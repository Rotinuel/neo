// supabase/functions/booking-reminders/index.ts
// Runs daily to send reminders for upcoming bookings and review requests

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
)

const RESEND_KEY      = Deno.env.get('RESEND_API_KEY')!
const FROM_EMAIL      = Deno.env.get('RESEND_FROM_EMAIL') || 'onboarding@resend.dev'
const FROM_NAME       = Deno.env.get('RESEND_FROM_NAME')  || 'GenRent'
const APP_URL         = Deno.env.get('NEXT_PUBLIC_APP_URL') || 'https://genrent.com'

async function sendEmail(to: string, subject: string, html: string) {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${RESEND_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: `${FROM_NAME} <${FROM_EMAIL}>`,
      to: [to],
      subject,
      html,
    }),
  })
  if (!res.ok) {
    const err = await res.text()
    console.error('[sendEmail] Resend error:', err)
  }
  return res.ok
}

const wrap = (content: string) => `
<!DOCTYPE html><html><body style="margin:0;padding:0;background:#0a0a0a;font-family:Arial,sans-serif">
<div style="max-width:560px;margin:40px auto;background:#111;border:1px solid #2e2e2e;border-radius:16px;overflow:hidden">
  <div style="padding:24px 32px;border-bottom:1px solid #2e2e2e">
    <span style="font-size:20px;font-weight:800;color:#f5f5f5">⚡ GenRent</span>
  </div>
  <div style="padding:32px">${content}</div>
  <div style="padding:16px 32px;border-top:1px solid #2e2e2e;background:#0a0a0a;text-align:center">
    <p style="margin:0;font-size:12px;color:#525252">© ${new Date().getFullYear()} GenRent</p>
  </div>
</div>
</body></html>`

const btn = (url: string, label: string) =>
  `<a href="${url}" style="display:inline-block;background:#ff7d11;color:#000;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:700;margin-top:16px">${label}</a>`

Deno.serve(async () => {
  const tomorrow = new Date()
  tomorrow.setDate(tomorrow.getDate() + 1)
  const tomorrowStr = tomorrow.toISOString().split('T')[0]

  // Bookings starting tomorrow
  const { data: upcoming } = await supabase
    .from('bookings')
    .select(`
      id, start_date, delivery_address,
      generator:generators!generator_id(title),
      renter:users!renter_id(full_name, email),
      owner:users!owner_id(full_name, email, phone)
    `)
    .eq('start_date', tomorrowStr)
    .eq('status', 'confirmed')

  let sent = 0

  for (const b of upcoming || []) {
    // Remind renter
    if (b.renter?.email) {
      const ok = await sendEmail(
        b.renter.email,
        `Reminder: Your rental starts tomorrow — ${b.generator?.title}`,
        wrap(`
          <h2 style="color:#ff7d11;margin:0 0 8px">Your Rental Starts Tomorrow ⚡</h2>
          <p style="color:#a3a3a3">Hi ${b.renter.full_name}, your <strong style="color:#f5f5f5">${b.generator?.title}</strong> rental starts on <strong style="color:#f5f5f5">${b.start_date}</strong>.</p>
          <p style="color:#a3a3a3">Delivery to: <strong style="color:#f5f5f5">${b.delivery_address}</strong></p>
          ${btn(`${APP_URL}/renter/booking/${b.id}`, 'View Booking')}
        `)
      )
      if (ok) sent++
    }

    // Remind owner
    if (b.owner?.email) {
      const ok = await sendEmail(
        b.owner.email,
        `Reminder: Rental starts tomorrow — ${b.generator?.title}`,
        wrap(`
          <h2 style="color:#ff7d11;margin:0 0 8px">Rental Starts Tomorrow ⚡</h2>
          <p style="color:#a3a3a3">Hi ${b.owner.full_name}, a booking for your <strong style="color:#f5f5f5">${b.generator?.title}</strong> starts tomorrow.</p>
          <p style="color:#a3a3a3">Renter: <strong style="color:#f5f5f5">${b.renter?.full_name}</strong></p>
          <p style="color:#a3a3a3">Make sure the generator is fuelled and ready.</p>
          ${btn(`${APP_URL}/owner/dashboard`, 'View Dashboard')}
        `)
      )
      if (ok) sent++
    }
  }

  // Request reviews for bookings completed 2 days ago
  const twoDaysAgo = new Date()
  twoDaysAgo.setDate(twoDaysAgo.getDate() - 2)
  const twoDaysStr = twoDaysAgo.toISOString().split('T')[0]

  const { data: completed } = await supabase
    .from('bookings')
    .select(`id, generator:generators!generator_id(title), renter:users!renter_id(full_name, email)`)
    .eq('end_date', twoDaysStr)
    .eq('status', 'completed')

  for (const b of completed || []) {
    if (b.renter?.email) {
      const ok = await sendEmail(
        b.renter.email,
        `How was your rental? — ${b.generator?.title}`,
        wrap(`
          <h2 style="color:#ff7d11;margin:0 0 8px">How Was Your Experience? ⭐</h2>
          <p style="color:#a3a3a3">Hi ${b.renter.full_name}, your <strong style="color:#f5f5f5">${b.generator?.title}</strong> rental has ended.</p>
          <p style="color:#a3a3a3">Help other renters by leaving a quick review.</p>
          ${btn(`${APP_URL}/renter/booking/${b.id}`, 'Leave a Review')}
        `)
      )
      if (ok) sent++
    }
  }

  return new Response(
    JSON.stringify({ reminders_sent: sent }),
    { headers: { 'Content-Type': 'application/json' } }
  )
})
