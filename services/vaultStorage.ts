import { VaultItem, VaultFilterOptions, VaultMediaType } from '@/types/vault';
import { detectMediaContainer } from '@/utils/mediaDetector';
import {
  generateUUID,
  encryptBytes,
  decryptBytes,
  encryptString,
  decryptString,
  importKeyFromHex,
} from './cryptoUtils';

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error || new Error('FileReader failed'));
    reader.readAsDataURL(blob);
  });
}

/**
 * Snapchat for Web only supports PNG, JPEG/JPG, and GIF images in chat.
 * Converts WebP, SVG, AVIF, or other image formats into standard PNG.
 */
async function ensureSnapchatCompatibleImage(blob: Blob): Promise<{ blob: Blob; mimeType: string; ext: string }> {
  if (
    blob.type === 'image/png' ||
    blob.type === 'image/jpeg' ||
    blob.type === 'image/jpg' ||
    blob.type === 'image/gif'
  ) {
    const ext = blob.type === 'image/png' ? 'png' : blob.type === 'image/gif' ? 'gif' : 'jpg';
    return { blob, mimeType: blob.type, ext };
  }

  try {
    if (typeof createImageBitmap === 'function') {
      const bitmap = await createImageBitmap(blob);
      const canvas = document.createElement('canvas');
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(bitmap, 0, 0);
        const pngBlob = await new Promise<Blob | null>((res) => canvas.toBlob(res, 'image/png'));
        if (pngBlob) {
          return { blob: pngBlob, mimeType: 'image/png', ext: 'png' };
        }
      }
    }
  } catch (e) {
    console.warn('[VaultStorage] Failed to convert image to PNG for Snapchat:', e);
  }

  return { blob, mimeType: 'image/png', ext: 'png' };
}

const DB_NAME = 'AppMediaVaultDB';
const DB_VERSION = 2;
const STORE_ITEMS = 'vault_items';
const STORE_USERS = 'users';
const STORE_META = 'app_meta';
const META_SESSION_KEY = 'active_user_session';

/**
 * Returns a guaranteed valid media MIME type for HTML5 video/image playback.
 */
