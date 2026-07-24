import CryptoJS from "crypto-js";

const SECRET_KEY_B64 = "76iRl07s0xSN9jqmEWAt79EBJZulIQIsV64FZr2O";
const SIGNATURE_BODY_MAX_BYTES = 102_400;

const HOST_POOL = [
  "https://api6.aoneroom.com",
  "https://api5.aoneroom.com",
  "https://api4.aoneroom.com",
  "https://api4sg.aoneroom.com",
  "https://api3.aoneroom.com",
  "https://api.inmoviebox.com",
];

const VERSION_CODE = 50020044;
const VERSION_NAME = "3.0.03.0529.03";
const ANDROID_VERSION = "13";
const ANDROID_BUILD = "TQ2A.230405.003";
const DEVICE_MODEL = "23078RKD5C";
const DEVICE_BRAND = "Redmi";

const USER_AGENT =
  `com.community.oneroom/${VERSION_CODE} ` +
  `(Linux; U; Android ${ANDROID_VERSION}; en_US; ` +
  `${DEVICE_MODEL}; Build/${ANDROID_BUILD}; Cronet/135.0.7012.3)`;

export type MovieBoxCaption = {
  language: string;
  language_code: string;
  url: string;
};

export interface MovieBoxStream {
  quality: string;
  resolution: number;
  url: string;
  format: string;
  size: string;
  codecName?: string;
  duration?: number;
  captions?: MovieBoxCaption[];
  se: number;
  ep: number;
}

type MovieBoxSearchItem = {
  subjectId: string;
  type: "movie" | "tv" | "shorts" | string;
  title: string;
  releaseDate?: string | null;
  language?: string | null;
  hasResource?: boolean;
  resourceDetectors?: any[];
};

export type MovieBoxLookupInput = {
  title: string;
  type: "movie" | "tv";
  year?: number | string | null;
  season?: number;
  episode?: number;
  subjectId?: string;
};

export type MovieBoxDirectResponse = {
  title: string;
  subjectId: string;
  streams: MovieBoxStream[];
};

function md5Hex(str: string): string {
  return CryptoJS.MD5(str).toString(CryptoJS.enc.Hex);
}

function generateClientToken(ts: number): string {
  const tsStr = String(ts);
  const reversed = tsStr.split("").reverse().join("");
  const hash = md5Hex(reversed);
  return `${tsStr},${hash}`;
}

function sortedQueryString(urlStr: string): string {
  const u = new URL(urlStr);
  const keys: string[] = [];
  u.searchParams.forEach((_, key) => keys.push(key));
  keys.sort();
  return keys.map((k) => `${k}=${u.searchParams.get(k)}`).join("&");
}

function getDeviceId(): string {
  if (typeof window !== "undefined" && window.localStorage) {
    let id = localStorage.getItem("mb_device_id");
    if (!id) {
      id = Array.from({ length: 32 }, () => Math.floor(Math.random() * 16).toString(16)).join("");
      localStorage.setItem("mb_device_id", id);
    }
    return id;
  }
  return "a1b2c3d4e5f678901234567890abcdef";
}

function getGaid(): string {
  if (typeof window !== "undefined" && window.localStorage) {
    let gaid = localStorage.getItem("mb_gaid");
    if (!gaid) {
      gaid = "00000000-0000-4000-8000-" + Array.from({ length: 12 }, () => Math.floor(Math.random() * 16).toString(16)).join("");
      localStorage.setItem("mb_gaid", gaid);
    }
    return gaid;
  }
  return "00000000-0000-4000-8000-1234567890ab";
}

function buildCanonicalString(
  method: string,
  accept: string,
  contentType: string,
  urlStr: string,
  body: string | null,
  ts: number
): string {
  const u = new URL(urlStr);
  const path = u.pathname;
  const query = sortedQueryString(urlStr);
  const canonicalUrl = query ? `${path}?${query}` : path;

  let bodyHash = "";
  let bodyLength = "";

  if (body !== null) {
    const encoder = new TextEncoder();
    const bodyBytes = encoder.encode(body);
    const truncatedBytes = bodyBytes.subarray(0, SIGNATURE_BODY_MAX_BYTES);
    const truncatedStr = new TextDecoder("utf-8").decode(truncatedBytes);
    bodyHash = md5Hex(truncatedStr);
    bodyLength = String(bodyBytes.length);
  }

  return [method.toUpperCase(), accept, contentType, bodyLength, ts, bodyHash, canonicalUrl].join("\n");
}

