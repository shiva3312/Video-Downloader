export type LicenseTier = 'FREE' | 'PRO' | 'LIFETIME';

export type ProFeature =
  | 'vault_unlimited'
  | 'chat_vault'
  | 'multi_user'
  | 'bulk_export';

export interface LicensePayload {
  keyId: string;
  tier: LicenseTier;
  issuedAt: number;            // Timestamp (epoch ms)
  expiresAt: number;           // Expiration timestamp (epoch ms)
  features: ProFeature[];
  allowedInstalls?: number;
}

export interface LicenseStatus {
  isValid: boolean;
  isExpired: boolean;
  tier: LicenseTier;
  expiresAt?: number;
  daysRemaining?: number;
  installInstanceId?: string;
  error?: string;
}
