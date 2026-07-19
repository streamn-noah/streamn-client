import { getMediaDetail } from './tmdb';
import AsyncStorage from '@react-native-async-storage/async-storage';
import CryptoJS from 'crypto-js';

// MovieBox direct integration. Requests are signed using HMAC-MD5 via crypto-js
// and query the MovieBox host pool directly from the device's residential connection.
// This completely bypasses the backend and proxy server.

const SECRET_KEY_B64 = '76iRl07s0xSN9jqmEWAt79EBJZulIQIsV64FZr2O';
const SIGNATURE_BODY_MAX_BYTES = 102_400;

const HOST_POOL = [
  'https://api6.aoneroom.com',
  'https://api5.aoneroom.com',
  'https://api4.aoneroom.com',
  'https://api4sg.aoneroom.com',
  'https://api3.aoneroom.com',
  'https://api6sg.aoneroom.com',
  'https://api.inmoviebox.com',
];

const VERSION_CODE = 50020044;
const VERSION_NAME = '3.0.03.0529.03';
const ANDROID_VERSION = '13';
const ANDROID_BUILD = 'TQ2A.230405.003';
const DEVICE_MODEL = '23078RKD5C';
const DEVICE_BRAND = 'Redmi';

const USER_AGENT =
  `com.community.oneroom/${VERSION_CODE} ` +
  `(Linux; U; Android ${ANDROID_VERSION}; en_US; ` +
  `${DEVICE_MODEL}; Build/${ANDROID_BUILD}; Cronet/135.0.7012.3)`;

const PATHS = {
  search:       '/wefeed-mobile-bff/subject-api/search',
  get:          '/wefeed-mobile-bff/subject-api/get',
  seasonInfo:   '/wefeed-mobile-bff/subject-api/season-info',
  resource:     '/wefeed-mobile-bff/subject-api/resource',
  captions:     '/wefeed-mobile-bff/subject-api/get-ext-captions',
  tabOperating: '/wefeed-mobile-bff/tab-operating',
};

const KV_TOKEN_KEY = 'mobile_auth_token';
const SUBJECT_MATCH_TTL_MS = 6 * 60 * 60 * 1000;
const DOWNLOAD_PACK_TTL_MS = 60 * 1000;

const ENGLISH_PREFERRED_PATTERN = /\b(english|eng|original)\b/i;
const NON_ENGLISH_PATTERN =
  /\b(hindi|tamil|telugu|malayalam|bengali|punjabi|urdu|spanish|espanol|latino|french|german|italian|korean|japanese|arabic|portuguese|russian|multi-audio|dual-audio|dubbed)\b/i;

const ALLOWED_SUBJECT_TYPES = new Set([1, 2, 7]);

const LANGUAGE_NAMES: Record<string, string> = {
  en: 'English',   fr: 'Français',  ar: 'Arabic',    zh: 'Chinese',
  ru: 'Russian',   pt: 'Português', es: 'Spanish',   de: 'German',
  ja: 'Japanese',  ko: 'Korean',    it: 'Italian',   sw: 'Kiswahili',
  ha: 'Hausa',     ms: 'Malay',     bn: 'Bengali',   ur: 'Urdu',
  pa: 'Punjabi',   fil: 'Filipino', id: 'Indonesian',
};

// ─── Interfaces ───────────────────────────────────────────────────────────────

type MovieBoxCaption = {
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
};

export type MovieBoxDownloadPack = {
  seasons?: Array<{
    season: number;
    episodes?: Array<{
      episode: number;
      qualities?: MovieBoxStream[];
      streams?: MovieBoxStream[];
    }>;
  }>;
};

export type MovieBoxLookupInput = {
  title: string;
  type: "movie" | "tv";
  year?: string | null;
  season?: number;
  episode?: number;
  subjectId?: string;
};

export interface MovieBoxResponse {
  title: string;
  subjectId: string;
  streams: MovieBoxStream[];
}

type CachedMovieBoxMatch = {
  match: MovieBoxSearchItem;
  timestamp: number;
};

