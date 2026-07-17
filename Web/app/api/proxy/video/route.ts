import { type NextRequest } from "next/server";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const targetUrl = searchParams.get("url");

  if (!targetUrl) {
    return new Response("url parameter is required", { status: 400 });
  }

  // Forward Range header for video seeking
  const rangeHeader = request.headers.get("range");

  const upstreamHeaders: Record<string, string> = {
    "User-Agent":
      "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36",
    Accept: "video/mp4,video/*;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
  };

  if (rangeHeader) {
    upstreamHeaders["Range"] = rangeHeader;
  }

  try {
    const upstreamRes = await fetch(targetUrl, {
      method: "GET",
      headers: upstreamHeaders,
      cache: "no-store",
    });

    if (!upstreamRes.ok && upstreamRes.status !== 206) {
      console.error(`[video-proxy] upstream ${upstreamRes.status} for ${targetUrl}`);
      return new Response(`Upstream responded with ${upstreamRes.status}`, {
        status: upstreamRes.status || 502,
      });
    }

    const responseHeaders = new Headers();
    const forwardHeaders = [
      "content-type",
      "content-length",
      "content-range",
      "accept-ranges",
      "last-modified",
      "etag",
    ];

    for (const header of forwardHeaders) {
      if (upstreamRes.headers.has(header)) {
        responseHeaders.set(header, upstreamRes.headers.get(header)!);
      }
    }

    responseHeaders.set("Access-Control-Allow-Origin", "*");
    responseHeaders.set("Access-Control-Allow-Headers", "Range");
    responseHeaders.set("Cache-Control", "public, max-age=60");

    return new Response(upstreamRes.body, {
      status: upstreamRes.status,
      headers: responseHeaders,
    });
  } catch (error: any) {
    console.error("[video-proxy] fetch error:", error);
    return new Response(`Proxy error: ${error.message}`, { status: 502 });
  }
}
