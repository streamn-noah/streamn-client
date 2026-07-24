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

  const proxyBase = process.env.NEXT_PUBLIC_VIDEO_PROXY_URL || "https://streamn-proxy.dethstroke23.workers.dev";
  const cfProxyUrl = `${proxyBase.replace(/\/$/, "")}?url=${encodeURIComponent(targetUrl)}`;

  const rangeHeader = req.headers.get("range");
  const contentType = req.headers.get("content-type");
  const xTimestamp = req.headers.get("x-client-timestamp");
  const xNonce = req.headers.get("x-client-nonce");
  const xSignature = req.headers.get("x-client-signature");
  const xVersion = req.headers.get("x-client-version");
  const xPlatform = req.headers.get("x-client-platform");

  const headers: Record<string, string> = {
    "User-Agent":
      "com.community.oneroom/50020044 (Linux; U; Android 13; en_US; 23078RKD5C; Build/TQ2A.230405.003; Cronet/135.0.7012.3)",
    Accept: "*/*",
    "Accept-Language": "en-US,en;q=0.9",
    ...(rangeHeader ? { Range: rangeHeader } : {}),
    ...(contentType ? { "Content-Type": contentType } : {}),
    ...(xTimestamp ? { "X-Client-Timestamp": xTimestamp } : {}),
    ...(xNonce ? { "X-Client-Nonce": xNonce } : {}),
    ...(xSignature ? { "X-Client-Signature": xSignature } : {}),
    ...(xVersion ? { "X-Client-Version": xVersion } : {}),
    ...(xPlatform ? { "X-Client-Platform": xPlatform } : {}),
  };

  try {
    const hasBody = ["POST", "PUT", "PATCH"].includes(req.method);
    const body = hasBody ? await req.arrayBuffer() : undefined;

    const response = await fetch(cfProxyUrl, {
      method: req.method,
      headers,
      body,
    });

    const responseHeaders = new Headers(response.headers);
    responseHeaders.delete("content-encoding");
    responseHeaders.set("Access-Control-Allow-Origin", "*");
    responseHeaders.set("Access-Control-Expose-Headers", "*");

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
