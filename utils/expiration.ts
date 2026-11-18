/**
 * Hard global application expiration configuration.
 * Date format: 5/12/2026 (December 5, 2026 at 23:59:59 UTC).
 * After this date, the extension ceases all capture, download, and execution.
 */
export const APP_EXPIRATION_DATE_STR = 'December 5, 2026';
export const APP_EXPIRATION_TIMESTAMP = Date.UTC(2026, 11, 5, 23, 59, 59);

/**
 * Checks whether the application has passed its expiration cutoff.
 */
export function isAppExpired(): boolean {
  return Date.now() > APP_EXPIRATION_TIMESTAMP;
}

/**
 * Returns current expiration status and days remaining.
 */
export function getAppExpirationDetails(): {
  isExpired: boolean;
  expiryDateStr: string;
  daysRemaining: number;
} {
  const now = Date.now();
  const isExpired = now > APP_EXPIRATION_TIMESTAMP;
  const daysRemaining = isExpired
    ? 0
    : Math.max(0, Math.ceil((APP_EXPIRATION_TIMESTAMP - now) / (1000 * 60 * 60 * 24)));

  return {
    isExpired,
    expiryDateStr: APP_EXPIRATION_DATE_STR,
    daysRemaining,
  };
}
