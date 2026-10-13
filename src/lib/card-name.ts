/**
 * 卡名的組法。
 *
 * ── 為什麼獨立一個檔案 ──────────────────────────────────────────
 * 禁卡表、勘誤表這些**瀏覽器端**也會用到的模組需要這個函式，
 * 但它們不需要整份卡牌資料。放在 cards.ts（開頭就 import 了 3 MB 的 JSON）
 * 會把整包資料拖進客戶端程式。純函式就該放在沒有資料相依的檔案裡。
 */

import type { Card } from './types';

/**
 * 一張卡在牌表、禁卡表、勘誤表上的完整英文名。
 *
 * 官方英文資料把名字拆成兩半，而且**兩種卡拆法不一樣**：
 *
 *   傳奇      name 只有稱號（Daughter of the Void），英雄名在 tags（["Kai'Sa"]）
 *   英雄單位  name 是英雄名（Annie），稱號在 subtitle（Fiery）
 *
 * 但外面（官方禁卡表、勘誤頁、其他社群工具）寫的都是合起來的
 * 「Kai'Sa, Daughter of the Void」「Annie, Fiery」——
 * 繁中資料本來就是合的（凱莎-虛空之女），只有英文是拆的。
 *
 * 這個差異先前害我們匯出的牌表貼到別的社群工具時，**傳奇那一行會被判成
 * 找不到卡**。所以匯出與匯入共用這一個函式，兩邊的規則不會走鐘。
 *
 * ⚠️ 2026-10-13 收錄六個系列後這件事更嚴重：全卡池有 145 個 `name` 被多張
 * 不同的卡共用（六張阿璃、五張德萊文…）。只比對 `name` 會**對到錯的卡**，
 * 禁卡表誤判、匯入拿到別張卡 —— 一律改用這個完整名稱。
 */
export function fullCardName(card: Card): string {
  if (card.types.includes('legend')) {
    const champion = card.championTag;
    if (!champion) return card.name;
    /*
     * 已經合併好的就別再合一次 —— 官方資料不是每個系列都拆開存。
     * 少了這一行會變成「Draven, Draven, Vanquisher」。
     */
    if (card.name.startsWith(`${champion},`)) return card.name;
    return `${champion}, ${card.name}`;
  }
  return card.subtitle === null ? card.name : `${card.name}, ${card.subtitle}`;
}

/**
 * 這張卡在外部文件上可能被寫成的各種名字。
 *
 * 實際見過的三種寫法（以試煉場的安妮傳奇為例）：
 *
 *   Annie, Dark Child   牌表、其他社群工具（英雄名＋稱號）
 *   Dark Child, Starter 官方勘誤頁（稱號＋副標；傳奇的副標是區分用的短名）
 *   Dark Child          規則討論裡常常只寫稱號
 *
 * ⚠️ 這是**寬鬆**比對用的，只適合「找一張卡給使用者看」的場合
 *（貼牌表匯入）：只寫「Ahri」的話卡池裡有六張符合，呼叫端要自己決定挑哪一張。
 *
 * 禁卡與勘誤**不可以**用這個比對 —— 套到錯的卡比漏掉還嚴重。
 * 那兩份資料的卡名在建置階段就已經解析成唯一的完整名稱
 *（見 scripts/fetch-errata.mjs 與 src/lib/ban-list.ts），執行期只比 fullCardName。
 */
export function cardNameAliases(card: Card): string[] {
  const names = new Set<string>([fullCardName(card), card.name]);
  if (card.subtitle !== null) names.add(`${card.name}, ${card.subtitle}`);
  return [...names];
}