interface CachedToken {
  token: string;
  expiresAtSeconds: number;
  deviceId?: string;
  gaid?: string;
}

interface MBResourceItem {
  episode:            number;
  title:              string;
  resourceLink:       string;
  linkType:           number;
  size?:              string;
  resourceId:         string;
  resolution:         number;
  codecName?:         string;
  duration?:          number;
  extCaptions?:       Array<{ lan: string; lanName?: string; url: string }>;
  se:                 number;
  ep:                 number;
}

interface MBResourceData {
  pager: { hasMore: boolean; totalCount: number; nextPage?: string; page?: string; perPage?: number };
  list:  MBResourceItem[];
}

interface MBSearchItem {
  subjectId:        string;
  subjectType:      number;
  title:            string;
  description?:     string;
  releaseDate?:     string;
  duration?:        string;
  genre?:           string;
  cover?:           { url: string; thumbnail?: string };
  countryName?:     string;
  imdbRatingValue?: string;
  language?:        string;
}

interface MBSearchData {
  pager: { hasMore: boolean; nextPage: string; page: string; perPage: number; totalCount: number };
  items: MBSearchItem[];
}

// ─── Cache Stores ──────────────────────────────────────────────────────────────

const subjectMatchCache = new Map<string, CachedMovieBoxMatch>();
const downloadPackCache = new Map<string, { pack: MovieBoxDownloadPack; timestamp: number }>();

// ─── Signing Helpers ───────────────────────────────────────────────────────────

function md5Hex(data: string): string {
  return CryptoJS.MD5(data).toString(CryptoJS.enc.Hex);
}

function generateClientToken(ts: number): string {
  const tsStr = String(ts);
  const reversed = tsStr.split('').reverse().join('');
  const hash = md5Hex(reversed);
  return `${tsStr},${hash}`;
}

function sortedQueryString(url: string): string {
  const u = new URL(url);
  const params: string[] = [];
  const sorted = [...u.searchParams.entries()].sort(([a], [b]) => a.localeCompare(b));
  for (const [key, value] of sorted) {
    params.push(`${key}=${value}`);
  }
  return params.join('&');
}

function buildCanonicalString(
  method: string,
  accept: string,
  contentType: string,
  url: string,
  body: string | null,
  ts: number
): string {
  const u = new URL(url);
  const path = u.pathname;
  const query = sortedQueryString(url);
  const canonicalUrl = query ? `${path}?${query}` : path;

  let bodyHash = '';
  let bodyLength = '';

  if (body !== null) {
    let truncated = body;
    if (body.length > SIGNATURE_BODY_MAX_BYTES) {
      truncated = body.substring(0, SIGNATURE_BODY_MAX_BYTES);
    }
    bodyHash = md5Hex(truncated);
    bodyLength = String(body.length);
  }

  return [method.toUpperCase(), accept, contentType, bodyLength, ts, bodyHash, canonicalUrl].join('\n');
}

function generateSignature(
  method: string,
  accept: string,
  contentType: string,
  url: string,
  body: string | null,
  ts: number
): string {
  const canonical = buildCanonicalString(method, accept, contentType, url, body, ts);
  const secretKey = CryptoJS.enc.Base64.parse(SECRET_KEY_B64);
  const mac = CryptoJS.HmacMD5(canonical, secretKey);
  const macBase64 = CryptoJS.enc.Base64.stringify(mac);
  return `${ts}|2|${macBase64}`;
}

function getLookupCacheKey(input: MovieBoxLookupInput) {
  return `${input.type}:${input.title.toLowerCase()}:${input.year ?? ""}`;
}

function normalizeTitle(value: string): string {
  return value
    .toLowerCase()
    .replace(/\[[^\]]*\]/g, " ")
    .replace(/\([^)]*\)/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function getYearFromDate(value?: string | null): string | null {
  if (!value) return null;
  const match = value.match(/\b(19|20)\d{2}\b/);
  return match?.[0] ?? null;
}

