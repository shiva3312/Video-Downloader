export interface DetectedMediaInfo {
  type: 'video' | 'image' | 'audio' | 'unknown';
  format: 'MP4' | 'WEBM' | 'MKV' | 'OGV' | 'JPG' | 'PNG' | 'GIF' | 'WEBP' | 'UNKNOWN';
  mimeType: string;
  ext: string;
}

/**
 * Checks if a given URL or hostname belongs exclusively to Telegram or Snapchat.
 */
export function isSupportedDomain(url: string = typeof window !== 'undefined' ? window.location?.href || '' : ''): boolean {
  if (!url) return false;
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase();
    return (
      host === 'telegram.org' ||
      host.endsWith('.telegram.org') ||
      host === 'snapchat.com' ||
      host.endsWith('.snapchat.com')
    );
  } catch {
    return false;
  }
}

/**
 * Sniffs binary magic bytes from the first 16 to 128 bytes of a file or stream.
 * Accurately determines container format, MIME type, and file extension.
 */
export function detectMediaContainer(header: Uint8Array | ArrayBuffer | number[]): DetectedMediaInfo {
  const bytes =
    header instanceof Uint8Array
      ? header
      : header instanceof ArrayBuffer
      ? new Uint8Array(header)
      : new Uint8Array(header);

  if (!bytes || bytes.length < 4) {
    return { type: 'video', format: 'MP4', mimeType: 'video/mp4', ext: 'mp4' };
  }

  // 1. EBML: WebM / Matroska
  // 0x1A 0x45 0xDF 0xA3
  if (
    bytes[0] === 0x1a &&
    bytes[1] === 0x45 &&
    bytes[2] === 0xdf &&
    bytes[3] === 0xa3
  ) {
    const sliceLen = Math.min(bytes.length, 128);
    let str = '';
    for (let i = 0; i < sliceLen; i++) {
      str += String.fromCharCode(bytes[i]);
    }
    if (str.includes('webm')) {
      return { type: 'video', format: 'WEBM', mimeType: 'video/webm', ext: 'webm' };
    }
    return { type: 'video', format: 'MKV', mimeType: 'video/webm', ext: 'mkv' };
  }

  // 2. ISO Base Media File Format: MP4, QuickTime MOV, Fragmented MP4 (fMP4)
  // Bytes 4-7: 0x66 0x74 0x79 0x70 ('ftyp') or 'styp', 'moov', 'mdat'
  if (bytes.length >= 8) {
    const boxType = String.fromCharCode(bytes[4], bytes[5], bytes[6], bytes[7]);
    if (boxType === 'ftyp' || boxType === 'styp' || boxType === 'moov' || boxType === 'mdat') {
      return { type: 'video', format: 'MP4', mimeType: 'video/mp4', ext: 'mp4' };
    }
  }

  // 3. Ogg: 'OggS'
  if (
    bytes[0] === 0x4f &&
    bytes[1] === 0x67 &&
    bytes[2] === 0x67 &&
    bytes[3] === 0x53
  ) {
    return { type: 'video', format: 'OGV', mimeType: 'video/ogg', ext: 'ogv' };
  }

  // 4. PNG: 0x89 0x50 0x4E 0x47
  if (
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47
  ) {
    return { type: 'image', format: 'PNG', mimeType: 'image/png', ext: 'png' };
  }

  // 5. JPEG: 0xFF 0xD8 0xFF
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return { type: 'image', format: 'JPG', mimeType: 'image/jpeg', ext: 'jpg' };
  }

  // 6. GIF: 'GIF8'
  if (
    bytes[0] === 0x47 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x38
  ) {
    return { type: 'image', format: 'GIF', mimeType: 'image/gif', ext: 'gif' };
  }

  // 7. WEBP: 'RIFF' .... 'WEBP'
  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return { type: 'image', format: 'WEBP', mimeType: 'image/webp', ext: 'webp' };
  }

  // Default fallback
  return { type: 'video', format: 'MP4', mimeType: 'video/mp4', ext: 'mp4' };
}

/**
 * Sniffs a Blob's first 128 bytes asynchronously
 */
export async function sniffBlobMediaInfo(blob: Blob): Promise<DetectedMediaInfo> {
  try {
    const slice = blob.slice(0, 128);
    const buf = await slice.arrayBuffer();
    const info = detectMediaContainer(new Uint8Array(buf));

    // If container detection returned generic fallback, check blob.type
    if (info.format === 'MP4' && blob.type) {
      if (blob.type.includes('webm')) {
        return { type: 'video', format: 'WEBM', mimeType: 'video/webm', ext: 'webm' };
      }
      if (blob.type.includes('matroska')) {
        return { type: 'video', format: 'MKV', mimeType: 'video/webm', ext: 'mkv' };
      }
      if (blob.type.includes('png')) {
        return { type: 'image', format: 'PNG', mimeType: 'image/png', ext: 'png' };
      }
      if (blob.type.includes('jpeg') || blob.type.includes('jpg')) {
        return { type: 'image', format: 'JPG', mimeType: 'image/jpeg', ext: 'jpg' };
      }
    }

    return info;
  } catch {
    return { type: 'video', format: 'MP4', mimeType: 'video/mp4', ext: 'mp4' };
  }
}
