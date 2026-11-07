import { defineConfig } from 'wxt';

// See https://wxt.dev/api/config.html
export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  manifest: {
    name: 'Video Downloader (Web & Telegram)',
    description: 'Detects and downloads progressive videos, streams, and blobs from Telegram Web and other websites with one click.',
    version: '1.0.0',
    permissions: [
      'downloads',
      'activeTab',
      'storage',
      'scripting'
    ],
    host_permissions: [
      '*://web.telegram.org/*',
      '*://*/*'
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
