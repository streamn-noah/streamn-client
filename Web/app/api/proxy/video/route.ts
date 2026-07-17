import { type NextRequest, NextResponse } from "next/server";

export const runtime = "edge";

/**
 * Server-side video proxy — tunnels MP4 streams from CORS-restricted CDNs
 * (e.g. bcdn.hakunaymatata.com) through our Next.js origin so the browser
 * never makes a cross-origin video request.
 *
 * Supports HTTP Range requests so scrubbing / seeking works correctly.
 *
 * Usage: /api/proxy/video?url=<encoded-mp4-url>
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const rawUrl = searchParams.get("url");

  if (!rawUrl) {
    return NextResponse.json({ error: "url parameter is required" }, { status: 400 });
  }

  let targetUrl: string;
  try {
    targetUrl = decodeURIComponent(rawUrl);
    new URL(targetUrl); // validate
  } catch {
    return NextResponse.json({ error: "Invalid url parameter" }, { status: 400 });
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

  let upstreamRes: Response;
  try {
    upstreamRes = await fetch(targetUrl, {
      method: "GET",
      headers: upstreamHeaders,
      cache: "no-store",
    });
  } catch (err) {
    console.error("[video-proxy] fetch error:", err);
    return NextResponse.json({ error: "Failed to fetch upstream video" }, { status: 502 });
  }

  // Treat 206 Partial Content as success
  if (!upstreamRes.ok && upstreamRes.status !== 206) {
    console.error(`[video-proxy] upstream ${upstreamRes.status} for ${targetUrl}`);
    return NextResponse.json(
      { error: `Upstream responded with ${upstreamRes.status}` },
      { status: upstreamRes.status }
    );
  }

  // Forward relevant response headers
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
    const val = upstreamRes.headers.get(header);
    if (val) responseHeaders.set(header, val);
  }

  // We own this origin now — no CORS restriction for the browser
  responseHeaders.set("Access-Control-Allow-Origin", "*");
  responseHeaders.set("Access-Control-Allow-Headers", "Range");
  // Short cache — signed URLs expire
  responseHeaders.set("Cache-Control", "public, max-age=60");

  return new NextResponse(upstreamRes.body, {
    status: upstreamRes.status,
    headers: responseHeaders,
  });
}

// Handle preflight CORS for Range-header pre-flight requests
export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Range, Content-Type",
    },
  });
}
