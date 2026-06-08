import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'
import { requireAuth } from '@/lib/auth'
import { getDistance } from '@/lib/geo'

// GET /api/listings — public search
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url)

    const rawKvaMin   = searchParams.get('kva_min')
    const rawKvaMax   = searchParams.get('kva_max')
    const rawPriceMax = searchParams.get('price_max')
    const lat         = parseFloat(searchParams.get('lat'))
    const lng         = parseFloat(searchParams.get('lng'))
    const radius      = parseFloat(searchParams.get('radius') || '50')
    const fuel_type   = searchParams.get('fuel_type')
    const city        = searchParams.get('city')
    const state       = searchParams.get('state')
    const start_date  = searchParams.get('start_date')
    const end_date    = searchParams.get('end_date')
    const sort        = searchParams.get('sort') || 'newest'
    const page        = Math.max(1, parseInt(searchParams.get('page') || '1'))
    const limit       = Math.min(parseInt(searchParams.get('limit') || '20'), 50)

    const supabase = getSupabaseAdmin()

    // ── Step 1: fetch generators (no join — avoid FK hint issues) ──
    let query = supabase
      .from('generators')
      .select('*', { count: 'exact' })
      .eq('status', 'active')

    if (rawKvaMin)   query = query.gte('kva', parseFloat(rawKvaMin))
    if (rawKvaMax)   query = query.lte('kva', parseFloat(rawKvaMax))
    if (rawPriceMax) query = query.lte('price_daily', parseFloat(rawPriceMax))
    if (fuel_type)   query = query.eq('fuel_type', fuel_type)
    if (city)        query = query.ilike('city', `%${city}%`)
    if (state)       query = query.ilike('state', `%${state}%`)

    // Availability filter
    if (start_date && end_date) {
      const { data: booked } = await supabase
        .from('availability_blocks')
        .select('generator_id')
        .lte('start_date', end_date)
        .gte('end_date', start_date)

      if (booked?.length) {
        const ids = booked.map(b => b.generator_id)
        query = query.not('id', 'in', `(${ids.join(',')})`)
      }
    }

    switch (sort) {
      case 'price_asc':  query = query.order('price_daily', { ascending: true });  break
      case 'price_desc': query = query.order('price_daily', { ascending: false }); break
      case 'rating':     query = query.order('rating_avg',  { ascending: false }); break
      default:           query = query.order('created_at',  { ascending: false }); break
    }

    const from = (page - 1) * limit
    query = query.range(from, from + limit - 1)

    const { data: generators, error, count } = await query

    if (error) {
      console.error('[GET /api/listings] query error:', error)
      throw error
    }

    if (!generators?.length) {
      return NextResponse.json({ listings: [], total: 0, page, pages: 0 })
    }

    // ── Step 2: fetch owner info separately — avoids join failures ──
    const ownerIds = [...new Set(generators.map(g => g.owner_id))]
    const { data: owners } = await supabase
      .from('users')
      .select('id, full_name, avatar_url, phone_verified')
      .in('id', ownerIds)

    const ownerMap = {}
    ;(owners || []).forEach(o => { ownerMap[o.id] = o })

    // ── Step 3: merge + optional radius filter ─────────────────────
    let listings = generators.map(g => {
      const owner = ownerMap[g.owner_id] || {}
      return {
        ...g,
        owner_name:     owner.full_name     ?? null,
        owner_avatar:   owner.avatar_url    ?? null,
        owner_verified: owner.phone_verified ?? false,
      }
    })

    if (!isNaN(lat) && !isNaN(lng)) {
      listings = listings
        .map(g => ({
          ...g,
          distance_km:
            g.latitude && g.longitude
              ? Math.round(getDistance(lat, lng, g.latitude, g.longitude) * 10) / 10
              : null,
        }))
        .filter(g => g.distance_km === null || g.distance_km <= radius)
        .sort((a, b) => (a.distance_km ?? 999) - (b.distance_km ?? 999))
    }

    return NextResponse.json({
      listings,
      total:  count ?? listings.length,
      page,
      pages:  Math.ceil((count ?? listings.length) / limit),
    })
  } catch (err) {
    console.error('[GET /api/listings]', err)
    return NextResponse.json({ error: 'Failed to fetch listings' }, { status: 500 })
  }
}

// POST /api/listings — create listing (owners only)
export async function POST(request) {
  try {
    const user = await requireAuth(['owner', 'admin'])
    const body = await request.json()

    const {
      title, description, brand, model, kva, fuel_type,
      price_daily, price_weekly, price_monthly, security_deposit,
      latitude, longitude, address, city, state, service_radius_km,
      self_delivery, delivery_fee_base, delivery_fee_per_km,
      instant_book, condition_rating, year_manufactured,
    } = body

    if (!title || !brand || !kva || !fuel_type || !price_daily) {
      return NextResponse.json(
        { error: 'title, brand, kva, fuel_type and price_daily are required' },
        { status: 400 }
      )
    }

    const supabase = getSupabaseAdmin()

    const { data: listing, error } = await supabase
      .from('generators')
      .insert({
        owner_id:            user.id,
        title:               title.trim(),
        description:         description?.trim()  || null,
        brand:               brand.trim(),
        model:               model?.trim()         || null,
        kva:                 parseFloat(kva),
        fuel_type,
        price_daily:         parseFloat(price_daily),
        price_weekly:        price_weekly  ? parseFloat(price_weekly)  : null,
        price_monthly:       price_monthly ? parseFloat(price_monthly) : null,
        security_deposit:    parseFloat(security_deposit || 0),
        latitude:            latitude  ? parseFloat(latitude)  : null,
        longitude:           longitude ? parseFloat(longitude) : null,
        address:             address?.trim()  || null,
        city:                city?.trim()     || null,
        state:               state?.trim()    || null,
        service_radius_km:   parseInt(service_radius_km || 20),
        self_delivery:       !!self_delivery,
        delivery_fee_base:   parseFloat(delivery_fee_base   || 0),
        delivery_fee_per_km: parseFloat(delivery_fee_per_km || 0),
        instant_book:        instant_book !== false,
        condition_rating:    condition_rating  ? parseInt(condition_rating)  : null,
        year_manufactured:   year_manufactured ? parseInt(year_manufactured) : null,
        status:              'draft',
      })
      .select()
      .single()

    if (error) throw error

    return NextResponse.json({ listing }, { status: 201 })
  } catch (err) {
    console.error('[POST /api/listings]', err)
    return NextResponse.json(
      { error: err.message || 'Failed to create listing' },
      { status: err.status || 500 }
    )
  }
}
