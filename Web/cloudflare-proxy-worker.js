export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const targetUrl = url.searchParams.get('url');

    // Handle CORS preflight requests
    if (request.method === "OPTIONS") {
      return new Response(null, {
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, HEAD, POST, OPTIONS",
          "Access-Control-Allow-Headers": request.headers.get("Access-Control-Request-Headers") || "Range",
          "Access-Control-Max-Age": "86400",
        }
      });
    }

    if (!targetUrl) {
      return new Response('Missing url parameter', { status: 400 });
    }

    const headers = new Headers(request.headers);
    headers.delete('host');
    headers.delete('connection');
    headers.delete('accept-encoding');
    headers.delete('origin');
    headers.delete('referer');

    const response = await fetch(targetUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36',
        Accept: 'video/mp4,video/*;q=0.9,*/*;q=0.8',
        ...(request.headers.get('range') ? { Range: request.headers.get('range') } : {})
      }
    });

    const HEV1 = new Uint8Array([104, 101, 118, 49]); // 'hev1'
    const HVC1 = new Uint8Array([104, 118, 99, 49]); // 'hvc1'

    const transformStream = new TransformStream({
      transform(chunk, controller) {
        let offset = 0;
        while (true) {
          let found = -1;
          for (let i = offset; i < chunk.length - 3; i++) {
            if (chunk[i] === HEV1[0] && chunk[i+1] === HEV1[1] && chunk[i+2] === HEV1[2] && chunk[i+3] === HEV1[3]) {
              found = i;
              break;
            }
          }
          if (found === -1) break;
          chunk.set(HVC1, found);
          offset = found + 4;
        }
        controller.enqueue(chunk);
      }
    });

    const responseHeaders = new Headers(response.headers);
    responseHeaders.delete('content-encoding');
    // Ensure the player can access the stream from any origin
    responseHeaders.set('Access-Control-Allow-Origin', '*');

    return new Response(response.body ? response.body.pipeThrough(transformStream) : null, {
      status: response.status,
      headers: responseHeaders
    });
  }
};
