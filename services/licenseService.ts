import { LicensePayload, LicenseStatus, LicenseTier, ProFeature } from '@/types/license';
import { computeHmacSha256, generateUUID } from './cryptoUtils';
import { vaultStorage } from './vaultStorage';

const LICENSE_SECRET = 'vd_pro_master_license_salt_2026';
const META_LICENSE_KEY = 'active_pro_license';
const META_INSTALL_INSTANCE = 'install_instance_id';

class LicenseService {
  private currentStatus: LicenseStatus | null = null;

  /**
   * Returns the unique installation instance ID.
   * This is created on install and automatically erased on extension uninstall.
   */
  public async getInstallInstanceId(): Promise<string> {
    let id = await vaultStorage.getMeta<string>(META_INSTALL_INSTANCE);
    if (!id) {
      id = generateUUID();
      await vaultStorage.setMeta(META_INSTALL_INSTANCE, id);
    }
    return id;
  }

  /**
   * Validates a license key string against cryptographic signature, expiry, and format.
   * Tolerates arbitrary user casing and whitespace.
   */
  public async validateKey(keyString: string): Promise<LicenseStatus> {
    const clean = (keyString || '').trim();
    if (!clean.toUpperCase().startsWith('PRO-')) {
      return {
        isValid: false,
        isExpired: false,
        tier: 'FREE',
        error: 'Invalid key format. Key must start with PRO-',
      };
    }

    const parts = clean.split('-');
    if (parts.length < 5) {
      return {
        isValid: false,
        isExpired: false,
        tier: 'FREE',
        error: 'Malformed key structure. Expected PRO-<TIER>-<EXPIRY>-<NONCE>-<SIG>',
      };
    }

    const [, rawTier, rawExpiryHex, rawNonce, rawSig] = parts;
    const tier = (rawTier.toUpperCase() === 'LIFETIME' ? 'LIFETIME' : 'PRO') as LicenseTier;
    const expiryHex = rawExpiryHex.toLowerCase();
    const nonce = rawNonce.toUpperCase();
    const sig = rawSig.toUpperCase();

    const expiresAt = parseInt(expiryHex, 16);
    if (isNaN(expiresAt)) {
      return {
        isValid: false,
        isExpired: false,
        tier: 'FREE',
        error: 'Invalid key expiration data.',
      };
    }

    // 1. Verify cryptographic signature with normalized data
    const dataToSign = `${tier}-${expiryHex}-${nonce}`;
    const expectedFullSig = await computeHmacSha256(dataToSign, LICENSE_SECRET);
    const expectedShortSig = expectedFullSig.substring(0, 12).toUpperCase();

    if (sig !== expectedShortSig) {
      return {
        isValid: false,
        isExpired: false,
        tier: 'FREE',
        error: 'Invalid license signature or counterfeit key.',
      };
    }

    // 2. Check Expiration
    const now = Date.now();
    if (now > expiresAt) {
      const expDate = new Date(expiresAt).toLocaleDateString();
      return {
        isValid: false,
        isExpired: true,
        tier: 'FREE',
        expiresAt,
        daysRemaining: 0,
        error: `This license key expired on ${expDate}. Please renew with a new key.`,
      };
    }

    const daysRemaining = Math.max(0, Math.ceil((expiresAt - now) / (1000 * 60 * 60 * 24)));

    return {
      isValid: true,
      isExpired: false,
      tier,
      expiresAt,
      daysRemaining,
    };
  }

  /**
   * Activates a license key for this extension installation.
   * If valid, persists key and associates it with the current installInstanceId.
   */
  public async activateKey(keyString: string): Promise<LicenseStatus> {
    const status = await this.validateKey(keyString);
    if (!status.isValid) {
      return status;
    }

    const installInstanceId = await this.getInstallInstanceId();
    await vaultStorage.setMeta(META_LICENSE_KEY, {
      key: keyString.trim().toUpperCase(),
      activatedAt: Date.now(),
      installInstanceId,
      expiresAt: status.expiresAt,
      tier: status.tier,
    });

    this.currentStatus = {
      ...status,
      installInstanceId,
    };

    return this.currentStatus;
  }

  /**
   * Deactivates the current license key.
   */
  public async deactivateKey(): Promise<void> {
    await vaultStorage.deleteMeta(META_LICENSE_KEY);
    this.currentStatus = null;
  }

  /**
   * Retrieves the current active license status.
   * Checks expiration dynamically; if expired, downgrades to FREE.
   */
  public async getStatus(): Promise<LicenseStatus> {
    const saved = await vaultStorage.getMeta<{
      key: string;
      activatedAt: number;
      installInstanceId: string;
      expiresAt: number;
      tier: LicenseTier;
    }>(META_LICENSE_KEY);

    if (!saved?.key) {
      return {
        isValid: false,
        isExpired: false,
        tier: 'FREE',
      };
    }

    // Verify current install instance matches
    const currentInstanceId = await this.getInstallInstanceId();
    if (saved.installInstanceId !== currentInstanceId) {
      // Re-installed! The key was bound to previous install instance.
      await this.deactivateKey();
      return {
        isValid: false,
        isExpired: false,
        tier: 'FREE',
        error: 'Extension was reinstalled. A fresh key is required for this new installation.',
      };
    }

    // Validate key again to check expiration
    const status = await this.validateKey(saved.key);
    this.currentStatus = status;
    return status;
  }

  /**
   * Fast sync check if PRO is currently active.
   */
  public async isPro(): Promise<boolean> {
    const status = await this.getStatus();
    return status.isValid && !status.isExpired && (status.tier === 'PRO' || status.tier === 'LIFETIME');
  }

  /**
   * Checks whether a specific pro feature is authorized.
   */
  public async isFeatureEnabled(feature: ProFeature): Promise<boolean> {
    const pro = await this.isPro();
    if (pro) return true;

    // Free tier limitations:
    // 'vault_unlimited', 'chat_vault', 'multi_user', 'bulk_export' are PRO ONLY
    return false;
  }

  /**
   * Checks whether the user is permitted to save another item into their vault.
   * Pro tier: Unlimited IndexedDB vault storage.
   * Free tier: Standard downloads only (PC disk), Vault is restricted to Pro.
   */
  public async canSaveVaultItem(userId: string): Promise<{ allowed: boolean; reason?: string }> {
    const user = await vaultStorage.getUserRecord(userId);
    const isPro = !!user?.isPro && (!user.licenseExpiresAt || Date.now() <= user.licenseExpiresAt);
    if (isPro) return { allowed: true };

    return {
      allowed: false,
      reason: 'Saving media to the Protected In-App Vault (IndexedDB) is a PRO feature. Activate a Pro Key to save videos, photos, and chat screenshots privately.',
    };
  }

  /**
   * Checks whether creating an additional user profile is permitted.
   * Free tier: 1 user only. Pro tier: Unlimited profiles.
   */
  public async canCreateUser(): Promise<{ allowed: boolean; reason?: string }> {
    const pro = await this.isPro();
    if (pro) return { allowed: true };

    const users = await vaultStorage.getAllUsers();
    if (users.length >= 1) {
      return {
        allowed: false,
        reason: 'Free tier allows only 1 user profile. Please enter a valid Pro Key to create and manage multiple profiles.',
      };
    }

    return { allowed: true };
  }
}

export const licenseService = new LicenseService();
