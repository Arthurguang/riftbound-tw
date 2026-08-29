import { defineConfig, devices } from '@playwright/test';

/**
 * 端對端測試設定。
 *
 * 一律以「正式版建置」啟動伺服器測試 —— 因為開發模式的 CSP 是放寬過的，
 * 只有正式版才代表使用者實際會拿到的安全設定。
 */
const PORT = 3100;
const baseURL = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',

  use: {
    baseURL,
    trace: 'on-first-retry',
  },

  /*
   * 三種瀏覽器引擎都要跑。
   *
   * 我們的資安保證有一部分是「相信瀏覽器有正確實作 CSP 規格」——
   * 與其相信，不如三個引擎都實測：
   *   Chromium → Chrome / Edge / Opera / 大部分 Android 瀏覽器
   *   Firefox  → Gecko 引擎
   *   WebKit   → Safari（macOS 與所有 iOS 瀏覽器）
   */
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },

    /*
     * Firefox 預設只在 CI（Linux）上跑。
     *
     * 原因：Playwright 內附的 Firefox 在部分 Windows 環境無法啟動
     * （回報 "side-by-side configuration is incorrect"，缺的是它自己的
     *   mozglue 組件清單，與本專案無關）。
     * 讓本機的測試因為這個而永遠是紅的，只會讓人開始忽略測試結果。
     *
     * CI 上一定會跑，所以 Gecko 引擎的 CSP 行為仍然有被驗證。
     * 本機若要一起跑：ALL_BROWSERS=1 npx playwright test
     */
    ...(process.env.CI || process.env.ALL_BROWSERS
      ? [{ name: 'firefox', use: { ...devices['Desktop Firefox'] } }]
      : []),
  ],

  webServer: {
    command: `npx next start -p ${PORT}`,
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
