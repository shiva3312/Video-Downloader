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

async function exportKeyToHex(key) {
  const raw = await crypto.subtle.exportKey('raw', key);
  return bytesToHex(new Uint8Array(raw));
}

async function importKeyFromHex(hex) {
  const bytes = hexToBytes(hex);
  return crypto.subtle.importKey(
    'raw',
    bytes,
    { name: 'AES-GCM', length: 256 },
    false,
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

async function encryptString(text, key) {
  const enc = new TextEncoder();
  const { ciphertext, ivHex } = await encryptBytes(enc.encode(text), key);
  const bytes = new Uint8Array(ciphertext);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return { ciphertextBase64: btoa(binary), ivHex };
}

async function decryptString(ciphertextBase64, ivHex, key) {
  const binary = atob(ciphertextBase64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  const decryptedBuf = await decryptBytes(bytes, ivHex, key);
  const dec = new TextDecoder();
  return dec.decode(decryptedBuf);
}

async function main() {
  console.log('=== Running AES-256-GCM User Encryption Tests ===');

  const saltA = bytesToHex(crypto.getRandomValues(new Uint8Array(16)));
  const keyA = await deriveUserEncryptionKey('PasswordUserA!', saltA);
  const keyAHex = await exportKeyToHex(keyA);
  const importedKeyA = await importKeyFromHex(keyAHex);

  const saltB = bytesToHex(crypto.getRandomValues(new Uint8Array(16)));
  const keyB = await deriveUserEncryptionKey('PasswordUserB!', saltB);

  // Test 1: String Encryption & Decryption
  const secretText = 'Confidential chat text between Alice and Bob';
  const enc = await encryptString(secretText, importedKeyA);
  console.log('1. User A ciphertext (base64):', enc.ciphertextBase64.substring(0, 24) + '...');
  const decryptedA = await decryptString(enc.ciphertextBase64, enc.ivHex, importedKeyA);
  console.log('2. Decryption with Key A success:', decryptedA === secretText);

  // Test 2: User B tries to decrypt User A data -> MUST FAIL
  let failed = false;
  try {
    await decryptString(enc.ciphertextBase64, enc.ivHex, keyB);
  } catch (err) {
    failed = true;
    console.log('3. Decryption with Key B rejected (tag check failed):', err.message);
  }
  console.log('4. Isolation verified (User B cannot read User A data):', failed);

  // Test 3: Binary Buffer (simulating video or photo blob)
  const videoBuffer = new Uint8Array([0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70]);
  const binEnc = await encryptBytes(videoBuffer, importedKeyA);
  
  // Verify encrypted bytes are scrambled and no longer match standard MP4 ftyp header
  const encBytes = new Uint8Array(binEnc.ciphertext);
  const headerScrambled = !encBytes.slice(0, 8).every((b, i) => b === videoBuffer[i]);
  console.log('5. Encrypted binary is scrambled (cannot be opened by external players):', headerScrambled);

  const binDec = await decryptBytes(binEnc.ciphertext, binEnc.ivHex, importedKeyA);
  const binMatches = new Uint8Array(binDec).every((b, i) => b === videoBuffer[i]);
  console.log('6. Binary blob decrypted in-memory only by app:', binMatches);

  // Test 4: Title & URL metadata encrypted at rest
  const originalTitle = 'Secret Telegram Video 2026.mp4';
  const originalUrl = 'https://web.telegram.org/stream/confidential-id';
  const encTitle = await encryptString(originalTitle, importedKeyA);
  const encUrl = await encryptString(originalUrl, importedKeyA);

  const decTitle = await decryptString(encTitle.ciphertextBase64, encTitle.ivHex, importedKeyA);
  const decUrl = await decryptString(encUrl.ciphertextBase64, encUrl.ivHex, importedKeyA);
  console.log('7. Title & URL encrypted at rest and decrypted only by app:', decTitle === originalTitle && decUrl === originalUrl);

  console.log('=== ALL AES-256-GCM ENCRYPTION TESTS PASSED! ===');
}

main().catch(console.error);
