import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  try {
    const { to, body } = await req.json()

    const accountSid = process.env.TWILIO_ACCOUNT_SID
    const authToken  = process.env.TWILIO_AUTH_TOKEN
    const from       = process.env.TWILIO_FROM_NUMBER

    if (!to || !body) {
      return NextResponse.json({ error: 'Missing to or body' }, { status: 400 })
    }
    if (!accountSid || !authToken || !from) {
      return NextResponse.json({ error: 'Twilio credentials not configured' }, { status: 500 })
    }

    const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`
    const credentials = Buffer.from(`${accountSid}:${authToken}`).toString('base64')

    const twilioRes = await fetch(twilioUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${credentials}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({ To: to, From: from, Body: body }).toString(),
    })

    const data = await twilioRes.json()

    if (twilioRes.ok) {
      return NextResponse.json({ success: true, messageSid: data.sid, status: data.status })
    } else {
      return NextResponse.json({ success: false, error: data.message, code: data.code }, { status: 400 })
    }
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}