function getLanguageScore(item: MovieBoxSearchItem): number {
  const haystack = `${item.title} ${item.language ?? ""}`;
  if (ENGLISH_PREFERRED_PATTERN.test(haystack)) return 25;
  if (NON_ENGLISH_PATTERN.test(haystack)) return -35;
  return 5;
}

function getTitleScore(input: MovieBoxLookupInput, item: MovieBoxSearchItem): number {
  const expected = normalizeTitle(input.title);
  const candidate = normalizeTitle(item.title);

  if (candidate === expected) return 60;
  if (candidate.startsWith(expected) || expected.startsWith(candidate)) return 40;
  if (candidate.includes(expected) || expected.includes(candidate)) return 25;

  const expectedWords = new Set(expected.split(" ").filter(Boolean));
  const candidateWords = candidate.split(" ").filter(Boolean);
  const sharedWords = candidateWords.filter((word) => expectedWords.has(word)).length;

  return sharedWords * 5;
}

function scoreSearchItem(input: MovieBoxLookupInput, item: MovieBoxSearchItem): number {
  if (input.type === "movie" && item.type !== "movie") return -1000;
  if (input.type === "tv" && item.type !== "tv") return -1000;

  let score = getTitleScore(input, item) + getLanguageScore(item);

  const candidateYear = getYearFromDate(item.releaseDate);
  if (input.year && candidateYear) {
    score += candidateYear === input.year ? 80 : -70;
  } else if (input.year && !candidateYear) {
    score -= 5;
  }

  if (item.hasResource) {
    score += 10;
  }

  return score;
}

function sortStreamsByQuality(streams: MovieBoxStream[]): MovieBoxStream[] {
  return [...streams].sort((a, b) => (b.resolution || 0) - (a.resolution || 0));
}

function resolveSubjectType(subjectType: number): 'movie' | 'tv' | 'shorts' {
  if (subjectType === 2) return 'tv';
  if (subjectType === 7) return 'shorts';
  return 'movie';
}

// ─── Device Credentials & Caching ──────────────────────────────────────────────

async function getStableDeviceAndGaid(): Promise<{ deviceId: string; gaid: string }> {
  try {
    const cachedDevice = await AsyncStorage.getItem('mb_device_id');
    const cachedGaid = await AsyncStorage.getItem('mb_gaid');
    if (cachedDevice && cachedGaid) {
      return { deviceId: cachedDevice, gaid: cachedGaid };
    }
  } catch (err) {
    console.warn("[MovieBox Direct] Failed to read device credentials:", err);
  }

  const deviceId = Array.from({ length: 16 }, () => Math.floor(Math.random() * 256))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  const gaid = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });

  try {
    await AsyncStorage.setItem('mb_device_id', deviceId);
    await AsyncStorage.setItem('mb_gaid', gaid);
  } catch (err) {
    console.warn("[MovieBox Direct] Failed to save device credentials:", err);
  }

  return { deviceId, gaid };
}

function decodeJwtExpSeconds(jwt: string): number | null {
  try {
    const payloadB64 = jwt.split('.')[1];
    if (!payloadB64) return null;
    const padded = payloadB64.replace(/-/g, '+').replace(/_/g, '/');
    const padding = '='.repeat((4 - (padded.length % 4)) % 4);
    
    const parsed = CryptoJS.enc.Base64.parse(padded + padding);
    const json = parsed.toString(CryptoJS.enc.Utf8);
    const payload = JSON.parse(json) as { exp?: number };
    return typeof payload.exp === 'number' ? payload.exp : null;
  } catch {
    return null;
  }
}

async function getCachedAuthToken(): Promise<CachedToken | null> {
  try {
    const raw = await AsyncStorage.getItem(KV_TOKEN_KEY);
    if (!raw) return null;
    const cached = JSON.parse(raw) as CachedToken;
    
    const EXPIRY_SAFETY_MARGIN_SECONDS = 300;
    const nowSeconds = Math.floor(Date.now() / 1000);
    if (nowSeconds < cached.expiresAtSeconds - EXPIRY_SAFETY_MARGIN_SECONDS) {
      return cached;
    }
  } catch (e) {
    console.warn(`[MovieBox Direct] Failed to read cached token: ${e}`);
  }
  return null;
}

