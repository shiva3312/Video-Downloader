#!/usr/bin/env node

/**
 * CLI Tool to generate cryptographically signed activation keys for Video Downloader Pro.
 * Usage:
 *   node scripts/generate-key.mjs [days] [tier]
 *
 * Examples:
 *   node scripts/generate-key.mjs 30 PRO        # 30-day Pro key
 *   node scripts/generate-key.mjs 365 PRO       # 1-year Pro key
 *   node scripts/generate-key.mjs 0 LIFETIME    # Lifetime key
 *   node scripts/generate-key.mjs -1 PRO        # Expired key (testing rejection)
 */

import crypto from 'node:crypto';

const LICENSE_SECRET = 'vd_pro_master_license_salt_2026';

function generateKey(durationDays = 30, tier = 'PRO') {
  const isLifetime = durationDays === 0 || tier.toUpperCase() === 'LIFETIME';
  const now = Date.now();
  let expiresAt;

  if (isLifetime) {
    tier = 'LIFETIME';
    expiresAt = now + 100 * 365 * 24 * 3600 * 1000; // 100 years
  } else {
    tier = 'PRO';
    expiresAt = now + durationDays * 24 * 3600 * 1000;
  }

  const expiryHex = expiresAt.toString(16).toLowerCase();
  const nonce = crypto.randomUUID().split('-')[0].toUpperCase();
  const dataToSign = `${tier}-${expiryHex}-${nonce}`;

  const fullSig = crypto
    .createHmac('sha256', LICENSE_SECRET)
    .update(dataToSign)
    .digest('hex');
  const shortSig = fullSig.substring(0, 12).toUpperCase();

  const key = `PRO-${tier}-${expiryHex}-${nonce}-${shortSig}`;
  const expiryDate = new Date(expiresAt).toLocaleString();

  return {
    key,
    tier,
    durationDays: isLifetime ? 'Lifetime' : `${durationDays} days`,
    expiresAt,
    expiryDate,
    isExpired: now > expiresAt,
  };
}

// Read CLI arguments
const args = process.argv.slice(2);
const daysInput = args[0] !== undefined ? parseInt(args[0], 10) : 30;
const tierInput = (args[1] || (daysInput === 0 ? 'LIFETIME' : 'PRO')).toUpperCase();

console.log('\n========================================');
console.log('  Video Downloader Pro Key Generator    ');
console.log('========================================\n');

const result = generateKey(daysInput, tierInput);

console.log(`🔑 Activation Key : \x1b[32m\x1b[1m${result.key}\x1b[0m`);
console.log(`📋 Tier           : ${result.tier}`);
console.log(`⏳ Validity       : ${result.durationDays}`);
console.log(`📅 Expiration     : ${result.expiryDate}`);
if (result.isExpired) {
  console.log(`⚠️ Status         : \x1b[31mEXPIRED (Will be rejected by extension)\x1b[0m`);
} else {
  console.log(`✅ Status         : \x1b[32mACTIVE / VALID\x1b[0m`);
}
console.log('\n----------------------------------------\n');
