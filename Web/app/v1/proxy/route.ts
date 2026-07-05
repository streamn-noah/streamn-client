import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  // Reconstruct target URL on local backend (localhost:3001)
  const targetUrl = `https://streamn-backend.fly.dev/v1/proxy${requestUrl.search}`;

  try {
    const response = await fetch(targetUrl, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Accept: "*/*",
      },
    });

    if (!response.ok) {
      console.warn(`Backend v1/proxy target returned status ${response.status}`);
      return new Response(`Backend proxy returned ${response.status}`, {
        status: response.status,
      });
    }

    const contentType =
      response.headers.get("content-type") || "application/vnd.apple.mpegurl";

    return new Response(response.body, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, OPTIONS",
        "Access-Control-Allow-Headers": "*",
        "Cache-Control": "public, max-age=3600",
      },
    });
  } catch (err: any) {
    console.error("v1/proxy handler error:", err?.message || err);
    return new Response("Failed to proxy stream", { status: 500 });
  }
}
