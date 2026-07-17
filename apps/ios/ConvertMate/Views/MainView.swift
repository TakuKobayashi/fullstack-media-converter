// MARK: - MainView.swift

import SwiftUI
import PhotosUI
import UniformTypeIdentifiers

struct MainView: View {
    @StateObject private var vm = ConversionViewModel()
    @State private var photoItems: [PhotosPickerItem] = []
    @State private var showFilePicker = false
    @State private var showShareSheet = false
    @State private var shareURL: URL? = nil
    @State private var showZipShare = false

    var body: some View {
        ZStack {
            AppColors.navy.ignoresSafeArea()

            VStack(spacing: 0) {
                // ── Navigation bar ─────────────────────────────────────
                navBar

                ScrollView {
                    VStack(spacing: 12) {
                        // Controls (only when files are loaded)
                        if !vm.jobs.isEmpty {
                            ControlsPanel(
                                outputFormat: $vm.outputFormat,
                                quality: $vm.quality,
                                concurrency: $vm.concurrency,
                                isRunning: vm.isRunning,
                            )
                            .padding(.horizontal, 16)
                            .onChange(of: vm.outputFormat) { _, new in vm.setOutputFormat(new) }
                        }

                        // Action buttons
                        if !vm.jobs.isEmpty {
                            actionButtons
                                .padding(.horizontal, 16)
                        }

                        // Summary
                        if !vm.jobs.isEmpty {
                            summaryRow
                                .padding(.horizontal, 16)
                        }

                        // Empty state / job list
                        if vm.jobs.isEmpty {
                            emptyState
                        } else {
                            LazyVStack(spacing: 8) {
                                ForEach(vm.jobs) { job in
                                    JobRowView(
                                        job: job,
                                        onRemove: { vm.removeJob(id: job.id) },
                                        onShare: { url in shareURL = url; showShareSheet = true },
                                    )
                                }
                            }
                            .padding(.horizontal, 16)
                        }

                        Spacer().frame(height: 100)
                    }
                    .padding(.top, 12)
                }
            }

            // ── FAB ────────────────────────────────────────────────────
            VStack {
                Spacer()
                HStack {
                    Spacer()
                    fabMenu
                        .padding(.trailing, 20)
                        .padding(.bottom, 32)
                }
            }
        }
        // PhotosPicker binding
        .onChange(of: photoItems) { _, items in
            Task { await vm.addPhotoPickerItems(items); photoItems = [] }
        }
        // File importer
        .fileImporter(
            isPresented: $showFilePicker,
            allowedContentTypes: [.image, .movie, .pdf],
            allowsMultipleSelection: true,
        ) { result in
            if let urls = try? result.get() {
                let securedURLs = urls.compactMap { url -> URL? in
                    guard url.startAccessingSecurityScopedResource() else { return nil }
                    // Copy to temp so security scope is released
                    let tmp = FileManager.default.temporaryDirectory
                        .appendingPathComponent(url.lastPathComponent)
                    try? FileManager.default.copyItem(at: url, to: tmp)
                    url.stopAccessingSecurityScopedResource()
                    return tmp
                }
                vm.addURLs(securedURLs)
            }
        }
        // Share sheet (single file)
        .sheet(isPresented: $showShareSheet) {
            if let url = shareURL {
                ShareSheet(urls: [url])
            }
        }
        // ZIP share
        .onChange(of: vm.zipURL) { _, url in
            if url != nil { showZipShare = true }
        }
        .sheet(isPresented: $showZipShare) {
            if let url = vm.zipURL {
                ShareSheet(urls: [url])
            }
        }
    }

