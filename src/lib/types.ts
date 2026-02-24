// ─── Database Row Types ─────────────────────────────────────────────
// NOTE: Using `type` aliases (not `interface`) so these satisfy
// Record<string, unknown> which Supabase's GenericTable requires.

export type Profile = {
  id: string
  email: string
  role: 'business' | 'admin'
  created_at: string
}

export type VerificationStatus = 'pending' | 'approved' | 'review' | 'rejected' | 'suspended'

export type ListingSource = 'manual' | 'osm' | 'csv_import'

export type ClaimStatus = 'unclaimed' | 'pending' | 'claimed'

export type PendingChanges = {
  name?: string
  description?: string | null
  phone?: string | null
  email_contact?: string | null
  website?: string | null
  abn?: string | null
}

export type Business = {
  id: string
  owner_id: string
  name: string
  slug: string
  description: string | null
  phone: string | null
  email_contact: string | null
  website: string | null
  abn: string | null
  status: 'draft' | 'published' | 'suspended' | 'paused'
  is_seed: boolean
  claim_status: ClaimStatus
  seed_source: string | null
  seed_source_id: string | null
  verification_status: VerificationStatus
  listing_source: ListingSource
  billing_status: BillingStatus
  trial_ends_at: string | null
  pending_changes: PendingChanges | null
  created_at: string
  updated_at: string
}

export type BusinessContact = {
  id: string
  business_id: string
  phone: string | null
  email: string | null
  website: string | null
  has_contact: boolean
  verified_at: string | null
  created_at: string
  updated_at: string
}

export type DeterministicResults = {
  spam_score: number
  duplicate_score: number
  phone_valid: boolean | null
  email_valid: boolean | null
  pass: boolean
}

export type AIReviewResults = {
  spam_likelihood: number
  toxicity: number
  real_business: number
  is_blocked_category: boolean
  blocked_reason: string | null
  summary: string
}

export type VerificationJob = {
  id: string
  business_id: string
  status: VerificationStatus
  deterministic_result: DeterministicResults | null
  ai_result: AIReviewResults | null
  final_decision: VerificationStatus | null
  reviewer_id: string | null
  created_at: string
  updated_at: string
}

export type AdminReview = {
  id: string
  verification_job_id: string
  reviewer_id: string
  decision: VerificationStatus
  notes: string | null
  created_at: string
}

export type ClaimMatchScore = {
  name_score: number
  phone_score: number
  website_score: number
  location_score: number
  weighted_total: number
  signals_used: number
}

export type BusinessClaim = {
  id: string
  business_id: string
  claimer_id: string
  status: 'pending' | 'approved' | 'rejected'
  claimed_business_name: string | null
  claimed_phone: string | null
  claimed_website: string | null
  claimed_email: string | null
  claimed_postcode: string | null
  match_score: ClaimMatchScore | null
  verification_method: string | null
  admin_notes: string | null
  created_at: string
  reviewed_at: string | null
  reviewed_by: string | null
}

export type BusinessLocation = {
  id: string
  business_id: string
  address_text: string | null
  suburb: string | null
  state: string | null
  postcode: string | null
  lat: number | null
  lng: number | null
  geom: unknown | null
  service_radius_km: number
}

export type Category = {
  id: string
  name: string
  slug: string
  parent_id: string | null
}

export type BusinessCategory = {
  business_id: string
  category_id: string
}

export type Photo = {
  id: string
  business_id: string
  url: string
  sort_order: number
  created_at: string
}

export type Testimonial = {
  id: string
  business_id: string
  author_name: string
  text: string
  rating: number
  created_at: string
}

export type PlanTier = 'free_trial' | 'basic' | 'premium' | 'premium_annual'

export type BillingStatus = 'active' | 'trial' | 'billing_suspended'

export type Subscription = {
  id: string
  business_id: string
  stripe_customer_id: string | null
  stripe_subscription_id: string | null
  status: SubscriptionStatus
  plan: PlanTier
  stripe_price_id: string | null
  current_period_end: string | null
  cancel_at_period_end: boolean
  updated_at: string
}

export type UserSubscription = {
  id: string
  user_id: string
  stripe_customer_id: string | null
  stripe_subscription_id: string | null
  status: SubscriptionStatus
  plan: PlanTier
  stripe_price_id: string | null
  current_period_start: string | null
  current_period_end: string | null
  cancel_at_period_end: boolean
  trial_ends_at: string | null
  updated_at: string
}

export type Report = {
  id: string
  business_id: string
  reporter_ip_hash: string
  reason: ReportReason
  details: string | null
  status: 'open' | 'resolved'
  created_at: string
}

