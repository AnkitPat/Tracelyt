import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

const DEFAULT_PROJECT_ID = '00000000-0000-4000-8000-000000000002'

export async function GET() {
  const apiUrl = process.env.TRACELYT_API_URL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000'
  const projectId = process.env.TRACELYT_PROJECT_ID || process.env.NEXT_PUBLIC_PROJECT_ID || DEFAULT_PROJECT_ID
  const apiKey = process.env.TRACELYT_API_KEY

  if (!apiKey) {
    return NextResponse.json(
      { error: 'TRACELYT_API_KEY is not set. Run pnpm seed from the repository root.' },
      { status: 500 },
    )
  }

  try {
    const response = await fetch(`${apiUrl}/api/v1/projects/${projectId}/metrics?window=5m`, {
      headers: { authorization: `Bearer ${apiKey}` },
      cache: 'no-store',
    })
    const body = await response.json()
    return NextResponse.json(body, { status: response.status })
  } catch {
    return NextResponse.json(
      { error: 'Failed to reach the Tracelyt backend. Ensure it is running on port 4000.' },
      { status: 502 },
    )
  }
}
