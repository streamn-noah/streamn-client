import { NextApiRequest, NextApiResponse } from 'next';
import http from 'http';
import https from 'https';

export const config = {
  api: {
    responseLimit: false,
    bodyParser: false,
    externalResolver: true,
  },
};

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  const targetUrl = req.query.url as string;
  if (!targetUrl) {
    return res.status(400).send('Missing url parameter');
  }

  const isHttps = targetUrl.startsWith('https://');
  const client = isHttps ? https : http;

  const urlObj = new URL(targetUrl);
  const options = {
    hostname: urlObj.hostname,
    port: urlObj.port || (isHttps ? 443 : 80),
    path: urlObj.pathname + urlObj.search,
    method: req.method,
    headers: {
      'User-Agent': 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36',
      Accept: 'video/mp4,video/*;q=0.9,*/*;q=0.8',
    },
  };

  if (req.headers.range) {
    // @ts-expect-error Typescript doesn't like indexing into headers
    options.headers['Range'] = req.headers.range;
  }

  const proxyReq = client.request(options, (proxyRes) => {
    // Strip headers that interfere with the client connection
    const headersToStrip = ['connection', 'keep-alive', 'transfer-encoding', 'content-encoding'];
    const safeHeaders = { ...proxyRes.headers };
    for (const h of headersToStrip) {
      delete safeHeaders[h];
    }

    res.writeHead(proxyRes.statusCode || 200, safeHeaders);
    
    // On-the-fly 'hev1' to 'hvc1' binary replacement
    const HEV1 = Buffer.from('hev1');
    const HVC1 = Buffer.from('hvc1');

    proxyRes.on('data', (chunk) => {
      let offset = 0;
      while (true) {
        const index = chunk.indexOf(HEV1, offset);
        if (index === -1) break;
        // Overwrite 'hev1' with 'hvc1'
        HVC1.copy(chunk, index);
        offset = index + 4;
      }
      res.write(chunk);
    });

    proxyRes.on('end', () => {
      res.end();
    });
  });

  proxyReq.on('error', (err: any) => {
    if (err.code !== 'ECONNRESET') {
      console.error('[next-proxy] Proxy error:', err.message);
    }
    if (!res.headersSent) {
      res.writeHead(502);
      res.end('Proxy Error');
    }
  });

  req.on('close', () => {
    proxyReq.destroy();
  });

  req.on('aborted', () => {
    proxyReq.destroy();
  });

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    req.pipe(proxyReq);
  } else {
    proxyReq.end();
  }
}
