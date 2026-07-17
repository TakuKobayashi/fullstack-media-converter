// MARK: - ConversionQueue.swift
// Concurrency-controlled batch runner using Swift async/await + TaskGroup.
// Mirrors packages/core ConversionQueue.

import Foundation

actor ConversionQueue {
    private let imageEngine = ImageConversionEngine()
    private let videoEngine = VideoConversionEngine()

    func runAll(
        jobs: [ConversionJob],
        options: ConversionOptions,
        onUpdate: @escaping (ConversionJob) -> Void
    ) async -> [ConversionJob] {
        await withTaskGroup(of: ConversionJob.self) { group in
            // Use a semaphore-like pattern via task slots
            let semaphore = AsyncSemaphore(limit: options.concurrency)

            for job in jobs {
                group.addTask {
                    await semaphore.wait()
                    defer { Task { await semaphore.signal() } }

                    var updated = job
                    updated.status = .processing(progress: 0)
                    onUpdate(updated)

                    do {
                        let engine = self.pickEngine(for: job)
                        guard let engine else {
                            updated.status = .error("Unsupported: \(job.file.inputFormat) → \(job.outputFormat)")
                            onUpdate(updated)
                            return updated
                        }

                        let resultURL = try await engine.convert(job: job, options: options) { p in
                            var inProgress = job
                            inProgress.status = .processing(progress: p)
                            onUpdate(inProgress)
                        }
                        updated.status = .done
                        updated.resultURL = resultURL
                        onUpdate(updated)
                    } catch {
                        updated.status = .error(error.localizedDescription)
                        onUpdate(updated)
                    }
                    return updated
                }
            }

            var results: [ConversionJob] = []
            for await result in group { results.append(result) }
            return results
        }
    }

    private func pickEngine(for job: ConversionJob) -> ConversionEngine? {
        let input = job.file.inputFormat
        let output = job.outputFormat
        if imageEngine.canConvert(from: input, to: output) { return imageEngine }
        if videoEngine.canConvert(from: input, to: output) { return videoEngine }
        return nil
    }
}

// MARK: - AsyncSemaphore (Swift concurrency, no DispatchSemaphore)

actor AsyncSemaphore {
    private var count: Int
    private var waiters: [CheckedContinuation<Void, Never>] = []

    init(limit: Int) { self.count = limit }

    func wait() async {
        if count > 0 { count -= 1; return }
        await withCheckedContinuation { waiters.append($0) }
    }

    func signal() {
        if waiters.isEmpty { count += 1 }
        else { waiters.removeFirst().resume() }
    }
}
