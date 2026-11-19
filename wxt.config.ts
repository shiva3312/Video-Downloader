import { defineConfig } from 'wxt';

// See https://wxt.dev/api/config.html
export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  manifest: {
    name: 'Video Downloader (Telegram & Snapchat)',
    description: 'Detects and downloads progressive videos, streams, and blobs exclusively from Telegram Web and Snapchat Web with private encrypted vault storage.',
    version: '1.0.1',
    permissions: [
      'activeTab',
      'sidePanel',
      'unlimitedStorage'
    ],
    host_permissions: [
      '*://*/*',
      '<all_urls>'
    ],
    action: {
      default_title: 'Video Downloader',
      default_icon: {
        '16': 'icon/icon-16.png',
        '48': 'icon/icon-48.png',
        '128': 'icon/icon-128.png'
      }
    },
    icons: {
      '16': 'icon/icon-16.png',
      '48': 'icon/icon-48.png',
      '128': 'icon/icon-128.png'
    }
  }
});
