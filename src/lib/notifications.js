import axios from 'axios'

// ─── Resend Email ─────────────────────────────────────────────
// Free tier: 3,000 emails/month, 100/day
// Sign up at resend.com — get API key instantly, no credit card
export async function sendEmail({ to, subject, html, text }) {
  try {
    const res = await axios.post(
      'https://api.resend.com/emails',
      {
        from: `${process.env.RESEND_FROM_NAME || 'GenRent'} <${process.env.RESEND_FROM_EMAIL || 'onboarding@resend.dev'}>`,
        to: [to],
        subject,
        html: html || `<p>${text || subject}</p>`,
        text: text || subject,
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
          'Content-Type': 'application/json',
        },
      }
    )
    return true
  } catch (err) {
    console.error('[sendEmail]', err.response?.data || err.message)
    return false
  }
}

// ─── Termii SMS ───────────────────────────────────────────────
export async function sendSMS({ to, message }) {
  try {
    await axios.post('https://api.ng.termii.com/api/sms/send', {
      to,
      from: process.env.TERMII_SENDER_ID || 'GenRent',
      sms: message,
      type: 'plain',
      api_key: process.env.TERMII_API_KEY,
      channel: 'generic',
    })
    return true
  } catch (err) {
    console.error('[sendSMS]', err.response?.data || err.message)
    return false
  }
}

// ─── Termii OTP ───────────────────────────────────────────────
export async function sendOTP({ to, otp }) {
  return sendSMS({
    to,
    message: `Your GenRent verification code is: ${otp}. Valid for 10 minutes. Do not share this code.`,
  })
}

// ─── Email templates ──────────────────────────────────────────
const base = (content) => `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#0a0a0a;font-family:'DM Sans',Arial,sans-serif">
  <div style="max-width:560px;margin:40px auto;background:#111111;border:1px solid #2e2e2e;border-radius:16px;overflow:hidden">
    <div style="background:#111111;padding:24px 32px;border-bottom:1px solid #2e2e2e">
      <span style="font-size:22px;font-weight:800;color:#f5f5f5;letter-spacing:-0.5px">
        ⚡ GenRent
      </span>
    </div>
    <div style="padding:32px">
      ${content}
    </div>
    <div style="padding:20px 32px;border-top:1px solid #2e2e2e;background:#0a0a0a">
      <p style="margin:0;font-size:12px;color:#525252;text-align:center">
        © ${new Date().getFullYear()} GenRent · Nigeria's Generator Marketplace
      </p>
    </div>
  </div>
</body>
</html>`

const btn = (url, label) =>
  `<a href="${url}" style="display:inline-block;background:#ff7d11;color:#000000;padding:13px 28px;border-radius:10px;text-decoration:none;font-weight:700;font-size:14px;margin-top:20px">${label}</a>`

const h1 = (text) =>
  `<h1 style="margin:0 0 8px;font-size:26px;font-weight:800;color:#f5f5f5;line-height:1.2">${text}</h1>`

const p = (text) =>
  `<p style="margin:12px 0;font-size:15px;color:#a3a3a3;line-height:1.6">${text}</p>`

const row = (label, value, highlight = false) =>
  `<tr>
    <td style="padding:10px 0;border-bottom:1px solid #2e2e2e;font-size:13px;color:#737373">${label}</td>
    <td style="padding:10px 0;border-bottom:1px solid #2e2e2e;font-size:13px;color:${highlight ? '#ff7d11' : '#f5f5f5'};font-weight:${highlight ? '700' : '400'};text-align:right">${value}</td>
  </tr>`

const table = (rows) =>
  `<table style="width:100%;border-collapse:collapse;margin:20px 0">${rows}</table>`

