import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const targetUrl = searchParams.get("url");

  if (!targetUrl) {
    return NextResponse.json({ error: "Missing url parameter" }, { status: 400 });
  }

  try {
    const response = await fetch(targetUrl, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Accept: "*/*",
      },
    });

    if (!response.ok) {
      console.warn(`Stream proxy target returned ${response.status} for ${targetUrl}`);
      return new Response(`Stream target returned ${response.status}`, {
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
        "Cache-Control": "no-cache",
      },
    });
  } catch (err: any) {
    console.error("Proxy stream error:", err?.message || err);
    return new Response("Failed to proxy stream", { status: 500 });
  }
}
