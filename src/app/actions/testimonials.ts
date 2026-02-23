'use server'

import { createClient } from '@/lib/supabase/server'
import { testimonialSchema } from '@/lib/validations'
import { MAX_TESTIMONIALS } from '@/lib/constants'
import { revalidatePath } from 'next/cache'

// ─── Helpers ────────────────────────────────────────────────────────

async function getAuthenticatedUser() {
  const supabase = await createClient()
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser()

  if (error || !user) {
    throw new Error('You must be logged in to perform this action')
  }

  return { supabase, user }
}

async function verifyBusinessOwnership(businessId: string) {
  const { supabase, user } = await getAuthenticatedUser()

  const { data: business, error } = await supabase
    .from('businesses')
    .select('id, owner_id, slug')
    .eq('id', businessId)
    .single()

  if (error || !business) {
    throw new Error('Business not found')
  }

  if (business.owner_id !== user.id) {
    throw new Error('You do not have permission to modify this business')
  }

  return { supabase, user, business }
}

// ─── Server Actions ─────────────────────────────────────────────────

export async function addTestimonial(
  businessId: string,
  formData: FormData
) {
  const { supabase, business } = await verifyBusinessOwnership(businessId)

  // Check plan tier — testimonials require premium
  const { data: sub } = await supabase
    .from('subscriptions')
    .select('plan')
    .eq('business_id', businessId)
    .maybeSingle()

  if (!sub || (sub.plan !== 'premium' && sub.plan !== 'premium_annual')) {
    return { error: 'premium_required' }
  }

  // Check max testimonials limit
  const { count, error: countError } = await supabase
    .from('testimonials')
    .select('*', { count: 'exact', head: true })
    .eq('business_id', businessId)

  if (countError) {
    return { error: 'Failed to check testimonial count. Please try again.' }
  }

  if (count !== null && count >= MAX_TESTIMONIALS) {
    return {
      error: `You can have a maximum of ${MAX_TESTIMONIALS} testimonials. Please remove one before adding another.`,
    }
  }

  // Validate form data
  const rawData = {
    author_name: formData.get('author_name') as string,
    text: formData.get('text') as string,
    rating: Number(formData.get('rating')),
  }

  const parsed = testimonialSchema.safeParse(rawData)
  if (!parsed.success) {
    return { error: parsed.error.flatten().fieldErrors }
  }

  const { data: testimonial, error } = await supabase
    .from('testimonials')
    .insert({
      business_id: businessId,
      author_name: parsed.data.author_name,
      text: parsed.data.text,
      rating: parsed.data.rating,
    })
    .select()
    .single()

  if (error) {
    return { error: 'Failed to add testimonial. Please try again.' }
  }

  revalidatePath('/dashboard')
  revalidatePath(`/business/${business.slug}`)
  return { data: testimonial }
}

export async function deleteTestimonial(testimonialId: string) {
  const { supabase, user } = await getAuthenticatedUser()

  // Fetch the testimonial and verify ownership via the business
  const { data: testimonial, error: fetchError } = await supabase
    .from('testimonials')
    .select('id, business_id')
    .eq('id', testimonialId)
    .single()

  if (fetchError || !testimonial) {
    return { error: 'Testimonial not found' }
  }

  // Verify ownership of the parent business
  const { data: business, error: bizError } = await supabase
    .from('businesses')
    .select('id, owner_id, slug')
    .eq('id', testimonial.business_id)
    .single()

  if (bizError || !business) {
    return { error: 'Business not found' }
  }

  if (business.owner_id !== user.id) {
    return { error: 'You do not have permission to delete this testimonial' }
  }

  const { error: deleteError } = await supabase
    .from('testimonials')
    .delete()
    .eq('id', testimonialId)

  if (deleteError) {
    return { error: 'Failed to delete testimonial. Please try again.' }
  }

  revalidatePath('/dashboard')
  revalidatePath(`/business/${business.slug}`)
  return { success: true }
}