export const emailTemplates = {

  bookingConfirmed: ({ renter_name, generator_title, start_date, end_date, total, booking_id }) => ({
    subject: `Booking Confirmed — ${generator_title}`,
    html: base(`
      ${h1('Booking Confirmed ✓')}
      ${p(`Hi ${renter_name}, your booking is confirmed and payment received.`)}
      ${table(
        row('Generator', generator_title) +
        row('Dates', `${start_date} → ${end_date}`) +
        row('Total Paid', `₦${Number(total).toLocaleString()}`, true)
      )}
      ${btn(`${process.env.NEXT_PUBLIC_APP_URL}/renter/booking/${booking_id}`, 'View Booking')}
    `),
  }),

  ownerNewBooking: ({ owner_name, renter_name, generator_title, start_date, end_date, payout, booking_id }) => ({
    subject: `New Booking — ${generator_title}`,
    html: base(`
      ${h1('New Booking! 🎉')}
      ${p(`Hi ${owner_name}, <strong style="color:#f5f5f5">${renter_name}</strong> just booked your generator.`)}
      ${table(
        row('Generator', generator_title) +
        row('Dates', `${start_date} → ${end_date}`) +
        row('Your Payout', `₦${Number(payout).toLocaleString()}`, true)
      )}
      ${btn(`${process.env.NEXT_PUBLIC_APP_URL}/owner/dashboard`, 'View Dashboard')}
    `),
  }),

  bookingCancelled: ({ name, generator_title, refund_amount, booking_id }) => ({
    subject: `Booking Cancelled — ${generator_title}`,
    html: base(`
      ${h1('Booking Cancelled')}
      ${p(`Hi ${name}, your booking for <strong style="color:#f5f5f5">${generator_title}</strong> has been cancelled.`)}
      ${refund_amount
        ? p(`A refund of <strong style="color:#ff7d11">₦${Number(refund_amount).toLocaleString()}</strong> will be processed within 3–5 business days.`)
        : ''}
    `),
  }),

  welcomeEmail: ({ name, role }) => ({
    subject: 'Welcome to GenRent ⚡',
    html: base(`
      ${h1('Welcome to GenRent ⚡')}
      ${p(`Hi ${name}, your account is ready.`)}
      ${p(role === 'owner'
        ? 'Start listing your generator and earning today. It takes less than 5 minutes.'
        : role === 'driver'
        ? 'Browse available delivery jobs and start earning per trip.'
        : 'Find the perfect generator for your power needs — browse listings near you.')}
      ${btn(process.env.NEXT_PUBLIC_APP_URL, 'Get Started')}
    `),
  }),

  disputeResolved: ({ name, status, resolution, booking_id }) => ({
    subject: `Dispute ${status === 'resolved' ? 'Resolved' : 'Closed'} — GenRent`,
    html: base(`
      ${h1(`Dispute ${status === 'resolved' ? 'Resolved ✓' : 'Closed'}`)}
      ${p(`Hi ${name}, your dispute has been ${status} by our team.`)}
      ${resolution ? `<div style="background:#1a1a1a;border-left:3px solid #ff7d11;padding:14px 18px;border-radius:0 8px 8px 0;margin:16px 0">
        <p style="margin:0;font-size:13px;color:#a3a3a3"><strong style="color:#f5f5f5">Admin note:</strong> ${resolution}</p>
      </div>` : ''}
      ${p('If you have further questions, reply to this email or contact <a href="mailto:support@genrent.com" style="color:#ff7d11">support@genrent.com</a>')}
    `),
  }),

  payoutSent: ({ name, amount }) => ({
    subject: 'Payout Sent — GenRent',
    html: base(`
      ${h1('Payout Sent 💸')}
      ${p(`Hi ${name}, your payout of <strong style="color:#ff7d11">₦${Number(amount).toLocaleString()}</strong> has been sent to your bank account.`)}
      ${p('Allow 1–3 business days for the funds to arrive depending on your bank.')}
      ${btn(`${process.env.NEXT_PUBLIC_APP_URL}/owner/earnings`, 'View Earnings')}
    `),
  }),

  rentalReminder: ({ name, generator_title, start_date, delivery_address, booking_id }) => ({
    subject: `Reminder: Your rental starts tomorrow — ${generator_title}`,
    html: base(`
      ${h1('Your Rental Starts Tomorrow ⚡')}
      ${p(`Hi ${name}, this is a reminder that your <strong style="color:#f5f5f5">${generator_title}</strong> rental starts on <strong style="color:#f5f5f5">${start_date}</strong>.`)}
      ${table(row('Delivery to', delivery_address))}
      ${btn(`${process.env.NEXT_PUBLIC_APP_URL}/renter/booking/${booking_id}`, 'View Booking')}
    `),
  }),

  reviewRequest: ({ name, generator_title, booking_id }) => ({
    subject: `How was your rental? — ${generator_title}`,
    html: base(`
      ${h1('How Was Your Experience? ⭐')}
      ${p(`Hi ${name}, your rental of <strong style="color:#f5f5f5">${generator_title}</strong> has ended.`)}
      ${p('Help other renters by leaving a quick review — it only takes 30 seconds.')}
      ${btn(`${process.env.NEXT_PUBLIC_APP_URL}/renter/booking/${booking_id}`, 'Leave a Review')}
    `),
  }),

}
