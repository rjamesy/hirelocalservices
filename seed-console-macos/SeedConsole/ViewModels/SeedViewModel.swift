import Foundation
import SwiftUI

struct PipelineCounts {
    var seenPlaceIds: Int = 0
    var totalCandidates: Int = 0
    var readyForAi: Int = 0
    var readyToPublish: Int = 0
    var published: Int = 0
    var rejected: Int = 0
    var lastRefreshed: Date? = nil
}

@Observable
final class SeedViewModel {
    // MARK: - Phase Selection
    var selectedPhase: PipelinePhase = .extract
    var activePhase: PipelinePhase? = nil  // nil when idle

    // MARK: - Shared Config
    var environment: SeedEnvironment = .dev
    var selectedRegion: String = "seq"
    var selectedCategory: String = "all"
    var dryRun: Bool = true
    var force: Bool = false

    // MARK: - Phase-Specific Inputs
    var maxPlaces: Int = 1000
    var maxApiCalls: Int = 500
    var maxAiCalls: Int = 200
    var maxCostUsd: Double = 1.0
    var limit: Int = 0
    var concurrency: Int = 3

    // MARK: - Safety
    var prodConfirmed: Bool = false
    var publishConfirmationText: String = ""

    // MARK: - Output
    var logOutput: String = ""
    var stats: PhaseStats = PhaseStats()

    // MARK: - Status Panel
    var statusCounts: PipelineCounts? = nil
    var isRefreshingStatus: Bool = false

    // MARK: - Validation
    var configValidation: ConfigValidation?

    struct ConfigValidation {
        var scriptExists: Bool = false
        var tsxExists: Bool = false
        var envVarsPresent: [String: Bool] = [:]

        var allValid: Bool {
            scriptExists && tsxExists && envVarsPresent.values.allSatisfy { $0 }
        }
    }

    var projectPath: String {
        get {
            UserDefaults.standard.string(forKey: "projectPath")
                ?? "/Users/rjamesy/AndroidStudioProjects/HireLocalServices"
        }
        set {
            UserDefaults.standard.set(newValue, forKey: "projectPath")
        }
    }

    // MARK: - Private
    private var process: Process?
    private var killTimer: DispatchWorkItem?

    // MARK: - Computed

    var isRunning: Bool {
        activePhase != nil
    }

    func canStart(_ phase: PipelinePhase) -> Bool {
        guard !isRunning else { return false }
        if environment == .prod && !dryRun && !prodConfirmed {
            return false
        }
        if phase.isDestructive && environment == .prod && !dryRun {
            if publishConfirmationText != "PUBLISH" {
                return false
            }
        }
        return true
    }

    // MARK: - Actions

    func runPhase(_ phase: PipelinePhase) {
        guard canStart(phase) else { return }

        guard let npxPath = resolveExecutable("npx") else {
            appendLog("[ERROR] Cannot find 'npx' in PATH. Is Node.js installed?\n")
            return
        }

        // Build arguments
        var args = ["tsx", phase.scriptPath]

        if phase.requiresRegion {
            args.append(contentsOf: ["--region", selectedRegion])
        }
        if phase.supportsCategory && selectedCategory != "all" {
            args.append(contentsOf: ["--category", selectedCategory])
        }
        if phase.supportsMaxPlaces {
            args.append(contentsOf: ["--max-places", "\(maxPlaces)"])
        }
        if phase.supportsMaxApiCalls {
            args.append(contentsOf: ["--max-api-calls", "\(maxApiCalls)"])
        }
        if phase.supportsMaxAiCalls {
            args.append(contentsOf: ["--max-ai-calls", "\(maxAiCalls)"])
        }
        if phase.supportsMaxCost {
            args.append(contentsOf: ["--max-cost", String(format: "%.2f", maxCostUsd)])
        }
        if phase.supportsLimit && limit > 0 {
            args.append(contentsOf: ["--limit", "\(limit)"])
        }
        if phase.supportsConcurrency {
            args.append(contentsOf: ["--concurrency", "\(concurrency)"])
        }
        if phase.supportsDryRun && dryRun {
            args.append("--dry-run")
        }
        if phase.supportsForce && force {
            args.append("--force")
        }

        // Reset state
        stats = PhaseStats()
        activePhase = phase
        appendLog("--- Starting \(phase.displayName) ---\n")
        appendLog("Environment: \(environment.label)\n")
        appendLog("Command: npx \(args.dropFirst().joined(separator: " "))\n")
        appendLog("Project: \(projectPath)\n\n")

        // Configure process
        let proc = Process()
        proc.executableURL = URL(fileURLWithPath: npxPath)
        proc.arguments = args
        proc.currentDirectoryURL = URL(fileURLWithPath: projectPath)

        // Build environment
        var env = ProcessInfo.processInfo.environment

        let nodeDirs = [
            "/opt/homebrew/bin",
            "/opt/homebrew/sbin",
            "/usr/local/bin",
            "\(NSHomeDirectory())/.nvm/current/bin",
            "\(NSHomeDirectory())/.volta/bin",
            "\(NSHomeDirectory())/.fnm/current/bin",
        ]
        let existingPath = env["PATH"] ?? "/usr/bin:/bin:/usr/sbin:/sbin"
        env["PATH"] = (nodeDirs + [existingPath]).joined(separator: ":")

        if environment == .prod {
            let prodEnv = loadEnvFile("~/.seedconsole/prod.env")
            env.merge(prodEnv) { _, new in new }
        }

        proc.environment = env

        // Pipes
        let outputPipe = Pipe()
        let errorPipe = Pipe()
        proc.standardOutput = outputPipe
        proc.standardError = errorPipe

        let currentPhase = phase

        outputPipe.fileHandleForReading.readabilityHandler = { [weak self] handle in
            let data = handle.availableData
            guard !data.isEmpty, let str = String(data: data, encoding: .utf8) else { return }
            DispatchQueue.main.async {
                self?.handleOutput(str, phase: currentPhase)
            }
        }

        errorPipe.fileHandleForReading.readabilityHandler = { [weak self] handle in
            let data = handle.availableData
            guard !data.isEmpty, let str = String(data: data, encoding: .utf8) else { return }
            DispatchQueue.main.async {
                self?.handleOutput("[stderr] \(str)", phase: currentPhase)
            }
        }

        proc.terminationHandler = { [weak self] proc in
            DispatchQueue.main.async {
                self?.killTimer?.cancel()
                self?.killTimer = nil
                self?.activePhase = nil
                outputPipe.fileHandleForReading.readabilityHandler = nil
                errorPipe.fileHandleForReading.readabilityHandler = nil
                let code = proc.terminationStatus
                self?.appendLog("\n--- \(currentPhase.displayName) exited with code \(code) ---\n")
            }
        }

        do {
            try proc.run()
            self.process = proc
        } catch {
            appendLog("[ERROR] Failed to launch: \(error.localizedDescription)\n")
            activePhase = nil
        }
    }

