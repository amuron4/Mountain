import { defineConfig, devices } from '@playwright/test';

// 事前インストール済み Chromium を使う環境では CHROMIUM_PATH を指定（例: /opt/pw-browsers/chromium）
const executablePath = process.env.CHROMIUM_PATH || undefined;

export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:4173/',
    locale: 'ja-JP',
    timezoneId: 'Asia/Tokyo',
    launchOptions: { executablePath },
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: 'npm run build && npm run preview',
    url: 'http://localhost:4173/',
    reuseExistingServer: true,
    timeout: 120_000,
  },
  projects: [
    {
      name: 'mobile',
      // iPhone 相当の画面幅（Chromium で実行）
      use: { ...devices['iPhone 13'], defaultBrowserType: 'chromium' },
    },
  ],
});
