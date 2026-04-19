import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  const { prompt } = await req.json()
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY!,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1000,
      system: 'You are a local business outreach expert. Respond with valid JSON only.',
      messages: [{ role: 'user', content: prompt }],
    }),
  })
  const data = await res.json()
  const text = data.content?.find((b: any) => b.type === 'text')?.text || '{}'
  try {
    return NextResponse.json(JSON.parse(text.replace(/```json|```/g, '').trim()))
  } catch {
    return NextResponse.json({ error: 'Parse error', raw: text }, { status: 500 })
  }
}
