import { supabaseAdmin } from './supabase.helper'

export async function createTestUser(email: string, password: string, role: 'user' | 'admin' = 'user') {
  // Check if user already exists
  const { data: existingUsers } = await supabaseAdmin.auth.admin.listUsers()
  const existing = existingUsers?.users?.find(u => u.email === email)

  if (existing) {
    // Update password and ensure confirmed
    await supabaseAdmin.auth.admin.updateUserById(existing.id, {
      password,
      email_confirm: true,
    })
    // Upsert profile
    await supabaseAdmin.from('profiles').upsert({
      id: existing.id,
      email,
      role,
    }, { onConflict: 'id' })
    return existing
  }

  const { data, error } = await supabaseAdmin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  })
  if (error) throw new Error(`Failed to create test user: ${error.message}`)

  // Upsert profile
  await supabaseAdmin.from('profiles').upsert({
    id: data.user.id,
    email,
    role,
  }, { onConflict: 'id' })

  return data.user
}

export async function deleteTestUser(email: string) {
  const { data: existingUsers } = await supabaseAdmin.auth.admin.listUsers()
  const existing = existingUsers?.users?.find(u => u.email === email)
  if (existing) {
    // Clean up profile
    await supabaseAdmin.from('profiles').delete().eq('id', existing.id)
    await supabaseAdmin.auth.admin.deleteUser(existing.id)
  }
}
