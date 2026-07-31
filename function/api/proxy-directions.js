// functions/api/proxy-directions.js
//
// Cloudflare Pages Function — proxies requests to the legacy Directions
// API (maps.googleapis.com/maps/api/directions/json) as a fallback path
// for organisations/plans where Routes API v2 isn't available.
//
// The frontend currently resolves its Directions fallback client-side via
// the Google Maps JavaScript SDK's DirectionsService, which is safe to call
// directly from the browser (it rides on the referrer-restricted browser
// key already loaded in the page, not a secret). This endpoint exists so a
// raw server-side Directions REST call is available if/when that fallback
// is moved server-side too — accepts the same params as Google's REST API
// via query string or a JSON POST body, and never exposes the key.
//
// Required Cloudflare Pages environment variable:
//   GOOGLE_MAPS_SERVER_KEY — same server-restricted key used by proxy-routes.js

export async function onRequestPost(context) {
  const { request, env } = context;

  let params;
  try {
    params = await request.json();
  } catch (err) {
    return jsonError('Request body must be valid JSON', 400);
  }

  return handleDirectionsRequest(params, env);
}

export async function onRequestGet(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const params = Object.fromEntries(url.searchParams.entries());
  return handleDirectionsRequest(params, env);
}

async function handleDirectionsRequest(params, env) {
  const apiKey = env.GOOGLE_MAPS_SERVER_KEY;
  if (!apiKey) {
    return jsonError('Server misconfigured: GOOGLE_MAPS_SERVER_KEY is not set', 500);
  }

  if (!params || !params.origin || !params.destination) {
    return jsonError('Missing required "origin" and/or "destination" params', 400);
  }

  const upstreamUrl = new URL('https://maps.googleapis.com/maps/api/directions/json');
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') {
      upstreamUrl.searchParams.set(key, String(value));
    }
  }
  upstreamUrl.searchParams.set('key', apiKey);

  let upstream;
  try {
    upstream = await fetch(upstreamUrl.toString(), { method: 'GET' });
  } catch (err) {
    return jsonError('Upstream request to Google Directions API failed: ' + err.message, 502);
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

function jsonError(message, status) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}