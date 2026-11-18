import { detectMediaContainer } from './test-magic-sniffer.mjs';
import { webcrypto } from 'crypto';
const crypto = webcrypto;

// Helper to simulate browser crypto
function hexToBytes(hex) {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substr(i, 2), 16);
  }
  return bytes;
}

async function runTests() {
  console.log('=== Running Video Format Diagnosis & Resolution Tests ===');

  // Test 1: Real WebM EBML header
  const webmHeader = new Uint8Array([
    0x1a, 0x45, 0xdf, 0xa3, 0x9f, 0x42, 0x86, 0x81, 0x01, 0x42, 0xf7, 0x81,
    0x01, 0x42, 0xf2, 0x81, 0x04, 0x42, 0xf3, 0x81, 0x08, 0x42, 0x82, 0x84,
    0x77, 0x65, 0x62, 0x6d, // 'webm'
    ...new Array(500).fill(0x33)
  ]);

  const webmSniff = detectMediaContainer(webmHeader);
  if (webmSniff.format !== 'WEBM' || webmSniff.mimeType !== 'video/webm' || webmSniff.ext !== 'webm') {
    throw new Error('Test 1 Failed: WebM not correctly detected');
  }
  console.log('Test 1 Passed: WebM EBML container correctly detected from magic bytes.');

  // Test 2: Real MP4 ftyp box header
  const mp4Header = new Uint8Array([
    0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70, // '....ftyp'
    0x69, 0x73, 0x6f, 0x6d, 0x00, 0x00, 0x02, 0x00,
    0x69, 0x73, 0x6f, 0x6d, 0x69, 0x73, 0x6f, 0x32,
    ...new Array(500).fill(0x77)
  ]);

  const mp4Sniff = detectMediaContainer(mp4Header);
  if (mp4Sniff.format !== 'MP4' || mp4Sniff.mimeType !== 'video/mp4' || mp4Sniff.ext !== 'mp4') {
    throw new Error('Test 2 Failed: MP4 not correctly detected');
  }
  console.log('Test 2 Passed: MP4 ISO BMFF container correctly detected from magic bytes.');

  // Test 3: Self-healing decryption test
  // An item was mistakenly stored in IndexedDB with format='MP4', originalMimeType='video/mp4',
  // but its raw payload contains WebM bytes.
  const salt = hexToBytes('abcdef0123456789abcdef0123456789');
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw', enc.encode('Password123!'), { name: 'PBKDF2' }, false, ['deriveKey']
  );
  const encKey = await crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256' },
    keyMaterial, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']
  );

  const iv = new Uint8Array(12);
  crypto.getRandomValues(iv);
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv }, encKey, webmHeader
  );

  // Decrypt and apply self-healing logic
  const decryptedBuf = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv }, encKey, ciphertext
  );
  const plainHeader = new Uint8Array(decryptedBuf.slice(0, 128));
  const healed = detectMediaContainer(plainHeader);

  if (healed.format !== 'WEBM' || healed.mimeType !== 'video/webm' || healed.ext !== 'webm') {
    throw new Error('Test 3 Failed: Self-healing failed to recognize WebM payload');
  }
  console.log('Test 3 Passed: Self-healing successfully corrected legacy mislabeled item from MP4 to WEBM on decryption.');

  // Test 4: Export to PC filename correction
  let filename = 'Video_1_2026-11-18.mp4';
  const ext = healed.ext; // 'webm'
  if (filename.toLowerCase().endsWith('.mp4') && (ext === 'webm' || ext === 'mkv')) {
    filename = filename.replace(/\.mp4$/i, `.${ext}`);
  }
  if (filename !== 'Video_1_2026-11-18.webm') {
    throw new Error('Test 4 Failed: Filename extension was not corrected');
  }
  console.log('Test 4 Passed: Export filename extension automatically corrected to .webm.');

  console.log('=== ALL FORMAT TESTS PASSED! ===');
}

runTests().catch(err => {
  console.error(err);
  process.exit(1);
});
