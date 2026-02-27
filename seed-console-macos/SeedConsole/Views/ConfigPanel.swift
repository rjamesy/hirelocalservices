import SwiftUI

struct ConfigPanel: View {
    @Bindable var viewModel: SeedViewModel

    private var phase: PipelinePhase { viewModel.selectedPhase }

    var body: some View {
        Form {
            // MARK: - Project Path
            Section("Project") {
                HStack {
                    TextField("Path", text: $viewModel.projectPath)
                        .textFieldStyle(.roundedBorder)
                        .font(.system(.caption, design: .monospaced))
                        .truncationMode(.middle)

                    Button("Browse...") {
                        viewModel.browseProjectPath()
                    }
                    .controlSize(.small)
                }
            }

            // MARK: - Environment
            Section("Environment") {
                Picker("Target", selection: $viewModel.environment) {
                    ForEach(SeedEnvironment.allCases) { env in
                        Text(env.label).tag(env)
                    }
                }
                .pickerStyle(.segmented)
                .onChange(of: viewModel.environment) {
                    viewModel.prodConfirmed = false
                    viewModel.publishConfirmationText = ""
                }
            }

            // MARK: - Region & Category
            Section("Region & Category") {
                Picker("Region", selection: $viewModel.selectedRegion) {
                    ForEach(SeedConfig.regions) { region in
                        Text(region.name).tag(region.id)
                    }
                }

                if phase.supportsCategory {
                    Picker("Category", selection: $viewModel.selectedCategory) {
                        ForEach(SeedConfig.categories) { cat in
                            Text(cat.name).tag(cat.slug)
                        }
                    }
                }
            }

            // MARK: - Phase Controls
            Section("Phase Controls (\(phase.displayName))") {
                if phase.supportsMaxPlaces {
                    NumberRow(label: "Max Places", value: $viewModel.maxPlaces)
                }
                if phase.supportsMaxApiCalls {
                    NumberRow(label: "Max API Calls", value: $viewModel.maxApiCalls)
                }
                if phase.supportsMaxAiCalls {
                    NumberRow(label: "Max AI Calls", value: $viewModel.maxAiCalls)
                }
                if phase.supportsMaxCost {
                    HStack {
                        Text("Cost Cap ($)")
                        Spacer()
                        TextField("", value: $viewModel.maxCostUsd, format: .number.precision(.fractionLength(2)))
                            .textFieldStyle(.roundedBorder)
                            .frame(width: 80)
                            .multilineTextAlignment(.trailing)
                    }
                }
                if phase.supportsLimit {
                    NumberRow(label: "Limit (0=all)", value: $viewModel.limit)
                }
                if phase.supportsConcurrency {
                    NumberRow(label: "Concurrency", value: $viewModel.concurrency)
                }
                if phase.supportsDryRun {
                    Toggle("Dry Run", isOn: $viewModel.dryRun)
                        .onChange(of: viewModel.dryRun) {
                            viewModel.prodConfirmed = false
                            viewModel.publishConfirmationText = ""
                        }
                }
                if phase.supportsForce {
                    Toggle("Force", isOn: $viewModel.force)
                }
            }

            // MARK: - Production Safety
            if viewModel.environment == .prod && !viewModel.dryRun {
                Section {
                    if phase.isDestructive {
                        // Publish in prod without dry-run: must type PUBLISH
                        VStack(alignment: .leading, spacing: 6) {
                            Text("Type PUBLISH to confirm production publish")
                                .font(.callout)
                                .foregroundStyle(.red)
                            TextField("", text: $viewModel.publishConfirmationText)
                                .textFieldStyle(.roundedBorder)
                                .font(.system(.body, design: .monospaced))
                        }
                    } else {
                        Toggle(isOn: $viewModel.prodConfirmed) {
                            VStack(alignment: .leading, spacing: 2) {
                                Text("I understand this writes to production")
                                    .font(.callout)
                                    .foregroundStyle(.red)
                                Text("Data will be modified in the live database")
                                    .font(.caption2)
                                    .foregroundStyle(.secondary)
                            }
                        }
                        .tint(.red)
                    }
                } header: {
                    Label("Production Warning", systemImage: "exclamationmark.triangle.fill")
                        .foregroundStyle(.red)
                }
            }

            // MARK: - Validation
            if let validation = viewModel.configValidation {
                Section("Config Status") {
                    ValidationRow(label: phase.scriptPath, valid: validation.scriptExists)
                    ValidationRow(label: "tsx binary", valid: validation.tsxExists)
                    let requiredVars = SeedConfig.baseEnvVars + phase.additionalEnvVars
                    ForEach(requiredVars, id: \.self) { key in
                        ValidationRow(
                            label: key,
                            valid: validation.envVarsPresent[key] ?? false
                        )
                    }
                }
            }

            // MARK: - Actions
            Section {
                HStack(spacing: 8) {
                    Button("Validate") {
                        viewModel.validateConfig()
                    }
                    .controlSize(.small)
                    .disabled(viewModel.isRunning)

                    Spacer()

                    Button("Clear") {
                        viewModel.clearLog()
                    }
                    .controlSize(.small)
                }

                HStack(spacing: 8) {
                    Button {
                        viewModel.runPhase(viewModel.selectedPhase)
                    } label: {
                        Label("Run \(phase.displayName)", systemImage: "play.fill")
                    }
                    .buttonStyle(.borderedProminent)
                    .tint(.green)
                    .disabled(!viewModel.canStart(viewModel.selectedPhase))

                    Button(action: viewModel.stopPhase) {
                        Label("Stop", systemImage: "stop.fill")
                    }
                    .buttonStyle(.borderedProminent)
                    .tint(.red)
                    .disabled(!viewModel.isRunning)
                }
            }
        }
        .formStyle(.grouped)
        .padding(.top, 4)
    }
}

private struct NumberRow: View {
    let label: String
    @Binding var value: Int

    var body: some View {
        HStack {
            Text(label)
            Spacer()
            TextField("", value: $value, format: .number)
                .textFieldStyle(.roundedBorder)
                .frame(width: 80)
                .multilineTextAlignment(.trailing)
        }
    }
}

private struct ValidationRow: View {
    let label: String
    let valid: Bool

    var body: some View {
        HStack {
            Image(systemName: valid ? "checkmark.circle.fill" : "xmark.circle.fill")
                .foregroundStyle(valid ? .green : .red)
                .imageScale(.small)
            Text(label)
                .font(.system(.caption, design: .monospaced))
                .lineLimit(1)
                .truncationMode(.middle)
            Spacer()
        }
    }
}
