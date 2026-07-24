import * as FileSystem from 'expo-file-system/legacy';
import { Platform } from 'react-native';

const MOVIEBOX_USER_AGENT =
  'com.community.oneroom/50020044 (Linux; U; Android 13; en_US; 23078RKD5C; Build/TQ2A.230405.003; Cronet/135.0.7012.3)';

const HEV1_BYTES = [104, 101, 118, 49]; // 'hev1'
const HVC1_BYTES = [104, 118, 99, 49]; // 'hvc1'

function base64ToUint8Array(base64: string): Uint8Array {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

function uint8ArrayToBase64(bytes: Uint8Array): string {
  let binary = '';
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

/**
 * Searches for 'hev1' FourCC atom tags in the first 512KB of a base64 encoded MP4 header
 * and replaces them with 'hvc1' for iOS AVPlayer compatibility.
 */
export function patchBase64Header(base64Str: string): { patchedBase64: string; replacedCount: number } {
  try {
    const bytes = base64ToUint8Array(base64Str);
    let count = 0;
    const maxSearchLen = Math.min(bytes.length - 3, 512 * 1024);

    for (let i = 0; i < maxSearchLen; i++) {
      if (
        bytes[i] === HEV1_BYTES[0] &&
        bytes[i + 1] === HEV1_BYTES[1] &&
        bytes[i + 2] === HEV1_BYTES[2] &&
        bytes[i + 3] === HEV1_BYTES[3]
      ) {
        bytes[i] = HVC1_BYTES[0];
        bytes[i + 1] = HVC1_BYTES[1];
        bytes[i + 2] = HVC1_BYTES[2];
        bytes[i + 3] = HVC1_BYTES[3];
        count++;
        i += 3;
      }
    }

    if (count > 0) {
      return { patchedBase64: uint8ArrayToBase64(bytes), replacedCount: count };
    }
  } catch (err) {
    console.warn('[H265Patcher] Header patch failed:', err);
  }

  return { patchedBase64: base64Str, replacedCount: 0 };
}

function getStreamHash(url: string): string {
  let hash = 0;
  for (let i = 0; i < url.length; i++) {
    const char = url.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash |= 0;
  }
  return Math.abs(hash).toString(36);
}

/**
 * On iOS, downloads the stream directly from CDN using official MovieBox User-Agent,
 * replaces 'hev1' -> 'hvc1' FourCC atom tags in the local file header,
 * and returns a file:// URI ready for native iOS AVPlayer playback.
 */
export async function prepareIosH265Stream(
  rawUrl: string,
  onProgress?: (percent: number) => void
): Promise<string> {
  if (Platform.OS !== 'ios') {
    return rawUrl;
  }

  const cleanedUrl = rawUrl.replace(/(https?:\/\/[^/]+)\/\/+/g, '$1/');
  const isHls = cleanedUrl.includes('.m3u8');
  if (isHls) {
    return cleanedUrl;
  }

  try {
    const cacheDir = `${FileSystem.cacheDirectory}h265_streams/`;
    const dirInfo = await FileSystem.getInfoAsync(cacheDir);
    if (!dirInfo.exists) {
      await FileSystem.makeDirectoryAsync(cacheDir, { intermediates: true });
    }

    const hash = getStreamHash(cleanedUrl);
    const localFileUri = `${cacheDir}stream_${hash}.mp4`;

    const fileInfo = await FileSystem.getInfoAsync(localFileUri);
    if (fileInfo.exists && fileInfo.size > 64 * 1024) {
      console.log('[H265Patcher] Using cached patched file for iOS:', localFileUri);
      return localFileUri;
    }

    console.log('[H265Patcher] Downloading stream directly to iOS local storage...');
    const downloadResumable = FileSystem.createDownloadResumable(
      cleanedUrl,
      localFileUri,
      {
        headers: {
          'User-Agent': MOVIEBOX_USER_AGENT,
          Accept: 'video/mp4,video/*;q=0.9,*/*;q=0.8',
        },
      },
      (downloadProgress) => {
        const progress =
          downloadProgress.totalBytesWritten /
          downloadProgress.totalBytesExpectedToWrite;
        onProgress?.(progress);
      }
    );

    const result = await downloadResumable.downloadAsync();
    if (!result || !result.uri) {
      console.warn('[H265Patcher] Download failed, falling back to raw URL');
      return cleanedUrl;
    }

    // Read initial 512KB header and patch hev1 -> hvc1
    console.log('[H265Patcher] Patching MP4 header (hev1 -> hvc1) on local file...');
    const base64Header = await FileSystem.readAsStringAsync(result.uri, {
      encoding: FileSystem.EncodingType.Base64,
    });

    const { patchedBase64, replacedCount } = patchBase64Header(base64Header);
    if (replacedCount > 0) {
      console.log(`[H265Patcher] Successfully replaced ${replacedCount} 'hev1' atom(s) with 'hvc1'!`);
      await FileSystem.writeAsStringAsync(result.uri, patchedBase64, {
        encoding: FileSystem.EncodingType.Base64,
      });
    } else {
      console.log("[H265Patcher] No 'hev1' atoms found in header or already patched.");
    }

    return result.uri;
  } catch (error) {
    console.error('[H265Patcher] Error preparing iOS H.265 stream:', error);
    return cleanedUrl;
  }
}
