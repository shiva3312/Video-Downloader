import { readFileSync } from 'fs';

export function detectMediaContainer(header) {
  if (!header || header.length < 4) {
    return { type: 'video', format: 'MP4', mimeType: 'video/mp4', ext: 'mp4' };
  }

  // 1. EBML: WebM / Matroska
  if (
    header[0] === 0x1a &&
    header[1] === 0x45 &&
    header[2] === 0xdf &&
    header[3] === 0xa3
  ) {
    const sliceLen = Math.min(header.length, 128);
    const text = String.fromCharCode(...header.slice(0, sliceLen));
    if (text.includes('webm')) {
      return { type: 'video', format: 'WEBM', mimeType: 'video/webm', ext: 'webm' };
    }
    return { type: 'video', format: 'MKV', mimeType: 'video/webm', ext: 'mkv' };
  }

  // 2. ISO Base Media File Format: MP4, MOV, fMP4
  if (header.length >= 8) {
    const boxType = String.fromCharCode(header[4], header[5], header[6], header[7]);
    if (boxType === 'ftyp' || boxType === 'styp' || boxType === 'moov' || boxType === 'mdat') {
      return { type: 'video', format: 'MP4', mimeType: 'video/mp4', ext: 'mp4' };
    }
  }

  // 3. Ogg: 'OggS'
  if (
    header[0] === 0x4f &&
    header[1] === 0x67 &&
    header[2] === 0x67 &&
    header[3] === 0x53
  ) {
    return { type: 'video', format: 'OGV', mimeType: 'video/ogg', ext: 'ogv' };
  }

  // 4. PNG: 89 50 4E 47
  if (
    header[0] === 0x89 &&
    header[1] === 0x50 &&
    header[2] === 0x4e &&
    header[3] === 0x47
  ) {
    return { type: 'image', format: 'PNG', mimeType: 'image/png', ext: 'png' };
  }

  // 5. JPEG: FF D8 FF
  if (header[0] === 0xff && header[1] === 0xd8 && header[2] === 0xff) {
    return { type: 'image', format: 'JPG', mimeType: 'image/jpeg', ext: 'jpg' };
  }

  // 6. GIF: 'GIF8'
  if (
    header[0] === 0x47 &&
    header[1] === 0x49 &&
    header[2] === 0x46 &&
    header[3] === 0x38
  ) {
    return { type: 'image', format: 'GIF', mimeType: 'image/gif', ext: 'gif' };
  }

  // 7. WEBP: 'RIFF' .... 'WEBP'
  if (
    header.length >= 12 &&
    header[0] === 0x52 &&
    header[1] === 0x49 &&
    header[2] === 0x46 &&
    header[3] === 0x46 &&
    header[8] === 0x57 &&
    header[9] === 0x45 &&
    header[10] === 0x42 &&
    header[11] === 0x50
  ) {
    return { type: 'image', format: 'WEBP', mimeType: 'image/webp', ext: 'webp' };
  }

  // Fallback default
  return { type: 'video', format: 'MP4', mimeType: 'video/mp4', ext: 'mp4' };
}

// Tests
const testMp4 = new Uint8Array([0x00, 0x00, 0x00, 0x20, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d]);
const testWebM = new Uint8Array([
  0x1a, 0x45, 0xdf, 0xa3, 0x9f, 0x42, 0x86, 0x81, 0x01, 0x42, 0xf7, 0x81,
  0x01, 0x42, 0xf2, 0x81, 0x04, 0x42, 0xf3, 0x81, 0x08, 0x42, 0x82, 0x84,
  0x77, 0x65, 0x62, 0x6d // 'webm'
]);
const testPng = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const testJpg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0]);

console.log('MP4 detected:', detectMediaContainer(testMp4));
console.log('WebM detected:', detectMediaContainer(testWebM));
console.log('PNG detected:', detectMediaContainer(testPng));
console.log('JPG detected:', detectMediaContainer(testJpg));
