/**
 * 關鍵字辭典的搜尋邏輯。
 *
 * 刻意抽成純函式而不是寫在元件裡，原因是「可測試性」：
 * 端對端測試沒辦法可靠地測中文搜尋 —— Playwright 的逐字輸入打不出中文
 * （需要輸入法），而 fill() 在 WebKit 上又不會觸發 React 的 onChange。
 * 把邏輯放在這裡，就能用單元測試把三種語言都測到，
 * 端對端測試則專心驗證「畫面有沒有正確反應」。
 */

import { CARD_FACE_TW, KEYWORD_LABELS } from './labels';
import { KEYWORDS, type Keyword, type Taxonomy } from './types';

/**
 * 依關鍵字搜尋。
 *
 * 比對範圍涵蓋三種語言的名稱與官方說明，因此打「壁壘」「壁垒」或「Tank」
 * 都能找到同一個關鍵字。
 */
export function filterKeywords(
  keywords: Taxonomy['keywords'],
  query: string,
): readonly Keyword[] {
  const q = query.trim().toLowerCase();
  if (q === '') return KEYWORDS;

  return KEYWORDS.filter((name) => {
    const entry = keywords[name];
    /*
     * 卡面上印的字也要找得到。
     *
     * 繁中實體卡的用語是官方簡中逐字轉繁，跟官方繁中規則書不一樣 ——
     * 卡面印「壁壘」，規則書寫「坦克」。玩家是看著手上的卡打字的，
     * 只認規則書用語等於讓他搜不到自己手上那張卡（見 labels.ts 的 CARD_FACE_TW）。
     */
    const haystack = [
      name,
      KEYWORD_LABELS[name]['zh-TW'],
      KEYWORD_LABELS[name]['zh-CN'],
      CARD_FACE_TW[name] ?? '',
      entry?.en ?? '',
      entry?.cn ?? '',
      entry?.tw ?? '',
    ]
      .join(' ')
      .toLowerCase();
    return haystack.includes(q);
  });
}
