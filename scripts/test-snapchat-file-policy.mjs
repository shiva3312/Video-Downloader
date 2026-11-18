console.log('=== Running Snapchat File Sharing Policy Tests ===');

// 1. Test video filtering on Snapchat Web
const mockFiles = [
  { name: 'snap_video.mp4', type: 'video/mp4' },
  { name: 'camera.webm', type: 'video/webm' },
  { name: 'photo.jpg', type: 'image/jpeg' },
  { name: 'screenshot.png', type: 'image/png' },
];

const snapchatAllowedImages = mockFiles.filter((f) => {
  const isVideo = f.type.startsWith('video/') || /\.(mp4|webm|mkv|mov|avi)$/i.test(f.name);
  return !isVideo;
});

if (snapchatAllowedImages.length !== 2) {
  throw new Error(`Test 1 Failed: Expected 2 images, got ${snapchatAllowedImages.length}`);
}
console.log('Test 1 Passed: Video files strictly filtered out for Snapchat Web chat injection.');

// 2. Test format support check according to Snapchat Help Article 18591239085204
const snapchatSupportedMimes = new Set(['image/png', 'image/jpeg', 'image/jpg', 'image/gif']);

function isSnapchatSupported(mime) {
  return snapchatSupportedMimes.has(mime);
}

if (!isSnapchatSupported('image/png') || !isSnapchatSupported('image/jpeg') || !isSnapchatSupported('image/gif')) {
  throw new Error('Test 2 Failed: Valid Snapchat formats failed check');
}
if (isSnapchatSupported('video/mp4') || isSnapchatSupported('video/webm') || isSnapchatSupported('image/webp')) {
  throw new Error('Test 2 Failed: Unsupported formats were permitted');
}
console.log('Test 2 Passed: Compliant with Snapchat Help Article 18591239085204 (PNG, JPG, GIF only).');

console.log('=== ALL SNAPCHAT FILE POLICY TESTS PASSED! ===');
