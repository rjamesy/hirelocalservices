import type {
  Business,
  Subscription,
  UserSubscription,
  Photo,
  Testimonial,
  Category,
  BusinessLocation,
  Profile,
  SystemFlags,
} from '@/lib/types'

export const mockUser = {
  id: 'user-123',
  email: 'test@example.com',
  app_metadata: {},
  user_metadata: {},
  aud: 'authenticated',
  created_at: '2024-01-01T00:00:00Z',
}

export const mockAdminUser = {
  ...mockUser,
  id: 'admin-123',
  email: 'admin@example.com',
}

export const mockProfile: Profile = {
  id: 'user-123',
  email: 'test@example.com',
  role: 'business',
  admin_notes: null,
  suspended_at: null,
  suspended_reason: null,
  created_at: '2024-01-01T00:00:00Z',
}

export const mockAdminProfile: Profile = {
  id: 'admin-123',
  email: 'admin@example.com',
  role: 'admin',
  admin_notes: null,
  suspended_at: null,
  suspended_reason: null,
  created_at: '2024-01-01T00:00:00Z',
}

export const mockBusiness: Business = {
  id: 'biz-123',
  owner_id: 'user-123',
  name: 'Test Business',
  slug: 'test-business',
  description: 'A great test business for all your testing needs.',
  phone: '0412345678',
  email_contact: 'contact@test.com',
  website: 'https://test.com',
  abn: '12345678901',
  status: 'published',
  is_seed: false,
  claim_status: 'unclaimed',
  seed_source: null,
  seed_source_id: null,
  seed_confidence: null,
  verification_status: 'approved',
  listing_source: 'manual',
  pending_changes: null,
  billing_status: 'active',
  trial_ends_at: null,
  suspended_reason: null,
  suspended_at: null,
  deleted_at: null,
  duplicate_user_choice: null,
  duplicate_of_business_id: null,
  duplicate_confidence: null,
  duplicate_candidates_json: null,
  merged_seed_business_id: null,
  created_at: '2024-01-01T00:00:00Z',
  updated_at: '2024-06-01T00:00:00Z',
}

export const mockLocation: BusinessLocation = {
  id: 'loc-123',
  business_id: 'biz-123',
  address_text: '123 Test St',
  suburb: 'Brisbane',
  state: 'QLD',
  postcode: '4000',
  lat: -27.4698,
  lng: 153.0251,
  geom: null,
  service_radius_km: 25,
}

export const mockSubscription: Subscription = {
  id: 'sub-123',
  business_id: 'biz-123',
  stripe_customer_id: 'cus_test123',
  stripe_subscription_id: 'sub_test123',
  status: 'active',
  plan: 'premium',
  stripe_price_id: 'price_premium',
  current_period_end: '2025-01-01T00:00:00Z',
  cancel_at_period_end: false,
  updated_at: '2024-06-01T00:00:00Z',
}

export const mockUserSubscription: UserSubscription = {
  id: 'usub-123',
  user_id: 'user-123',
  stripe_customer_id: 'cus_test123',
  stripe_subscription_id: 'sub_test123',
  status: 'active',
  plan: 'premium',
  stripe_price_id: 'price_premium',
  current_period_start: '2024-06-01T00:00:00Z',
  current_period_end: '2025-01-01T00:00:00Z',
  cancel_at_period_end: false,
  trial_ends_at: null,
  updated_at: '2024-06-01T00:00:00Z',
}

export const mockPhoto: Photo = {
  id: 'photo-123',
  business_id: 'biz-123',
  url: 'https://example.supabase.co/storage/v1/object/public/photos/biz-123/1234-test.jpg',
  sort_order: 0,
  status: 'live',
  created_at: '2024-01-01T00:00:00Z',
}

export const mockTestimonial: Testimonial = {
  id: 'test-123',
  business_id: 'biz-123',
  author_name: 'Jane Doe',
  text: 'Excellent service, would recommend to everyone!',
  rating: 5,
  status: 'live',
  created_at: '2024-01-15T00:00:00Z',
}

export const mockCategory: Category = {
  id: 'cat-123',
  name: 'Plumbing',
  slug: 'plumbing',
  parent_id: null,
}

export const mockCategories: Category[] = [
  { id: 'cat-1', name: 'Cleaning', slug: 'cleaning', parent_id: null },
  { id: 'cat-2', name: 'Electrical', slug: 'electrical', parent_id: null },
  { id: 'cat-3', name: 'Plumbing', slug: 'plumbing', parent_id: null },
]

export const mockSystemFlags: SystemFlags = {
  id: 1,
  registrations_enabled: true,
  listings_enabled: true,
  payments_enabled: true,
  claims_enabled: true,
  maintenance_mode: false,
  maintenance_message: 'System temporarily unavailable.',
  captcha_required: false,
  listings_require_approval: false,
  soft_launch_mode: false,
  seed_min_confidence: 0.5,
  seed_require_phone: false,
  circuit_breaker_triggered_at: null,
  circuit_breaker_cooldown_minutes: 15,
  created_at: '2024-01-01T00:00:00Z',
  updated_at: '2024-01-01T00:00:00Z',
}
