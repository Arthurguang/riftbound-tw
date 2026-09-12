/**
 * 記住圖鑑捲到哪裡，從卡片詳細頁回來時捲回原位。
 *
 * 使用者回報：捲到很下面、點進一張卡、按「回到卡牌圖鑑」，結果跳回最上面，
 * 又要重新捲一次找剛才看到哪。翻 376 張卡時這件事會不斷發生。
 *
 * 做法是點卡片的當下把位置存進 sessionStorage，圖鑑掛載時取出用掉。
 * 為什麼不是靠瀏覽器的上一頁：「回到卡牌圖鑑」是一個連結（前往新頁面），
 * 不是上一頁，瀏覽器不會還原捲動位置。
 *
 * 用 sessionStorage 而非 localStorage：這是「這次瀏覽」的狀態，
 * 關掉分頁就該忘記，不該留在使用者的電腦裡。
 */

const KEY = 'rb-gallery-scroll';

/** 離開圖鑑去看某張卡之前，記下目前位置。 */
export function rememberGalleryScroll(): void {
  try {
    window.sessionStorage.setItem(KEY, String(Math.round(window.scrollY)));
  } catch {
    // 無痕模式或瀏覽器擋住儲存時存不了，不影響瀏覽
  }
}

/**
 * 取出上次記下的位置，並清掉。
 *
 * 只能用一次 —— 從頁首點「卡牌圖鑑」進來是全新的瀏覽，不該把人丟到半路。
 */
export function consumeGalleryScroll(): number | null {
  try {
    const raw = window.sessionStorage.getItem(KEY);
    if (raw === null) return null;
    window.sessionStorage.removeItem(KEY);
    const value = Number(raw);
    return Number.isFinite(value) && value > 0 ? value : null;
  } catch {
    return null;
  }
}
