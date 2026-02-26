import { cleanupJourneyData, seedJourneyData } from './seed.helper'
import { createTestUser } from './auth.helper'
import { E2E_USER_EMAIL, E2E_USER_PASSWORD, E2E_ADMIN_EMAIL, E2E_ADMIN_PASSWORD } from './constants'

export default async function globalSetup() {
  console.log('[E2E] Global setup: cleaning up old test data...')
  await cleanupJourneyData()

  console.log('[E2E] Global setup: creating test users...')
  await createTestUser(E2E_USER_EMAIL, E2E_USER_PASSWORD, 'user')
  await createTestUser(E2E_ADMIN_EMAIL, E2E_ADMIN_PASSWORD, 'admin')

  console.log('[E2E] Global setup: seeding journey data...')
  await seedJourneyData()

  console.log('[E2E] Global setup complete.')
}