    func stopPhase() {
        guard let proc = process, proc.isRunning else { return }

        appendLog("\n[STOP] Sending SIGINT...\n")
        proc.interrupt()

        let killWork = DispatchWorkItem { [weak self] in
            guard let proc = self?.process, proc.isRunning else { return }
            self?.appendLog("[STOP] Process did not exit after 5s, sending SIGKILL...\n")
            proc.terminate()
        }
        killTimer = killWork
        DispatchQueue.main.asyncAfter(deadline: .now() + 5, execute: killWork)
    }

    func validateConfig() {
        var validation = ConfigValidation()

        let scriptPath = (projectPath as NSString)
            .appendingPathComponent(selectedPhase.scriptPath)
        validation.scriptExists = FileManager.default.fileExists(atPath: scriptPath)

        let tsxPath = (projectPath as NSString)
            .appendingPathComponent("node_modules/.bin/tsx")
        validation.tsxExists = FileManager.default.fileExists(atPath: tsxPath)

        let processEnv = ProcessInfo.processInfo.environment
        let envFile: [String: String]
        if environment == .prod {
            envFile = loadEnvFile("~/.seedconsole/prod.env")
        } else {
            let envLocalPath = (projectPath as NSString).appendingPathComponent(".env.local")
            envFile = loadEnvFile(envLocalPath)
        }

        let requiredVars = SeedConfig.baseEnvVars + selectedPhase.additionalEnvVars
        for key in requiredVars {
            let inFile = envFile[key].map { !$0.isEmpty } ?? false
            let inProcess = processEnv[key].map { !$0.isEmpty } ?? false
            validation.envVarsPresent[key] = inFile || inProcess
        }

        configValidation = validation

        appendLog("--- Config Validation (\(selectedPhase.displayName)) ---\n")
        appendLog("  \(selectedPhase.scriptPath): \(validation.scriptExists ? "found" : "MISSING")\n")
        appendLog("  tsx binary: \(validation.tsxExists ? "found" : "MISSING")\n")
        for key in requiredVars {
            let ok = validation.envVarsPresent[key] ?? false
            appendLog("  \(key): \(ok ? "set" : "MISSING")\n")
        }
        appendLog("  Result: \(validation.allValid ? "ALL OK" : "ISSUES FOUND")\n\n")
    }

    func clearLog() {
        logOutput = ""
        stats = PhaseStats()
        configValidation = nil
    }

    func browseProjectPath() {
        let panel = NSOpenPanel()
        panel.canChooseDirectories = true
        panel.canChooseFiles = false
        panel.allowsMultipleSelection = false
        panel.message = "Select HireLocalServices project directory"
        panel.directoryURL = URL(fileURLWithPath: projectPath)

        if panel.runModal() == .OK, let url = panel.url {
            projectPath = url.path
        }
    }

    // MARK: - Status Panel (Supabase REST)

