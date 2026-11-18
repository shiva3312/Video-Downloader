import { UserRecord, ActiveSession, AuthResult } from '@/types/auth';
import {
  generateSaltHex,
  hashPassword,
  verifyPassword,
  generateUUID,
  deriveUserEncryptionKey,
  exportKeyToHex,
  importKeyFromHex,
} from './cryptoUtils';
import { vaultStorage } from './vaultStorage';
import { licenseService } from './licenseService';

const META_SESSION_KEY = 'active_user_session';
const MAX_SESSION_DURATION_MS = 24 * 60 * 60 * 1000; // 24 Hours max session time

class AuthService {
  private cachedKey: { userId: string; key: CryptoKey } | null = null;

  /**
   * Registers a new user. Multiple users can be created freely.
   * If a valid Pro Key is provided, user is granted full Pro access (IndexedDB Vault, Side Panel).
   * If no key is provided, user is created with Free tier (Standard Telegram/Web downloads).
   */
  public async register(
    usernameInput: string,
    passwordInput: string,
    licenseKeyInput?: string
  ): Promise<AuthResult> {
    const username = usernameInput.trim();
    if (!username || username.length < 2) {
      return { success: false, error: 'Username must be at least 2 characters.' };
    }
    if (!passwordInput || passwordInput.length < 4) {
      return { success: false, error: 'Password must be at least 4 characters.' };
    }

    // 1. Check if username is already taken
    const existing = await vaultStorage.findUserByUsername(username);
    if (existing) {
      return { success: false, error: `Username "${username}" already exists.` };
    }

    let isPro = false;
    let licenseExpiresAt: number | undefined;
    const cleanKey = licenseKeyInput?.trim();

    // 2. Validate Pro Key if provided
    if (cleanKey) {
      const act = await licenseService.validateKey(cleanKey);
      if (!act.isValid) {
        return { success: false, error: act.error || 'Provided license key is invalid or expired.' };
      }
      isPro = true;
      licenseExpiresAt = act.expiresAt;

      // Also register key with license service
      await licenseService.activateKey(cleanKey);
    }

    // 3. Hash password with PBKDF2 & derive per-user AES-256-GCM encryption key
    const salt = generateSaltHex(16);
    const passwordHash = await hashPassword(passwordInput, salt);
    const encKey = await deriveUserEncryptionKey(passwordInput, salt);
    const encryptionKeyHex = await exportKeyToHex(encKey);
    const now = Date.now();

    const user: UserRecord = {
      id: generateUUID(),
      username,
      salt,
      passwordHash,
      createdAt: now,
      lastLoginAt: now,
      isPro,
      licenseKey: cleanKey,
      licenseExpiresAt,
    };

    await vaultStorage.putUser(user);

    // 4. Cache key and establish active session (max 24h)
    this.cachedKey = { userId: user.id, key: encKey };
    const session = await this.setSession(user, encryptionKeyHex);

    return {
      success: true,
      user,
      session,
    };
  }

  /**
   * Authenticates a user, derives their AES-256-GCM encryption key,
   * and starts a session valid for up to 24 hours.
   */
  public async login(usernameInput: string, passwordInput: string): Promise<AuthResult> {
    const username = usernameInput.trim();
    if (!username || !passwordInput) {
      return { success: false, error: 'Please enter username and password.' };
    }

    const user: UserRecord = await vaultStorage.findUserByUsername(username);
    if (!user) {
      return { success: false, error: 'User does not exist. Please create a profile.' };
    }

    const isValid = await verifyPassword(passwordInput, user.salt, user.passwordHash);
    if (!isValid) {
      return { success: false, error: 'Incorrect password.' };
    }

    // Check if user's Pro license has expired
    if (user.isPro && user.licenseExpiresAt && Date.now() > user.licenseExpiresAt) {
      user.isPro = false;
    }

    user.lastLoginAt = Date.now();
    await vaultStorage.putUser(user);

    // Derive per-user AES-256-GCM encryption key from password + salt
    const encKey = await deriveUserEncryptionKey(passwordInput, user.salt);
    const encryptionKeyHex = await exportKeyToHex(encKey);
    this.cachedKey = { userId: user.id, key: encKey };

    const session = await this.setSession(user, encryptionKeyHex);

    return {
      success: true,
      user,
      session,
    };
  }

