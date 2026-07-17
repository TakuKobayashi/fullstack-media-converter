// MARK: - ConversionModels.swift
// Mirrors packages/shared types — platform-native Swift version.

import Foundation
import UniformTypeIdentifiers

// MARK: Formats

enum ImageOutputFormat: String, CaseIterable, Identifiable {
    case jpg, png, webp, heic
    var id: String { rawValue }
    var displayName: String { rawValue.uppercased() }
    var utType: UTType {
        switch self {
        case .jpg:  return .jpeg
        case .png:  return .png
        case .webp: return UTType(mimeType: "image/webp") ?? .data
        case .heic: return .heic
        }
    }
}

enum VideoOutputFormat: String, CaseIterable, Identifiable {
    case mp4, mov, gif
    var id: String { rawValue }
    var displayName: String { rawValue.uppercased() }
}

// MARK: Job

enum JobStatus {
    case pending, processing(progress: Double), done, error(String)

    var isTerminal: Bool {
        switch self { case .done, .error: return true; default: return false }
    }
    var progress: Double {
        switch self {
        case .processing(let p): return p
        case .done: return 1.0
        default: return 0
        }
    }
}

struct ConversionFile: Identifiable {
    let id: UUID
    let name: String
    let size: Int64
    let url: URL          // local file URL (copied to temp dir)
    var inputFormat: String { url.pathExtension.lowercased() }
}

struct ConversionJob: Identifiable {
    let id: UUID
    let file: ConversionFile
    let outputFormat: String    // lowercase ext
    var status: JobStatus = .pending
    var resultURL: URL? = nil

    var outputFileName: String {
        let base = file.name.components(separatedBy: ".").dropLast().joined(separator: ".")
        return "\(base).\(outputFormat)"
    }
}

// MARK: Options

struct ConversionOptions {
    var quality: Double = 0.92   // 0–1
    var keepExif: Bool = true
    var concurrency: Int = 3
}

// MARK: Supported routes (mirrors SUPPORTED_CONVERSIONS in shared)

struct ConversionRoute {
    let from: String
    let to: String
    var label: String { "\(from.uppercased()) → \(to.uppercased())" }
}

let supportedConversions: [ConversionRoute] = [
    .init(from: "webp", to: "jpg"),
    .init(from: "webp", to: "png"),
    .init(from: "png",  to: "jpg"),
    .init(from: "jpg",  to: "png"),
    .init(from: "jpeg", to: "png"),
    .init(from: "heic", to: "jpg"),
    .init(from: "heic", to: "png"),
    .init(from: "avif", to: "jpg"),
    .init(from: "avif", to: "png"),
    .init(from: "mov",  to: "mp4"),
    .init(from: "mp4",  to: "gif"),
    .init(from: "jpg",  to: "pdf"),
    .init(from: "png",  to: "pdf"),
]

func canConvert(from: String, to: String) -> Bool {
    supportedConversions.contains { $0.from == from && $0.to == to }
}

func outputFormats(for inputFormat: String) -> [String] {
    supportedConversions.filter { $0.from == inputFormat }.map(\.to)
}
