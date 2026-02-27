import Foundation

struct SeedRegion: Identifiable, Hashable {
    let id: String
    let name: String
    let state: String
}

struct Category: Identifiable, Hashable {
    let id: String
    let slug: String
    let name: String
}

enum SeedEnvironment: String, CaseIterable, Identifiable {
    case dev = "dev"
    case prod = "prod"

    var id: String { rawValue }
    var label: String {
        switch self {
        case .dev: return "Development"
        case .prod: return "Production"
        }
    }
}

enum SeedConfig {
    static let regions: [SeedRegion] = [
        SeedRegion(id: "seq", name: "SEQ (South-East QLD)", state: "QLD"),
    ]

    static let categories: [Category] = [
        Category(id: "all", slug: "all", name: "All Categories"),
        // Cleaning
        Category(id: "house-cleaning", slug: "house-cleaning", name: "House Cleaning"),
        Category(id: "office-cleaning", slug: "office-cleaning", name: "Office Cleaning"),
        Category(id: "carpet-cleaning", slug: "carpet-cleaning", name: "Carpet Cleaning"),
        Category(id: "window-cleaning", slug: "window-cleaning", name: "Window Cleaning"),
        Category(id: "end-of-lease-cleaning", slug: "end-of-lease-cleaning", name: "End of Lease Cleaning"),
        Category(id: "aircon-cleaning", slug: "aircon-cleaning", name: "Aircon Cleaning"),
        // Home Maintenance
        Category(id: "handyman", slug: "handyman", name: "Handyman"),
        Category(id: "painting", slug: "painting", name: "Painting"),
        Category(id: "plumbing", slug: "plumbing", name: "Plumbing"),
        Category(id: "electrical", slug: "electrical", name: "Electrical"),
        Category(id: "carpentry", slug: "carpentry", name: "Carpentry"),
        Category(id: "fencing", slug: "fencing", name: "Fencing"),
        Category(id: "roofing", slug: "roofing", name: "Roofing"),
        Category(id: "guttering", slug: "guttering", name: "Guttering"),
        // Outdoor
        Category(id: "lawn-mowing", slug: "lawn-mowing", name: "Lawn Mowing"),
        Category(id: "gardening", slug: "gardening", name: "Gardening"),
        Category(id: "tree-removal", slug: "tree-removal", name: "Tree Removal"),
        Category(id: "landscaping", slug: "landscaping", name: "Landscaping"),
        Category(id: "pressure-washing", slug: "pressure-washing", name: "Pressure Washing"),
        // Automotive
        Category(id: "mobile-mechanic", slug: "mobile-mechanic", name: "Mobile Mechanic"),
        Category(id: "car-detailing", slug: "car-detailing", name: "Car Detailing"),
        Category(id: "towing", slug: "towing", name: "Towing"),
        // Moving
        Category(id: "removalists", slug: "removalists", name: "Removalists"),
        Category(id: "furniture-assembly", slug: "furniture-assembly", name: "Furniture Assembly"),
        Category(id: "courier", slug: "courier", name: "Courier"),
        Category(id: "rubbish-removal", slug: "rubbish-removal", name: "Rubbish Removal"),
        // Pest Control
        Category(id: "general-pest-control", slug: "general-pest-control", name: "General Pest Control"),
        Category(id: "termite-inspection", slug: "termite-inspection", name: "Termite Inspection"),
        Category(id: "rodent-control", slug: "rodent-control", name: "Rodent Control"),
        // Pet Services
        Category(id: "dog-walking", slug: "dog-walking", name: "Dog Walking"),
        Category(id: "pet-grooming", slug: "pet-grooming", name: "Pet Grooming"),
        Category(id: "pet-sitting", slug: "pet-sitting", name: "Pet Sitting"),
        // Beauty & Wellness
        Category(id: "mobile-hairdresser", slug: "mobile-hairdresser", name: "Mobile Hairdresser"),
        Category(id: "mobile-beauty", slug: "mobile-beauty", name: "Mobile Beauty"),
        Category(id: "massage-therapist", slug: "massage-therapist", name: "Massage Therapist"),
        // IT & Tech
        Category(id: "computer-repair", slug: "computer-repair", name: "Computer Repair"),
        Category(id: "phone-repair", slug: "phone-repair", name: "Phone Repair"),
        Category(id: "smart-home-setup", slug: "smart-home-setup", name: "Smart Home Setup"),
        // Events
        Category(id: "photography", slug: "photography", name: "Photography"),
        Category(id: "dj", slug: "dj", name: "DJ"),
        Category(id: "catering", slug: "catering", name: "Catering"),
        Category(id: "party-hire", slug: "party-hire", name: "Party Hire"),
    ]

    static let baseEnvVars = [
        "NEXT_PUBLIC_SUPABASE_URL",
        "SUPABASE_SERVICE_ROLE_KEY",
    ]
}