    func refreshStatus() {
        guard !isRefreshingStatus else { return }

        let envFile: [String: String]
        if environment == .prod {
            envFile = loadEnvFile("~/.seedconsole/prod.env")
        } else {
            let envLocalPath = (projectPath as NSString).appendingPathComponent(".env.local")
            envFile = loadEnvFile(envLocalPath)
        }

        guard let supabaseUrl = envFile["NEXT_PUBLIC_SUPABASE_URL"], !supabaseUrl.isEmpty,
              let serviceKey = envFile["SUPABASE_SERVICE_ROLE_KEY"], !serviceKey.isEmpty else {
            appendLog("[STATUS] Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY\n")
            return
        }

        isRefreshingStatus = true

        let queries: [(String, String, WritableKeyPath<PipelineCounts, Int>)] = [
            ("seed_seen_places", "", \.seenPlaceIds),
            ("seed_candidates", "", \.totalCandidates),
            ("seed_candidates", "status=eq.ready_for_ai", \.readyForAi),
            ("seed_candidates", "ai_validation_status=eq.approved&publish_status=eq.unpublished", \.readyToPublish),
            ("seed_candidates", "publish_status=eq.published", \.published),
            ("seed_candidates", "status=eq.rejected_low_quality", \.rejected),
        ]

        var counts = PipelineCounts()
        let group = DispatchGroup()

        for (table, filter, keyPath) in queries {
            group.enter()

            var urlString = "\(supabaseUrl)/rest/v1/\(table)?select=count"
            if !filter.isEmpty {
                urlString += "&\(filter)"
            }

            guard let url = URL(string: urlString) else {
                group.leave()
                continue
            }

            var request = URLRequest(url: url)
            request.setValue(serviceKey, forHTTPHeaderField: "apikey")
            request.setValue("Bearer \(serviceKey)", forHTTPHeaderField: "Authorization")
            request.setValue("count=exact", forHTTPHeaderField: "Prefer")
            request.httpMethod = "HEAD"

            URLSession.shared.dataTask(with: request) { _, response, _ in
                if let httpResponse = response as? HTTPURLResponse,
                   let countHeader = httpResponse.value(forHTTPHeaderField: "content-range") {
                    // content-range: 0-0/123 or */123
                    let parts = countHeader.split(separator: "/")
                    if let last = parts.last, let count = Int(last) {
                        counts[keyPath: keyPath] = count
                    }
                }
                group.leave()
            }.resume()
        }

        group.notify(queue: .main) { [weak self] in
            counts.lastRefreshed = Date()
            self?.statusCounts = counts
            self?.isRefreshingStatus = false
        }
    }

    // MARK: - Private Helpers

    private func appendLog(_ text: String) {
        logOutput += text
    }

    private func handleOutput(_ text: String, phase: PipelinePhase) {
        appendLog(text)
        let lines = text.components(separatedBy: .newlines)
        for line in lines {
            stats.parseLine(line, phase: phase)
        }
    }

    private func resolveExecutable(_ name: String) -> String? {
        let knownPaths = [
            "/opt/homebrew/bin/\(name)",
            "/usr/local/bin/\(name)",
            "/Users/\(NSUserName())/.nvm/current/bin/\(name)",
            "/Users/\(NSUserName())/.volta/bin/\(name)",
            "/Users/\(NSUserName())/.fnm/current/bin/\(name)",
        ]

        for path in knownPaths {
            if FileManager.default.isExecutableFile(atPath: path) {
                return path
            }
        }

        let whichProcess = Process()
        whichProcess.executableURL = URL(fileURLWithPath: "/usr/bin/which")
        whichProcess.arguments = [name]

        let pipe = Pipe()
        whichProcess.standardOutput = pipe
        whichProcess.standardError = Pipe()

        do {
            try whichProcess.run()
            whichProcess.waitUntilExit()

            let data = pipe.fileHandleForReading.readDataToEndOfFile()
            guard let path = String(data: data, encoding: .utf8)?
                .trimmingCharacters(in: .whitespacesAndNewlines),
                !path.isEmpty else {
                return nil
            }
            return path
        } catch {
            return nil
        }
    }

    func loadEnvFile(_ path: String) -> [String: String] {
        let expandedPath = NSString(string: path).expandingTildeInPath
        guard let content = try? String(contentsOfFile: expandedPath, encoding: .utf8) else {
            return [:]
        }

        var result: [String: String] = [:]
        for line in content.components(separatedBy: .newlines) {
            let trimmed = line.trimmingCharacters(in: .whitespaces)
            if trimmed.isEmpty || trimmed.hasPrefix("#") { continue }

            if let eqIndex = trimmed.firstIndex(of: "=") {
                let key = String(trimmed[trimmed.startIndex..<eqIndex])
                    .trimmingCharacters(in: .whitespaces)
                var value = String(trimmed[trimmed.index(after: eqIndex)...])
                    .trimmingCharacters(in: .whitespaces)

                if (value.hasPrefix("\"") && value.hasSuffix("\"")) ||
                   (value.hasPrefix("'") && value.hasSuffix("'")) {
                    value = String(value.dropFirst().dropLast())
                }

                result[key] = value
            }
        }
        return result
    }
}
