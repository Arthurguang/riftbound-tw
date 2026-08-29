/**
 * 全站安全標頭的單一事實來源。
 *
 * middleware.ts 負責套用 Content-Security-Policy（需要每次請求產生的 nonce），
 * next.config.ts 負責套用其餘的靜態標頭。
 * 測試 tests/security-headers.test.ts 會直接讀這裡的定義來斷言實際回應，
 * 所以「設定」與「驗證」不會各說各話。
 */

/**
 * 官方卡圖 CDN —— 唯二允許的外部圖片來源。
 *   EN    Riot Games 全球官方
 *   zh-CN 中國大陸官方發行商（Riot Games × 闪魂）
 * 兩者都是官方來源；本站不引用任何第三方站台的圖片。
 */
export const IMAGE_CDN = 'https://cmsassets.rgpub.io';
export const IMAGE_CDN_CN = 'https://cdn.playloltcg.com';

/**
 * 不需要 nonce 的靜態安全標頭。
 *
 * 對照組：playriftbound.com 官網只有 HSTS、nosniff、Referrer-Policy 三項，
 * 而且沒有 CSP。下面每一項都是刻意加上去的。
 */
export const STATIC_SECURITY_HEADERS: ReadonlyArray<{ key: string; value: string }> = [
  // 強制瀏覽器往後兩年只用 HTTPS 連線本站（含子網域）。
  {
    key: 'Strict-Transport-Security',
    value: 'max-age=63072000; includeSubDomains; preload',
  },
  // 禁止瀏覽器「猜測」檔案型別（防止把圖片當成腳本執行）。
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  // 舊瀏覽器的防點擊劫持；新瀏覽器由 CSP 的 frame-ancestors 負責。
  { key: 'X-Frame-Options', value: 'DENY' },
  // 跨站導覽時只送出網域，不洩漏使用者看過哪張卡。
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  // 明確關閉所有本站用不到的瀏覽器功能。
  {
    key: 'Permissions-Policy',
    value: [
      'accelerometer=()',
      'camera=()',
      'display-capture=()',
      'geolocation=()',
      'gyroscope=()',
      'magnetometer=()',
      'microphone=()',
      'midi=()',
      'payment=()',
      'usb=()',
    ].join(', '),
  },
  // 把本站放進獨立的瀏覽情境，避免被其他分頁透過 window.opener 干擾。
  { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
  // 禁止其他網站把本站資源當成子資源載入。
  { key: 'Cross-Origin-Resource-Policy', value: 'same-origin' },
  // 不要讓瀏覽器預先解析頁面上外部連結的 DNS。
  { key: 'X-DNS-Prefetch-Control', value: 'off' },
];

/**
 * 產生 Content-Security-Policy。
 *
 * @param nonce  本次請求的一次性隨機值，Next.js 會自動貼到它產生的 script 標籤上
 * @param isDev  開發模式。Next.js 的熱重載需要 eval 與 inline style，
 *               因此開發時會放寬——但**正式環境永遠是嚴格版本**。
 */
export function buildCsp(nonce: string, isDev: boolean, isSecure = true): string {
  const directives: Record<string, string[]> = {
    /*
     * 預設「全部禁止」，下面逐項開放。
     *
     * 用 'none' 而不是 'self' 的差別在未來：CSP 規格日後新增資源類型時，
     * 'self' 會自動放行同網域的那種資源，'none' 則會擋下來，
     * 逼我們明確決定要不要開。這就是 Mozilla Observatory 所謂的
     * 「deny by default」。
     *
     * 前提是每一種資源類型都要有自己的指令，否則會退回 default-src 而被擋。
     * 下面十一項已經涵蓋所有會退回 default-src 的類型；
     * script-src-elem / style-src-elem 等細分指令則會退回各自的 script-src /
     * style-src，不受影響。
     */
    'default-src': ["'none'"],

    // 只有帶著本次 nonce 的腳本能執行。'strict-dynamic' 讓 Next.js 由這些
    // 腳本動態載入的 chunk 也被信任，同時讓網域白名單失效——
    // 也就是說，就算未來不小心加了寬鬆的網域，也無法被拿來繞過。
    'script-src': isDev
      ? ["'self'", `'nonce-${nonce}'`, "'unsafe-eval'", "'unsafe-inline'"]
      : ["'self'", `'nonce-${nonce}'`, "'strict-dynamic'"],

    // 正式環境的樣式一律是自家網域上的 .css 檔。
    'style-src': isDev ? ["'self'", "'unsafe-inline'"] : ["'self'", `'nonce-${nonce}'`],

    // 卡圖來自 Riot 官方 CDN；符號圖示則放在自己網域。
    'img-src': ["'self'", IMAGE_CDN, IMAGE_CDN_CN, 'data:'],

    'font-src': ["'self'"],

    // 開發時要允許熱重載用的 WebSocket。
    'connect-src': isDev ? ["'self'", 'ws:', 'wss:'] : ["'self'"],

    'manifest-src': ["'self'"],

    // 本站不需要以下任何一種能力，全部封死。
    'object-src': ["'none'"],
    'frame-src': ["'none'"],
    'worker-src': ["'self'"],
    'media-src': ["'none'"],

    // 禁止本站被任何頁面用 iframe 嵌入（防點擊劫持）。
    'frame-ancestors': ["'none'"],
    // 禁止用注入的 <base> 標籤改寫所有相對網址。
    'base-uri': ["'none'"],
    // 本站沒有任何表單，因此禁止任何表單送出目標。
    'form-action': ["'none'"],

    /*
     * Trusted Types：強制任何寫入 DOM 的危險操作（innerHTML 之類）
     * 都必須先經過一個明確定義的檢查函式，否則瀏覽器直接拒絕。
     * 本站的程式碼本來就沒有用那些寫法（scripts/check-forbidden-apis.mjs
     * 會擋），這一條是額外的保險，防的是「未來不小心引入」。
     */
    'require-trusted-types-for': ["'script'"],
  };

  const policy = Object.entries(directives)
    .map(([name, values]) => `${name} ${values.join(' ')}`)
    .join('; ');

  /*
   * upgrade-insecure-requests：把頁面上所有 http 子資源自動改用 https 載入。
   *
   * 只在「這次連線本身就是 https」時才送出。原因是：
   * 若在 http://localhost 上送這條，Safari／WebKit 會把 localhost 的
   * CSS 與 JS 也升級成 https，然後因為本機沒有憑證而全部載入失敗
   * （Chromium 對 localhost 有豁免，WebKit 沒有）。
   *
   * 正式環境一律是 https，所以這條仍然會生效 —— 這不是放寬安全性，
   * 而是讓這條規則只出現在它有意義的地方。
   */
  return isSecure && !isDev ? `${policy}; upgrade-insecure-requests` : policy;
}
