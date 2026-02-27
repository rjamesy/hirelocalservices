import SwiftUI

struct StatusBar: View {
    let viewModel: SeedViewModel

    var body: some View {
        HStack(spacing: 12) {
            // Status indicator
            HStack(spacing: 4) {
                Circle()
                    .fill(viewModel.isRunning ? .green : .red)
                    .frame(width: 8, height: 8)

                if let phase = viewModel.activePhase {
                    Text("Running: \(phase.displayName)")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                } else {
                    Text("Stopped")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            }

            if viewModel.dryRun {
                Text("DRY RUN")
                    .font(.system(.caption2, design: .monospaced, weight: .bold))
                    .padding(.horizontal, 6)
                    .padding(.vertical, 2)
                    .background(.yellow.opacity(0.3))
                    .clipShape(RoundedRectangle(cornerRadius: 3))
            }

            if viewModel.environment == .prod {
                Text("PROD")
                    .font(.system(.caption2, design: .monospaced, weight: .bold))
                    .padding(.horizontal, 6)
                    .padding(.vertical, 2)
                    .background(.red.opacity(0.3))
                    .clipShape(RoundedRectangle(cornerRadius: 3))
            }

            Spacer()

            // Phase-aware counters
            if viewModel.stats.hasData {
                phaseCounters
            }
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 6)
        .background(.bar)
    }

    @ViewBuilder
    private var phaseCounters: some View {
        let stats = viewModel.stats
        let phase = viewModel.activePhase ?? viewModel.selectedPhase

        switch phase {
        case .extract:
            Group {
                StatLabel(name: "API Calls", value: stats.apiCallsMade)
                StatLabel(name: "Places", value: stats.uniquePlaceIds, color: .green)
                StatLabel(name: "New", value: stats.newPlaceIds, color: .blue)
                StatLabel(name: "Errors", value: stats.apiErrors, color: .red)
            }
        case .normalize:
            Group {
                StatLabel(name: "API Calls", value: stats.apiCallsMade)
                StatLabel(name: "Normalized", value: stats.normalized, color: .green)
                StatLabel(name: "Ready", value: stats.readyForAi, color: .blue)
                StatLabel(name: "Rejected", value: stats.rejected, color: .orange)
            }
        case .generateDescriptions:
            Group {
                StatLabel(name: "Processed", value: stats.candidatesProcessed)
                StatLabel(name: "Generated", value: stats.descriptionsGenerated, color: .green)
                StatLabel(name: "Fallback", value: stats.descriptionsFallback, color: .orange)
                StatLabel(name: "AI Calls", value: stats.aiCalls, color: .blue)
            }
        case .publish:
            Group {
                StatLabel(name: "Published", value: stats.published, color: .green)
                StatLabel(name: "Skipped", value: stats.skippedAlreadyPublished, color: .orange)
                StatLabel(name: "Errors", value: stats.errors, color: .red)
            }
        case .coverageReport:
            EmptyView()
        }

        if !stats.estCost.isEmpty {
            HStack(spacing: 2) {
                Text("Cost")
                    .font(.caption2)
                    .foregroundStyle(.secondary)
                Text(stats.estCost)
                    .font(.system(.caption2, design: .monospaced, weight: .semibold))
                    .foregroundStyle(.purple)
            }
        }
    }
}

private struct StatLabel: View {
    let name: String
    let value: Int
    var color: Color = .secondary

    var body: some View {
        HStack(spacing: 2) {
            Text(name)
                .font(.caption2)
                .foregroundStyle(.secondary)
            Text("\(value)")
                .font(.system(.caption2, design: .monospaced, weight: .semibold))
                .foregroundStyle(value > 0 ? color : .secondary)
        }
    }
}
