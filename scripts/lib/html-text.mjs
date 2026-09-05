/**
 * 從遠端 HTML 取純文字的共用工具。
 *
 * 抽出來成為獨立模組是為了**能被測試**：fetch-errata.mjs 是一支
 * 匯入就會執行 main() 的腳本，測試檔一 import 就會發網路請求。
 *
 * 這裡的三個函式都是資安相關的 —— CodeQL 在原本的寫法上抓到兩個真問題
 *（重複解碼、剝標籤不完整），詳見各自的註解。
 */

/**
 * 允許出現在勘誤文字裡的字元。
 *
 * 這是資安防線，跟 card-text-parser 同一個原則：**與其事後消毒，
 * 不如一開始就不讓奇怪的東西進到專案裡**。這些文字最後會直接渲染給使用者，
 * 出現角括號就代表頁面結構跟我們以為的不一樣，寧可中斷也不要猜。
 */
export function assertPlainText(value, where) {
  if (/[<>]/.test(value)) throw new Error(`${where} 含有角括號，可能混進了標籤：${value}`);
  if (value.length === 0 || value.length > 1200) throw new Error(`${where} 長度不合理：${value.length}`);
}

/**
 * 把標籤拿掉。
 *
 * ⚠️ **要重複做到不再變化為止。**
 *
 * 第一版只做一次 `replace(/<[^>]+>/g, '')`。那擋不住巢狀寫法：
 * `<scr<script>ipt>` 掃一次之後**反而變成** `<script>`。
 * CodeQL 標成 js/incomplete-multi-character-sanitization，判斷是對的。
 *
 * 這裡做到穩定為止，呼叫端再用 assertPlainText 確認真的沒有角括號了 ——
 * 剝不乾淨就讓建置失敗，不猜。
 */
export function stripTags(value) {
  let out = value;
  for (;;) {
    const next = out.replace(/<[^<>]*>/g, '');
    if (next === out) return next;
    out = next;
  }
}

/**
 * 把 HTML 實體還原成文字。
 *
 * ⚠️ **一定要一次掃完，不能一個一個 replace 串起來。**
 *
 * 第一版是串起來寫的，而且 `&amp; → &` 排在最前面。這會**重複解碼**：
 * 輸入 `&amp;lt;` 先變成 `&lt;`，後面那一步再把它變成 `<` ——
 * 等於幫攻擊者把跳脫過的角括號還原回來。CodeQL 把這個標成
 * js/double-escaping，判斷是對的。
 *
 * 改成單次掃描：每個實體只會被換一次，換出來的結果不會再被後面的規則處理。
 */
const ENTITIES = {
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&apos;': String.fromCharCode(39),
  '&nbsp;': ' ',
  '&rsquo;': String.fromCharCode(8217),
  '&lsquo;': String.fromCharCode(8216),
  '&mdash;': String.fromCharCode(8212),
  '&ndash;': String.fromCharCode(8211),
};

export function decodeEntities(s) {
  return s.replace(/&(?:#(\d+)|#[xX]([0-9a-fA-F]+)|[a-zA-Z]+);/g, (whole, dec, hex) => {
    if (dec !== undefined) return String.fromCodePoint(Number(dec));
    if (hex !== undefined) return String.fromCodePoint(parseInt(hex, 16));
    return ENTITIES[whole.toLowerCase()] ?? whole;
  });
}