async function writeTokenToStorage(cached: CachedToken): Promise<void> {
  try {
    await AsyncStorage.setItem(KV_TOKEN_KEY, JSON.stringify(cached));
  } catch (e) {
    console.warn(`[MovieBox Direct] Failed to write token: ${e}`);
  }
}

async function invalidateAuthToken(): Promise<void> {
  try {
    await AsyncStorage.removeItem(KV_TOKEN_KEY);
  } catch (e) {
    console.warn(`[MovieBox Direct] Failed to delete token: ${e}`);
  }
}

// ─── Headers and Signature Builder ─────────────────────────────────────────────

async function buildHeaders(
  method: string,
  url: string,
  body: string | null = null,
  authToken: string | null = null,
  deviceId: string,
  gaid: string
): Promise<Record<string, string>> {
  const accept = 'application/json';
  const contentType = body !== null ? 'application/json; charset=utf-8' : 'application/json';
  const ts = Date.now();

  const token = generateClientToken(ts);
  const signature = generateSignature(method, accept, contentType, url, body, ts);

  const headers: Record<string, string> = {
    'User-Agent':      USER_AGENT,
    'Accept':          accept,
    'Content-Type':    contentType,
    'Connection':      'keep-alive',
    'X-Client-Token':  token,
    'x-tr-signature':  signature,
    'X-Client-Info':   JSON.stringify({
      package_name:    'com.community.oneroom',
      version_name:    VERSION_NAME,
      version_code:    VERSION_CODE,
      os:              'android',
      os_version:      ANDROID_VERSION,
      install_ch:      'ps',
      device_id:       deviceId,
      install_store:   'ps',
      gaid,
      brand:           DEVICE_BRAND,
      model:           DEVICE_MODEL,
      system_language: 'en',
      net:             'NETWORK_WIFI',
      region:          'US',
      timezone:        'America/New_York',
      sp_code:         '40401',
      'X-Play-Mode':   '2',
    }),
    'X-Client-Status': '0',
    'X-Play-Mode':     '2',
  };

  if (authToken) {
    headers['Authorization'] = `Bearer ${authToken}`;
  }

  return headers;
}

// ─── Host Pool Network Layer ───────────────────────────────────────────────────

interface AttemptResult<T> {
  data: T | null;
  freshXUserToken: string | null;
  authFailure: boolean;
}

function extractXUserToken(response: Response): string | null {
  const xUser = response.headers.get('x-user');
  if (!xUser) return null;
  try {
    const payload = JSON.parse(xUser) as { token?: string };
    return payload.token ?? null;
  } catch {
    return null;
  }
}

async function attemptHostPool<T>(
  path: string,
  method: string,
  params?: Record<string, any>,
  bodyObj?: Record<string, any> | null,
  authToken?: string | null,
  deviceId?: string,
  gaid?: string
): Promise<AttemptResult<T>> {
  let sawAnyResponse = false;
  let sawAuthFailure = false;
  let freshXUserToken: string | null = null;
  const bodyStr = bodyObj ? JSON.stringify(bodyObj) : null;

  for (const base of HOST_POOL) {
    const url = new URL(`${base}${path}`);
    if (params) {
      for (const [key, value] of Object.entries(params)) {
        url.searchParams.set(key, String(value));
      }
    }

    const urlStr = url.toString();
    
    let headers: Record<string, string>;
    try {
      headers = await buildHeaders(method, urlStr, bodyStr, authToken, deviceId || '', gaid || '');
    } catch (e) {
      console.error(`[MovieBox Direct] Headers build failed for ${base}:`, e);
      continue;
    }

    console.log(`[MovieBox Direct Outgoing] URL: ${urlStr}`);

    try {
      const response = await fetch(urlStr, {
        method,
        headers: {
          ...headers,
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Pragma': 'no-cache',
          'Expires': '0',
        },
        body: bodyStr ?? undefined,
      });

      sawAnyResponse = true;

      const xUserToken = extractXUserToken(response);
      if (xUserToken) freshXUserToken = xUserToken;

      if (response.status === 401 || response.status === 403) {
        console.warn(`[MovieBox Direct] Host ${base} returned ${response.status} (auth) — trying next`);
        sawAuthFailure = true;
        continue;
      }

      if (!response.ok) {
        console.warn(`[MovieBox Direct] Host ${base} returned ${response.status} — trying next`);
        continue;
      }

      const data = await response.json() as { code: number; message?: string; data?: T };

      if (data.code === 0) {
        return { data: (data.data ?? null) as T | null, freshXUserToken, authFailure: false };
      }

      console.warn(`[MovieBox Direct] Host ${base} returned API code ${data.code}: ${data.message ?? ''} — trying next`);
      if (data.message && /token|auth/i.test(data.message)) {
        sawAuthFailure = true;
      }
    } catch (err) {
      console.warn(`[MovieBox Direct] Host ${base} failed: ${err} — trying next`);
    }
  }

  console.error(`[MovieBox Direct] All ${HOST_POOL.length} hosts exhausted for ${path}`);
  return {
    data: null,
    freshXUserToken,
    authFailure: sawAnyResponse && sawAuthFailure,
  };
}