  /**
   * Retrieves the current authenticated session.
   * Auto-logs out if the session has exceeded 24 hours.
   */
  public async getActiveSession(): Promise<ActiveSession | null> {
    const session = await vaultStorage.getMeta<ActiveSession>(META_SESSION_KEY);
    if (!session || !session.userId) {
      return null;
    }

    // Enforce 24-hour maximum session time
    const sessionAge = Date.now() - session.unlockedAt;
    if (sessionAge > MAX_SESSION_DURATION_MS) {
      console.log('[AuthService] Active session exceeded 24 hours. Auto-locking.');
      await this.logout();
      return null;
    }

    // Check user's current record in DB
    const user: UserRecord = await vaultStorage.getUserRecord(session.userId);
    if (!user) {
      await this.logout();
      return null;
    }

    const isPro = !!user.isPro && (!user.licenseExpiresAt || Date.now() <= user.licenseExpiresAt);

    const updatedSession: ActiveSession = {
      ...session,
      isPro,
      licenseExpiresAt: user.licenseExpiresAt,
    };

    return updatedSession;
  }

  /**
   * Retrieves the active user's AES-256-GCM CryptoKey for encrypting / decrypting vault data.
   */
  public async getUserEncryptionKey(): Promise<CryptoKey | null> {
    const session = await this.getActiveSession();
    if (!session?.userId || !session.encryptionKeyHex) {
      return null;
    }

    if (this.cachedKey && this.cachedKey.userId === session.userId) {
      return this.cachedKey.key;
    }

    try {
      const key = await importKeyFromHex(session.encryptionKeyHex);
      this.cachedKey = { userId: session.userId, key };
      return key;
    } catch (err) {
      console.error('[AuthService] Failed to import session encryption key:', err);
      return null;
    }
  }

  /**
   * Activates or upgrades a Pro Key for an existing user.
   */
  public async activateProForUser(userId: string, keyString: string): Promise<{ success: boolean; error?: string }> {
    const act = await licenseService.validateKey(keyString.trim());
    if (!act.isValid) {
      return { success: false, error: act.error || 'Invalid or expired license key.' };
    }

    const user: UserRecord = await vaultStorage.getUserRecord(userId);
    if (!user) {
      return { success: false, error: 'User not found.' };
    }

    user.isPro = true;
    user.licenseKey = keyString.trim().toUpperCase();
    user.licenseExpiresAt = act.expiresAt;
    await vaultStorage.putUser(user);

    await licenseService.activateKey(keyString.trim().toUpperCase());

    // Update active session preserving existing encryptionKeyHex
    const currentSession = await vaultStorage.getMeta<ActiveSession>(META_SESSION_KEY);
    await this.setSession(user, currentSession?.encryptionKeyHex);

    return { success: true };
  }

  /**
   * Clears active session and wipes cached encryption keys (Logout).
   */
  public async logout(): Promise<void> {
    this.cachedKey = null;
    await vaultStorage.deleteMeta(META_SESSION_KEY);
  }

  /**
   * Lists all registered user profiles (without sensitive credentials).
   */
  public async listUsers(): Promise<{ id: string; username: string; isPro: boolean; createdAt: number; lastLoginAt: number }[]> {
    const raw = await vaultStorage.getAllUsers();
    return raw.map((u) => ({
      id: u.id,
      username: u.username,
      isPro: !!u.isPro,
      createdAt: u.createdAt,
      lastLoginAt: u.lastLoginAt,
    }));
  }

  /**
   * Deletes a user profile and logs out if active.
   */
  public async deleteUser(id: string): Promise<boolean> {
    const active = await this.getActiveSession();
    if (active?.userId === id) {
      await this.logout();
    }
    await vaultStorage.deleteUser(id);
    return true;
  }

  private async setSession(user: UserRecord, encryptionKeyHex?: string): Promise<ActiveSession> {
    const isPro = !!user.isPro && (!user.licenseExpiresAt || Date.now() <= user.licenseExpiresAt);

    const session: ActiveSession = {
      userId: user.id,
      username: user.username,
      isAuthenticated: true,
      unlockedAt: Date.now(),
      isPro,
      licenseExpiresAt: user.licenseExpiresAt,
      encryptionKeyHex,
    };

    await vaultStorage.setMeta(META_SESSION_KEY, session);
    return session;
  }
}

export const authService = new AuthService();
