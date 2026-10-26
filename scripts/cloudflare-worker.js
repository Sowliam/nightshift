/**
 * Cloudflare Worker: Reverse Proxy for NIGHTSHIFT Backend (Render ➔ Cloudflare Edge)
 * Bypasses Iranian ISP censorship on *.onrender.com without needing a VPN.
 */

const TARGET_HOST = 'nightshift-server-cfch.onrender.com';

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // Replace hostname with Render backend
    url.hostname = TARGET_HOST;
    url.protocol = 'https:';
    url.port = '443';

    // Clone headers and rewrite Host
    const headers = new Headers(request.headers);
    headers.set('Host', TARGET_HOST);
    headers.set('X-Forwarded-Host', request.headers.get('Host') || url.hostname);
    headers.set('X-Forwarded-Proto', 'https');

    // Handle CORS preflight options directly
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: {
          'Access-Control-Allow-Origin': request.headers.get('Origin') || '*',
          'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
          'Access-Control-Allow-Headers': request.headers.get('Access-Control-Request-Headers') || '*',
          'Access-Control-Allow-Credentials': 'true',
          'Access-Control-Max-Age': '86400',
        },
      });
    }

    try {
      const response = await fetch(url.toString(), {
        method: request.method,
        headers: headers,
        body: ['GET', 'HEAD'].includes(request.method) ? undefined : request.body,
        redirect: 'follow',
      });

      // Clone response to add/ensure CORS headers
      const newHeaders = new Headers(response.headers);
      newHeaders.set('Access-Control-Allow-Origin', request.headers.get('Origin') || '*');
      newHeaders.set('Access-Control-Allow-Credentials', 'true');
      newHeaders.set('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS, HEAD');
      newHeaders.set('Access-Control-Allow-Headers', '*');

      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers: newHeaders,
      });
    } catch (err) {
      return new Response(JSON.stringify({ error: 'Gateway Error', details: err.message }), {
        status: 502,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
      });
    }
  },
};
