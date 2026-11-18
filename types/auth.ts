export interface UserRecord {
  id: string;              // Unique identifier (UUIDv4)
  username: string;        // Display and lookup name (case-insensitive lookup)
  salt: string;            // Hex-encoded 16-byte cryptographic salt
  passwordHash: string;    // PBKDF2 derived hash string
  createdAt: number;       // Epoch milliseconds
  lastLoginAt: number;     // Epoch milliseconds
  isPro: boolean;          // Whether this user has unlocked Pro features
  licenseKey?: string;     // User-specific or shared pro key if activated
  licenseExpiresAt?: number;// Expiration timestamp of the user's pro key
}

export interface ActiveSession {
  userId: string;
  username: string;
  isAuthenticated: boolean;
  unlockedAt: number;
  isPro: boolean;
  licenseExpiresAt?: number;
  encryptionKeyHex?: string;  // 32-byte (256-bit) AES-GCM user key in hex, active in session memory
}

export interface AuthResult {
  success: boolean;
  error?: string;
  user?: UserRecord;
  session?: ActiveSession;
}