let _bootstrapPromise: Promise<string> | null = null;

async function bootstrapAuthToken(deviceId: string, gaid: string): Promise<string> {
  if (!_bootstrapPromise) {
    _bootstrapPromise = (async () => {
      const bootstrapResult = await attemptHostPool<unknown>(
        PATHS.tabOperating,
        'GET',
        { page: 1, tabId: 0, version: '' },
        null,
        null,
        deviceId,
        gaid
      );

      const token = bootstrapResult.freshXUserToken;
      if (!token) {
        throw new Error('[MovieBox Direct] Bootstrap failed — no x-user token received from any host');
      }

      const exp = decodeJwtExpSeconds(token);
      const expiresAtSeconds = exp ?? Math.floor(Date.now() / 1000) + 3600;

      await writeTokenToStorage({ token, expiresAtSeconds, deviceId, gaid });
      return token;
    })().finally(() => {
      _bootstrapPromise = null;
    });
  }
  return _bootstrapPromise;
}

async function fetchWithHostPool<T>(
  path: string,
  method: string,
  params?: Record<string, any>,
  bodyObj?: Record<string, any> | null
): Promise<T | null> {
  const { deviceId, gaid } = await getStableDeviceAndGaid();

  let tokenInfo = await getCachedAuthToken();
  let authToken = tokenInfo?.token || null;

  if (!authToken) {
    try {
      authToken = await bootstrapAuthToken(deviceId, gaid);
    } catch (e) {
      console.error(`[MovieBox Direct] Initial bootstrap failed: ${e}`);
      return null;
    }
  }

  let result = await attemptHostPool<T>(path, method, params, bodyObj, authToken, deviceId, gaid);

  if (result.freshXUserToken) {
    const exp = decodeJwtExpSeconds(result.freshXUserToken);
    const expiresAtSeconds = exp ?? Math.floor(Date.now() / 1000) + 3600;
    await writeTokenToStorage({ token: result.freshXUserToken, expiresAtSeconds, deviceId, gaid });
  }

  if (result.data) {
    return result.data;
  }

  if (result.authFailure) {
    console.warn(`[MovieBox Direct] Auth failure on ${path} — invalidating token and retrying once`);
    await invalidateAuthToken();

    try {
      authToken = await bootstrapAuthToken(deviceId, gaid);
    } catch (e) {
      console.error(`[MovieBox Direct] Re-bootstrap after auth failure failed: ${e}`);
      return null;
    }

    result = await attemptHostPool<T>(path, method, params, bodyObj, authToken, deviceId, gaid);
    if (result.freshXUserToken) {
      const exp = decodeJwtExpSeconds(result.freshXUserToken);
      const expiresAtSeconds = exp ?? Math.floor(Date.now() / 1000) + 3600;
      await writeTokenToStorage({ token: result.freshXUserToken, expiresAtSeconds, deviceId, gaid });
    }
    return result.data;
  }

  return null;
}

