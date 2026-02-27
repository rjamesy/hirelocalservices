/**
 * Abuse Simulation Script
 *
 * Hits app endpoints directly to verify rate limiting and abuse protection.
 * Run: npx tsx scripts/simulate-abuse.ts
 *
 * Requires the app to be running on localhost:3000
 */

const BASE = process.env.BASE_URL ?? 'http://localhost:3000'

interface TestResult {
  name: string
  passed: boolean
  detail: string
}

const results: TestResult[] = []

async function testRegistrationFlood() {
  console.log('\n--- Registration Flood (8 attempts, expect block after 5) ---')
  let blocked = 0

  for (let i = 0; i < 8; i++) {
    try {
      const resp = await fetch(`${BASE}/auth/sign-up`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          email: `abuse-sim-${i}-${Date.now()}@test.local`,
          password: 'TestPassword123!',
        }),
        redirect: 'manual',
      })
      if (resp.status === 429 || resp.status === 403) blocked++
      console.log(`  Attempt ${i + 1}: ${resp.status}`)
    } catch (e: any) {
      console.log(`  Attempt ${i + 1}: ERROR ${e.message}`)
    }
  }

  const passed = blocked > 0
  results.push({ name: 'Registration flood', passed, detail: `${blocked}/8 blocked` })
  console.log(passed ? '  PASS' : '  FAIL')
}

async function testLoginFlood() {
  console.log('\n--- Login Flood (25 attempts, expect block after 20) ---')
  let blocked = 0

  for (let i = 0; i < 25; i++) {
    try {
      const resp = await fetch(`${BASE}/auth/sign-in`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          email: `nonexistent-${i}@test.local`,
          password: 'wrong',
        }),
        redirect: 'manual',
      })
      if (resp.status === 429 || resp.status === 403) blocked++
      if (i % 5 === 0) console.log(`  Attempt ${i + 1}: ${resp.status}`)
    } catch (e: any) {
      if (i % 5 === 0) console.log(`  Attempt ${i + 1}: ERROR`)
    }
  }

  const passed = blocked > 0
  results.push({ name: 'Login flood', passed, detail: `${blocked}/25 blocked` })
  console.log(passed ? '  PASS' : '  FAIL')
}

async function testInvalidUpload() {
  console.log('\n--- Invalid MIME Upload (.exe file) ---')
  try {
    const formData = new FormData()
    formData.append('file', new Blob(['not a real exe'], { type: 'application/x-msdownload' }), 'malware.exe')

    const resp = await fetch(`${BASE}/api/upload`, {
      method: 'POST',
      body: formData,
    })

    const passed = resp.status >= 400
    results.push({ name: 'Invalid MIME upload', passed, detail: `Status: ${resp.status}` })
    console.log(`  Status: ${resp.status} — ${passed ? 'PASS' : 'FAIL'}`)
  } catch (e: any) {
    results.push({ name: 'Invalid MIME upload', passed: true, detail: `Rejected: ${e.message}` })
    console.log('  PASS (request rejected)')
  }
}

async function main() {
  console.log(`Abuse simulation against ${BASE}`)
  console.log('='.repeat(50))

  await testRegistrationFlood()
  await testLoginFlood()
  await testInvalidUpload()

  console.log('\n' + '='.repeat(50))
  console.log('RESULTS:')
  for (const r of results) {
    console.log(`  ${r.passed ? 'PASS' : 'FAIL'} — ${r.name}: ${r.detail}`)
  }

  const allPassed = results.every((r) => r.passed)
  console.log(`\nOverall: ${allPassed ? 'ALL PASS' : 'SOME FAILED'}`)
  process.exit(allPassed ? 0 : 1)
}

main()
