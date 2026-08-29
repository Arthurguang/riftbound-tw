import type { NextConfig } from 'next';
import { STATIC_SECURITY_HEADERS } from './src/lib/security-headers';

const nextConfig: NextConfig = {
  reactStrictMode: true,

  // 不要在回應裡宣傳自己用什麼框架 —— 減少攻擊者的情報。
  poweredByHeader: false,

  // 正式環境不輸出 source map，避免原始碼與內部路徑外洩。
  productionBrowserSourceMaps: false,

  // 卡圖只允許來自 Riot 官方 CDN。
  // 這裡限制的是 Next.js 圖片最佳化能代理的來源，等於多一道白名單。
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'cmsassets.rgpub.io', pathname: '/sanity/images/**' },
    ],
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