function generateSignature(
  method: string,
  accept: string,
  contentType: string,
  urlStr: string,
  body: string | null,
  ts: number
): string {
  const canonical = buildCanonicalString(method, accept, contentType, urlStr, body, ts);
  const secretKey = CryptoJS.enc.Base64.parse(SECRET_KEY_B64);
  const mac = CryptoJS.HmacMD5(canonical, secretKey);
  return `${ts}|2|${CryptoJS.enc.Base64.stringify(mac)}`;
}

function buildHeaders(
  method: string,
  urlStr: string,
  bodyStr: string | null = null,
  authToken: string | null = null,
  contentType: string = "application/json"
): Record<string, string> {
  const ts = Date.now();
  const token = generateClientToken(ts);
  const sig = generateSignature(method, "application/json", contentType, urlStr, bodyStr, ts);

  const headers: Record<string, string> = {
    "User-Agent": USER_AGENT,
    Accept: "application/json",
    "Content-Type": contentType,
    "X-Client-Token": token,
    "x-tr-signature": sig,
    "X-Forwarded-For": "197.210.65.1",
    "X-Real-IP": "197.210.65.1",
    "X-Client-Info": JSON.stringify({
      package_name: "com.community.oneroom",
      version_name: VERSION_NAME,
      version_code: VERSION_CODE,
      os: "android",
      os_version: ANDROID_VERSION,
      install_ch: "ps",
      device_id: getDeviceId(),
      install_store: "ps",
      gaid: getGaid(),
      brand: DEVICE_BRAND,
      model: DEVICE_MODEL,
      system_language: "en",
      net: "NETWORK_WIFI",
      region: "NG",
      timezone: "Africa/Lagos",
      sp_code: "62120",
      "X-Play-Mode": "2",
    }),
    "X-Client-Status": "0",
    "X-Play-Mode": "2",
  };

  if (authToken) {
    headers["Authorization"] = `Bearer ${authToken}`;
  }

  return headers;
}

let cachedAuthToken: string | null = null;

async function getAuthToken(): Promise<string | null> {
  if (cachedAuthToken) return cachedAuthToken;

  for (const base of HOST_POOL) {
    const urlStr = `${base}/wefeed-mobile-bff/tab-operating?page=1&tabId=0&version=`;
    const headers = buildHeaders("GET", urlStr, null, null);

    const workerProxyBase = process.env.NEXT_PUBLIC_VIDEO_PROXY_URL || "https://streamn-proxy.dethstroke23.workers.dev";
    const urlsToTry =
      typeof window !== "undefined"
        ? [`/api/proxy/video?url=${encodeURIComponent(urlStr)}`, urlStr]
        : [urlStr, `${workerProxyBase.replace(/\/$/, "")}?url=${encodeURIComponent(urlStr)}`];

    for (const fetchUrl of urlsToTry) {
      try {
        const signal = fetchUrl.includes("proxy") ? undefined : AbortSignal.timeout(1500);
        const res = await fetch(fetchUrl, { method: "GET", headers, signal });
        if (!res.ok) continue;

        const xUser = res.headers.get("x-user") || res.headers.get("X-User");
        if (xUser) {
          try {
            const payload = JSON.parse(xUser) as { token?: string };
            if (payload.token) {
              cachedAuthToken = payload.token;
              return cachedAuthToken;
            }
          } catch { }
        }
      } catch (err) {
        console.warn(`[MovieBox Direct Web] Bootstrap failed for host ${base} (${fetchUrl}):`, err);
      }
    }
  }

  return null;
}

function normalizeTitle(value: string): string {
  return value
    .toLowerCase()
    .replace(/\[[^\]]*\]/g, " ")
    .replace(/\([^)]*\)/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function isNonEnglishDub(title: string, language?: string | null): boolean {
  const haystack = `${title} ${language ?? ""}`;
  const bracketDubPattern =
    /[\[(].*?\b(hindi|tamil|telugu|malayalam|kannada|bengali|punjabi|urdu|spanish|espanol|latino|french|german|italian|korean|japanese|arabic|portuguese|russian|chinese|thai|indonesian|filipino|dub|dubbed|dual-audio|multi-audio)\b.*?[\])]/i;
  if (bracketDubPattern.test(haystack)) return true;
  const wordDubPattern =
    /\b(hindi|tamil|telugu|malayalam|kannada|bengali|punjabi|urdu|dubbed|dual-audio|multi-audio)\b/i;
  return wordDubPattern.test(haystack);
}

