function isSupportedDomain(url) {
  if (!url) return false;
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase();
    return (
      host === 'telegram.org' ||
      host.endsWith('.telegram.org') ||
      host === 'snapchat.com' ||
      host.endsWith('.snapchat.com')
    );
  } catch {
    return false;
  }
}

console.log('=== Testing Domain Restriction Logic ===');

const allowedUrls = [
  'https://web.telegram.org/k/',
  'https://web.telegram.org/a/#123456',
  'https://telegram.org/',
  'https://oauth.telegram.org/auth',
  'https://www.snapchat.com/web/54b2f875-b86c-5f80-bd5c-c61df287fc91',
  'https://web.snapchat.com/',
  'https://snapchat.com/',
  'https://accounts.snapchat.com/accounts/login',
];

const blockedUrls = [
  'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
  'https://www.google.com/search?q=test',
  'https://facebook.com/videos/12345',
  'https://instagram.com/reels/12345',
  'https://x.com/user/status/12345',
  'https://twitter.com/',
  'https://github.com/facebook/react',
  'https://vimeo.com/12345678',
  'https://tiktok.com/@user/video/12345',
  'https://netflix.com/watch/123',
  'chrome://extensions/',
  'about:blank',
];

for (const url of allowedUrls) {
  if (!isSupportedDomain(url)) {
    throw new Error(`FAIL: Allowed URL was blocked: ${url}`);
  }
}
console.log(`Passed: All ${allowedUrls.length} Telegram & Snapchat URLs correctly permitted.`);

for (const url of blockedUrls) {
  if (isSupportedDomain(url)) {
    throw new Error(`FAIL: Blocked URL was permitted: ${url}`);
  }
}
console.log(`Passed: All ${blockedUrls.length} other websites correctly blocked.`);

console.log('=== ALL DOMAIN RESTRICTION TESTS PASSED! ===');
