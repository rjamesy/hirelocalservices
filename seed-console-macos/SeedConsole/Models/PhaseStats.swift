import Foundation

struct PhaseStats {
    // Extract
    var apiCallsMade: Int = 0
    var uniquePlaceIds: Int = 0
    var newPlaceIds: Int = 0
    var alreadySeen: Int = 0
    var duplicates: Int = 0
    var apiErrors: Int = 0

    // Normalize
    var normalized: Int = 0
    var readyForAi: Int = 0
    var rejected: Int = 0
    var blacklisted: Int = 0

    // Generate Descriptions
    var candidatesProcessed: Int = 0
    var descriptionsGenerated: Int = 0
    var descriptionsFallback: Int = 0
    var aiCalls: Int = 0
    var tokens: Int = 0

    // Publish
    var published: Int = 0
    var skippedAlreadyPublished: Int = 0
    var errors: Int = 0

    // String values
    var estCost: String = ""
    var batchId: String = ""
    var runId: String = ""

    var hasData: Bool {
        apiCallsMade > 0 || uniquePlaceIds > 0 || normalized > 0
        || candidatesProcessed > 0 || published > 0 || errors > 0
        || !estCost.isEmpty
    }

    mutating func parseLine(_ line: String, phase: PipelinePhase) {
        switch phase {
        case .extract: parseExtract(line)
        case .normalize: parseNormalize(line)
        case .generateDescriptions: parseGenDesc(line)
        case .publish: parsePublish(line)
        case .coverageReport: break
        }
    }

    // MARK: - Extract

    private mutating func parseExtract(_ line: String) {
        if let v = Self.extractInt(from: line, key: "API calls made:") {
            apiCallsMade = v
        } else if line.contains("Unique place_ids:") {
            // Parse "X (Y new, Z already seen)"
            if let v = Self.extractInt(from: line, key: "Unique place_ids:") {
                uniquePlaceIds = v
            }
            if let range = line.range(of: #"(\d+) new"#, options: .regularExpression) {
                let numStr = line[range].split(separator: " ").first ?? ""
                newPlaceIds = Int(numStr) ?? newPlaceIds
            }
            if let range = line.range(of: #"(\d+) already seen"#, options: .regularExpression) {
                let numStr = line[range].split(separator: " ").first ?? ""
                alreadySeen = Int(numStr) ?? alreadySeen
            }
        } else if let v = Self.extractInt(from: line, key: "Duplicates:") {
            duplicates = v
        } else if let v = Self.extractInt(from: line, key: "API errors:") {
            apiErrors = v
        } else if let s = Self.extractString(from: line, key: "Est. cost:") {
            estCost = s
        }
    }

    // MARK: - Normalize

    private mutating func parseNormalize(_ line: String) {
        if let v = Self.extractInt(from: line, key: "API calls made:") {
            apiCallsMade = v
        } else if let v = Self.extractInt(from: line, key: "Normalized:") {
            normalized = v
        } else if let v = Self.extractInt(from: line, key: "Ready for AI:") {
            readyForAi = v
        } else if let v = Self.extractInt(from: line, key: "Rejected:") {
            rejected = v
        } else if let v = Self.extractInt(from: line, key: "Blacklisted:") {
            blacklisted = v
        } else if let s = Self.extractString(from: line, key: "Est. cost:") {
            estCost = s
        }
    }

    // MARK: - Generate Descriptions

    private mutating func parseGenDesc(_ line: String) {
        if let v = Self.extractInt(from: line, key: "Candidates processed:") {
            candidatesProcessed = v
        } else if line.contains("Descriptions:") {
            // Parse "X generated, Y fallback"
            if let range = line.range(of: #"(\d+) generated"#, options: .regularExpression) {
                let numStr = line[range].split(separator: " ").first ?? ""
                descriptionsGenerated = Int(numStr) ?? descriptionsGenerated
            }
            if let range = line.range(of: #"(\d+) fallback"#, options: .regularExpression) {
                let numStr = line[range].split(separator: " ").first ?? ""
                descriptionsFallback = Int(numStr) ?? descriptionsFallback
            }
        } else if let v = Self.extractInt(from: line, key: "AI calls:") {
            aiCalls = v
        } else if let v = Self.extractInt(from: line, key: "Tokens:") {
            tokens = v
        } else if let s = Self.extractString(from: line, key: "Est. cost:") {
            estCost = s
        } else if let s = Self.extractString(from: line, key: "Run ID:") {
            runId = s
        }
    }

    // MARK: - Publish

    private mutating func parsePublish(_ line: String) {
        if let v = Self.extractInt(from: line, key: "Published:") {
            published = v
        } else if let v = Self.extractInt(from: line, key: "Skipped (already pub'd):") {
            skippedAlreadyPublished = v
        } else if let v = Self.extractInt(from: line, key: "Errors:") {
            errors = v
        } else if let s = Self.extractString(from: line, key: "Batch ID:") {
            batchId = s
        } else if let s = Self.extractString(from: line, key: "Run ID:") {
            runId = s
        }
    }

    // MARK: - Helpers

    private static func extractInt(from line: String, key: String) -> Int? {
        let trimmed = line.trimmingCharacters(in: .whitespaces)
        guard trimmed.contains(key) else { return nil }
        guard let keyRange = trimmed.range(of: key) else { return nil }
        let rest = trimmed[keyRange.upperBound...].trimmingCharacters(in: .whitespaces)
        // Take first number-like token
        let token = rest.split(separator: " ").first.map(String.init) ?? rest
        // Strip commas from numbers like "1,234"
        let cleaned = token.replacingOccurrences(of: ",", with: "")
        return Int(cleaned)
    }

    private static func extractString(from line: String, key: String) -> String? {
        let trimmed = line.trimmingCharacters(in: .whitespaces)
        guard trimmed.contains(key) else { return nil }
        guard let keyRange = trimmed.range(of: key) else { return nil }
        let rest = trimmed[keyRange.upperBound...].trimmingCharacters(in: .whitespaces)
        return rest.isEmpty ? nil : String(rest)
    }
}
