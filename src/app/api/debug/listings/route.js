import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'

// GET /api/debug/listings — shows raw generator rows for debugging
// REMOVE THIS FILE BEFORE GOING TO PRODUCTION
export async function GET() {
  try {
    const supabase = getSupabaseAdmin()

    // 1. Fetch ALL generators with no filters
    const { data: all, error: allErr } = await supabase
      .from('generators')
      .select('id, title, status, owner_id, created_at')
      .order('created_at', { ascending: false })
      .limit(20)

    // 2. Fetch only active ones with the join we use in production
    const { data: active, error: activeErr } = await supabase
      .from('generators')
      .select(
        `id, title, status, kva, price_daily,
         owner:users!owner_id(id, full_name)`
      )
      .eq('status', 'active')
      .limit(20)

    // 3. Count by status
    const { data: counts } = await supabase
      .rpc('count_generators_by_status')
      .catch(() => ({ data: null }))

    // Fallback count via raw select
    const { data: statusRows } = await supabase
      .from('generators')
      .select('status')

    const statusCounts = (statusRows || []).reduce((acc, r) => {
      acc[r.status] = (acc[r.status] || 0) + 1
      return acc
    }, {})

    return NextResponse.json({
      all_generators: all || [],
      all_error: allErr?.message || null,
      active_generators: active || [],
      active_error: activeErr?.message || null,
      status_counts: statusCounts,
      total_rows: statusRows?.length || 0,
    })
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
