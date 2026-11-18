export default defineBackground(() => {
  console.log('[VideoDownloader] Background service worker initialized.');

  // Handle messages from content script or popup
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'UPDATE_VIDEO_COUNT') {
      const tabId = sender.tab?.id;
      const count = message.payload?.count || 0;

      if (tabId) {
        chrome.action.setBadgeText({
          tabId,
          text: count > 0 ? String(count) : '',
        });
        chrome.action.setBadgeBackgroundColor({
          tabId,
          color: '#0088cc', // Modern Telegram/cyan blue badge
        });
      }
      sendResponse({ success: true });
      return false;
    }

    return false;
  });

  // Clean up badge when tab is updated or refreshed
  chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
    if (changeInfo.status === 'loading') {
      chrome.action.setBadgeText({ tabId, text: '' });
    }
  });
});

