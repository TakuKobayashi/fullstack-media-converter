// MARK: - VideoConversionEngine.swift
// AVFoundation-based video conversion.
// MOV → MP4: AVAssetExportSession with passthrough where possible.
// MP4 → GIF: frame extraction via AVAssetImageGenerator.

import AVFoundation
import Foundation
import ImageIO
import UniformTypeIdentifiers

final class VideoConversionEngine: ConversionEngine {
    func canConvert(from inputFormat: String, to outputFormat: String) -> Bool {
        (inputFormat == "mov" && outputFormat == "mp4") ||
        (inputFormat == "mp4" && outputFormat == "mov") ||
        (inputFormat == "mp4" && outputFormat == "gif")
    }

    func convert(
        job: ConversionJob,
        options: ConversionOptions,
        progress: @escaping (Double) -> Void
    ) async throws -> URL {
        if job.outputFormat == "gif" {
            return try await convertToGIF(job: job, progress: progress)
        } else {
            return try await remuxVideo(job: job, progress: progress)
        }
    }

    // MARK: - MOV ↔ MP4 remux

    private func remuxVideo(job: ConversionJob, progress: @escaping (Double) -> Void) async throws -> URL {
        let asset = AVAsset(url: job.file.url)

        let outputURL = FileManager.default.temporaryDirectory
            .appendingPathComponent(UUID().uuidString)
            .appendingPathExtension(job.outputFormat)

        let preset = AVAssetExportPresetPassthrough  // no re-encode = fast, lossless
        guard let session = AVAssetExportSession(asset: asset, presetName: preset) else {
            throw ConversionError.videoExportFailed("Failed to create export session")
        }

        let fileType: AVFileType = job.outputFormat == "mp4" ? .mp4 : .mov
        session.outputFileType = fileType
        session.outputURL = outputURL

        // Poll progress on a background task
        let progressTask = Task {
            while !Task.isCancelled {
                progress(Double(session.progress) * 0.95)
                try? await Task.sleep(nanoseconds: 100_000_000) // 100ms
            }
        }

        await session.export()
        progressTask.cancel()

        if let error = session.error { throw error }
        guard session.status == .completed else {
            throw ConversionError.videoExportFailed("Export status: \(session.status.rawValue)")
        }

        progress(1.0)
        return outputURL
    }

    // MARK: - MP4 → GIF

    private func convertToGIF(job: ConversionJob, progress: @escaping (Double) -> Void) async throws -> URL {
        let asset = AVAsset(url: job.file.url)
        let duration = try await asset.load(.duration)
        let durationSeconds = CMTimeGetSeconds(duration)

        let generator = AVAssetImageGenerator(asset: asset)
        generator.appliesPreferredTrackTransform = true
        generator.maximumSize = CGSize(width: 480, height: 480) // cap GIF size

        let fps: Double = 10
        let frameCount = Int(durationSeconds * fps)
        let frameTimes = (0..<frameCount).map { i -> CMTime in
            CMTimeMakeWithSeconds(Double(i) / fps, preferredTimescale: 600)
        }

        let outputURL = FileManager.default.temporaryDirectory
            .appendingPathComponent(UUID().uuidString)
            .appendingPathExtension("gif")

        guard let dest = CGImageDestinationCreateWithURL(
            outputURL as CFURL,
            UTType.gif.identifier as CFString,
            frameCount,
            nil
        ) else {
            throw ConversionError.encodeFailed("gif")
        }

        // GIF container properties
        let gifProperties: [CFString: Any] = [
            kCGImagePropertyGIFDictionary: [
                kCGImagePropertyGIFLoopCount: 0,  // infinite loop
            ]
        ]
        CGImageDestinationSetProperties(dest, gifProperties as CFDictionary)

        // Frame properties (100ms per frame = 10fps)
        let frameProperties: [CFString: Any] = [
            kCGImagePropertyGIFDictionary: [
                kCGImagePropertyGIFDelayTime: 1.0 / fps,
                kCGImagePropertyGIFUnclampedDelayTime: 1.0 / fps,
            ]
        ]

        // Extract & write frames
        for (i, time) in frameTimes.enumerated() {
            let cgImage = try generator.copyCGImage(at: time, actualTime: nil)
            CGImageDestinationAddImage(dest, cgImage, frameProperties as CFDictionary)
            progress(Double(i + 1) / Double(frameCount) * 0.95)
        }

        guard CGImageDestinationFinalize(dest) else {
            throw ConversionError.encodeFailed("gif finalize")
        }

        progress(1.0)
        return outputURL
    }
}