function scoreSearchItem(input: MovieBoxLookupInput, item: MovieBoxSearchItem): number {
  if (input.type === "movie" && item.type !== "movie") return -1000;
  if (input.type === "tv" && item.type !== "tv") return -1000;
  if (isNonEnglishDub(item.title, item.language)) return -1000;

  const expected = normalizeTitle(input.title);
  const candidate = normalizeTitle(item.title);

  let score = 0;
  if (candidate === expected) score += 60;
  else if (candidate.startsWith(expected) || expected.startsWith(candidate)) score += 40;
  else if (candidate.includes(expected) || expected.includes(candidate)) score += 25;

  const inputYear = input.year ? String(input.year) : null;
  const candidateYear = item.releaseDate ? item.releaseDate.match(/\b(19|20)\d{2}\b/)?.[0] : null;

  if (inputYear && candidateYear) {
    score += candidateYear === inputYear ? 80 : -70;
  }

  // Penalize unreleased future titles (e.g. 2026 unreleased upcoming movies)
  if (item.releaseDate) {
    const releaseTime = new Date(item.releaseDate).getTime();
    if (!isNaN(releaseTime) && releaseTime > Date.now()) {
      score -= 500;
    }
  }

  if (item.hasResource) score += 10;
  return score;
}


function extractStreamsFromItem(item: MovieBoxSearchItem): MovieBoxStream[] {
  const streams: MovieBoxStream[] = [];
  const detectors = item.resourceDetectors || [];
  for (const detector of detectors) {
    const resList = detector.resolutionList || [];
    for (const r of resList) {
      const url = r.resourceLink || r.url;
      if (url) {
        streams.push({
          quality: `${r.resolution || 720}p`,
          resolution: r.resolution || 720,
          url,
          format: "mp4",
          size: formatFileSize(r.size),
          codecName: r.codecName,
          duration: r.duration,
          se: r.se ?? 0,
          ep: r.ep ?? 0,
        });
      }
    }
    if (!streams.length && (detector.downloadUrl || detector.resourceLink)) {
      const url = detector.downloadUrl || detector.resourceLink;
      if (url) {
        streams.push({
          quality: "720p",
          resolution: 720,
          url,
          format: "mp4",
          size: "",
          se: 0,
          ep: 0,
        });
      }
    }
  }
  return streams;
}

export async function searchSubject(title: string): Promise<MovieBoxSearchItem[]> {
  const authToken = await getAuthToken();
  const bodyObj = { keyword: title, page: 1, perPage: 10, subjectType: 0 };
  const bodyStr = JSON.stringify(bodyObj);

  for (const base of HOST_POOL) {
    const urlStr = `${base}/wefeed-mobile-bff/subject-api/search`;
    const headers = buildHeaders("POST", urlStr, bodyStr, authToken, "application/json; charset=utf-8");

    const workerProxyBase = process.env.NEXT_PUBLIC_VIDEO_PROXY_URL || "https://streamn-proxy.dethstroke23.workers.dev";
    const urlsToTry =
      typeof window !== "undefined"
        ? [`/api/proxy/video?url=${encodeURIComponent(urlStr)}`, urlStr]
        : [urlStr, `${workerProxyBase.replace(/\/$/, "")}?url=${encodeURIComponent(urlStr)}`];

    for (const fetchUrl of urlsToTry) {
      try {
        const signal = fetchUrl.includes("proxy") ? undefined : AbortSignal.timeout(1500);
        const res = await fetch(fetchUrl, {
          method: "POST",
          headers,
          body: bodyStr,
          signal,
        });

        if (!res.ok) continue;
        const json = await res.json();
        const items = json?.data?.items || json?.data?.results;
        if (Array.isArray(items) && items.length > 0) {
          return items.map((r: any) => ({
            subjectId: String(r.subjectId),
            type: r.subjectType === 2 ? "tv" : "movie",
            title: r.title || title,
            releaseDate: r.releaseDate,
            hasResource: Boolean(r.hasResource),
            resourceDetectors: r.resourceDetectors,
          }));
        }
      } catch (err) {
        console.warn(`[MovieBox Direct Web] Host ${base} failed for search (${fetchUrl}):`, err);
      }
    }
  }

  return [];
}

