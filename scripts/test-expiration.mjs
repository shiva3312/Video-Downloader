import assert from 'node:assert';

// Emulate logic from utils/expiration.ts
const APP_EXPIRATION_DATE_STR = 'December 5, 2026';
const APP_EXPIRATION_TIMESTAMP = Date.UTC(2026, 11, 5, 23, 59, 59);

function checkIsExpired(currentTimeMs) {
  return currentTimeMs > APP_EXPIRATION_TIMESTAMP;
}

function getExpirationDetails(currentTimeMs) {
  const isExpired = currentTimeMs > APP_EXPIRATION_TIMESTAMP;
  const daysRemaining = isExpired
    ? 0
    : Math.max(0, Math.ceil((APP_EXPIRATION_TIMESTAMP - currentTimeMs) / (1000 * 60 * 60 * 24)));

  return {
    isExpired,
    expiryDateStr: APP_EXPIRATION_DATE_STR,
    daysRemaining,
  };
}

console.log('Testing expiration logic...');

// 1. Verify target date matches 5/12/2026 (December 5, 2026 23:59:59 UTC)
const expDate = new Date(APP_EXPIRATION_TIMESTAMP);
assert.strictEqual(expDate.getUTCFullYear(), 2026, 'Year must be 2026');
assert.strictEqual(expDate.getUTCMonth(), 11, 'Month must be 11 (December)');
assert.strictEqual(expDate.getUTCDate(), 5, 'Date must be 5th');
assert.strictEqual(expDate.getUTCHours(), 23, 'Hour must be 23');
assert.strictEqual(expDate.getUTCMinutes(), 59, 'Minute must be 59');
assert.strictEqual(expDate.getUTCSeconds(), 59, 'Seconds must be 59');

console.log(' Target date verified:', expDate.toUTCString());

// 2. Verify current date (e.g., 2026-11-18) is NOT expired
const todayNov18 = Date.UTC(2026, 10, 18, 12, 0, 0);
assert.strictEqual(checkIsExpired(todayNov18), false, 'Today (Nov 18, 2026) must not be expired');
const detailsToday = getExpirationDetails(todayNov18);
assert.strictEqual(detailsToday.isExpired, false);
assert(detailsToday.daysRemaining > 0, 'Days remaining should be > 0');
console.log(` Today (Nov 18, 2026) -> isExpired: false, daysRemaining: ${detailsToday.daysRemaining}`);

// 3. Verify Dec 5, 2026 at 23:59:58 UTC is NOT expired
const rightBefore = APP_EXPIRATION_TIMESTAMP - 1000;
assert.strictEqual(checkIsExpired(rightBefore), false, '1 sec before cutoff must not be expired');

// 4. Verify Dec 6, 2026 at 00:00:00 UTC IS expired
const rightAfter = APP_EXPIRATION_TIMESTAMP + 1000;
assert.strictEqual(checkIsExpired(rightAfter), true, '1 sec after cutoff MUST be expired');
const detailsAfter = getExpirationDetails(rightAfter);
assert.strictEqual(detailsAfter.isExpired, true);
assert.strictEqual(detailsAfter.daysRemaining, 0);
console.log(' Dec 6, 2026 -> isExpired: true, daysRemaining: 0');

// 5. Verify Year 2027 is expired
const year2027 = Date.UTC(2027, 0, 1, 0, 0, 0);
assert.strictEqual(checkIsExpired(year2027), true, '2027 must be expired');
console.log(' Year 2027 -> isExpired: true');

console.log('\nAll expiration tests passed successfully!');
