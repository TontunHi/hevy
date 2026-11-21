const HEVY_BASE = 'https://api.hevyapp.com'

const ALLOWED_PREFIXES = [
  '/v1/user/info',
  '/v1/workouts',
  '/v1/exercise_templates',
  '/v1/body_measurements',
  '/v1/routines',
  '/v1/routine_folders',
]

export default async function handler(req, res) {
  const apiKey = process.env.HEVY_API_KEY
  if (!apiKey) {
    res.status(500).json({
      error: 'HEVY_API_KEY is not configured in Vercel Environment Variables.',
    })
    return
  }

  const url = new URL(req.url, 'http://localhost')
  const path = url.searchParams.get('path') || ''
  if (!ALLOWED_PREFIXES.some((p) => path === p || path.startsWith(`${p}/`) || path.startsWith(`${p}?`))) {
    res.status(400).json({ error: `Disallowed Hevy API path: ${path}` })
    return
  }

  const method = (req.method || 'GET').toUpperCase()
  const init = {
    method,
    headers: {
      'api-key': apiKey,
      'Content-Type': 'application/json',
    },
  }

  if (method !== 'GET' && method !== 'HEAD' && req.body !== undefined) {
    init.body = typeof req.body === 'string' ? req.body : JSON.stringify(req.body)
  }

  try {
    const upstream = await fetch(`${HEVY_BASE}${path}`, init)
    const text = await upstream.text()
    res.status(upstream.status)
    res.setHeader('Content-Type', upstream.headers.get('content-type') || 'application/json')
    res.send(text)
  } catch (err) {
    res.status(502).json({ error: String(err) })
  }
}
