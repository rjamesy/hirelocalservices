import Foundation

enum PipelinePhase: String, CaseIterable, Identifiable {
    case extract
    case normalize
    case generateDescriptions
    case publish
    case coverageReport

    var id: String { rawValue }

    var displayName: String {
        switch self {
        case .extract: return "Extract"
        case .normalize: return "Normalize"
        case .generateDescriptions: return "Gen Descriptions"
        case .publish: return "Publish"
        case .coverageReport: return "Coverage"
        }
    }

    var scriptPath: String {
        switch self {
        case .extract: return "scripts/seed-extract.ts"
        case .normalize: return "scripts/seed-normalize.ts"
        case .generateDescriptions: return "scripts/seed-generate-descriptions.ts"
        case .publish: return "scripts/seed-publish.ts"
        case .coverageReport: return "scripts/seed-coverage-report.ts"
        }
    }

    // MARK: - Capability Flags

    var supportsCategory: Bool {
        self != .coverageReport
    }

    var supportsDryRun: Bool {
        self != .coverageReport
    }

    var supportsForce: Bool {
        self != .coverageReport
    }

    var supportsConcurrency: Bool {
        switch self {
        case .normalize, .generateDescriptions, .publish: return true
        default: return false
        }
    }

    var supportsMaxApiCalls: Bool {
        switch self {
        case .extract, .normalize: return true
        default: return false
        }
    }

    var supportsMaxPlaces: Bool {
        self == .extract
    }

    var supportsMaxAiCalls: Bool {
        self == .generateDescriptions
    }

    var supportsMaxCost: Bool {
        self == .generateDescriptions
    }

    var supportsLimit: Bool {
        switch self {
        case .normalize, .generateDescriptions, .publish: return true
        default: return false
        }
    }

    var isDestructive: Bool {
        self == .publish
    }

    var requiresRegion: Bool {
        self != .coverageReport
    }

    // MARK: - Environment Variables

    var additionalEnvVars: [String] {
        switch self {
        case .extract, .normalize:
            return ["GOOGLE_PLACES_API_KEY"]
        case .generateDescriptions:
            return ["OPENAI_API_KEY"]
        case .publish, .coverageReport:
            return []
        }
    }
}
