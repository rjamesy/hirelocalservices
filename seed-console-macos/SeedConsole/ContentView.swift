import SwiftUI

struct ContentView: View {
    @State private var viewModel = SeedViewModel()

    var body: some View {
        HSplitView {
            ConfigPanel(viewModel: viewModel)
                .frame(minWidth: 260, idealWidth: 300, maxWidth: 340)

            VStack(spacing: 0) {
                StageButtonBar(viewModel: viewModel)
                Divider()

                HSplitView {
                    LogView(logOutput: viewModel.logOutput)
                        .frame(minWidth: 350)

                    StatusPanel(viewModel: viewModel)
                        .frame(minWidth: 180, idealWidth: 220, maxWidth: 260)
                }

                Divider()
                StatusBar(viewModel: viewModel)
            }
            .frame(minWidth: 500)
        }
        .frame(minWidth: 900, minHeight: 650)
        .overlay(prodBorderOverlay)
    }

    @ViewBuilder
    private var prodBorderOverlay: some View {
        if viewModel.environment == .prod {
            RoundedRectangle(cornerRadius: 0)
                .stroke(.red.opacity(0.6), lineWidth: 3)
                .allowsHitTesting(false)
        }
    }
}
