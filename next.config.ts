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
