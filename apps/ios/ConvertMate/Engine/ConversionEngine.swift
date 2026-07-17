// MARK: - ConversionEngine.swift
// Platform-agnostic protocol — same concept as packages/core ConversionEngine.

import Foundation

protocol ConversionEngine {
    func canConvert(from inputFormat: String, to outputFormat: String) -> Bool
    func convert(
        job: ConversionJob,
        options: ConversionOptions,
        progress: @escaping (Double) -> Void
    ) async throws -> URL
}
