# 🎬 Spün MovieBox API Integration Guide

This guide details how to integrate your deployed **Spün MovieBox Cloudflare Worker** backend into the Next.js `streamn` codebase. 

Because MovieBox provides **direct `.mp4` video files and subtitles**, you can stream them natively inside your own HTML5 video player instead of using an embedded third-party iframe (like `cinesrc` or `vidlink`).

---

## 🛠 Environment Setup

Add these keys to your Next.js environment file ([streamn/web/.env](file:///c:/Users/PC/Documents/GitHub/streamn/web/.env)):

```env
# URL of your deployed Cloudflare Worker
MOVIEBOX_API_URL="https://spun-moviebox.dethstroke23.workers.dev"

# The authorization secret you configured via 'wrangler secret put'
MOVIEBOX_WORKER_SECRET="local-secret-12345"
```

---

## 🛰 API Reference

All requests (except public endpoints `/` and `/health`) must include the following header for authentication:
```http
X-Worker-Secret: <YOUR_MOVIEBOX_WORKER_SECRET>
```

### 1. Search Endpoint
Used to find the MovieBox `subjectId` corresponding to a media title.

*   **URL**: `POST /search`
*   **Request Body**:
    ```json
    {
      "keyword": "Avatar",
      "page": 1,
      "perPage": 10
    }
    ```
*   **Response Payload**:
    ```json
    {
      "items": [
        {
          "subjectId": "1654274595068805784",
          "subjectType": 1,
          "title": "Avatar [Hindi]",
          "type": "movie",
          "releaseDate": "2009-12-18",
          "duration": "2h 42m",
          "genre": "Action, Adventure, Fantasy",
          "poster": "https://pbcdn.aoneroom.com/image/...",
          "rating": 7.9,
          "language": "English, Spanish",
          "country": "United States"
        }
      ],
      "pager": {
        "hasMore": false,
        "page": 1,
        "perPage": 10,
        "totalCount": 1
      }
    }
    ```

### 2. Stream Links Endpoint
Retrieves play links for a specific movie or TV episode.

*   **URL**: `GET /stream/:subjectId?se=X&ep=Y`
    *   *Movies*: Set `se=0` and `ep=0`.
    *   *TV Series*: Set `se` (season number) and `ep` (episode number).
*   **Response Payload**:
    ```json
    {
      "streams": [
        {
          "quality": "1080p",
          "resolution": 1080,
          "url": "https://bcdn.hakunaymatata.com/resource/file.mp4?sign=abc123xyz&t=1782346",
          "format": "mp4",
          "size": "426 MB",
          "codecName": "hevc",
          "duration": 4005,
          "captions": [
            {
              "language": "English",
              "language_code": "en",
              "url": "https://bcdn.hakunaymatata.com/captions/en.vtt"
            }
          ],
          "se": 0,
          "ep": 0
        },
        {
          "quality": "720p",
          "resolution": 720,
          "url": "https://bcdn.hakunaymatata.com/resource/file_720.mp4?sign=abc456xyz&t=1782346",
          "format": "mp4",
          "size": "211 MB",
          "codecName": "hevc",
          "duration": 4005,
          "captions": [],
          "se": 0,
          "ep": 0
        }
      ],
      "total": 2
    }
    ```

### 3. TV Season Structure Endpoint
Gets available seasons, episodes, and resolution distribution for a TV show or shorts series.

*   **URL**: `GET /season/:subjectId`
*   **Response Payload**:
    ```json
    {
      "seasons": [
        {
          "season": 1,
          "totalEpisode": 8,
          "episodesAvailable": 8,
          "resolutions": [
            { "resolution": 360, "epNum": 8 },
            { "resolution": 720, "epNum": 8 },
            { "resolution": 1080, "epNum": 7 }
          ],
          "episodes": [
            { "episode": 1, "title": null, "releaseDate": null }
          ]
        }
      ]
    }
    ```

---

## 🔒 Security Best Practices

> [!IMPORTANT]
> **Protect Your Secret Key:**
> Do **NOT** fetch from the Cloudflare Worker directly in client-side React components (e.g. standard frontend `fetch` inside `useEffect`). If you do, users can inspect their browser's Network tab, steal your `X-Worker-Secret`, and abuse your API.

### 🛡 The Secure Gateway Architecture
Route all requests through a server-side Next.js API Route (e.g., `/api/stream/moviebox`). Next.js fetches from the Worker securely on the server-side, hiding the API secret from the browser client:

```
[Browser Frontend] 
       │
       ▼ (Client fetch request without secret key)
[Next.js Server API Route (/api/stream/moviebox)]
       │
       ▼ (Server fetch adding X-Worker-Secret header)
[Cloudflare Worker Backend]
```

---

## ⚡ Performance & Streaming Best Practices

### 1. Zero URL Caching
*   **CDN Expiration:** The video URLs returned from the `/stream` endpoint include a cryptographic signature (`sign`) and an expiration timestamp (`t`). 
*   **Rule:** Never cache the stream URLs database-side. Always request them fresh from the backend right before starting a playback session.

### 2. Matching TMDB to MovieBox
Because `streamn` uses TMDB IDs and MovieBox uses internal `subjectId`s, implement a search-and-match heuristic:
1. Search for the title using `POST /search`.
2. Compare the `releaseDate` or `year` from TMDB with the MovieBox results to ensure you pick the correct match.
3. Cache the matched mapping (e.g., `TMDB_ID -> MovieBox_SubjectID`) in your database or Redis so you only perform the search once per movie.

### 3. Cross-Origin (CORS) Issues
If your HTML5 video player throws CORS warnings when loading `.vtt` subtitles or direct `.mp4` URLs from the MovieBox CDN, add the `crossorigin="anonymous"` attribute to your `<video>` element:
```tsx
<video src={streamUrl} crossorigin="anonymous" controls>
  {captions.map((cap) => (
    <track 
      key={cap.language_code} 
      src={cap.url} 
      label={cap.language} 
      srcLang={cap.language_code} 
      kind="subtitles" 
    />
  ))}
</video>
```

---

## 🚀 Integration Code Example

Create a secure Next.js API route under `app/api/stream/moviebox/route.ts` to query the Worker:

```typescript
// app/api/stream/moviebox/route.ts
import { NextResponse } from "next/server";

const WORKER_URL = process.env.MOVIEBOX_API_URL;
const WORKER_SECRET = process.env.MOVIEBOX_WORKER_SECRET;

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const title = searchParams.get("title");
  const season = searchParams.get("season") || "0";
  const episode = searchParams.get("episode") || "0";

  if (!title) {
    return NextResponse.json({ error: "Title parameter is required" }, { status: 400 });
  }

  try {
    // 1. Search for the subjectId
    const searchResponse = await fetch(`${WORKER_URL}/search`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Worker-Secret": WORKER_SECRET!,
      },
      body: JSON.stringify({ keyword: title, page: 1, perPage: 5 }),
    });

    if (!searchResponse.ok) {
      throw new Error(`Search failed: ${searchResponse.statusText}`);
    }

    const searchData = await searchResponse.json();
    const match = searchData.items?.[0]; // Get the closest match

    if (!match) {
      return NextResponse.json({ error: "No media match found on MovieBox" }, { status: 404 });
    }

    // 2. Fetch the stream link using the subjectId
    const streamResponse = await fetch(
      `${WORKER_URL}/stream/${match.subjectId}?se=${season}&ep=${episode}`,
      {
        method: "GET",
        headers: {
          "X-Worker-Secret": WORKER_SECRET!,
        },
      }
    );

    if (!streamResponse.ok) {
      throw new Error(`Stream lookup failed: ${streamResponse.statusText}`);
    }

    const streamData = await streamResponse.json();
    return NextResponse.json({
      title: match.title,
      subjectId: match.subjectId,
      streams: streamData.streams,
    });
  } catch (error) {
    console.error("MovieBox API Resolve Error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal Server Error" },
      { status: 500 }
    );
  }
}
```
