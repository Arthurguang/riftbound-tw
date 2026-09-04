/**
 * 在同一個分頁裡記住「你正在編的東西」。
 *
 * ── 為什麼需要這個 ──────────────────────────────────────────────
 * 牌組與盤面都編在網址裡（?d= / ?b=），所以複製網址就能分享 ——
 * 這是本站不需要資料庫的關鍵。但導覽列的連結是乾淨的 `/replay`、`/deck`，
 * 所以跑去看圖鑑再回來，網址上的狀態就沒了。
 *
 * 使用者的原話：「切換到其他功能再回到復盤時，剛剛擺好的內容都不見了。」
 *
 * ── 為什麼用 sessionStorage 而不是 localStorage ─────────────────
 * sessionStorage 只活在**這個分頁**：在站內來回切換會留著，關掉分頁就清掉。
 *
 * localStorage 會留到下次開瀏覽器 —— 那反而嚇人：你三天後打開網站，
 * 看到一個早就忘了的盤面，還以為系統壞了。要長期保存的正確做法是
 * 複製網址，那本來就是這個站的分享機制。
 *
 * ── 存進去的東西是不可信輸入 ────────────────────────────────────
 * 使用者可以用開發者工具改寫 sessionStorage，所以讀回來的字串
 * **必須跟網址參數走同一套驗證**（decodeBoard / decodeDeck 會逐項比對
 * 真實卡片）。這裡只負責存取字串，不做任何解讀。
 */

const PREFIX = 'riftbound:session:';

/**
 * 記住某個頁面的編碼狀態。
 *
 * 傳入空字串代表「回到初始狀態」，這時直接把記錄清掉 ——
 * 留著一個空狀態沒有意義，而且會讓下次進來時多做一次無謂的還原。
 */
export function rememberState(key: string, code: string): void {
  if (typeof window === 'undefined') return;
  try {
    if (code === '') window.sessionStorage.removeItem(PREFIX + key);
    else window.sessionStorage.setItem(PREFIX + key, code);
  } catch {
    // 隱私瀏覽模式或關閉儲存的瀏覽器 —— 不能存就算了，功能照常運作
  }
}

/**
 * 取回某個頁面上次的編碼狀態。
 *
 * 讀不到就回傳空字串，呼叫端會當成「沒有先前的狀態」。
 * 任何失敗（沒有資料、瀏覽器禁用儲存）都走這條路，不讓頁面壞掉。
 */
export function recallState(key: string): string {
  if (typeof window === 'undefined') return '';
  try {
    return window.sessionStorage.getItem(PREFIX + key) ?? '';
  } catch {
    return '';
  }
}
