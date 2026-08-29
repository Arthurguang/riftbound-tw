import { NextResponse, type NextRequest } from 'next/server';
import { buildCsp } from '@/lib/security-headers';
import { isArtLang, isTextLang } from '@/lib/i18n';

/**
 * 每一次頁面請求都產生一個一次性的隨機 nonce，寫進 Content-Security-Policy。
 *
 * 為什麼要每次都換：只有帶著「這次請求的 nonce」的腳本才會被瀏覽器執行。
 * 攻擊者無法事先猜到 nonce，所以就算真的有辦法把一段 <script> 注入頁面，
 * 那段腳本也不會執行。
 *
 * Next.js 會偵測請求標頭裡的 CSP nonce，自動貼到它產生的 script 標籤上，
 * 我們不需要手動處理框架自己的腳本。
 */
export function middleware(request: NextRequest) {
  const nonce = crypto.randomUUID().replaceAll('-', '');

  // 部署在 Vercel 之類的平台時，實際協定寫在 x-forwarded-proto。
  const isSecure =
    (request.headers.get('x-forwarded-proto') ?? request.nextUrl.protocol.replace(':', '')) ===
    'https';

  const csp = buildCsp(nonce, process.env.NODE_ENV !== 'production', isSecure);

  // 讓 Next.js 在伺服器端渲染時讀得到 nonce。
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-nonce', nonce);
  requestHeaders.set('Content-Security-Policy', csp);

  /*
   * 語言設定放在網址（?lang=&art=），但 layout 讀不到網址參數，
   * 所以在這裡先驗證過再用標頭傳進去。
   *
   * 驗證這一步不能省：網址是使用者可以任意編造的輸入，
   * 而 lang 會直接變成 <html lang="..."> 的屬性值。
   */
  const lang = request.nextUrl.searchParams.get('lang') ?? '';
  const art = request.nextUrl.searchParams.get('art') ?? '';
  if (isTextLang(lang)) requestHeaders.set('x-text-lang', lang);
  if (isArtLang(art)) requestHeaders.set('x-art-lang', art);

  const response = NextResponse.next({ request: { headers: requestHeaders } });

  // 真正送給瀏覽器的那一份。
  response.headers.set('Content-Security-Policy', csp);

  /*
   * HTML 內含當次請求的 nonce，因此絕對不能被快取後重複發給其他人 ——
   * 否則第二個人拿到的 nonce 會與他自己的 CSP 標頭對不上，整頁腳本都會被擋。
   * （靜態資源不受影響：它們不在這個 middleware 的 matcher 範圍內。）
   */
  response.headers.set('Cache-Control', 'no-store, must-revalidate');

  return response;
}

export const config = {
  matcher: [
    /*
     * 套用到所有頁面請求，但排除：
     *   _next/static  — 建置產物（已由 next.config.ts 的 headers() 保護）
     *   _next/image   — 圖片最佳化端點
     *   favicon 等根目錄靜態檔
     * 另外排除預取（prefetch）請求，避免瀏覽器拿到與實際頁面不同的 nonce。
     */
    {
      source: '/((?!_next/static|_next/image|favicon.ico|robots.txt|glyphs/).*)',
      missing: [
        { type: 'header', key: 'next-router-prefetch' },
        { type: 'header', key: 'purpose', value: 'prefetch' },
      ],
    },
  ],
};