export type BusinessMetrics = {
  id: string
  business_id: string
  date: string
  search_impressions: number
  profile_views: number
  created_at: string
  updated_at: string
}

export type BlacklistEntry = {
  id: string
  term: string
  match_type: 'exact' | 'contains' | 'starts_with'
  reason: string | null
  added_by: string | null
  is_active: boolean
  created_at: string
}

export type Postcode = {
  id: number
  postcode: string
  suburb: string
  state: string
  lat: number
  lng: number
}

export type SystemSettingKey =
  | 'openai_api_key'
  | 'seed_visibility_days'
  | 'mask_seed_phone'
  | 'seed_exposure_level'
  | 'seed_source_osm'
  | 'seed_source_manual'
  | 'ranking_weight_premium_annual'
  | 'ranking_weight_premium'
  | 'ranking_weight_basic'
  | 'ranking_weight_trial'
  | 'exposure_balance_strength'
  | 'email_template_subject'
  | 'email_template_body'
  | 'ai_verification_enabled'
  | 'ai_verification_strictness'
  | 'max_premium_listings'

export type SystemSetting = {
  key: SystemSettingKey
  value: unknown
  updated_at: string
  updated_by: string | null
}

export type AuditAction =
  | 'listing_created'
  | 'listing_updated'
  | 'listing_claimed'
  | 'listing_suspended'
  | 'listing_unsuspended'
  | 'listing_unlisted'
  | 'listing_claim_submitted'
  | 'listing_claim_approved'
  | 'listing_claim_rejected'
  | 'seed_ingested'
  | 'reset_executed'
  | 'settings_changed'
  | 'verification_completed'

export type AuditLogEntry = {
  id: string
  action: AuditAction
  entity_type: string | null
  entity_id: string | null
  actor_id: string | null
  details: Record<string, unknown>
  created_at: string
}

// ─── Enums ──────────────────────────────────────────────────────────

export type AustralianState =
  | 'QLD'
  | 'NSW'
  | 'VIC'
  | 'SA'
  | 'WA'
  | 'TAS'
  | 'NT'
  | 'ACT'

export type SubscriptionStatus =
  | 'active'
  | 'past_due'
  | 'canceled'
  | 'unpaid'
  | 'incomplete'

export type ReportReason = 'spam' | 'inappropriate' | 'fake' | 'other'

// ─── Search Types ───────────────────────────────────────────────────

export type SearchParams = {
  category?: string
  lat?: number
  lng?: number
  radius_km?: number
  keyword?: string
  page?: number
}

export type SearchResult = {
  id: string
  name: string
  slug: string
  phone: string | null
  website: string | null
  description: string | null
  listing_source: ListingSource
  is_claimed: boolean
  suburb: string | null
  state: string | null
  postcode: string | null
  service_radius_km: number | null
  distance_m: number | null
  category_names: string[]
  avg_rating: number | null
  review_count: number
  photo_url: string | null
  total_count: number
}

// ─── Composite Types ────────────────────────────────────────────────

export type BusinessWithDetails = Business & {
  locations: BusinessLocation[]
  categories: (BusinessCategory & { category: Category })[]
  photos: Photo[]
  testimonials: Testimonial[]
  subscription: Subscription | null
  owner: Profile | null
}

