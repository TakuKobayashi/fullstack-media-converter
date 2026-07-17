// MARK: - ConversionViewModel.swift

import Foundation
import SwiftUI
import PhotosUI

@MainActor
final class ConversionViewModel: ObservableObject {
    // MARK: Published state
    @Published var jobs: [ConversionJob] = []
    @Published var outputFormat: String = "jpg"
    @Published var quality: Double = 0.92
    @Published var concurrency: Int = 3
    @Published var isRunning: Bool = false
    @Published var errorMessage: String? = nil
    @Published var zipURL: URL? = nil

    // MARK: Computed
    var pendingJobs: [ConversionJob] { jobs.filter { if case .pending = $0.status { return true }; return false } }
    var doneCount: Int   { jobs.filter { if case .done = $0.status { return true }; return false }.count }
    var errorCount: Int  { jobs.filter { if case .error = $0.status { return true }; return false }.count }

    private let queue = ConversionQueue()

    // MARK: File management

    func addURLs(_ urls: [URL]) {
        let new: [ConversionJob] = urls.compactMap { url in
            let ext = url.pathExtension.lowercased()
            // Auto-pick compatible output format
            let validOutputs = outputFormats(for: ext)
            guard !validOutputs.isEmpty else { return nil }
            let outFmt = validOutputs.contains(outputFormat) ? outputFormat : validOutputs[0]

            let size = (try? url.resourceValues(forKeys: [.fileSizeKey]).fileSize).flatMap { Int64($0) } ?? 0
            let file = ConversionFile(id: UUID(), name: url.lastPathComponent, size: size, url: url)
            return ConversionJob(id: UUID(), file: file, outputFormat: outFmt)
        }
        jobs.append(contentsOf: new)
        zipURL = nil
    }

    func addPhotoPickerItems(_ items: [PhotosPickerItem]) async {
        var urls: [URL] = []
        for item in items {
            guard let data = try? await item.loadTransferable(type: Data.self) else { continue }
            // Determine file extension from content type
            let ext: String
            if let type_ = item.supportedContentTypes.first {
                ext = type_.preferredFilenameExtension ?? "jpg"
            } else { ext = "jpg" }
            let tempURL = FileManager.default.temporaryDirectory
                .appendingPathComponent(UUID().uuidString)
                .appendingPathExtension(ext)
            try? data.write(to: tempURL)
            urls.append(tempURL)
        }
        addURLs(urls)
    }

    func removeJob(id: UUID) {
        jobs.removeAll { $0.id == id }
    }

    func clearAll() {
        jobs = []
        zipURL = nil
    }

    func setOutputFormat(_ fmt: String) {
        outputFormat = fmt
        // Update all pending jobs
        jobs = jobs.map { job in
            guard case .pending = job.status, canConvert(from: job.file.inputFormat, to: fmt) else { return job }
            var updated = job
            // Swift structs: need var + mutating
            return ConversionJob(id: job.id, file: job.file, outputFormat: fmt, status: job.status, resultURL: job.resultURL)
        }
    }

    // MARK: Conversion

    func startConversion() {
        guard !isRunning, !pendingJobs.isEmpty else { return }
        isRunning = true
        zipURL = nil

        let options = ConversionOptions(quality: quality, concurrency: concurrency)
        let toRun = pendingJobs

        Task {
            await queue.runAll(jobs: toRun, options: options) { [weak self] updated in
                Task { @MainActor [weak self] in
                    guard let self else { return }
                    if let idx = self.jobs.firstIndex(where: { $0.id == updated.id }) {
                        self.jobs[idx] = updated
                    }
                }
            }
            isRunning = false
        }
    }

    // MARK: ZIP

    func buildZip() async {
        let done = jobs.filter { if case .done = $0.status { return true }; return false }
            .compactMap { job -> (String, URL)? in
                guard let url = job.resultURL else { return nil }
                return (job.outputFileName, url)
            }
        guard !done.isEmpty else { return }

        let zipURL = FileManager.default.temporaryDirectory
            .appendingPathComponent("ConvertMate_\(Int(Date().timeIntervalSince1970)).zip")

        do {
            try ZipHelper.createZip(at: zipURL, entries: done)
            self.zipURL = zipURL
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}
