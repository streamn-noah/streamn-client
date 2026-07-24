import { NextRequest } from "next/server";

export const runtime = "edge";

async function proxyHandler(req: NextRequest) {
  const rawUrl = req.url;
  const urlParamIndex = rawUrl.indexOf("url=");
  let targetUrl: string | null = null;

  if (urlParamIndex !== -1) {
    const rawParam = rawUrl.substring(urlParamIndex + 4);
    try {
      targetUrl = decodeURIComponent(rawParam);
    } catch {
      targetUrl = rawParam;
    }
  }

  if (!targetUrl) {
    return new Response("Missing url parameter", { status: 400 });
  }

  const rangeHeader = req.headers.get("range");
  const contentType = req.headers.get("content-type");
  const xTimestamp = req.headers.get("x-client-timestamp");
  const xNonce = req.headers.get("x-client-nonce");
  const xSignature = req.headers.get("x-client-signature");
  const xVersion = req.headers.get("x-client-version");
  const xPlatform = req.headers.get("x-client-platform");
  const authorization = req.headers.get("authorization");
  const xTrSignature = req.headers.get("x-tr-signature");
  const xClientToken = req.headers.get("x-client-token");
  const xClientInfo = req.headers.get("x-client-info");

  const reqAccept = req.headers.get("accept");
  const acceptHeader = xTrSignature
    ? "application/json"
    : reqAccept && reqAccept !== "*/*"
    ? reqAccept
    : "*/*";

  const headers: Record<string, string> = {
    "User-Agent":
      "com.community.oneroom/50020044 (Linux; U; Android 13; en_US; 23078RKD5C; Build/TQ2A.230405.003; Cronet/135.0.7012.3)",
    Accept: acceptHeader,
    "Accept-Language": "en-US,en;q=0.9",
    "X-Forwarded-For": "197.210.65.1",
    "X-Real-IP": "197.210.65.1",
    ...(rangeHeader ? { Range: rangeHeader } : {}),
    ...(contentType ? { "Content-Type": contentType } : {}),
    ...(xTimestamp ? { "X-Client-Timestamp": xTimestamp } : {}),
    ...(xNonce ? { "X-Client-Nonce": xNonce } : {}),
    ...(xSignature ? { "X-Client-Signature": xSignature } : {}),
    ...(xVersion ? { "X-Client-Version": xVersion } : {}),
    ...(xPlatform ? { "X-Client-Platform": xPlatform } : {}),
    ...(authorization ? { Authorization: authorization } : {}),
    ...(xTrSignature ? { "x-tr-signature": xTrSignature } : {}),
    ...(xClientToken ? { "X-Client-Token": xClientToken } : {}),
    ...(xClientInfo ? { "X-Client-Info": xClientInfo } : {}),
  };

  try {
    const hasBody = ["POST", "PUT", "PATCH"].includes(req.method);
    const body = hasBody ? await req.arrayBuffer() : undefined;

    // Use Cloudflare Worker proxy as server-side fallback to avoid Node TLS undici handshake errors
    const workerProxyBase = process.env.NEXT_PUBLIC_VIDEO_PROXY_URL || "https://streamn-proxy.dethstroke23.workers.dev";
    let response: Response;
    try {
      response = await fetch(targetUrl, {
        method: req.method,
        headers,
        body,
      });
    } catch {
      const proxyFetchUrl = `${workerProxyBase.replace(/\/$/, "")}?url=${encodeURIComponent(targetUrl)}`;
      response = await fetch(proxyFetchUrl, {
        method: req.method,
        headers,
        body,
      });
    }

    const responseHeaders = new Headers(response.headers);
    responseHeaders.delete("content-encoding");
    responseHeaders.set("Access-Control-Allow-Origin", "*");
    responseHeaders.set("Access-Control-Expose-Headers", "*");

    if (req.method === "HEAD" || !response.body) {
      return new Response(null, {
        status: response.status,
        headers: responseHeaders,
      });
    }

    const isVideo = (response.headers.get("content-type") || "").includes("video") || targetUrl.includes(".mp4");

    if (isVideo) {
      const HEV1 = new Uint8Array([104, 101, 118, 49]); // 'hev1'
      const HVC1 = new Uint8Array([104, 118, 99, 49]); // 'hvc1'

      const transformStream = new TransformStream({
        transform(chunk, controller) {
          let offset = 0;
          while (true) {
            let found = -1;
            for (let i = offset; i < chunk.length - 3; i++) {
              if (
                chunk[i] === HEV1[0] &&
                chunk[i + 1] === HEV1[1] &&
                chunk[i + 2] === HEV1[2] &&
                chunk[i + 3] === HEV1[3]
              ) {
                found = i;
                break;
              }
            }
            if (found === -1) break;
            chunk.set(HVC1, found);
            offset = found + 4;
          }
          controller.enqueue(chunk);
        },
      });

      return new Response(response.body.pipeThrough(transformStream), {
        status: response.status,
        headers: responseHeaders,
      });
    }

    return new Response(response.body, {
      status: response.status,
      headers: responseHeaders,
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}

export async function GET(req: NextRequest) {
  return proxyHandler(req);
}

export async function POST(req: NextRequest) {
  return proxyHandler(req);
}

export async function HEAD(req: NextRequest) {
  return proxyHandler(req);
}

export async function OPTIONS() {
  return new Response(null, {
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, HEAD, POST, OPTIONS",
      "Access-Control-Allow-Headers": "*",
      "Access-Control-Max-Age": "86400",
    },
  });
}
