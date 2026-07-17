// MARK: - JobRowView.swift

import SwiftUI

struct JobRowView: View {
    let job: ConversionJob
    let onRemove: () -> Void
    let onShare: (URL) -> Void

    var body: some View {
        RoundedCard {
            VStack(alignment: .leading, spacing: 10) {
                // ── Top row ────────────────────────────────────────────
                HStack(spacing: 10) {
                    Text(fileEmoji)
                        .font(.system(size: 22))

                    VStack(alignment: .leading, spacing: 4) {
                        Text(job.file.name)
                            .font(.system(size: 14, weight: .medium))
                            .foregroundStyle(AppColors.cream)
                            .lineLimit(1)

                        HStack(spacing: 6) {
                            FormatBadge(text: job.file.inputFormat)
                            Text("→")
                                .font(.system(size: 11))
                                .foregroundStyle(AppColors.muted)
                            FormatBadge(text: job.outputFormat, highlight: true)
                            Text(ZipHelper.formatBytes(job.file.size))
                                .font(.system(size: 11))
                                .foregroundStyle(AppColors.muted)
                        }
                    }

                    Spacer()

                    // Status / actions
                    statusView
                }

                // ── Progress bar ───────────────────────────────────────
                if case .processing(let p) = job.status {
                    GeometryReader { geo in
                        ZStack(alignment: .leading) {
                            Capsule().fill(AppColors.navy3).frame(height: 3)
                            Capsule()
                                .fill(AppColors.indigo2)
                                .frame(width: geo.size.width * p, height: 3)
                        }
                    }
                    .frame(height: 3)
                    .animation(.easeInOut(duration: 0.2), value: p)
                }

                // ── Error detail ───────────────────────────────────────
                if case .error(let msg) = job.status {
                    Text(msg)
                        .font(.system(size: 11))
                        .foregroundStyle(AppColors.coral)
                }
            }
            .padding(14)
        }
    }

    @ViewBuilder
    private var statusView: some View {
        switch job.status {
        case .pending:
            HStack(spacing: 4) {
                Image(systemName: "clock")
                    .font(.system(size: 14))
                    .foregroundStyle(AppColors.muted)
                Button(action: onRemove) {
                    Image(systemName: "xmark")
                        .font(.system(size: 12, weight: .medium))
                        .foregroundStyle(AppColors.muted)
                        .frame(width: 28, height: 28)
                        .background(AppColors.navy3)
                        .clipShape(Circle())
                }
            }

        case .processing(let p):
            ZStack {
                Circle()
                    .stroke(AppColors.navy3, lineWidth: 2.5)
                Circle()
                    .trim(from: 0, to: p)
                    .stroke(AppColors.indigo2, style: StrokeStyle(lineWidth: 2.5, lineCap: .round))
                    .rotationEffect(.degrees(-90))
                    .animation(.easeInOut(duration: 0.15), value: p)
            }
            .frame(width: 24, height: 24)

        case .done:
            HStack(spacing: 6) {
                Image(systemName: "checkmark.circle.fill")
                    .foregroundStyle(AppColors.indigo2)
                    .font(.system(size: 18))
                if let url = job.resultURL {
                    Button("Share") { onShare(url) }
                        .font(.system(size: 12, weight: .medium))
                        .foregroundStyle(AppColors.indigo3)
                }
            }

        case .error:
            Image(systemName: "exclamationmark.circle.fill")
                .foregroundStyle(AppColors.coral)
                .font(.system(size: 18))
        }
    }

    private var fileEmoji: String {
        switch job.file.inputFormat {
        case "heic", "avif", "webp", "jpg", "jpeg", "png", "gif": return "🖼️"
        case "mp4", "mov": return "🎬"
        case "pdf": return "📄"
        default: return "📁"
        }
    }
}