function formatFileSize(rawSize: any): string {
  if (!rawSize) return "";
  const str = String(rawSize).trim();
  if (str.includes("MB") || str.includes("GB") || str.includes("KB")) return str;
  const bytes = Number(str);
  if (isNaN(bytes) || bytes <= 0) return str;
  if (bytes >= 1024 * 1024 * 1024) {
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
  }
  return `${Math.round(bytes / (1024 * 1024))} MB`;
}

async function fetchResourcePack(
  subjectId: string,
  se: number,
  ep: number
): Promise<MovieBoxStream[]> {
  const authToken = await getAuthToken();
  const resolutions = [720, 1080, 480, 360];

  for (const resolution of resolutions) {
    const params = {
      subjectId,
      se: String(se),
      ep: String(ep),
      resolution: String(resolution),
      page: "1",
      perPage: "10",
    };

    for (const base of HOST_POOL) {
      const url = new URL(`${base}/wefeed-mobile-bff/subject-api/resource`);
      for (const [k, v] of Object.entries(params)) {
        url.searchParams.set(k, v);
      }

      const urlStr = url.toString();
      const headers = buildHeaders("GET", urlStr, null, authToken);

      const workerProxyBase = process.env.NEXT_PUBLIC_VIDEO_PROXY_URL || "https://streamn-proxy.dethstroke23.workers.dev";
      const urlsToTry =
        typeof window !== "undefined"
          ? [`/api/proxy/video?url=${encodeURIComponent(urlStr)}`, urlStr]
          : [urlStr, `${workerProxyBase.replace(/\/$/, "")}?url=${encodeURIComponent(urlStr)}`];

      for (const fetchUrl of urlsToTry) {
        try {
          const signal = fetchUrl.includes("proxy") ? undefined : AbortSignal.timeout(1500);
          const res = await fetch(fetchUrl, { method: "GET", headers, signal });
          if (!res.ok) continue;

          const json = await res.json();
          const downloads = Array.isArray(json?.data?.list)
            ? json.data.list
            : Array.isArray(json?.data?.downloads)
              ? json.data.downloads
              : [];

          if (downloads.length > 0) {
            return downloads
              .filter((d: any) => d.resourceLink || d.url)
              .map((d: any) => ({
                quality: `${d.resolution || resolution}p`,
                resolution: d.resolution || resolution,
                url: d.resourceLink || d.url,
                format: "mp4",
                size: formatFileSize(d.size),
                codecName: d.codecName,
                duration: d.duration,
                se: d.se ?? se,
                ep: d.ep ?? ep,
              }));
          }
        } catch (err) {
          console.warn(`[MovieBox Direct Web] Host ${base} failed for resource ${resolution}p (${fetchUrl}):`, err);
        }
      }
    }
  }

  return [];
}

export async function fetchDirectMovieBoxStreams(
  input: MovieBoxLookupInput
): Promise<MovieBoxDirectResponse | null> {
  try {
    let subjectId = input.subjectId;
    let title = input.title;
    let selectedItem: MovieBoxSearchItem | null = null;

    if (!subjectId) {
      const items = await searchSubject(input.title);
      if (!items.length) {
        console.warn(`[MovieBox Direct Web] No search results for "${input.title}"`);
        return null;
      }

      const sorted = [...items].sort((a, b) => scoreSearchItem(input, b) - scoreSearchItem(input, a));
      const best = sorted[0];
      if (!best || scoreSearchItem(input, best) < 0) return null;
      subjectId = best.subjectId;
      title = best.title;
      selectedItem = best;
    }

    // 1. Try inline streams from search result resourceDetectors
    if (selectedItem) {
      const inlineStreams = extractStreamsFromItem(selectedItem);
      if (inlineStreams.length > 0) {
        const sortedStreams = [...inlineStreams].sort((a, b) => b.resolution - a.resolution);
        return {
          title,
          subjectId,
          streams: sortedStreams,
        };
      }
    }

    // 2. Fall back to fetchResourcePack if search didn't include inline resourceDetectors
    const querySeason = input.type === "movie" ? 0 : input.season ?? 1;
    const queryEpisode = input.type === "movie" ? 0 : input.episode ?? 1;

    const streams = await fetchResourcePack(subjectId, querySeason, queryEpisode);
    if (!streams.length) return null;

    const allStreams = [...streams].sort((a, b) => b.resolution - a.resolution);
    if (!allStreams.length) return null;

    return {
      title,
      subjectId,
      streams: allStreams,
    };
  } catch (err) {
    console.error("[MovieBox Direct Web] Error fetching streams:", err);
    return null;
  }
}
