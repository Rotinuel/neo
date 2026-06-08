import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'
import { requireAuth } from '@/lib/auth'

// GET /api/listings/[id]
export async function GET(request, { params }) {
  try {
    const { id } = await params
    const supabase = getSupabaseAdmin()

    // Fetch generator without join first
    const { data: listing, error } = await supabase
      .from('generators')
      .select('*')
      .eq('id', id)
      .single()

    if (error || !listing) {
      return NextResponse.json({ error: 'Listing not found' }, { status: 404 })
    }

    // Fetch owner separately
    const { data: owner } = await supabase
      .from('users')
      .select('id, full_name, avatar_url, phone_verified, email_verified, created_at')
      .eq('id', listing.owner_id)
      .single()

    // Fetch reviews
    const { data: reviewRows } = await supabase
      .from('reviews')
      .select('id, rating, body, created_at, type, reviewer_id')
      .eq('generator_id', id)
      .eq('type', 'generator')
      .order('created_at', { ascending: false })
      .limit(20)

    // Fetch reviewer names separately
    let reviews = reviewRows || []
    if (reviews.length) {
      const reviewerIds = [...new Set(reviews.map(r => r.reviewer_id))]
      const { data: reviewers } = await supabase
        .from('users')
        .select('id, full_name, avatar_url')
        .in('id', reviewerIds)
      const reviewerMap = {}
      ;(reviewers || []).forEach(u => { reviewerMap[u.id] = u })
      reviews = reviews.map(r => ({
        ...r,
        reviewer: reviewerMap[r.reviewer_id] || null,
      }))
    }

    // Fetch availability blocks
    const { data: availability_blocks } = await supabase
      .from('availability_blocks')
      .select('start_date, end_date, reason')
      .eq('generator_id', id)
      .gte('end_date', new Date().toISOString().split('T')[0]) // only future blocks

    // Increment view count (fire and forget)
    supabase
      .from('generators')
      .update({ view_count: (listing.view_count || 0) + 1 })
      .eq('id', id)
      .then(() => {}).catch(() => {})

    return NextResponse.json({
      listing: {
        ...listing,
        owner:               owner || null,
        reviews:             reviews,
        availability_blocks: availability_blocks || [],
      },
    })
  } catch (err) {
    console.error('[GET /api/listings/[id]]', err)
    return NextResponse.json({ error: 'Failed to fetch listing' }, { status: 500 })
  }
}

// PUT /api/listings/[id]
export async function PUT(request, { params }) {
  try {
    const { id } = await params
    const user = await requireAuth(['owner', 'admin'])
    const body = await request.json()
    const supabase = getSupabaseAdmin()

    const { data: existing } = await supabase
      .from('generators')
      .select('owner_id, photos')
      .eq('id', id)
      .single()

    if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    if (existing.owner_id !== user.id && user.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    // Require at least 1 photo to go active
    if (body.status === 'active') {
      const photos = body.photos || existing.photos || []
      if (photos.length === 0) {
        return NextResponse.json(
          { error: 'Add at least one photo before activating your listing' },
          { status: 400 }
        )
      }
    }

    const allowed = [
      'title', 'description', 'brand', 'model', 'kva', 'fuel_type',
      'photos', 'price_daily', 'price_weekly', 'price_monthly',
      'security_deposit', 'latitude', 'longitude', 'address', 'city',
      'state', 'service_radius_km', 'self_delivery', 'delivery_fee_base',
      'delivery_fee_per_km', 'instant_book', 'condition_rating',
      'year_manufactured', 'last_serviced_at', 'status',
    ]

    const updates = {}
    allowed.forEach(f => { if (body[f] !== undefined) updates[f] = body[f] })

    const { data: updated, error } = await supabase
      .from('generators')
      .update(updates)
      .eq('id', id)
      .select()
      .single()

    if (error) throw error
    return NextResponse.json({ listing: updated })
  } catch (err) {
    console.error('[PUT /api/listings/[id]]', err)
    return NextResponse.json({ error: err.message || 'Update failed' }, { status: err.status || 500 })
  }
}

// DELETE /api/listings/[id]
export async function DELETE(request, { params }) {
  try {
    const { id } = await params
    const user = await requireAuth(['owner', 'admin'])
    const supabase = getSupabaseAdmin()

    const { data: listing } = await supabase
      .from('generators')
      .select('owner_id')
      .eq('id', id)
      .single()

    if (!listing) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    if (listing.owner_id !== user.id && user.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    await supabase.from('generators').update({ status: 'suspended' }).eq('id', id)
    return NextResponse.json({ success: true })
  } catch (err) {
    return NextResponse.json({ error: 'Delete failed' }, { status: 500 })
  }
}
