// MARK: - ImageConversionEngine.swift
// Uses ImageIO + CGImageDestination for format conversion.
// Handles HEIC, AVIF, WebP via system decoders (iOS 16+).
// No third-party dependencies.

import Foundation
import ImageIO
import UniformTypeIdentifiers
import CoreGraphics

final class ImageConversionEngine: ConversionEngine {
    private let imageFormats = ["jpg", "jpeg", "png", "webp", "heic", "avif", "gif"]

    func canConvert(from inputFormat: String, to outputFormat: String) -> Bool {
        imageFormats.contains(inputFormat) && imageFormats.contains(outputFormat)
        && supportedConversions.contains { $0.from == inputFormat && $0.to == outputFormat }
    }

    func convert(
        job: ConversionJob,
        options: ConversionOptions,
        progress: @escaping (Double) -> Void
    ) async throws -> URL {
        try await Task.detached(priority: .userInitiated) {
            progress(0.05)

            // 1. Load source image via ImageIO (supports HEIC, AVIF, WebP natively on iOS 16+)
            let sourceOptions: [CFString: Any] = [
                kCGImageSourceShouldCache: false,
                kCGImageSourceShouldAllowFloat: false,
            ]
            guard
                let source = CGImageSourceCreateWithURL(job.file.url as CFURL, sourceOptions as CFDictionary),
                let cgImage = CGImageSourceCreateImageAtIndex(source, 0, nil)
            else {
                throw ConversionError.decodeFailed(job.file.name)
            }

            progress(0.35)

            // 2. Determine output UTType
            let utType = Self.utType(for: job.outputFormat)

            // 3. Write to temp file
            let outputURL = FileManager.default.temporaryDirectory
                .appendingPathComponent(UUID().uuidString)
                .appendingPathExtension(job.outputFormat)

            guard let destination = CGImageDestinationCreateWithURL(
                outputURL as CFURL,
                utType.identifier as CFString,
                1,
                nil
            ) else {
                throw ConversionError.encodeFailed(job.outputFormat)
            }

            // 4. Encode options
            var destOptions: [CFString: Any] = [
                kCGImageDestinationLossyCompressionQuality: options.quality,
            ]

            // Copy EXIF/metadata from source if requested
            if options.keepExif,
               let metadata = CGImageSourceCopyPropertiesAtIndex(source, 0, nil) {
                destOptions[kCGImageDestinationMergeMetadata] = true
                CGImageDestinationAddImageAndMetadata(destination, cgImage, metadata as CGImageMetadata, destOptions as CFDictionary)
            } else {
                CGImageDestinationAddImage(destination, cgImage, destOptions as CFDictionary)
            }

            progress(0.80)

            guard CGImageDestinationFinalize(destination) else {
                throw ConversionError.encodeFailed(job.outputFormat)
            }

            progress(1.0)
            return outputURL
        }.value
    }

    private static func utType(for ext: String) -> UTType {
        switch ext {
        case "jpg", "jpeg": return .jpeg
        case "png":         return .png
        case "webp":        return UTType(mimeType: "image/webp") ?? .jpeg
        case "heic":        return .heic
        case "gif":         return .gif
        default:            return .jpeg
        }
    }
}

enum ConversionError: LocalizedError {
    case decodeFailed(String)
    case encodeFailed(String)
    case unsupported(String, String)
    case videoExportFailed(String)

    var errorDescription: String? {
        switch self {
        case .decodeFailed(let f):    return "Failed to decode: \(f)"
        case .encodeFailed(let f):    return "Failed to encode as \(f)"
        case .unsupported(let i, let o): return "Unsupported: \(i) → \(o)"
        case .videoExportFailed(let r): return "Video export failed: \(r)"
        }
    }
}
