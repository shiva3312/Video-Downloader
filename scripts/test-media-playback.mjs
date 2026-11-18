import { webcrypto } from 'crypto';
const crypto = webcrypto;

function bytesToHex(bytes) {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function hexToBytes(hex) {
  const cleanHex = hex.trim();
  const bytes = new Uint8Array(cleanHex.length / 2);
  for (let i = 0; i < cleanHex.length; i += 2) {
    bytes[i / 2] = parseInt(cleanHex.substr(i, 2), 16);
  }
  return bytes;
}

function generateSaltHex(byteLength = 16) {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  return bytesToHex(bytes);
}

async function deriveUserEncryptionKey(password, saltHex) {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    enc.encode(password),
    { name: 'PBKDF2' },
    false,
    ['deriveKey', 'deriveBits']
  );

  const saltBytes = hexToBytes(saltHex);
  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: saltBytes,
      iterations: 100000,
      hash: 'SHA-256',
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    true,
    ['encrypt', 'decrypt']
  );
}

async function encryptBytes(plainData, key) {
  const iv = new Uint8Array(12);
  crypto.getRandomValues(iv);

  const ciphertext = await crypto.subtle.encrypt(
    {
      name: 'AES-GCM',
      iv,
    },
    key,
    plainData
  );

  return {
    ciphertext,
    ivHex: bytesToHex(iv),
  };
}

async function decryptBytes(ciphertext, ivHex, key) {
  const iv = hexToBytes(ivHex);
  return crypto.subtle.decrypt(
    {
      name: 'AES-GCM',
      iv,
    },
    key,
    ciphertext
  );
}

function getCorrectMimeType(type, format, originalMime) {
  if (originalMime && originalMime !== 'application/octet-stream' && originalMime.includes('/')) {
    return originalMime;
  }
  const fmt = (format || '').toUpperCase();
  if (type === 'video') {
    if (fmt === 'WEBM' || fmt === 'MKV') return 'video/webm';
    if (fmt === 'OGG' || fmt === 'OGV') return 'video/ogg';
    return 'video/mp4';
  }
  if (type === 'image' || type === 'chat_screenshot') {
    if (fmt === 'PNG') return 'image/png';
    if (fmt === 'WEBP') return 'image/webp';
    if (fmt === 'GIF') return 'image/gif';
    if (fmt === 'SVG') return 'image/svg+xml';
    return 'image/jpeg';
  }
  if (type === 'text') {
    return 'text/plain;charset=utf-8';
  }
  return 'application/octet-stream';
}

async function runMediaPlaybackTests() {
  console.log('=== Running Media Playback & Decryption Verification Tests ===');

  const salt = generateSaltHex(16);
  const key = await deriveUserEncryptionKey('Password123!', salt);

  // 1. Test Video Blob (Simulating MP4 binary header)
  const fakeVideoBytes = new Uint8Array([
    0x00, 0x00, 0x00, 0x20, 0x66, 0x74, 0x79, 0x70, // '....ftyp'
    0x69, 0x73, 0x6f, 0x6d, 0x00, 0x00, 0x02, 0x00, // 'isom....'
    0x6d, 0x70, 0x34, 0x31, 0x6d, 0x70, 0x34, 0x32, // 'mp41mp42'
    0x69, 0x73, 0x6f, 0x6d, 0x00, 0x00, 0x00, 0x08,
  ]);

  const { ciphertext: videoCipher, ivHex: videoIv } = await encryptBytes(fakeVideoBytes.buffer, key);
  console.log('1. Encrypted video payload length:', videoCipher.byteLength, 'bytes');

  // Decrypt and assign MIME
  const plainVideoBuf = await decryptBytes(videoCipher, videoIv, key);
  const videoMime = getCorrectMimeType('video', 'MP4', 'application/octet-stream');
  const decryptedVideoBlob = new Blob([plainVideoBuf], { type: videoMime });

  console.log('2. Decrypted Video MIME type:', decryptedVideoBlob.type);
  console.log('3. Decrypted Video size:', decryptedVideoBlob.size, 'bytes');
  if (decryptedVideoBlob.type !== 'video/mp4') {
    throw new Error('Video MIME type was not video/mp4!');
  }
  if (decryptedVideoBlob.size !== fakeVideoBytes.length) {
    throw new Error('Video byte length mismatch!');
  }

  // 2. Test Image Blob (Simulating JPEG binary header 0xFF, 0xD8, 0xFF, 0xE0)
  const fakeImageBytes = new Uint8Array([
    0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01,
  ]);
  const { ciphertext: imageCipher, ivHex: imageIv } = await encryptBytes(fakeImageBytes.buffer, key);
  const plainImageBuf = await decryptBytes(imageCipher, imageIv, key);
  const imageMime = getCorrectMimeType('image', 'JPG', '');
  const decryptedImageBlob = new Blob([plainImageBuf], { type: imageMime });

  console.log('4. Decrypted Image MIME type:', decryptedImageBlob.type);
  console.log('5. Decrypted Image size:', decryptedImageBlob.size, 'bytes');
  if (decryptedImageBlob.type !== 'image/jpeg') {
    throw new Error('Image MIME type was not image/jpeg!');
  }

  // 3. Test MKV / WEBM video MIME normalization
  const mkvMime = getCorrectMimeType('video', 'MKV', 'application/octet-stream');
  console.log('6. MKV MIME normalized for HTML5 video player:', mkvMime);
  if (mkvMime !== 'video/webm') {
    throw new Error('MKV was not normalized to video/webm for browser playback!');
  }

  // 4. Test PNG screenshot MIME
  const pngMime = getCorrectMimeType('chat_screenshot', 'PNG', '');
  console.log('7. Chat Screenshot PNG MIME:', pngMime);
  if (pngMime !== 'image/png') {
    throw new Error('PNG screenshot MIME was not image/png!');
  }

  console.log('=== ALL MEDIA PLAYBACK & MIME TESTS PASSED SUCCESSFULLY! ===');
}

runMediaPlaybackTests().catch((err) => {
  console.error('Test failed:', err);
  process.exit(1);
});
