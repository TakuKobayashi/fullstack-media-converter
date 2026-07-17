// MARK: - ControlsPanel.swift

import SwiftUI

struct ControlsPanel: View {
    @Binding var outputFormat: String
    @Binding var quality: Double
    @Binding var concurrency: Int
    let isRunning: Bool

    private let outputFormats = ["jpg", "png", "webp", "mp4", "gif", "pdf"]
    private let concurrencyOptions = [1, 2, 3, 4, 6]

    var body: some View {
        RoundedCard {
            VStack(spacing: 16) {
                // Output format picker
                HStack {
                    Text("Output Format")
                        .font(.system(size: 13))
                        .foregroundStyle(AppColors.muted)
                    Spacer()
                    Picker("Format", selection: $outputFormat) {
                        ForEach(outputFormats, id: \.self) {
                            Text($0.uppercased()).tag($0)
                        }
                    }
                    .pickerStyle(.menu)
                    .tint(AppColors.indigo3)
                    .disabled(isRunning)
                }

                Divider().background(AppColors.border)

                // Quality slider
                VStack(alignment: .leading, spacing: 8) {
                    HStack {
                        Text("Quality")
                            .font(.system(size: 13))
                            .foregroundStyle(AppColors.muted)
                        Spacer()
                        Text("\(Int(quality * 100))")
                            .font(.system(size: 13, weight: .semibold, design: .monospaced))
                            .foregroundStyle(AppColors.cream)
                    }
                    Slider(value: $quality, in: 0.6...1.0, step: 0.01)
                        .tint(AppColors.indigo2)
                        .disabled(isRunning)
                }

                Divider().background(AppColors.border)

                // Concurrency picker
                HStack {
                    Text("Threads")
                        .font(.system(size: 13))
                        .foregroundStyle(AppColors.muted)
                    Spacer()
                    HStack(spacing: 6) {
                        ForEach(concurrencyOptions, id: \.self) { n in
                            Button("\(n)") { concurrency = n }
                                .font(.system(size: 13, weight: concurrency == n ? .semibold : .regular))
                                .foregroundStyle(concurrency == n ? AppColors.cream : AppColors.muted)
                                .frame(width: 32, height: 28)
                                .background(concurrency == n ? AppColors.indigo : AppColors.navy3)
                                .clipShape(RoundedRectangle(cornerRadius: 6))
                                .disabled(isRunning)
                        }
                    }
                }
            }
            .padding(16)
        }
    }
}
