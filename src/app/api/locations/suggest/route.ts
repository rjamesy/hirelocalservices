import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: NextRequest) {
  const q = (request.nextUrl.searchParams.get('q')?.trim() ?? '').slice(0, 100)

  if (q.length < 2) {
    return NextResponse.json([])
  }

  const supabase = await createClient()

  const isNumeric = /^\d+$/.test(q)

  let query = supabase
    .from('postcodes')
    .select('suburb, state, postcode, lat, lng')
    .limit(10)

  if (isNumeric) {
    // Postcode prefix search
    query = query.ilike('postcode', `${q}%`)
  } else {
    // Suburb prefix search (prefix match, not contains)
    query = query.ilike('suburb', `${q}%`)
  }

  const { data, error } = await query.order('suburb', { ascending: true })

  if (error || !data) {
    return NextResponse.json([])
  }

  return NextResponse.json(
    data.map((row) => ({
      suburb: row.suburb,
      state: row.state,
      postcode: row.postcode,
      lat: row.lat,
      lng: row.lng,
    }))
  )
}