// ─── Database Schema (for Supabase typed client) ────────────────────

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: Profile
        Insert: Omit<Profile, 'created_at'>
        Update: Partial<Omit<Profile, 'id' | 'created_at'>>
        Relationships: []
      }
      businesses: {
        Row: Business
        Insert: Omit<Business, 'id' | 'created_at' | 'updated_at' | 'is_seed' | 'claim_status' | 'seed_source' | 'seed_source_id' | 'verification_status' | 'listing_source' | 'pending_changes' | 'billing_status' | 'trial_ends_at'> & Partial<Pick<Business, 'is_seed' | 'claim_status' | 'seed_source' | 'seed_source_id' | 'verification_status' | 'listing_source' | 'pending_changes' | 'billing_status' | 'trial_ends_at'>>
        Update: Partial<Omit<Business, 'id' | 'created_at' | 'owner_id'>>
        Relationships: [
          {
            foreignKeyName: 'businesses_owner_id_fkey'
            columns: ['owner_id']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
        ]
      }
      business_contacts: {
        Row: BusinessContact
        Insert: Omit<BusinessContact, 'id' | 'created_at' | 'updated_at' | 'has_contact' | 'verified_at'> & Partial<Pick<BusinessContact, 'verified_at'>>
        Update: Partial<Omit<BusinessContact, 'id' | 'created_at' | 'has_contact'>>
        Relationships: [
          {
            foreignKeyName: 'business_contacts_business_id_fkey'
            columns: ['business_id']
            isOneToOne: true
            referencedRelation: 'businesses'
            referencedColumns: ['id']
          },
        ]
      }
      business_locations: {
        Row: BusinessLocation
        Insert: Omit<BusinessLocation, 'id' | 'geom'>
        Update: Partial<Omit<BusinessLocation, 'id' | 'geom'>>
        Relationships: [
          {
            foreignKeyName: 'business_locations_business_id_fkey'
            columns: ['business_id']
            isOneToOne: false
            referencedRelation: 'businesses'
            referencedColumns: ['id']
          },
        ]
      }
      categories: {
        Row: Category
        Insert: Omit<Category, 'id'>
        Update: Partial<Omit<Category, 'id'>>
        Relationships: [
          {
            foreignKeyName: 'categories_parent_id_fkey'
            columns: ['parent_id']
            isOneToOne: false
            referencedRelation: 'categories'
            referencedColumns: ['id']
          },
        ]
      }
      business_categories: {
        Row: BusinessCategory
        Insert: BusinessCategory
        Update: Partial<BusinessCategory>
        Relationships: [
          {
            foreignKeyName: 'business_categories_business_id_fkey'
            columns: ['business_id']
            isOneToOne: false
            referencedRelation: 'businesses'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'business_categories_category_id_fkey'
            columns: ['category_id']
            isOneToOne: false
            referencedRelation: 'categories'
            referencedColumns: ['id']
          },
        ]
      }
      photos: {
        Row: Photo
        Insert: Omit<Photo, 'id' | 'created_at'>
        Update: Partial<Omit<Photo, 'id' | 'created_at'>>
        Relationships: [
          {
            foreignKeyName: 'photos_business_id_fkey'
            columns: ['business_id']
            isOneToOne: false
            referencedRelation: 'businesses'
            referencedColumns: ['id']
          },
        ]
      }
      testimonials: {
        Row: Testimonial
        Insert: Omit<Testimonial, 'id' | 'created_at'>
        Update: Partial<Omit<Testimonial, 'id' | 'created_at'>>
        Relationships: [
          {
            foreignKeyName: 'testimonials_business_id_fkey'
            columns: ['business_id']
            isOneToOne: false
            referencedRelation: 'businesses'
            referencedColumns: ['id']
          },
        ]
      }
      subscriptions: {
        Row: Subscription
        Insert: Pick<Subscription, 'business_id'> & Partial<Omit<Subscription, 'id' | 'updated_at' | 'business_id'>>
        Update: Partial<Omit<Subscription, 'id' | 'business_id'>>
        Relationships: [
          {
            foreignKeyName: 'subscriptions_business_id_fkey'
            columns: ['business_id']
            isOneToOne: true
            referencedRelation: 'businesses'
            referencedColumns: ['id']
          },
        ]
      }
      user_subscriptions: {
        Row: UserSubscription
        Insert: Pick<UserSubscription, 'user_id'> & Partial<Omit<UserSubscription, 'id' | 'updated_at' | 'user_id'>>
        Update: Partial<Omit<UserSubscription, 'id' | 'user_id'>>
        Relationships: [
          {
            foreignKeyName: 'user_subscriptions_user_id_fkey'
            columns: ['user_id']
            isOneToOne: true
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
        ]
      }
      reports: {
        Row: Report
        Insert: Omit<Report, 'id' | 'created_at' | 'status'>
        Update: Partial<Omit<Report, 'id' | 'created_at'>>
        Relationships: [
          {
            foreignKeyName: 'reports_business_id_fkey'
            columns: ['business_id']
            isOneToOne: false
            referencedRelation: 'businesses'
            referencedColumns: ['id']
          },
        ]
      }
      postcodes: {
        Row: Postcode
        Insert: Omit<Postcode, 'id'>
        Update: Partial<Postcode>
        Relationships: []
      }
      business_claims: {
        Row: BusinessClaim
        Insert: Omit<BusinessClaim, 'id' | 'created_at' | 'reviewed_at' | 'reviewed_by' | 'status' | 'match_score' | 'verification_method' | 'admin_notes'>
        Update: Partial<Omit<BusinessClaim, 'id' | 'created_at'>>
        Relationships: [
          {
            foreignKeyName: 'business_claims_business_id_fkey'
            columns: ['business_id']
            isOneToOne: false
            referencedRelation: 'businesses'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'business_claims_claimer_id_fkey'
            columns: ['claimer_id']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
        ]
      }
      verification_jobs: {
        Row: VerificationJob
        Insert: Omit<VerificationJob, 'id' | 'created_at' | 'updated_at'>
        Update: Partial<Omit<VerificationJob, 'id' | 'created_at'>>
        Relationships: [
          {
            foreignKeyName: 'verification_jobs_business_id_fkey'
            columns: ['business_id']
            isOneToOne: false
            referencedRelation: 'businesses'
            referencedColumns: ['id']
          },
        ]
      }
      admin_reviews: {
        Row: AdminReview
        Insert: Omit<AdminReview, 'id' | 'created_at'>
        Update: Partial<Omit<AdminReview, 'id' | 'created_at'>>
        Relationships: [
          {
            foreignKeyName: 'admin_reviews_verification_job_id_fkey'
            columns: ['verification_job_id']
            isOneToOne: false
            referencedRelation: 'verification_jobs'
            referencedColumns: ['id']
          },
        ]
      }
      blacklist: {
        Row: BlacklistEntry
        Insert: Omit<BlacklistEntry, 'id' | 'created_at'>
        Update: Partial<Omit<BlacklistEntry, 'id' | 'created_at'>>
        Relationships: []
      }
      system_settings: {
        Row: SystemSetting
        Insert: Pick<SystemSetting, 'key' | 'value'> & Partial<Pick<SystemSetting, 'updated_by'>>
        Update: Partial<Pick<SystemSetting, 'value' | 'updated_by'>>
        Relationships: [
          {
            foreignKeyName: 'system_settings_updated_by_fkey'
            columns: ['updated_by']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
        ]
      }
      audit_log: {
        Row: AuditLogEntry
        Insert: Omit<AuditLogEntry, 'id' | 'created_at'>
        Update: never
        Relationships: [
          {
            foreignKeyName: 'audit_log_actor_id_fkey'
            columns: ['actor_id']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
        ]
      }
      business_metrics: {
        Row: BusinessMetrics
        Insert: Omit<BusinessMetrics, 'id' | 'created_at' | 'updated_at'>
        Update: Partial<Omit<BusinessMetrics, 'id' | 'created_at'>>
        Relationships: [
          {
            foreignKeyName: 'business_metrics_business_id_fkey'
            columns: ['business_id']
            isOneToOne: false
            referencedRelation: 'businesses'
            referencedColumns: ['id']
          },
        ]
      }
      business_search_index: {
        Row: {
          business_id: string
          name: string
          slug: string
          description: string | null
          phone: string | null
          website: string | null
          suburb: string | null
          state: string | null
          postcode: string | null
          geom: unknown | null
          service_radius_km: number | null
          category_names: string[]
          avg_rating: number | null
          review_count: number
          photo_url: string | null
          listing_source: ListingSource
          is_claimed: boolean
          search_vector: unknown
          indexed_at: string
        }
        Insert: never
        Update: never
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      search_businesses: {
        Args: {
          p_category_slug?: string | null
          p_lat?: number | null
          p_lng?: number | null
          p_radius_km?: number | null
          p_keyword?: string | null
          p_limit?: number | null
          p_offset?: number | null
        }
        Returns: SearchResult[]
      }
      upsert_business_location: {
        Args: {
          p_business_id: string
          p_address_text?: string | null
          p_suburb?: string | null
          p_state?: string | null
          p_postcode?: string | null
          p_lat?: number | null
          p_lng?: number | null
          p_service_radius_km?: number
        }
        Returns: undefined
      }
      is_search_eligible: {
        Args: {
          p_business_id: string
        }
        Returns: boolean
      }
      refresh_search_index: {
        Args: {
          p_business_id: string
        }
        Returns: undefined
      }
      refresh_all_search_index: {
        Args: Record<string, never>
        Returns: undefined
      }
      is_blacklisted: {
        Args: {
          p_name: string
        }
        Returns: {
          is_blocked: boolean
          matched_term: string | null
          reason: string | null
        }[]
      }
      insert_audit_log: {
        Args: {
          p_action: string
          p_entity_type?: string | null
          p_entity_id?: string | null
          p_actor_id?: string | null
          p_details?: Record<string, unknown>
        }
        Returns: undefined
      }
      increment_search_impressions: {
        Args: {
          p_business_ids: string[]
        }
        Returns: undefined
      }
      increment_profile_view: {
        Args: {
          p_business_id: string
        }
        Returns: undefined
      }
      get_business_metrics: {
        Args: {
          p_business_id: string
          p_days?: number
        }
        Returns: {
          total_impressions: number
          total_views: number
          daily_impressions: unknown
          daily_views: unknown
        }[]
      }
    }
    Enums: {
      subscription_status: SubscriptionStatus
      report_reason: ReportReason
      business_status: 'draft' | 'published' | 'suspended' | 'paused'
      user_role: 'business' | 'admin'
      verification_status: VerificationStatus
      listing_source: ListingSource
      claim_status_enum: ClaimStatus
      plan_tier: PlanTier
    }
  }
}
