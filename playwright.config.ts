import { defineConfig, devices } from '@playwright/test';

/**
 * 端對端測試設定。
 *
 * 一律以「正式版建置」啟動伺服器測試 —— 因為開發模式的 CSP 是放寬過的，
 * 只有正式版才代表使用者實際會拿到的安全設定。
 */
const PORT = 3100;

/*
 * 預設測本機的正式版建置。
 * 設定 E2E_BASE_URL 就會改測已部署的線上網站 ——
 * 有些防護（HSTS、upgrade-insecure-requests）只有在真實的 HTTPS 上才會生效，
 * 因此上線後至少要對正式網址跑一次。
 *
 *   E2E_BASE_URL=https://你的網址 npx playwright test
 */
const baseURL = process.env.E2E_BASE_URL ?? `http://localhost:${PORT}`;
const usingDeployedSite = Boolean(process.env.E2E_BASE_URL);

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,

  /*
   * 限制並行的 worker 數量。
   *
   * 這台機器有 24 核，Playwright 預設會開 12 個 worker —— 但**伺服器只有一個**，
   * 而且 next start 是單執行緒的。12 個瀏覽器同時要求頁面掛載，伺服器就開始排隊，
   * 於是偶發紅燈：每次落在不同測試上，單獨重跑又一定過（實測 6 次全過，每次 3.7 秒）。
   *
   * 先前把 expect 逾時放寬到 15 秒只治標 —— 排隊夠久照樣會超過。
   * 真正的瓶頸是那一個伺服器行程，所以要限制的是需求端。
   *
   * 6 個 worker 是實測出來的：總時間從 1.4 分變成 2.0 分，慢了四成，
   * 但完整套件連跑三次全綠。多花 36 秒換掉「每次都要猜這次紅燈是不是真的」，
   * 這筆交易很划算 —— 會說謊的測試比慢的測試貴得多。
   */
  workers: 6,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',

  /*
   * 斷言的等待時間放寬到 15 秒（預設 5 秒）。
   *
   * 三種引擎同時打**同一台** Next.js 伺服器，負載高的時候連
   * 「頁面掛載完成」都可能超過五秒 —— 那不是應用程式慢，是測試環境擠。
   * 先前偶發的紅燈每次落在不同測試上，正是這個特徵（不是某一條壞掉）。
   *
   * 放寬的是**耐心**，不是條件：每一條斷言檢查的東西完全沒有變。
   */
  expect: { timeout: 15_000 },

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

  // 測線上網站時不需要在本機啟動伺服器。
  ...(usingDeployedSite
    ? {}
    : {
        webServer: {
          command: `npx next start -p ${PORT}`,
          url: baseURL,
          /*
           * 一律自己起一台新的，不重用既有的伺服器。
           *
           * 曾經兩次因為前一輪留下的伺服器還在跑舊的建置產物，
           * 測試對著過期的程式碼跑，結果整批紅燈、花很久才查到原因。
           * 埠被佔用時 Playwright 會直接報錯，那比安靜地測到舊版本好得多。
           */
          reuseExistingServer: false,
          timeout: 120_000,
        },
      }),
});
