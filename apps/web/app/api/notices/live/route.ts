export const dynamic = 'force-dynamic';

/**
 * Streams /api/notices/live from the API without the rewrite, which would hold the events
 * until the response finished. The session cookie is forwarded as-is.
 */
export async function GET(req: Request) {
  const api = process.env.API_INTERNAL_URL || 'http://localhost:3001';
  const upstream = await fetch(`${api}/api/notices/live`, {
    headers: {
      cookie: req.headers.get('cookie') ?? '',
      accept: 'text/event-stream',
    },
    cache: 'no-store',
  });
  return new Response(upstream.body, {
    status: upstream.status,
    headers: {
      'Content-Type': upstream.headers.get('content-type') ?? 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
