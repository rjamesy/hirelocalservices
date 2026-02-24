import type {
  Business,
  Subscription,
  UserSubscription,
  Photo,
  Testimonial,
  Category,
  BusinessLocation,
  Profile,
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
  created_at: '2024-01-01T00:00:00Z',
}

export const mockAdminProfile: Profile = {
  id: 'admin-123',
  email: 'admin@example.com',
  role: 'admin',
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
  verification_status: 'approved',
  listing_source: 'manual',
  pending_changes: null,
  billing_status: 'active',
  trial_ends_at: null,
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
