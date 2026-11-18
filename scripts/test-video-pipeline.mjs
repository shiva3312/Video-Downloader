import { webcrypto } from 'crypto';
const crypto = webcrypto;

// Helper to simulate browser's btoa / atob / FileReader
function bytesToHex(bytes) {
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}
function hexToBytes(hex) {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substr(i, 2), 16);
  }
  return bytes;
}

// 1. Generate a valid minimal MP4 header (ftyp box)
// 00 00 00 18 (box size = 24)
// 66 74 79 70 ('ftyp')
// 6d 70 34 32 ('mp42' major brand)
// 00 00 00 00 (minor version)
// 69 73 6f 6d ('isom' compatible brand)
// 6d 70 34 32 ('mp42' compatible brand)
const mp4Header = new Uint8Array([
  0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70,
  0x6d, 0x70, 0x34, 0x32, 0x00, 0x00, 0x00, 0x00,
  0x69, 0x73, 0x6f, 0x6d, 0x6d, 0x70, 0x34, 0x32,
  // Add 1024 bytes of dummy payload
  ...new Array(1024).fill(0x55)
]);

console.log('Original MP4 size:', mp4Header.length, 'bytes');

// Simulate sendMediaBlobToVault -> blobToDataUrl
const blob = new Blob([mp4Header], { type: 'video/mp4' });
const buf = await blob.arrayBuffer();
const base64 = Buffer.from(buf).toString('base64');
const dataUrl = `data:video/mp4;base64,${base64}`;

// Simulate background.ts receiving VAULT_SAVE_ITEM
// const res = await fetch(dataUrl);
// const rawBlob = await res.blob();
const backBuf = Buffer.from(dataUrl.split(',')[1], 'base64');
const receivedBlob = new Blob([backBuf], { type: 'video/mp4' });

// Simulate vaultStorage.saveItem encryption
const salt = hexToBytes('abcdef0123456789abcdef0123456789');
const enc = new TextEncoder();
const keyMaterial = await crypto.subtle.importKey(
  'raw', enc.encode('TestPass123!'), { name: 'PBKDF2' }, false, ['deriveKey']
);
const encKey = await crypto.subtle.deriveKey(
  { name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256' },
  keyMaterial, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']
);

const plainBuf = await receivedBlob.arrayBuffer();
const iv = new Uint8Array(12);
crypto.getRandomValues(iv);
const ciphertext = await crypto.subtle.encrypt(
  { name: 'AES-GCM', iv }, encKey, plainBuf
);

// Simulate IndexedDB storage
const storedBlob = new Blob([ciphertext], { type: 'application/octet-stream' });

// Simulate decryptItem
const storedBuf = await storedBlob.arrayBuffer();
const decryptedBuf = await crypto.subtle.decrypt(
  { name: 'AES-GCM', iv }, encKey, storedBuf
);

const decryptedBytes = new Uint8Array(decryptedBuf);
console.log('Decrypted size:', decryptedBytes.length, 'bytes');

// Check byte-for-byte match
let match = decryptedBytes.length === mp4Header.length;
for (let i = 0; i < mp4Header.length; i++) {
  if (decryptedBytes[i] !== mp4Header[i]) {
    match = false;
    break;
  }
}
console.log('Byte-for-byte match with original:', match);
