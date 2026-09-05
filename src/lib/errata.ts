/**
 * 官方勘誤表。
 *
 * ── 這是什麼、為什麼重要 ────────────────────────────────────────
 *
 * 官方對已印出的卡片發過勘誤，並明說**勘誤文字取代印刷文字，你永遠是照
 * 更新後的文字在玩**。所以這不是補充資料，是現行規則。
 *
 * 對台灣玩家特別重要的兩點：
 *
 *   1. 官方卡牌 API 的文字**新舊混雜**。實測 Kinkou Monk、Ravenborn Tome
 *      已經是勘誤後的，但 Salvage、Sigil of the Storm、Void Gate 還是勘誤前的 ——
 *      也就是說，光靠 API，本站的圖鑑對某些卡就是在顯示過時文字。
 *   2. 官方明說勘誤**不會**印在後續再版或**在地化版本**上。
 *      繁中卡上不會有這些更正。
 *
 * ── 資料從哪來 ──────────────────────────────────────────────────
 *
 * scripts/fetch-errata.mjs 從官方頁面抓取後嚴格解析，對不到卡片就中止。
 * 不是手打的 —— 31 張卡、每張新舊兩段規則文字，手打必然出錯。
 */

import data from '@/data/errata.json';
import zh from '@/data/errata-zh.json';
import type { Card } from './types';

export type ErrataEntry = {
  /** 官方頁面上的卡名，照抄不修改。 */
  official: string;
  /** 我們卡池裡的正式卡名。 */
  name: string;
  /** 勘誤後的官方文字 —— 這是現在實際生效的文字。 */
  updated: string;
  /** 卡片上印的原始文字。 */
  printed: string;
  /** 官方附註，例如「只有英文版的文字不同」。沒有就是 null。 */
  note: string | null;
};

export const ERRATA_VERSION = {
  document: data.document,
  published: data.published,
  url: data.source,
};

export const ERRATA: readonly ErrataEntry[] = data.entries;

/** 用卡名查勘誤 —— 勘誤是針對卡名的，所以異畫版一樣適用。 */
export function errataFor(card: Card): ErrataEntry | null {
  return ERRATA.find((e) => e.name === card.name) ?? null;
}

/**
 * 這筆勘誤是不是「只有英文版的文字不同」。
 *
 * 官方在少數幾張卡上註明了這件事。對只看繁中卡的使用者來說，
 * 那幾張其實不受影響 —— 不講清楚會讓人白擔心。
 */
export function isEnglishOnly(entry: ErrataEntry): boolean {
  return entry.note !== null && entry.note.toLowerCase().includes('english');
}

/**
 * 社群整理的中文參考翻譯。
 *
 * ── 為什麼跟官方資料分開放 ──────────────────────────────────────
 *
 * errata.json 是抓取腳本的產物，每次重跑整個覆蓋。翻譯寫進去會被沖掉，
 * 所以放在另一個手動維護的檔案。
 *
 * ── 為什麼一開始不做、現在做 ────────────────────────────────────
 *
 * 原本刻意不翻，理由是「自己翻等於發明一段看起來很官方的敘述」。
 * 那個顧慮沒有消失 —— 解法不是不翻，是**講清楚這不是官方的**：
 * 介面上明確標示為社群整理，而且把「官方繁中根本沒有出現過的詞」單獨列出來。
 *
 * 用詞一律沿用官方繁中卡面既有的譯法（放逐／回收／摧毀／召回／增益／征服……），
 * 那些是從卡牌資料裡實際比對出來的，不是憑印象。
 */

export const ZH_TRANSLATOR: string = zh.translator;

/** 官方繁中沒出現過、由我們自訂的詞 —— 介面上要讓使用者知道。 */
export const ZH_COINED_TERMS: readonly { en: string; zh: string; why: string }[] =
  zh.coinedTerms;

const ZH_ENTRIES = zh.entries as Record<string, string | undefined>;

/** 某張卡的勘誤中文參考翻譯；沒有就回 null。 */
export function errataZh(entry: ErrataEntry): string | null {
  return ZH_ENTRIES[entry.name] ?? null;
}

/** 這段翻譯裡有沒有用到自訂詞 —— 有的話介面要一併說明。 */
export function coinedTermsIn(text: string): typeof ZH_COINED_TERMS {
  return ZH_COINED_TERMS.filter((term) => text.includes(term.zh));
}
