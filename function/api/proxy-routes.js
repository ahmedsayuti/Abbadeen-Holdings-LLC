// functions/api/proxy-routes.js
//
// Cloudflare Pages Function — proxies POST requests to Google's
// Routes API v2 (routes.googleapis.com/directions/v2:computeRoutes).
//
// The frontend calls fetch('/api/proxy-routes', { method:'POST', body }),
// and this function forwards that body to Google, attaching the real
// server-side API key from an environment variable. The key is never
// present in any file served to the browser.
//
// Required Cloudflare Pages environment variable:
//   GOOGLE_MAPS_SERVER_KEY  — a server-restricted key (Routes API enabled,
//                             restricted by IP or "no application
//                             restriction" + API restriction, NOT the
//                             referrer-restricted browser key).

export async function onRequestPost(context) {
  const { request, env } = context;

  let body;
  try {
    body = await request.text();
  } catch (err) {
    return jsonError('Could not read request body', 400);
  }

  if (!body) {
    return jsonError('Empty request body', 400);
  }

  const apiKey = env.GOOGLE_MAPS_SERVER_KEY;
  if (!apiKey) {
    return jsonError('Server misconfigured: GOOGLE_MAPS_SERVER_KEY is not set', 500);
  }

  // Forward the field mask the frontend asked for, defaulting to a
  // sane minimal set if it didn't send one.
  const fieldMask = request.headers.get('X-Goog-FieldMask')
    || 'routes.duration,routes.distanceMeters,routes.polyline';

  let upstream;
  try {
    upstream = await fetch('https://routes.googleapis.com/directions/v2:computeRoutes', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': apiKey,
        'X-Goog-FieldMask': fieldMask,
      },
      body,
    });
  } catch (err) {
    return jsonError('Upstream request to Google Routes API failed: ' + err.message, 502);
  }

  const upstreamText = await upstream.text();

  return new Response(upstreamText, {
    status: upstream.status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
    },
  });
}

// Reject non-POST methods explicitly (Pages Functions default 404s otherwise,
// this gives a clearer error to the frontend/devs).
export async function onRequestGet() {
  return jsonError('Method not allowed — use POST', 405);
}

function jsonError(message, status) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}