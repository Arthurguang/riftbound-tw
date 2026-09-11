/*
 * Trusted Types 的 default 政策 —— 只放行「本站自己的程式分割檔」。
 *
 * ── 為什麼需要 ──────────────────────────────────────────────────
 * 本站的 CSP 有 require-trusted-types-for 'script'：任何把字串塞進
 * script.src、innerHTML 這類危險位置的動作，瀏覽器都直接拒絕。
 *
 * 但 Next.js 16 在站內換頁時，會用 script.src = '/_next/static/…js'
 * 載入下一頁的程式，也被一起擋掉。Next 只好退回「整頁重新載入」——
 * 慢，而且在 Safari 核心的瀏覽器上有時候乾脆換不過去。
 *
 * ── 這個政策做什麼、不做什麼 ────────────────────────────────────
 * 只定義 createScriptURL，而且只接受：
 *   · 同一個網域
 *   · 路徑在 /_next/static/ 底下
 *   · 副檔名是 .js
 * 其他一律丟出錯誤。
 *
 * 刻意「不」定義 createHTML 與 createScript ——
 * 所以 innerHTML、eval 類的寫入仍然全部被拒絕，那才是 XSS 最常見的途徑。
 *
 * 放行的範圍也沒有比 CSP 原本更寬：script-src 的 'strict-dynamic' 本來就
 * 允許本站程式載入自己的分割檔。這裡只是把同一件事告訴 Trusted Types。
 *
 * CSP 另外加上 `trusted-types default`：頁面上只能存在這一個名叫 default 的
 * 政策，而且不能重複建立 —— 就算有人設法執行了程式，也無法再造一個寬鬆的政策。
 *
 * ── 為什麼是獨立檔案 ────────────────────────────────────────────
 * 它必須在 Next.js 的程式之前就位，所以由 layout 以一般 <script src> 載入
 * （帶當次的 nonce）。不能寫成行內腳本 —— 那需要 dangerouslySetInnerHTML，
 * 本站禁用。也不能用 next/script：它自己就是用 script.src 動態插入的。
 */
(function () {
  'use strict';

  if (typeof window === 'undefined' || !window.trustedTypes || !window.trustedTypes.createPolicy) {
    // 不支援 Trusted Types 的瀏覽器本來就不會擋，什麼都不用做。
    return;
  }

  var STATIC_PREFIX = '/_next/static/';

  window.trustedTypes.createPolicy('default', {
    createScriptURL: function (input) {
      var raw = String(input);
      var url = new URL(raw, window.location.href);
      var sameOrigin = url.origin === window.location.origin;
      var isStaticChunk = url.pathname.indexOf(STATIC_PREFIX) === 0 && /\.js$/.test(url.pathname);

      if (sameOrigin && isStaticChunk && url.username === '' && url.password === '') {
        /*
         * 檢查用解析後的網址，但回傳「原本那個字串」，一個字都不改。
         *
         * Next.js 的載入器是用自己寫進去的那串路徑（例如 /_next/static/chunks/x.js）
         * 去認「哪一支已經載好了」。若這裡改回傳完整網址（http://…/_next/…），
         * 對不上，換頁後的畫面就會永遠停在「載入中…」—— 而且不會有任何錯誤。
         *
         * 回傳原字串是安全的：瀏覽器載入時用的解析規則，跟上面檢查時用的完全相同。
         */
        return raw;
      }
      throw new TypeError('Trusted Types：拒絕載入非本站程式檔 ' + url.origin + url.pathname);
    },
  });
})();
