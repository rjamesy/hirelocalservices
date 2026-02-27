import SwiftUI

struct StatusPanel: View {
    @Bindable var viewModel: SeedViewModel

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack {
                Text("Pipeline Status")
                    .font(.system(.caption, weight: .bold))
                    .foregroundStyle(.secondary)
                Spacer()
                Button {
                    viewModel.refreshStatus()
                } label: {
                    if viewModel.isRefreshingStatus {
                        ProgressView()
                            .controlSize(.small)
                            .scaleEffect(0.7)
                    } else {
                        Image(systemName: "arrow.clockwise")
                            .font(.caption)
                    }
                }
                .buttonStyle(.borderless)
                .disabled(viewModel.isRefreshingStatus)
            }
            .padding(.horizontal, 10)
            .padding(.top, 8)
            .padding(.bottom, 6)

            Divider()

            if let counts = viewModel.statusCounts {
                VStack(alignment: .leading, spacing: 8) {
                    CountRow(label: "Seen Place IDs", count: counts.seenPlaceIds, color: .secondary)
                    CountRow(label: "Total Candidates", count: counts.totalCandidates, color: .secondary)
                    CountRow(label: "Ready for AI", count: counts.readyForAi, color: .blue)
                    CountRow(label: "Ready to Publish", count: counts.readyToPublish, color: .orange)
                    CountRow(label: "Published", count: counts.published, color: .green)
                    CountRow(label: "Rejected", count: counts.rejected, color: .red)

                    Divider()

                    if let refreshed = counts.lastRefreshed {
                        Text("Updated \(refreshed, format: .dateTime.hour().minute().second())")
                            .font(.caption2)
                            .foregroundStyle(.tertiary)
                    }
                }
                .padding(.horizontal, 10)
                .padding(.vertical, 8)
            } else {
                VStack(spacing: 8) {
                    Text("No data")
                        .font(.caption)
                        .foregroundStyle(.tertiary)
                    Text("Click refresh to load counts from Supabase")
                        .font(.caption2)
                        .foregroundStyle(.tertiary)
                        .multilineTextAlignment(.center)
                }
                .frame(maxWidth: .infinity)
                .padding(.vertical, 20)
            }

            Spacer()
        }
        .background(Color(nsColor: .controlBackgroundColor))
    }
}

private struct CountRow: View {
    let label: String
    let count: Int
    let color: Color

    var body: some View {
        HStack {
            Text(label)
                .font(.system(.caption2))
                .foregroundStyle(.secondary)
            Spacer()
            Text("\(count)")
                .font(.system(.caption, design: .monospaced, weight: .semibold))
                .foregroundStyle(count > 0 ? color : .secondary)
        }
    }
}
