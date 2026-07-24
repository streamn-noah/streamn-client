export default {
  async fetch(request, env, ctx) {
    // Handle CORS preflight requests
    if (request.method === "OPTIONS") {
      return new Response(null, {
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, HEAD, POST, OPTIONS",
          "Access-Control-Allow-Headers": "*",
          "Access-Control-Max-Age": "86400",
        }
      });
    }

    const rawUrl = request.url;
    const urlParamIndex = rawUrl.indexOf('url=');
    let targetUrl = null;

    if (urlParamIndex !== -1) {
      const rawParam = rawUrl.substring(urlParamIndex + 4);
      try {
        targetUrl = decodeURIComponent(rawParam);
      } catch {
        targetUrl = rawParam;
      }
    }

    if (!targetUrl) {
      return new Response('Missing url parameter', { status: 400 });
    }

    const rangeHeader = request.headers.get('range');
    const contentType = request.headers.get('content-type');
    const xTimestamp = request.headers.get('x-client-timestamp');
    const xNonce = request.headers.get('x-client-nonce');
    const xSignature = request.headers.get('x-client-signature');
    const xVersion = request.headers.get('x-client-version');
    const xPlatform = request.headers.get('x-client-platform');

    const fetchHeaders = {
      'User-Agent': 'com.community.oneroom/50020044 (Linux; U; Android 13; en_US; 23078RKD5C; Build/TQ2A.230405.003; Cronet/135.0.7012.3)',
      'Accept': '*/*',
      'Accept-Language': 'en-US,en;q=0.9',
      ...(rangeHeader ? { Range: rangeHeader } : {}),
      ...(contentType ? { 'Content-Type': contentType } : {}),
      ...(xTimestamp ? { 'X-Client-Timestamp': xTimestamp } : {}),
      ...(xNonce ? { 'X-Client-Nonce': xNonce } : {}),
      ...(xSignature ? { 'X-Client-Signature': xSignature } : {}),
      ...(xVersion ? { 'X-Client-Version': xVersion } : {}),
      ...(xPlatform ? { 'X-Client-Platform': xPlatform } : {}),
    };

    const hasBody = ['POST', 'PUT', 'PATCH'].includes(request.method);
    const response = await fetch(targetUrl, {
      method: request.method,
      headers: fetchHeaders,
      body: hasBody ? await request.arrayBuffer() : undefined,
      redirect: 'follow'
    });

    const responseHeaders = new Headers(response.headers);
    responseHeaders.delete('content-encoding');
    responseHeaders.set('Access-Control-Allow-Origin', '*');
    responseHeaders.set('Access-Control-Expose-Headers', '*');

    if (request.method === 'HEAD' || !response.body) {
      return new Response(null, {
        status: response.status,
        headers: responseHeaders
      });
    }

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

    return new Response(response.body.pipeThrough(transformStream), {
      status: response.status,
      headers: responseHeaders
    });
  }
};