    // MARK: Nav bar
    private var navBar: some View {
        HStack {
            HStack(spacing: 8) {
                ZStack {
                    RoundedRectangle(cornerRadius: 6)
                        .fill(LinearGradient(colors: [AppColors.indigo, AppColors.coral], startPoint: .topLeading, endPoint: .bottomTrailing))
                        .frame(width: 28, height: 28)
                    Text("⚡").font(.system(size: 13))
                }
                Text("ConvertMate")
                    .displayFont(size: 17, weight: .bold)
                    .foregroundStyle(AppColors.cream)
            }
            Spacer()
            if !vm.jobs.isEmpty {
                Button("Clear") { vm.clearAll() }
                    .font(.system(size: 14))
                    .foregroundStyle(AppColors.muted)
            }
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 14)
        .background(AppColors.navy2)
    }

    // MARK: Action buttons
    private var actionButtons: some View {
        HStack(spacing: 10) {
            PrimaryButton(
                label: vm.isRunning ? "Converting…" : "Convert \(vm.pendingJobs.count) file\(vm.pendingJobs.count == 1 ? "" : "s")",
                icon: "play.fill",
                isLoading: vm.isRunning,
                isDisabled: vm.pendingJobs.isEmpty,
            ) { vm.startConversion() }

            if vm.doneCount > 1 {
                Button {
                    Task { await vm.buildZip() }
                } label: {
                    HStack(spacing: 6) {
                        Image(systemName: "archivebox")
                        Text("ZIP")
                    }
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundStyle(AppColors.indigo3)
                    .padding(.horizontal, 16)
                    .padding(.vertical, 13)
                    .overlay(RoundedRectangle(cornerRadius: 10).stroke(AppColors.indigo, lineWidth: 1))
                }
            }
        }
    }

    // MARK: Summary
    private var summaryRow: some View {
        HStack {
            SummaryChip(value: "\(vm.jobs.count)", label: "Total", color: AppColors.cream)
            SummaryChip(value: "\(vm.doneCount)", label: "Done", color: AppColors.indigo2)
            if vm.errorCount > 0 {
                SummaryChip(value: "\(vm.errorCount)", label: "Errors", color: AppColors.coral)
            }
        }
        .frame(maxWidth: .infinity)
        .padding(12)
        .background(AppColors.navy2)
        .clipShape(RoundedRectangle(cornerRadius: 10))
    }

    // MARK: Empty state
    private var emptyState: some View {
        VStack(spacing: 20) {
            Spacer().frame(height: 40)
            Text("📂")
                .font(.system(size: 64))
            Text("Select files to convert")
                .displayFont(size: 20, weight: .semibold)
                .foregroundStyle(AppColors.cream)
            Text("Images, videos, documents.\nBatch convert hundreds at once.")
                .font(.system(size: 15))
                .foregroundStyle(AppColors.muted)
                .multilineTextAlignment(.center)
            Spacer().frame(height: 20)
        }
    }

    // MARK: FAB
    private var fabMenu: some View {
        Menu {
            PhotosPicker(selection: $photoItems, matching: .any(of: [.images, .videos]), photoLibrary: .shared()) {
                Label("Photo Library", systemImage: "photo")
            }
            Button { showFilePicker = true } label: {
                Label("Files App", systemImage: "folder")
            }
        } label: {
            Image(systemName: "plus")
                .font(.system(size: 22, weight: .semibold))
                .foregroundStyle(AppColors.cream)
                .frame(width: 56, height: 56)
                .background(AppColors.indigo)
                .clipShape(Circle())
                .shadow(color: AppColors.indigo.opacity(0.5), radius: 12, y: 4)
        }
    }
}

// MARK: - Supporting views

struct SummaryChip: View {
    let value: String; let label: String; let color: Color
    var body: some View {
        VStack(spacing: 2) {
            Text(value).displayFont(size: 20).foregroundStyle(color)
            Text(label).font(.system(size: 11)).foregroundStyle(AppColors.muted)
        }
        .frame(maxWidth: .infinity)
    }
}

// UIActivityViewController wrapper
struct ShareSheet: UIViewControllerRepresentable {
    let urls: [URL]
    func makeUIViewController(context: Context) -> UIActivityViewController {
        UIActivityViewController(activityItems: urls, applicationActivities: nil)
    }
    func updateUIViewController(_ vc: UIActivityViewController, context: Context) {}
}
