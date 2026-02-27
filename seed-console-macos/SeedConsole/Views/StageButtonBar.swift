import SwiftUI

struct StageButtonBar: View {
    @Bindable var viewModel: SeedViewModel

    var body: some View {
        HStack(spacing: 6) {
            ForEach(PipelinePhase.allCases) { phase in
                PhaseButton(
                    phase: phase,
                    isSelected: viewModel.selectedPhase == phase,
                    isActive: viewModel.activePhase == phase,
                    tintColor: phaseColor(phase)
                ) {
                    viewModel.selectedPhase = phase
                }
            }

            Spacer()

            Button {
                viewModel.stopPhase()
            } label: {
                Label("Stop", systemImage: "stop.fill")
                    .font(.caption)
            }
            .buttonStyle(.bordered)
            .tint(.red)
            .controlSize(.small)
            .disabled(!viewModel.isRunning)
        }
        .padding(.horizontal, 10)
        .padding(.vertical, 6)
        .background(.bar)
    }

    private func phaseColor(_ phase: PipelinePhase) -> Color {
        if phase.isDestructive { return .orange }
        if viewModel.activePhase == phase { return .green }
        return .accentColor
    }
}

private struct PhaseButton: View {
    let phase: PipelinePhase
    let isSelected: Bool
    let isActive: Bool
    let tintColor: Color
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: 4) {
                if isActive {
                    ProgressView()
                        .controlSize(.small)
                        .scaleEffect(0.7)
                }
                Text(phase.displayName)
                    .font(.system(.caption, weight: .medium))
            }
        }
        .buttonStyle(.borderedProminent)
        .tint(isSelected ? tintColor : .gray.opacity(0.3))
        .controlSize(.small)
    }
}