export function getCorrectMimeType(type?: string, format?: string, originalMime?: string): string {
  // If originalMime is a valid media type (not octet-stream/generic), honor it
  if (
    originalMime &&
    (originalMime.startsWith('video/') || originalMime.startsWith('image/')) &&
    !originalMime.includes('octet-stream')
  ) {
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
  return type === 'video' ? 'video/mp4' : type === 'image' ? 'image/jpeg' : 'application/octet-stream';
}

class VaultStorage {
  private dbPromise: Promise<IDBDatabase> | null = null;

  private getDB(): Promise<IDBDatabase> {
    if (!this.dbPromise) {
      this.dbPromise = new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          this.dbPromise = null;
          reject(new Error('IndexedDB connection timed out after 2500ms'));
        }, 2500);

        try {
          const req = indexedDB.open(DB_NAME, DB_VERSION);

          req.onupgradeneeded = () => {
            const db = req.result;

            // 1. Vault Items store
            if (!db.objectStoreNames.contains(STORE_ITEMS)) {
              const itemStore = db.createObjectStore(STORE_ITEMS, { keyPath: 'id' });
              itemStore.createIndex('userId', 'userId', { unique: false });
              itemStore.createIndex('type', 'type', { unique: false });
              itemStore.createIndex('userId_type', ['userId', 'type'], { unique: false });
              itemStore.createIndex('createdAt', 'createdAt', { unique: false });
            }

            // 2. Users store
            if (!db.objectStoreNames.contains(STORE_USERS)) {
              const userStore = db.createObjectStore(STORE_USERS, { keyPath: 'id' });
              userStore.createIndex('username', 'username', { unique: true });
            }

            // 3. Meta / configuration store
            if (!db.objectStoreNames.contains(STORE_META)) {
              db.createObjectStore(STORE_META, { keyPath: 'key' });
            }
          };

          req.onblocked = () => {
            console.warn('[VaultStorage] IndexedDB upgrade blocked by open connection.');
          };

          req.onsuccess = () => {
            clearTimeout(timeout);
            const db = req.result;
            db.onversionchange = () => {
              db.close();
              this.dbPromise = null;
            };
            resolve(db);
          };

          req.onerror = () => {
            clearTimeout(timeout);
            this.dbPromise = null;
            reject(req.error || new Error('IndexedDB open error'));
          };
        } catch (err) {
          clearTimeout(timeout);
          this.dbPromise = null;
          reject(err);
        }
      });
    }
    return this.dbPromise;
  }

  // ==========================================
  // Vault Items Operations & AES-256 Encryption
  // ==========================================

  private async getActiveEncryptionKey(): Promise<CryptoKey | null> {
    const session = await this.getMeta<any>(META_SESSION_KEY);
    if (!session?.encryptionKeyHex) return null;
    try {
      return await importKeyFromHex(session.encryptionKeyHex);
    } catch {
      return null;
    }
  }

  /**
   * Saves a media item into IndexedDB.
   * If an active authenticated session exists, encrypts the binary payload (blobData),
   * thumbnail, and sensitive chat/text transcripts using AES-256-GCM with the user's key.
   */
  public async saveItem(
    itemInput: Omit<VaultItem, 'id' | 'createdAt'> & { id?: string; createdAt?: number }
  ): Promise<VaultItem> {
    const db = await this.getDB();
    const id = itemInput.id || generateUUID();
    const createdAt = itemInput.createdAt || Date.now();

    const storedItem: any = {
      ...itemInput,
      id,
      createdAt,
    };

    // Encrypt with user's AES-256-GCM key derived from password
    const encKey = await this.getActiveEncryptionKey();
    if (!encKey) {
      throw new Error(
        'ENCRYPTION_REQUIRED: Active user encryption key not available. Please unlock your profile to securely encrypt files.'
      );
    }

    storedItem.isEncrypted = true;

    // 1. Encrypt binary payload (blobData) with AES-256-GCM
    if (itemInput.blobData) {
      let arrayBuf: ArrayBuffer;
      if (typeof itemInput.blobData.arrayBuffer === 'function') {
        arrayBuf = await itemInput.blobData.arrayBuffer();
      } else if (itemInput.blobData instanceof ArrayBuffer) {
        arrayBuf = itemInput.blobData;
      } else if ((itemInput.blobData as any).buffer instanceof ArrayBuffer) {
        arrayBuf = (itemInput.blobData as any).buffer;
      } else {
        arrayBuf = new ArrayBuffer(0);
      }

      if (arrayBuf.byteLength > 0) {
        // Sniff binary magic bytes to guarantee accurate format and container
        let sniffedFormat = itemInput.format;
        let sniffedMime = itemInput.blobData.type;

        try {
          const headerBytes = new Uint8Array(arrayBuf.slice(0, 128));
          const sniffed = detectMediaContainer(headerBytes);
          if (itemInput.type === 'video' || sniffed.type === 'video') {
            sniffedFormat = sniffed.format;
            sniffedMime = sniffed.mimeType;
          } else if (itemInput.type === 'image' || itemInput.type === 'chat_screenshot' || sniffed.type === 'image') {
            sniffedFormat = sniffed.format;
            sniffedMime = sniffed.mimeType;
          }
        } catch {}

        sniffedMime = getCorrectMimeType(itemInput.type, sniffedFormat, sniffedMime);
        storedItem.format = sniffedFormat;
        storedItem.originalMimeType = sniffedMime;

        const { ciphertext, ivHex } = await encryptBytes(arrayBuf, encKey);
        storedItem.iv = ivHex;
        // Ciphertext stored as octet-stream so no external player can read or parse it
        storedItem.blobData = new Blob([ciphertext], { type: 'application/octet-stream' });
      }
    }

    // 2. Encrypt thumbnail string
    if (itemInput.thumbnail) {
      const { ciphertextBase64, ivHex: tIv } = await encryptString(itemInput.thumbnail, encKey);
      storedItem.encryptedThumb = `${tIv}:${ciphertextBase64}`;
      delete storedItem.thumbnail;
    }

    // 3. Encrypt sensitive chat/text metadata & transcripts
    if (itemInput.chatMeta || itemInput.textMeta) {
      const metaPayload = JSON.stringify({
        chatMeta: itemInput.chatMeta,
        textMeta: itemInput.textMeta,
      });
      const { ciphertextBase64, ivHex: mIv } = await encryptString(metaPayload, encKey);
      storedItem.encryptedMeta = `${mIv}:${ciphertextBase64}`;
      delete storedItem.chatMeta;
      delete storedItem.textMeta;
    }

    // 4. Encrypt title at rest
    if (itemInput.title) {
      const { ciphertextBase64, ivHex: titleIv } = await encryptString(itemInput.title, encKey);
      storedItem.encryptedTitle = `${titleIv}:${ciphertextBase64}`;
      storedItem.title = '🔒 Encrypted Media'; // Shielded placeholder at rest
    }

    // 5. Encrypt source URL at rest
    if (itemInput.sourceUrl) {
      const { ciphertextBase64, ivHex: urlIv } = await encryptString(itemInput.sourceUrl, encKey);
      storedItem.encryptedSourceUrl = `${urlIv}:${ciphertextBase64}`;
      storedItem.sourceUrl = ''; // Stripped at rest
    }

    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_ITEMS, 'readwrite');
      const store = tx.objectStore(STORE_ITEMS);
      const req = store.put(storedItem);

      req.onsuccess = () => {
        const resultItem = {
          ...itemInput,
          id,
          createdAt,
        };

        // Broadcast to notify sidepanel, popup, and any open views to update list and redirect to tab
        try {
          if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
            chrome.runtime
              .sendMessage({
                type: 'VAULT_ITEM_SAVED',
                payload: {
                  id,
                  type: itemInput.type,
                  title: itemInput.title,
                  userId: itemInput.userId,
                },
              })
              .catch(() => {});
          }
        } catch {}

        resolve(resultItem);
      };
      req.onerror = () => reject(req.error);
    });
  }

  /**
   * Decrypts an encrypted vault item using the user's active AES-256-GCM key.
   * If key is invalid or data belongs to another user, rejects/shields ciphertext.
   */
  private async decryptItem(rawItem: any, encKey: CryptoKey | null): Promise<VaultItem> {
    if (!rawItem.isEncrypted) {
      if (rawItem.blobData) {
        const mimeType = getCorrectMimeType(
          rawItem.type,
          rawItem.format,
          rawItem.originalMimeType || rawItem.blobData.type
        );
        if (rawItem.blobData.type !== mimeType) {
          return {
            ...rawItem,
            blobData: new Blob([rawItem.blobData], { type: mimeType }),
          };
        }
      }
      return rawItem as VaultItem;
    }

    if (!encKey) {
      // Return shielded placeholder when key is unavailable
      return {
        ...rawItem,
        title: '🔒 Encrypted item (Locked)',
        sourceUrl: '',
        blobData: undefined,
        thumbnail: undefined,
        chatMeta: undefined,
        textMeta: undefined,
      };
    }

    try {
      const decrypted: VaultItem = { ...rawItem };

      // 1. Decrypt binary blobData
      if (rawItem.blobData && rawItem.iv) {
        let encBuffer: ArrayBuffer;
        if (rawItem.blobData instanceof ArrayBuffer) {
          encBuffer = rawItem.blobData;
        } else if (rawItem.blobData?.buffer instanceof ArrayBuffer) {
          encBuffer = rawItem.blobData.buffer;
        } else if (typeof rawItem.blobData.arrayBuffer === 'function') {
          encBuffer = await rawItem.blobData.arrayBuffer();
        } else {
          encBuffer = new ArrayBuffer(0);
        }

        if (encBuffer.byteLength > 0) {
          const plainBuffer = await decryptBytes(encBuffer, rawItem.iv, encKey);

          // Sniff magic bytes of decrypted bytes: provides self-healing for any previously mislabeled items!
          let finalMime = getCorrectMimeType(rawItem.type, rawItem.format, rawItem.originalMimeType);
          let finalFormat = rawItem.format;

          try {
            const headerBytes = new Uint8Array(plainBuffer.slice(0, 128));
            const sniffed = detectMediaContainer(headerBytes);
            if (rawItem.type === 'video' || sniffed.type === 'video') {
              finalFormat = sniffed.format;
              finalMime = sniffed.mimeType;
            } else if (rawItem.type === 'image' || rawItem.type === 'chat_screenshot' || sniffed.type === 'image') {
              finalFormat = sniffed.format;
              finalMime = sniffed.mimeType;
            }
          } catch {}

          decrypted.format = finalFormat;
          decrypted.blobData = new Blob([plainBuffer], { type: finalMime });
        }
      }

      // 2. Decrypt thumbnail
      if (rawItem.encryptedThumb) {
        const colonIdx = rawItem.encryptedThumb.indexOf(':');
        if (colonIdx > 0) {
          const ivHex = rawItem.encryptedThumb.substring(0, colonIdx);
          const cipherBase64 = rawItem.encryptedThumb.substring(colonIdx + 1);
          decrypted.thumbnail = await decryptString(cipherBase64, ivHex, encKey);
        }
      }

      // 3. Decrypt chat transcripts & text metadata
      if (rawItem.encryptedMeta) {
        const colonIdx = rawItem.encryptedMeta.indexOf(':');
        if (colonIdx > 0) {
          const ivHex = rawItem.encryptedMeta.substring(0, colonIdx);
          const cipherBase64 = rawItem.encryptedMeta.substring(colonIdx + 1);
          const metaStr = await decryptString(cipherBase64, ivHex, encKey);
          const parsed = JSON.parse(metaStr);
          decrypted.chatMeta = parsed.chatMeta;
          decrypted.textMeta = parsed.textMeta;
        }
      }

      // 4. Decrypt title
      if (rawItem.encryptedTitle) {
        const colonIdx = rawItem.encryptedTitle.indexOf(':');
        if (colonIdx > 0) {
          const ivHex = rawItem.encryptedTitle.substring(0, colonIdx);
          const cipherBase64 = rawItem.encryptedTitle.substring(colonIdx + 1);
          decrypted.title = await decryptString(cipherBase64, ivHex, encKey);
        }
      }

      // 5. Decrypt sourceUrl
      if (rawItem.encryptedSourceUrl) {
        const colonIdx = rawItem.encryptedSourceUrl.indexOf(':');
        if (colonIdx > 0) {
          const ivHex = rawItem.encryptedSourceUrl.substring(0, colonIdx);
          const cipherBase64 = rawItem.encryptedSourceUrl.substring(colonIdx + 1);
          decrypted.sourceUrl = await decryptString(cipherBase64, ivHex, encKey);
        }
      }

      return decrypted;
    } catch (err) {
      console.warn('[VaultStorage] Decryption failed for item:', rawItem.id, err);
      // Strictly prevent exposing ciphertext or corrupted content
      return {
        ...rawItem,
        title: '🔒 Encrypted item (Locked)',
        sourceUrl: '',
        blobData: undefined,
        thumbnail: undefined,
        chatMeta: undefined,
        textMeta: undefined,
      };
    }
  }

  public async getRecentItems(userId: string, limit = 5): Promise<VaultItem[]> {
    const all = await this.getItems(userId);
    return all.slice(0, limit);
  }

  public async getItems(userId: string, filter?: VaultFilterOptions): Promise<VaultItem[]> {
    const db = await this.getDB();
    const encKey = await this.getActiveEncryptionKey();

    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_ITEMS, 'readonly');
      const store = tx.objectStore(STORE_ITEMS);
      let req: IDBRequest<any[]>;

      if (filter?.type) {
        const index = store.index('userId_type');
        req = index.getAll(IDBKeyRange.only([userId, filter.type]));
      } else {
        const index = store.index('userId');
        req = index.getAll(IDBKeyRange.only(userId));
      }

      req.onsuccess = async () => {
        const rawItems: any[] = req.result || [];

        // Decrypt all items using active user's AES-256-GCM key
        let items: VaultItem[] = await Promise.all(
          rawItems.map((raw) => this.decryptItem(raw, encKey))
        );

        // In-memory text filter
        if (filter?.query && filter.query.trim()) {
          const q = filter.query.trim().toLowerCase();
          items = items.filter((it) => {
            const titleMatch = it.title.toLowerCase().includes(q);
            const chatParticipantsMatch = it.chatMeta?.participants?.some((p) =>
              p.toLowerCase().includes(q)
            );
            const transcriptMatch = it.chatMeta?.formattedTranscript?.toLowerCase().includes(q);
            const snippetMatch = it.textMeta?.previewSnippet?.toLowerCase().includes(q);
            return titleMatch || !!chatParticipantsMatch || !!transcriptMatch || !!snippetMatch;
          });
        }

        // Sorting
        const sort = filter?.sort || 'newest';
        items.sort((a, b) => {
          if (sort === 'newest') return b.createdAt - a.createdAt;
          if (sort === 'oldest') return a.createdAt - b.createdAt;
          if (sort === 'size_desc') return b.sizeBytes - a.sizeBytes;
          if (sort === 'name_asc') return a.title.localeCompare(b.title);
          return b.createdAt - a.createdAt;
        });

        resolve(items);
      };

      req.onerror = () => reject(req.error);
    });
  }

  public async getItemById(id: string): Promise<VaultItem | undefined> {
    const db = await this.getDB();
    const encKey = await this.getActiveEncryptionKey();

    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_ITEMS, 'readonly');
      const store = tx.objectStore(STORE_ITEMS);
      const req = store.get(id);

      req.onsuccess = async () => {
        if (!req.result) {
          resolve(undefined);
          return;
        }
        const decrypted = await this.decryptItem(req.result, encKey);
        resolve(decrypted);
      };
      req.onerror = () => reject(req.error);
    });
  }

  public async deleteItem(id: string, userId: string): Promise<boolean> {
    const db = await this.getDB();
    const item = await this.getItemById(id);
    if (!item || item.userId !== userId) {
      return false;
    }

    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_ITEMS, 'readwrite');
      const store = tx.objectStore(STORE_ITEMS);
      const req = store.delete(id);

      req.onsuccess = () => resolve(true);
      req.onerror = () => reject(req.error);
    });
  }

  /**
   * Batch deletes multiple vault items by their IDs.
   */
  public async deleteItems(ids: string[], userId: string): Promise<number> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_ITEMS, 'readwrite');
      const store = tx.objectStore(STORE_ITEMS);
      let count = 0;
      for (const id of ids) {
        store.delete(id);
        count++;
      }
      tx.oncomplete = () => resolve(count);
      tx.onerror = () => reject(tx.error);
    });
  }

  /**
   * Injects single or multiple vault items (videos, images, transcripts) directly into
   * the active tab's chat composer (Telegram Web, Snapchat Web, WhatsApp Web, etc.)
   */
  public async sendItemsToActiveChat(
    items: VaultItem[]
  ): Promise<{ success: boolean; message: string }> {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab?.id) {
        return {
          success: false,
          message: 'No active browser tab found. Please switch to Telegram or your chat tab.',
        };
      }

      const isSnapchat = Boolean(tab.url && tab.url.includes('snapchat.com'));
      const hasVideos = items.some((it) => it.type === 'video');

      // Snapchat for Web officially blocks video uploads in chat (only photos: PNG, JPG, GIF)
      if (isSnapchat && hasVideos) {
        return {
          success: false,
          message:
            "Snapchat for Web does not support video uploads in chat (only photos: PNG, JPG, GIF). Use 'Download to PC' or the Snapchat mobile app to share videos.",
        };
      }

      // Prepare items for transfer to the page content script
      const payloadItems = await Promise.all(
        items.map(async (item) => {
          let dataUrl: string | undefined = undefined;
          let text: string | undefined = undefined;

          if (item.type === 'text') {
            text =
              item.chatMeta?.formattedTranscript ||
              item.textMeta?.previewSnippet ||
              item.title;
          } else if (item.blobData) {
            let blobToSend = item.blobData;
            let mimeType = getCorrectMimeType(
              item.type === 'video' ? 'video' : 'image',
              item.format,
              item.blobData?.type
            );
            let format = item.format;

            // Ensure images sent to Snapchat Web are in standard PNG/JPEG
            if (isSnapchat && (item.type === 'image' || item.type === 'chat_screenshot')) {
              const converted = await ensureSnapchatCompatibleImage(blobToSend);
              blobToSend = converted.blob;
              mimeType = converted.mimeType;
              format = converted.ext.toUpperCase();
            }

            try {
              dataUrl = await blobToDataUrl(blobToSend);
            } catch (e) {
              console.warn('[VideoDownloader] Failed to read blob as dataUrl:', e);
            }

            return {
              id: item.id,
              title: item.title,
              type: item.type,
              format,
              mimeType,
              dataUrl,
              text,
              sourceUrl: item.sourceUrl,
            };
          }

          const mimeType = getCorrectMimeType(
            item.type === 'video' ? 'video' : 'image',
            item.format,
            item.blobData?.type
          );

          return {
            id: item.id,
            title: item.title,
            type: item.type,
            format: item.format,
            mimeType,
            dataUrl,
            text,
            sourceUrl: item.sourceUrl,
          };
        })
      );

      return new Promise((resolve) => {
        chrome.tabs.sendMessage(
          tab.id!,
          {
            type: 'PASTE_MEDIA_TO_CHAT',
            payload: { items: payloadItems },
          },
          (response) => {
            if (chrome.runtime.lastError) {
              resolve({
                success: false,
                message:
                  'Cannot connect to tab. Open Telegram Web or your chat tab and make sure the page is loaded.',
              });
            } else if (response?.success) {
              const count = items.length;
              resolve({
                success: true,
                message: `💬 Pasted ${count} ${count === 1 ? 'item' : 'items'} into active chat!`,
              });
            } else {
              resolve({
                success: false,
                message:
                  response?.error ||
                  'Could not paste into chat. Please click on the chat message input first.',
              });
            }
          }
        );
      });
    } catch (err: any) {
      return { success: false, message: err?.message || 'Failed to send to chat.' };
    }
  }

  public async getStats(userId: string): Promise<{
    totalCount: number;
    videoCount: number;
    imageCount: number;
    chatCount: number;
    textCount: number;
    totalBytes: number;
  }> {
    const items = await this.getItems(userId);
    let videoCount = 0;
    let imageCount = 0;
    let chatCount = 0;
    let textCount = 0;
    let totalBytes = 0;

    for (const item of items) {
      totalBytes += item.sizeBytes || 0;
      if (item.type === 'video') videoCount++;
      else if (item.type === 'image') imageCount++;
      else if (item.type === 'chat_screenshot') chatCount++;
      else if (item.type === 'text') textCount++;
    }

    return {
      totalCount: items.length,
      videoCount,
      imageCount,
      chatCount,
      textCount,
      totalBytes,
    };
  }

  // ==========================================
  // Export & Clipboard Operations
  // ==========================================

  /**
   * Controlled PC Export: Downloads from the protected in-app vault
   * to the user's PC using native DOM object URLs without broad chrome.downloads permissions.
   */
  public exportToPC(item: VaultItem): void {
    let blob = item.blobData;
    if (!blob && (item.chatMeta?.formattedTranscript || item.textMeta?.previewSnippet)) {
      blob = new Blob([item.chatMeta?.formattedTranscript || item.textMeta?.previewSnippet || ''], {
        type: 'text/plain;charset=utf-8',
      });
    }

    if (!blob) {
      console.error('[VaultStorage] Item has no blobData to export.');
      return;
    }

    const correctMime = getCorrectMimeType(item.type, item.format, blob.type);
    if (blob.type !== correctMime) {
      blob = new Blob([blob], { type: correctMime });
    }

    const blobUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.style.display = 'none';
    a.href = blobUrl;

    let filename = item.title;
    const defaultExt =
      item.type === 'video'
        ? item.format === 'WEBM'
          ? 'webm'
          : item.format === 'MKV'
          ? 'mkv'
          : 'mp4'
        : item.type === 'text'
        ? 'txt'
        : 'jpg';
    const ext = (item.format || defaultExt).toLowerCase();

    // Replace mismatched extension (e.g. if title was Video_1.mp4 but container is WEBM, fix to .webm)
    if (filename.toLowerCase().endsWith('.mp4') && (ext === 'webm' || ext === 'mkv')) {
      filename = filename.replace(/\.mp4$/i, `.${ext}`);
    } else if (filename.toLowerCase().endsWith('.webm') && ext === 'mp4') {
      filename = filename.replace(/\.webm$/i, `.${ext}`);
    } else if (!filename.toLowerCase().endsWith(`.${ext}`)) {
      filename = filename.replace(/\.[a-zA-Z0-9]+$/, '') + `.${ext}`;
    }
    a.download = filename;

    document.body.appendChild(a);
    a.click();

    setTimeout(() => {
      a.remove();
      URL.revokeObjectURL(blobUrl);
    }, 20000);
  }

  /**
   * Stages a media item in the active tab's content script so that pressing
   * Ctrl+V anywhere inside Telegram Web, WhatsApp Web, or web chat apps
   * immediately injects the native File object without needing manual drag-and-drop.
   */
  public async stageMediaInActiveTab(item: VaultItem): Promise<void> {
    try {
      if (!item.blobData) return;
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab?.id) return;

      const isSnapchat = Boolean(tab.url && tab.url.includes('snapchat.com'));
      // Do not stage video file for Ctrl+V paste on Snapchat Web
      // because Snapchat Web strictly blocks video uploads in chat
      if (isSnapchat && item.type === 'video') {
        return;
      }

      let blobToSend = item.blobData;
      let mimeType = getCorrectMimeType(item.type, item.format, item.blobData.type);
      let ext = (item.format || (item.type === 'video' ? 'mp4' : 'jpg')).toLowerCase();

      // Ensure images sent or pasted on Snapchat Web are in standard PNG/JPEG
      if (isSnapchat && (item.type === 'image' || item.type === 'chat_screenshot')) {
        const converted = await ensureSnapchatCompatibleImage(blobToSend);
        blobToSend = converted.blob;
        mimeType = converted.mimeType;
        ext = converted.ext;
      }

      const dataUrl = await blobToDataUrl(blobToSend);
      let filename = item.title || `media_${Date.now()}`;
      if (!filename.toLowerCase().endsWith(`.${ext}`)) {
        filename = `${filename}.${ext}`;
      }

      chrome.tabs
        .sendMessage(tab.id, {
          type: 'STAGE_CLIPBOARD_MEDIA',
          payload: {
            dataUrl,
            filename,
            mimeType,
          },
        })
        .catch(() => {});
    } catch (e) {
      console.warn('[VaultStorage] stageMediaInActiveTab error:', e);
    }
  }

  /**
   * Copies media or content to clipboard.
   * Never writes internal "blob:https://..." URLs to the clipboard.
   * For videos: attempts direct binary ClipboardItem write, writes rich HTML video DataURL,
   * and stages the video File in the active tab for seamless Ctrl+V pasting.
   */
  public async copyItemToClipboard(item: VaultItem): Promise<{ success: boolean; message: string }> {
    try {
      if (item.type === 'text') {
        const text =
          item.chatMeta?.formattedTranscript || item.textMeta?.previewSnippet || item.title;
        await navigator.clipboard.writeText(text);
        return { success: true, message: 'Text transcript copied to clipboard!' };
      }

      if (item.type === 'image' || item.type === 'chat_screenshot') {
        if (item.blobData) {
          // Stage image in active tab for immediate Ctrl+V
          this.stageMediaInActiveTab(item).catch(() => {});

          // Copy image blob to system clipboard
          try {
            const pngBlob =
              item.blobData.type === 'image/png'
                ? item.blobData
                : new Blob([await item.blobData.arrayBuffer()], { type: 'image/png' });

            await navigator.clipboard.write([new ClipboardItem({ 'image/png': pngBlob })]);
            return { success: true, message: 'Image copied to clipboard!' };
          } catch (e) {
            // Fallback to text if image clipboard copy failed
            if (item.chatMeta?.formattedTranscript) {
              await navigator.clipboard.writeText(item.chatMeta.formattedTranscript);
              return { success: true, message: 'Chat transcript copied to clipboard!' };
            }
          }
        } else if (item.chatMeta?.formattedTranscript) {
          await navigator.clipboard.writeText(item.chatMeta.formattedTranscript);
          return { success: true, message: 'Chat transcript copied to clipboard!' };
        }
      }

      if (item.type === 'video') {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true }).catch(() => []);
        const isSnapchat = Boolean(tab?.url && tab.url.includes('snapchat.com'));

        // Stage video in active tab (automatically suppressed on Snapchat Web to avoid "You can't send this type of file")
        this.stageMediaInActiveTab(item).catch(() => {});

        if (isSnapchat) {
          // On Snapchat Web, inform the user about Snapchat's restriction
          await navigator.clipboard.writeText(item.title || 'Video');
          return {
            success: true,
            message:
              "Video copied! (Note: Snapchat Web only allows photo uploads in chat, not videos. Export to PC to share.)",
          };
        }

        if (item.blobData) {
          const mime = getCorrectMimeType('video', item.format, item.blobData.type);
          const videoBlob =
            item.blobData.type === mime
              ? item.blobData
              : new Blob([item.blobData], { type: mime });

          // 1. Try direct video blob write to clipboard
          try {
            await navigator.clipboard.write([
              new ClipboardItem({
                [mime]: videoBlob,
              }),
            ]);
            return {
              success: true,
              message: 'Video copied to clipboard as blob! (Ready to paste)',
            };
          } catch (clipErr) {
            console.warn('[VaultStorage] Direct video ClipboardItem write rejected by browser:', clipErr);
          }

          // 2. Fallback: Write rich HTML with embedded video DataURL + clean text title (NEVER blob: URL cache ID)
          try {
            const dataUrl = await blobToDataUrl(videoBlob);
            const htmlBlob = new Blob(
              [`<video controls src="${dataUrl}"></video><p>${item.title}</p>`],
              { type: 'text/html' }
            );
            const textBlob = new Blob([item.title], { type: 'text/plain' });

            await navigator.clipboard.write([
              new ClipboardItem({
                'text/html': htmlBlob,
                'text/plain': textBlob,
              }),
            ]);
            return {
              success: true,
              message: 'Video copied to clipboard! (Press Ctrl+V in chat or use 💬 "Send to Chat")',
            };
          } catch (htmlErr) {
            console.warn('[VaultStorage] HTML video clipboard write failed:', htmlErr);
          }
        }

        // Clean text copy fallback: ONLY copy title (NEVER blob: cache id!)
        const safeTitle = item.title || 'Telegram Video';
        await navigator.clipboard.writeText(safeTitle);
        return {
          success: true,
          message: 'Video title copied! (Use 💬 "Send to Chat" to paste directly into Telegram).',
        };
      }

      // Generic fallback: NEVER copy blob: URLs
      const textToCopy =
        item.sourceUrl && !item.sourceUrl.startsWith('blob:') ? item.sourceUrl : item.title;
      await navigator.clipboard.writeText(textToCopy);
      return { success: true, message: 'Copied to clipboard!' };
    } catch (err: any) {
      return { success: false, message: err?.message || 'Failed to copy to clipboard' };
    }
  }

  // ==========================================
  // Meta Store Operations (Meta, Session, App)
  // ==========================================

  public async getMeta<T = any>(key: string): Promise<T | null> {
    try {
      const db = await this.getDB();
      if (!db.objectStoreNames.contains(STORE_META)) return null;

      return new Promise((resolve) => {
        try {
          const tx = db.transaction(STORE_META, 'readonly');
          const store = tx.objectStore(STORE_META);
          const req = store.get(key);
          req.onsuccess = () => resolve(req.result ? req.result.value : null);
          req.onerror = () => resolve(null);
        } catch (e) {
          resolve(null);
        }
      });
    } catch (e) {
      return null;
    }
  }

  public async setMeta<T = any>(key: string, value: T): Promise<void> {
    try {
      const db = await this.getDB();
      if (!db.objectStoreNames.contains(STORE_META)) return;

      return new Promise((resolve, reject) => {
        try {
          const tx = db.transaction(STORE_META, 'readwrite');
          const store = tx.objectStore(STORE_META);
          const req = store.put({ key, value });
          req.onsuccess = () => resolve();
          req.onerror = () => reject(req.error);
        } catch (e) {
          reject(e);
        }
      });
    } catch (e) {
      console.warn('[VaultStorage] setMeta error:', e);
    }
  }

  public async deleteMeta(key: string): Promise<void> {
    try {
      const db = await this.getDB();
      if (!db.objectStoreNames.contains(STORE_META)) return;

      return new Promise((resolve, reject) => {
        try {
          const tx = db.transaction(STORE_META, 'readwrite');
          const store = tx.objectStore(STORE_META);
          const req = store.delete(key);
          req.onsuccess = () => resolve();
          req.onerror = () => reject(req.error);
        } catch (e) {
          reject(e);
        }
      });
    } catch (e) {
      console.warn('[VaultStorage] deleteMeta error:', e);
    }
  }

  // ==========================================
  // Raw User Store Access (Used by authService)
  // ==========================================

  public async getUserRecord(id: string): Promise<any | null> {
    try {
      const db = await this.getDB();
      if (!db.objectStoreNames.contains(STORE_USERS)) return null;

      return new Promise((resolve) => {
        try {
          const tx = db.transaction(STORE_USERS, 'readonly');
          const store = tx.objectStore(STORE_USERS);
          const req = store.get(id);
          req.onsuccess = () => resolve(req.result || null);
          req.onerror = () => resolve(null);
        } catch (e) {
          resolve(null);
        }
      });
    } catch (e) {
      return null;
    }
  }

  public async findUserByUsername(username: string): Promise<any | null> {
    try {
      const db = await this.getDB();
      if (!db.objectStoreNames.contains(STORE_USERS)) return null;

      return new Promise((resolve) => {
        try {
          const tx = db.transaction(STORE_USERS, 'readonly');
          const store = tx.objectStore(STORE_USERS);
          const req = store.getAll();
          req.onsuccess = () => {
            const users = req.result || [];
            const target = username.trim().toLowerCase();
            const found = users.find((u: any) => u.username?.trim().toLowerCase() === target);
            resolve(found || null);
          };
          req.onerror = () => resolve(null);
        } catch (e) {
          resolve(null);
        }
      });
    } catch (e) {
      return null;
    }
  }

  public async getAllUsers(): Promise<any[]> {
    try {
      const db = await this.getDB();
      if (!db.objectStoreNames.contains(STORE_USERS)) return [];

      return new Promise((resolve) => {
        try {
          const tx = db.transaction(STORE_USERS, 'readonly');
          const store = tx.objectStore(STORE_USERS);
          const req = store.getAll();
          req.onsuccess = () => resolve(req.result || []);
          req.onerror = () => resolve([]);
        } catch (e) {
          resolve([]);
        }
      });
    } catch (e) {
      return [];
    }
  }

  public async putUser(user: any): Promise<void> {
    try {
      const db = await this.getDB();
      if (!db.objectStoreNames.contains(STORE_USERS)) return;

      return new Promise((resolve, reject) => {
        try {
          const tx = db.transaction(STORE_USERS, 'readwrite');
          const store = tx.objectStore(STORE_USERS);
          const req = store.put(user);
          req.onsuccess = () => resolve();
          req.onerror = () => reject(req.error);
        } catch (e) {
          reject(e);
        }
      });
    } catch (e) {
      console.warn('[VaultStorage] putUser error:', e);
    }
  }

  public async deleteUser(id: string): Promise<void> {
    try {
      const db = await this.getDB();
      if (!db.objectStoreNames.contains(STORE_USERS)) return;

      return new Promise((resolve, reject) => {
        try {
          const tx = db.transaction(STORE_USERS, 'readwrite');
          const store = tx.objectStore(STORE_USERS);
          const req = store.delete(id);
          req.onsuccess = () => resolve();
          req.onerror = () => reject(req.error);
        } catch (e) {
          reject(e);
        }
      });
    } catch (e) {
      console.warn('[VaultStorage] deleteUser error:', e);
    }
  }
}

export const vaultStorage = new VaultStorage();
