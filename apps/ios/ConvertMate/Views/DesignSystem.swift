// MARK: - DesignSystem.swift
// Mirrors the Web/Android design system: navy + indigo + coral

import SwiftUI

enum AppColors {
    static let navy     = Color(hex: "0D1117")
    static let navy2    = Color(hex: "161B22")
    static let navy3    = Color(hex: "21262D")
    static let indigo   = Color(hex: "6E40C9")
    static let indigo2  = Color(hex: "8B5CF6")
    static let indigo3  = Color(hex: "A78BFA")
    static let coral    = Color(hex: "F25C54")
    static let cream    = Color(hex: "F0EDE8")
    static let muted    = Color(hex: "8B949E")
    static let border   = Color.white.opacity(0.08)
}

extension Color {
    init(hex: String) {
        let hex = hex.trimmingCharacters(in: CharacterSet.alphanumerics.inverted)
        var int: UInt64 = 0
        Scanner(string: hex).scanHexInt64(&int)
        let r = Double((int >> 16) & 0xFF) / 255
        let g = Double((int >> 8)  & 0xFF) / 255
        let b = Double(int         & 0xFF) / 255
        self.init(red: r, green: g, blue: b)
    }
}

// MARK: Typography modifiers

struct DisplayFont: ViewModifier {
    let size: CGFloat
    let weight: Font.Weight
    func body(content: Content) -> some View {
        content.font(.system(size: size, weight: weight, design: .rounded))
    }
}

extension View {
    func displayFont(size: CGFloat, weight: Font.Weight = .semibold) -> some View {
        modifier(DisplayFont(size: size, weight: weight))
    }
}

// MARK: Reusable shapes

struct RoundedCard<Content: View>: View {
    let content: Content
    init(@ViewBuilder content: () -> Content) { self.content = content() }
    var body: some View {
        content
            .background(AppColors.navy2)
            .clipShape(RoundedRectangle(cornerRadius: 12))
    }
}

struct FormatBadge: View {
    let text: String
    var highlight: Bool = false
    var body: some View {
        Text(text.uppercased())
            .font(.system(size: 10, weight: .semibold, design: .monospaced))
            .foregroundStyle(highlight ? AppColors.indigo3 : AppColors.muted)
            .padding(.horizontal, 6).padding(.vertical, 2)
            .background(highlight ? AppColors.indigo.opacity(0.2) : AppColors.navy3)
            .clipShape(RoundedRectangle(cornerRadius: 4))
    }
}

struct PrimaryButton: View {
    let label: String
    let icon: String
    var isLoading: Bool = false
    var isDisabled: Bool = false
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: 8) {
                if isLoading {
                    ProgressView().tint(.white).scaleEffect(0.8)
                } else {
                    Image(systemName: icon).font(.system(size: 15, weight: .semibold))
                }
                Text(label).fontWeight(.semibold)
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, 13)
            .background(isDisabled ? AppColors.navy3 : AppColors.indigo)
            .foregroundStyle(isDisabled ? AppColors.muted : AppColors.cream)
            .clipShape(RoundedRectangle(cornerRadius: 10))
        }
        .disabled(isDisabled || isLoading)
    }
}
