import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'edge';

export async function GET(req: NextRequest) {
  const targetUrl = req.nextUrl.searchParams.get('url');

  if (!targetUrl) {
    return new Response('Missing url parameter', { status: 400 });
  }

  try {
    const response = await fetch(targetUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      }
    });

    const responseHeaders = new Headers(response.headers);
    responseHeaders.set('Access-Control-Allow-Origin', '*');

    return new Response(response.body, {
      status: response.status,
      headers: responseHeaders
    });
  } catch (error) {
    console.error('Proxy error:', error);
    return new Response('Proxy Error', { status: 500 });
  }
}
