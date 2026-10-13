/**
 * 傳奇清單與英雄／區域標籤的辨認 —— 只在伺服器端使用。
 *
 * 會讀卡牌資料，所以**不要從客戶端元件 import 這個檔案**
 * （原因見 runeterra-core.ts 開頭）。
 *
 * ── 為什麼還留著區域標籤 ────────────────────────────────────────
 * 首頁的「區域地圖」已經拿掉（使用者回饋：玩家幾乎都是用領域顏色找卡，
 * 用區域找卡實用性不足）。但卡片的標籤裡同時混著英雄名與區域名，
 * 要分辨「哪一個是英雄」仍然需要這份區域清單。
 *
 * 傳奇卡上顯示的區域，刻意只用「卡片上真的帶有這個區域標籤的英雄卡」，
 * 不憑世界觀記憶補 —— 例如達瑞斯在設定上是諾克薩斯人，但他的卡沒有標諾克薩斯，就不顯示。
 */

import { TAXONOMY } from './cards';
import type { TextLang } from './i18n';
import { SET_IDS, type Card } from './types';
import { playDomains } from './runeterra-core';

/** 卡牌資料裡的區域標籤，一字不差。 */
export const REGION_TAGS: ReadonlySet<string> = new Set([
  'Ionia',
  'Bilgewater',
  'Noxus',
  'Zaun',
  'Mount Targon',
  'Freljord',
  'Demacia',
  'Bandle City',
  'Shadow Isles',
  'Piltover',
  'The Void',
  'Shurima',
  'Ixtal',
]);

/** 標籤的顯示名稱（英文介面直接用標籤本身）。 */
export function tagLabel(tag: string, lang: TextLang): string {
  if (lang === 'en') return tag;
  const label = TAXONOMY.tagLabels[tag];
  if (!label) return tag;
  return lang === 'zh-TW' ? label.tw : label.cn;
}

/**
 * 同一張卡的異畫版、超框版在資料裡是不同的紀錄，而且不一定有 variant 標記。
 * 以卡名去重，才不會把同一張卡算兩次。
 */
function uniqueByName(cards: readonly Card[]): Card[] {
  const seen = new Set<string>();
  const out: Card[] = [];
  for (const card of [...cards].sort((a, b) => a.number - b.number)) {
    if (seen.has(card.name)) continue;
    seen.add(card.name);
    out.push(card);
  }
  return out;
}

/**
 * 所有傳奇，每位一張（同名的異畫版只算一次）。
 *
 * **數量不寫死**：新系列加入傳奇時，首頁自動跟著變。
 * 排列：依系列的官方順序（SET_IDS，起源在最前），同系列依卡號。
 *
 * 2026-10-13：原本只分「起源／其他」兩段，收錄四個新系列後
 * 其他四個系列會在清單裡交錯排列，所以改用 SET_IDS 的完整順序。
 */
export function allLegends(cards: readonly Card[]): Card[] {
  const setOrder = (card: Card) => SET_IDS.indexOf(card.set);
  return uniqueByName(
    cards.filter((c) => c.types.includes('legend') && playDomains(c).length === 2),
  ).sort((a, b) => setOrder(a) - setOrder(b) || a.number - b.number);
}

/**
 * 一張英雄相關卡上的英雄標籤。
 *
 * 2026-10-13 改用建置階段標好的 championTag。
 * 原本是「排除區域標籤後剩下的第一個」，但新系列的傳奇同時帶種族標籤
 *（["Yordle","Ziggs"]），那個算法會挑到「Yordle」—— 首頁會把希格斯寫成約德爾人。
 */
export function championTagOf(card: Card): string | null {
  return card.championTag;
}

/** 英雄卡上標的區域；卡上沒標就回 null，不憑世界觀猜。 */
export function regionOfChampion(cards: readonly Card[], champion: string): string | null {
  for (const card of cards) {
    if (card.subtype !== 'champion' || !card.tags.includes(champion)) continue;
    const region = card.tags.find((t) => REGION_TAGS.has(t));
    if (region) return region;
  }
  return null;
}