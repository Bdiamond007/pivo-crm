import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  const { prompt } = await req.json()
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: 'You are a local business outreach expert. Respond with valid JSON only. No markdown, no backticks, just raw JSON.' },
        { role: 'user', content: prompt }
      ],
      max_tokens: 1000,
    }),
  })
  const data = await res.json()
  const text = data.choices?.[0]?.message?.content
  if (!text) return NextResponse.json({ error: 'No response', data }, { status: 500 })
  try {
    return NextResponse.json(JSON.parse(text.trim()))
  } catch {
    return NextResponse.json({ error: 'Parse error', raw: text }, { status: 500 })
  }
}
