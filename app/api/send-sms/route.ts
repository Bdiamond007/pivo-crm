import { NextRequest, NextResponse } from 'next/server'

function toE164(raw: string): string | null {
  if (!raw) return null
  const trimmed = raw.trim()
  const hasPlus = trimmed.startsWith('+')
  const digits = trimmed.replace(/\D/g, '')
  if (!digits) return null
  if (hasPlus) return '+' + digits
  if (digits.length === 10) return '+1' + digits
  if (digits.length === 11 && digits.startsWith('1')) return '+' + digits
  return '+' + digits
}

const ERROR_HINTS: Record<number, string> = {
  20003: 'Authentication failed — double-check your Account SID and Auth Token.',
  21211: 'Invalid recipient number — make sure it includes the area code.',
  21606: "Your 'From' number can't send SMS, or isn't owned by this account.",
  21608: 'Trial account: you can only text numbers verified in Twilio. Upgrade the account or verify this number.',
  21610: 'This contact replied STOP and unsubscribed — Twilio blocks further messages to them.',
  21614: "Recipient isn't a valid mobile number that can receive SMS.",
  30007: 'Carrier filtered the message as spam. Vary the wording or register your sender.',
  30034: 'Your US number is not registered for A2P 10DLC. Register it in the Twilio console to text US numbers.',
}

export async function POST(req: NextRequest) {
  try {
    const { to, body, accountSid: bodySid, authToken: bodyToken, from: bodyFrom } = await req.json()

    const accountSid = bodySid || process.env.TWILIO_ACCOUNT_SID
    const authToken  = bodyToken || process.env.TWILIO_AUTH_TOKEN
    const fromRaw    = bodyFrom || process.env.TWILIO_FROM_NUMBER

    if (!to || !body) {
      return NextResponse.json({ success: false, error: 'Missing recipient number or message body.' }, { status: 400 })
    }
    if (!accountSid || !authToken || !fromRaw) {
      return NextResponse.json({ success: false, error: 'Twilio credentials not configured. Add them in Twilio settings or set the TWILIO_* env vars.' }, { status: 400 })
    }

    const toE164Num = toE164(to)
    const fromE164Num = toE164(fromRaw)
    if (!toE164Num) {
      return NextResponse.json({ success: false, error: `"${to}" isn't a valid phone number.` }, { status: 400 })
    }
    if (!fromE164Num) {
      return NextResponse.json({ success: false, error: `Your 'From' number "${fromRaw}" isn't valid.` }, { status: 400 })
    }

    const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`
    const credentials = Buffer.from(`${accountSid}:${authToken}`).toString('base64')

    const twilioRes = await fetch(twilioUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${credentials}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({ To: toE164Num, From: fromE164Num, Body: body }).toString(),
    })

    const data = await twilioRes.json()

    if (twilioRes.ok) {
      return NextResponse.json({ success: true, messageSid: data.sid, status: data.status, to: toE164Num })
    }

    const hint = ERROR_HINTS[data.code as number]
    return NextResponse.json(
      { success: false, error: hint || data.message || 'Twilio rejected the message.', code: data.code },
      { status: 400 }
    )
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}
