/**
 * Test script for 0 KB media filter rules
 */

function isVideoZeroKb(vid) {
  const isZeroKb =
    Boolean(vid.isZeroKb) ||
    vid.sizeBytes === 0 ||
    (vid.fileSize &&
      (vid.fileSize === '0 B' ||
        vid.fileSize === '0 KB' ||
        vid.fileSize.startsWith('0 B') ||
        vid.fileSize.startsWith('0 KB'))) ||
    (vid.videoWidth === 0 && vid.videoHeight === 0 && (!vid.duration || vid.duration === 0));
  return Boolean(isZeroKb);
}

function isImageZeroKb(img) {
  const isZeroKb =
    Boolean(img.isZeroKb) ||
    img.sizeBytes === 0 ||
    (img.fileSize &&
      (img.fileSize === '0 B' ||
        img.fileSize === '0 KB' ||
        img.fileSize.startsWith('0 B') ||
        img.fileSize.startsWith('0 KB'))) ||
    (img.videoWidth === 0 && img.videoHeight === 0);
  return Boolean(isZeroKb);
}

console.log('=== Running 0 KB Media Filter Tests ===');

// 1. Empty dummy video element (0x0, 0s duration)
const dummyVideo = { videoWidth: 0, videoHeight: 0, duration: 0 };
if (!isVideoZeroKb(dummyVideo)) throw new Error('Dummy video should be 0 KB');
console.log('Test 1 Passed: Dummy video recognized as 0 KB');

// 2. Video with probed 0 bytes
const zeroByteVideo = { videoWidth: 1280, videoHeight: 720, duration: 10, sizeBytes: 0, fileSize: '0 B' };
if (!isVideoZeroKb(zeroByteVideo)) throw new Error('Zero-byte video should be 0 KB');
console.log('Test 2 Passed: 0-byte video recognized as 0 KB');

// 3. Normal playable video
const normalVideo = { videoWidth: 1920, videoHeight: 1080, duration: 45, sizeBytes: 15400000, fileSize: '14.7 MB' };
if (isVideoZeroKb(normalVideo)) throw new Error('Normal video should NOT be 0 KB');
console.log('Test 3 Passed: Playable video allowed');

// 4. 0x0 / 0 KB tracking pixel image
const trackingPixel = { videoWidth: 0, videoHeight: 0, sizeBytes: 0, fileSize: '0 B' };
if (!isImageZeroKb(trackingPixel)) throw new Error('Tracking pixel should be 0 KB');
console.log('Test 4 Passed: Tracking pixel recognized as 0 KB');

// 5. Normal photo
const normalImage = { videoWidth: 1080, videoHeight: 1350, sizeBytes: 450000, fileSize: '439 KB' };
if (isImageZeroKb(normalImage)) throw new Error('Normal image should NOT be 0 KB');
console.log('Test 5 Passed: Normal photo allowed');

console.log('=== ALL 0 KB FILTER TESTS PASSED SUCCESSFULLY! ===');
