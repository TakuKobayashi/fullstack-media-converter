// MARK: - ZipHelper.swift
// Pure Foundation ZIP creation — no third-party deps.
// Uses ZipArchive via libcompression or falls back to zip system call via Process.

import Foundation
import Compression

enum ZipHelper {
    /// Creates a ZIP archive at `destination` from an array of (filename, sourceURL) pairs.
    /// Uses the system `zip` command via Process — available on iOS via private API workaround
    /// on macOS/Catalyst. For pure iOS builds, use the streaming approach below.
    static func createZip(at destination: URL, entries: [(String, URL)]) throws {
        // Stage files in a temp directory then zip them
        let staging = FileManager.default.temporaryDirectory
            .appendingPathComponent("cm_zip_\(UUID().uuidString)", isDirectory: true)
        try FileManager.default.createDirectory(at: staging, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: staging) }

        for (name, url) in entries {
            let dest = staging.appendingPathComponent(name)
            if FileManager.default.fileExists(atPath: dest.path) {
                try FileManager.default.removeItem(at: dest)
            }
            try FileManager.default.copyItem(at: url, to: dest)
        }

        // Write a minimal ZIP using pure Swift
        let zipData = try buildZipData(directory: staging, entries: entries.map(\.0))
        try zipData.write(to: destination)
    }

    // MARK: - Minimal ZIP writer (PKZIP format, store method)
    // For large/many files consider using ZipFoundation or a similar library.

    private static func buildZipData(directory: URL, entries: [String]) throws -> Data {
        var central: [Data] = []
        var local = Data()
        var offset: UInt32 = 0

        for name in entries {
            let fileURL = directory.appendingPathComponent(name)
            let fileData = try Data(contentsOf: fileURL)
            let nameData = Data(name.utf8)
            let crc = crc32(fileData)
            let now = dosDateTime()

            // Local file header
            var localHeader = Data()
            localHeader += uint32LE(0x04034b50)  // signature
            localHeader += uint16LE(20)           // version needed
            localHeader += uint16LE(0)            // flags
            localHeader += uint16LE(0)            // compression: store
            localHeader += uint16LE(now.time)
            localHeader += uint16LE(now.date)
            localHeader += uint32LE(crc)
            localHeader += uint32LE(UInt32(fileData.count))
            localHeader += uint32LE(UInt32(fileData.count))
            localHeader += uint16LE(UInt16(nameData.count))
            localHeader += uint16LE(0)            // extra length
            localHeader += nameData
            local += localHeader
            local += fileData

            // Central directory entry
            var cd = Data()
            cd += uint32LE(0x02014b50)
            cd += uint16LE(20); cd += uint16LE(20)
            cd += uint16LE(0); cd += uint16LE(0)
            cd += uint16LE(now.time); cd += uint16LE(now.date)
            cd += uint32LE(crc)
            cd += uint32LE(UInt32(fileData.count))
            cd += uint32LE(UInt32(fileData.count))
            cd += uint16LE(UInt16(nameData.count))
            cd += uint16LE(0); cd += uint16LE(0)
            cd += uint16LE(0); cd += uint16LE(0)
            cd += uint32LE(0)
            cd += uint32LE(offset)
            cd += nameData
            central.append(cd)
            offset += UInt32(localHeader.count + fileData.count)
        }

        let cdData = central.reduce(Data(), +)
        var eocd = Data()
        eocd += uint32LE(0x06054b50)
        eocd += uint16LE(0); eocd += uint16LE(0)
        eocd += uint16LE(UInt16(entries.count))
        eocd += uint16LE(UInt16(entries.count))
        eocd += uint32LE(UInt32(cdData.count))
        eocd += uint32LE(offset)
        eocd += uint16LE(0)

        return local + cdData + eocd
    }

    private static func crc32(_ data: Data) -> UInt32 {
        var crc: UInt32 = 0xFFFFFFFF
        for byte in data {
            crc ^= UInt32(byte)
            for _ in 0..<8 { crc = (crc >> 1) ^ (0xEDB88320 * (crc & 1)) }
        }
        return ~crc
    }

    private static func dosDateTime() -> (time: UInt16, date: UInt16) {
        let c = Calendar.current; let now = Date()
        let h  = c.component(.hour, from: now)
        let m  = c.component(.minute, from: now)
        let s  = c.component(.second, from: now)
        let dy = c.component(.day, from: now)
        let mo = c.component(.month, from: now)
        let yr = max(0, c.component(.year, from: now) - 1980)
        return (
            time: UInt16((h << 11) | (m << 5) | (s / 2)),
            date: UInt16((yr << 9) | (mo << 5) | dy)
        )
    }

    private static func uint16LE(_ v: UInt16) -> Data {
        Data([UInt8(v & 0xFF), UInt8(v >> 8)])
    }
    private static func uint32LE(_ v: UInt32) -> Data {
        Data([UInt8(v & 0xFF), UInt8((v >> 8) & 0xFF), UInt8((v >> 16) & 0xFF), UInt8(v >> 24)])
    }

    static func formatBytes(_ bytes: Int64) -> String {
        switch bytes {
        case ..<1024: return "\(bytes) B"
        case ..<(1024*1024): return String(format: "%.1f KB", Double(bytes)/1024)
        default: return String(format: "%.1f MB", Double(bytes)/1024/1024)
        }
    }
}
