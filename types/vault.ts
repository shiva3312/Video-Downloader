export type VaultMediaType = 'video' | 'image' | 'chat_screenshot' | 'text';

export type VaultSortOption = 'newest' | 'oldest' | 'size_desc' | 'name_asc';

export interface VaultItem {
  id: string;                       // Unique Item ID (UUIDv4)
  userId: string;                   // Owner User ID (strict multi-user isolation)
  type: VaultMediaType;             // 'video' | 'image' | 'chat_screenshot' | 'text'
  title: string;                    // Friendly display title / filename
  sourceUrl: string;                // Origin page / asset URL
  format: string;                   // 'MP4', 'WEBM', 'PNG', 'JPG', 'TXT', 'CHAT', etc.
  sizeBytes: number;                // Total file/blob size in bytes
  createdAt: number;                // Timestamp (epoch ms)

  // Stored Data (Private In-App Sandbox IndexedDB)
  blobData?: Blob;                  // Binary payload stored in IndexedDB (decrypted in memory)
  thumbnail?: string;               // Base64 thumbnail for fast list previews (decrypted in memory)

  // Encryption at Rest Metadata (Per-User AES-256-GCM)
  isEncrypted?: boolean;            // True if encrypted on disk
  iv?: string;                      // 12-byte initialization vector in hex
  originalMimeType?: string;        // MIME type before encryption (e.g. video/mp4, image/png, text/plain)
  encryptedThumb?: string;          // Ciphertext of thumbnail
  encryptedMeta?: string;           // Ciphertext of sensitive metadata / chat transcripts

  // Media Specific Metadata
  videoMeta?: {
    duration?: number;              // Seconds
    resolution?: string;            // '1080p', '720p', etc.
    dimensions?: { width: number; height: number };
  };
  imageMeta?: {
    dimensions?: { width: number; height: number };
  };
  chatMeta?: {
    participants: string[];         // e.g. ["Alice", "Bob"] or Telegram channel name
    messageCount: number;           // Number of captured messages
    formattedTranscript?: string;   // Clean readable text/markdown transcript
    sourceApp?: 'telegram' | 'whatsapp' | 'snapchat' | 'generic';
  };
  textMeta?: {
    wordCount?: number;
    charCount?: number;
    previewSnippet?: string;
  };
}

export interface VaultFilterOptions {
  query?: string;
  sort?: VaultSortOption;
  type?: VaultMediaType;
}