// ─── Resource Pack Resolution ──────────────────────────────────────────────────

const RESOLUTIONS = [360, 480, 720, 1080];

async function fetchResourcePack(
  subjectId: string,
  se = 0,
  ep = 0
): Promise<MBResourceItem[] | null> {
  const seenResourceIds = new Set<string>();
  const allItems: MBResourceItem[] = [];
  const perPage = 10;

  const promises = RESOLUTIONS.map(async (resolution) => {
    let page = 1;
    const resItems: MBResourceItem[] = [];
    while (true) {
      const data = await fetchWithHostPool<MBResourceData>(
        PATHS.resource,
        'GET',
        { subjectId, se, ep, resolution, page, perPage }
      );

      if (!data?.list?.length) break;

      for (const item of data.list) {
        resItems.push(item);
      }

      if (!data.pager?.hasMore) break;

      page++;
      if (page > 100) break;
    }
    return resItems;
  });

  const results = await Promise.all(promises);
  for (const resItems of results) {
    for (const item of resItems) {
      if (!seenResourceIds.has(item.resourceId)) {
        seenResourceIds.add(item.resourceId);
        allItems.push(item);
      }
    }
  }

  if (!allItems.length) return null;

  return allItems.sort((a, b) => b.resolution - a.resolution);
}

function mapResourceItem(item: MBResourceItem): MovieBoxStream {
  const sizeMb = item.size
    ? `${Math.round(parseInt(item.size) / (1024 * 1024))} MB`
    : '0 MB';

  const captions = (item.extCaptions || []).map((cap) => ({
    language:      cap.lanName || LANGUAGE_NAMES[cap.lan] || cap.lan,
    language_code: cap.lan,
    url:           cap.url,
  }));

  return {
    quality:    `${item.resolution}p`,
    resolution: item.resolution,
    url:        item.resourceLink,
    format:     'mp4',
    size:       sizeMb,
    codecName:  item.codecName ?? undefined,
    duration:   item.duration ?? undefined,
    captions,
    se:         item.se,
    ep:         item.ep,
  };
}

// ─── Exported Direct Handlers ──────────────────────────────────────────────────

async function resolveMovieBoxMatch(input: MovieBoxLookupInput): Promise<MovieBoxSearchItem | null> {
  const cacheKey = getLookupCacheKey(input);
  const cached = subjectMatchCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < SUBJECT_MATCH_TTL_MS) {
    return cached.match;
  }

  const searchData = await fetchWithHostPool<MBSearchData>(
    PATHS.search,
    'POST',
    undefined,
    { keyword: input.title, page: 1, perPage: 10, subjectType: 0 }
  );

  const items = (searchData?.items ?? []).filter((item) => item.subjectId && item.title);
  if (!items.length) {
    console.warn(`[MovieBox Direct] No search matches found for "${input.title}"`);
    return null;
  }

  const mappedItems: MovieBoxSearchItem[] = items
    .filter((item) => ALLOWED_SUBJECT_TYPES.has(item.subjectType))
    .map((item) => ({
      subjectId: item.subjectId,
      type: resolveSubjectType(item.subjectType),
      title: item.title,
      releaseDate: item.releaseDate ?? null,
      language: item.language ?? null,
      hasResource: true,
    }));

  const bestMatch = [...mappedItems].sort((a, b) => scoreSearchItem(input, b) - scoreSearchItem(input, a))[0];
  if (!bestMatch || scoreSearchItem(input, bestMatch) < 0) {
    console.warn(`[MovieBox Direct] No confident match found for "${input.title}"`);
    return null;
  }

  subjectMatchCache.set(cacheKey, {
    match: bestMatch,
    timestamp: Date.now(),
  });

  return bestMatch;
}

