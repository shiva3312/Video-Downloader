/**
 * Cryptographic utility functions using the native Web Crypto API.
 * Compatible with MV3 Service Workers, Extension Popups, and Side Panels.
 */

export function generateUUID(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export function generateSaltHex(byteLength = 16): string {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  return bytesToHex(bytes);
}

export function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export function hexToBytes(hex: string): Uint8Array {
  const cleanHex = hex.trim();
  const bytes = new Uint8Array(cleanHex.length / 2);
  for (let i = 0; i < cleanHex.length; i += 2) {
    bytes[i / 2] = parseInt(cleanHex.substr(i, 2), 16);
  }
  return bytes;
}

/**
 * PBKDF2 Password Hashing with HMAC-SHA-256 and 100,000 iterations.
 */
export async function hashPassword(password: string, saltHex: string): Promise<string> {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    enc.encode(password),
    { name: 'PBKDF2' },
    false,
    ['deriveBits']
  );

  const saltBytes = hexToBytes(saltHex);
  const derivedBits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: saltBytes as unknown as BufferSource,
      iterations: 100000,
      hash: 'SHA-256',
    },
    keyMaterial,
    256
  );

  return bytesToHex(new Uint8Array(derivedBits));
}

/**
 * Constant-time comparison of two hex hashes to prevent timing attacks.
 */
export async function verifyPassword(
  attempt: string,
  saltHex: string,
  expectedHashHex: string
): Promise<boolean> {
  const computedHashHex = await hashPassword(attempt, saltHex);
  if (computedHashHex.length !== expectedHashHex.length) {
    return false;
  }
  let diff = 0;
  for (let i = 0; i < computedHashHex.length; i++) {
    diff |= computedHashHex.charCodeAt(i) ^ expectedHashHex.charCodeAt(i);
  }
  return diff === 0;
}

/**
 * Computes HMAC-SHA-256 signature for license keys.
 */
export async function computeHmacSha256(message: string, secret: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signature = await crypto.subtle.sign('HMAC', key, enc.encode(message));
  return bytesToHex(new Uint8Array(signature));
}

// ========================================================
// Per-User AES-256-GCM Client-Side Encryption at Rest
// ========================================================

/**
 * Derives a 256-bit AES-GCM CryptoKey from the user's master password and salt using PBKDF2.
 */
export async function deriveUserEncryptionKey(
  password: string,
  saltHex: string
): Promise<CryptoKey> {
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
      salt: saltBytes as unknown as BufferSource,
      iterations: 100000,
      hash: 'SHA-256',
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    true, // extractable so raw key can be kept in active session memory
    ['encrypt', 'decrypt']
  );
}

/**
 * Exports a CryptoKey to a 64-character raw hex string for session storage.
 */
export async function exportKeyToHex(key: CryptoKey): Promise<string> {
  const raw = await crypto.subtle.exportKey('raw', key);
  return bytesToHex(new Uint8Array(raw));
}

/**
 * Imports a 256-bit AES-GCM CryptoKey from a raw hex string.
 */
export async function importKeyFromHex(hex: string): Promise<CryptoKey> {
  const bytes = hexToBytes(hex);
  return crypto.subtle.importKey(
    'raw',
    bytes as unknown as BufferSource,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

/**
 * Encrypts an ArrayBuffer or Uint8Array using AES-256-GCM.
 * Generates a fresh, cryptographically secure 96-bit (12-byte) IV for each operation.
 */
export async function encryptBytes(
  plainData: ArrayBuffer | Uint8Array,
  key: CryptoKey
): Promise<{ ciphertext: ArrayBuffer; ivHex: string }> {
  const iv = new Uint8Array(12);
  crypto.getRandomValues(iv);

  const ciphertext = await crypto.subtle.encrypt(
    {
      name: 'AES-GCM',
      iv: iv as unknown as BufferSource,
    },
    key,
    plainData as unknown as BufferSource
  );

  return {
    ciphertext,
    ivHex: bytesToHex(iv),
  };
}

/**
 * Decrypts ciphertext ArrayBuffer or Uint8Array using AES-256-GCM and its unique IV.
 * Throws an error if the key is invalid or ciphertext was altered (tamper-evident).
 */
export async function decryptBytes(
  ciphertext: ArrayBuffer | Uint8Array,
  ivHex: string,
  key: CryptoKey
): Promise<ArrayBuffer> {
  const iv = hexToBytes(ivHex);
  return crypto.subtle.decrypt(
    {
      name: 'AES-GCM',
      iv: iv as unknown as BufferSource,
    },
    key,
    ciphertext as unknown as BufferSource
  );
}

/**
 * Encrypts a UTF-8 string to a Base64 ciphertext string with an IV.
 */
export async function encryptString(
  text: string,
  key: CryptoKey
): Promise<{ ciphertextBase64: string; ivHex: string }> {
  const enc = new TextEncoder();
  const { ciphertext, ivHex } = await encryptBytes(enc.encode(text), key);
  const bytes = new Uint8Array(ciphertext);
  let binary = '';
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  const ciphertextBase64 = btoa(binary);
  return { ciphertextBase64, ivHex };
}

/**
 * Decrypts a Base64 ciphertext string back to UTF-8 plaintext.
 */
export async function decryptString(
  ciphertextBase64: string,
  ivHex: string,
  key: CryptoKey
): Promise<string> {
  const binary = atob(ciphertextBase64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  const decryptedBuf = await decryptBytes(bytes, ivHex, key);
  const dec = new TextDecoder();
  return dec.decode(decryptedBuf);
}

