import type { NextConfig } from 'next';
import { STATIC_SECURITY_HEADERS } from './src/lib/security-headers';

const nextConfig: NextConfig = {
  reactStrictMode: true,

  // 不要在回應裡宣傳自己用什麼框架 —— 減少攻擊者的情報。
  poweredByHeader: false,

  // 正式環境不輸出 source map，避免原始碼與內部路徑外洩。
  productionBrowserSourceMaps: false,

  // 卡圖自 2026-09-12 起由本站代管，頁面不再載入任何外部圖片。
  // 白名單清空 = Next.js 的圖片最佳化端點不能被拿來代理任何外部網址。
  images: {
    remotePatterns: [],
  },

  /*
   * 舊網址整站永久轉到自己的網域（308），路徑與 ?lang= 等參數原樣保留。
   *
   * 網域買下來之前（2026-09-15），本站只能用 Vercel 配給的子網域，
   * 那個網址已經出現在分享出去的牌組連結與書籤裡，所以不能讓它失效。
   * 308 而非 307：告訴搜尋引擎「搬家了」，排名會轉到新網址，不會兩邊搶。
   *
   * 只轉正式站的舊網址。每次 PR 的預覽網址刻意不轉 —— 那是合併前驗收用的。
   * 寫在這裡而不是 middleware：這裡連 robots.txt、卡圖等靜態檔也會一起轉。
   *
   * 網址直接寫死而不 import src/lib/site.ts：Next.js 讀設定檔時
   * 多 import 一個本地檔案就會找不到模組而建置失敗（2026-09-18 實測）。
   * 兩邊有沒有一致，由 tests/e2e/security.spec.ts 的轉址測試把關。
   */
  async redirects() {
    return [
      {
        source: '/:path*',
        has: [{ type: 'host', value: 'riftbound-tw-sigma.vercel.app' }],
        destination: 'https://www.ashvigil.com/:path*',
        permanent: true,
      },
    ];
  },

  async headers() {
    return [
      {
        // 套用到每一個路徑（包含靜態檔案）。
        source: '/:path*',
        headers: [...STATIC_SECURITY_HEADERS],
      },
    ];
  },
};

export default nextConfig;