export async function getMovieBoxStreams(input: MovieBoxLookupInput): Promise<MovieBoxResponse | null> {
  try {
    const match = input.subjectId 
      ? { subjectId: input.subjectId, title: input.title, type: input.type } as MovieBoxSearchItem
      : await resolveMovieBoxMatch(input);
    if (!match) return null;

    const querySeason = input.type === 'movie' ? 0 : input.season ?? 1;
    const queryEpisode = input.type === 'movie' ? 0 : input.episode ?? 1;

    const pack = await fetchResourcePack(match.subjectId, querySeason, queryEpisode);
    if (!pack) return null;

    const isMovie = querySeason === 0 && queryEpisode === 0;
    let items = pack;

    if (!isMovie) {
      const filtered = pack.filter((r) => r.se === querySeason && r.ep === queryEpisode);
      if (!filtered.length) return null;
      items = filtered;
    }

    const seenQualities = new Set<string>();
    const streams = items
      .filter((item) => {
        const q = `${item.resolution}p`;
        if (seenQualities.has(q)) return false;
        seenQualities.add(q);
        return true;
      })
      .map(mapResourceItem);

    return {
      title: match.title,
      subjectId: match.subjectId,
      streams: sortStreamsByQuality(streams),
    };
  } catch (error) {
    console.error('[MovieBox Direct] Error in getMovieBoxStreams:', error);
    return null;
  }
}

export async function getMovieBoxDownloadSources(
  input: MovieBoxLookupInput,
): Promise<MovieBoxResponse | null> {
  try {
    if (input.type === 'movie') {
      return getMovieBoxStreams({
        ...input,
        season: 0,
        episode: 0,
      });
    }

    const match = input.subjectId 
      ? { subjectId: input.subjectId, title: input.title, type: input.type } as MovieBoxSearchItem
      : await resolveMovieBoxMatch(input);
    if (!match) return null;

    const cachedPack = downloadPackCache.get(match.subjectId);
    const pack =
      cachedPack && Date.now() - cachedPack.timestamp < DOWNLOAD_PACK_TTL_MS
        ? cachedPack.pack
        : await getMovieBoxSeasonDownloads(input);

    if (pack) {
      downloadPackCache.set(match.subjectId, {
        pack,
        timestamp: Date.now(),
      });
    }

    const seasonEntry = pack?.seasons?.find((entry) => entry.season === (input.season ?? 1));
    const episodeEntry = seasonEntry?.episodes?.find((entry) => entry.episode === (input.episode ?? 1));
    const qualities = episodeEntry?.qualities ?? episodeEntry?.streams ?? [];

    return {
      title: match.title,
      subjectId: match.subjectId,
      streams: sortStreamsByQuality(qualities),
    };
  } catch (error) {
    console.error('[MovieBox Direct] Error in getMovieBoxDownloadSources:', error);
    return null;
  }
}

export async function getMovieBoxSeasonDownloads(
  input: MovieBoxLookupInput,
): Promise<MovieBoxDownloadPack | null> {
  try {
    const match = input.subjectId 
      ? { subjectId: input.subjectId, title: input.title, type: input.type } as MovieBoxSearchItem
      : await resolveMovieBoxMatch(input);
    if (!match) return null;

    const pack = await fetchResourcePack(match.subjectId);
    if (!pack) return null;

    const seasonMap = new Map<number, Map<number, MovieBoxStream[]>>();

    for (const item of pack) {
      const seKey = item.se;
      const epKey = item.ep;

      if (!seasonMap.has(seKey)) seasonMap.set(seKey, new Map());
      const epMap = seasonMap.get(seKey)!;

      if (!epMap.has(epKey)) epMap.set(epKey, []);
      const qualities = epMap.get(epKey)!;

      const q = `${item.resolution}p`;
      if (!qualities.find((x) => x.quality === q)) {
        qualities.push(mapResourceItem(item));
      }
    }

    const seasons = [...seasonMap.entries()]
      .sort(([a], [b]) => a - b)
      .map(([seasonNum, epMap]) => ({
        season: seasonNum,
        episodes: [...epMap.entries()]
          .sort(([a], [b]) => a - b)
          .map(([epNum, qualities]) => ({
            episode:  epNum,
            qualities,
          })),
      }));

    return { seasons };
  } catch (error) {
    console.error('[MovieBox Direct] Error in getMovieBoxSeasonDownloads:', error);
    return null;
  }
}
