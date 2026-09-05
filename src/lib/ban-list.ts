/**
 * 官方禁卡表。
 *
 * ── 這份資料跟站上其他資料不一樣，請先讀完再改 ──────────────────
 *
 * 卡牌資料是從官方 API 抓的，官方改了我們重跑腳本就同步。
 * **禁卡表沒有 API** —— 這是實際查過的，不是猜的：把官方卡表全部 1189 筆抓下來，
 * 逐欄比對禁用卡與正常卡，除了卡號、圖片、繪師之外沒有任何差異，整份資料裡
 * 也找不到 banned / legality / restricted 之類的欄位。官方是把「BANNED」印章
 * 直接**烙在卡圖的 PNG 像素裡**，程式讀不到。
 *
 * 所以人工維護是唯一選項。這是全站第一份
 * 「會過期而且不會自己更新」的資料 —— 介面上一定要標出依據的版本日期，
 * 讓使用者自己判斷可不可信，而不是給一個看起來永遠正確的答案。
 *
 * ── 為什麼不直接用卡名比對 ──────────────────────────────────────
 *
 * 因為官方禁卡表上的卡名寫法**並不精確**。實際查證的結果：
 *
 *   官方寫「Dreaming Tree」            → 卡片實際叫「The Dreaming Tree」
 *   官方寫「The Arena's Greatest」      → 這張又有 The（所以不是統一規則）
 *   官方寫「Master Yi, Wuju Bladesman」→ 卡片實際叫「Wuju Bladesman - Starter」
 *   官方寫「Draven, Vanquisher」        → 同一份表的 2v2 區段寫成「Draven Vanquisher」
 *
 * 照字面比對會漏掉 The Dreaming Tree —— 那是一張確實在我們卡池裡的禁用戰場。
 * 但改用模糊比對更糟：**禁錯卡比漏掉還嚴重**，使用者會刪掉一張其實能用的卡。
 *
 * 所以這裡採取第三種做法：把官方原文與我們卡池的正式卡名**分成兩個欄位人工對應**，
 * 再用測試把對應關係釘死（見 tests/unit/ban-list.test.ts）。任何一邊改了名字，
 * 測試會馬上紅燈，而不是靜靜地失效。
 */

import type { Card } from './types';

/** 禁卡表的版本，介面上會標示，方便使用者自行對照官方公告。 */
export const BAN_LIST_VERSION = {
  document: 'Riftbound Banned Lists（官方英文版）',
  updated: '2026-07-16',
  url: 'https://playriftbound.com/en-us/rules-hub/',
};

/**
 * 賽制。
 *
 * 本站的牌組編輯器是 **1v1 構築**（核心規則 485），所以只有 `constructed`
 * 會觸發合法性提醒。2v2 的禁卡表另外多禁一張傳奇，這裡一併收錄是為了
 * 讓圖鑑能誠實標示 —— 但**不能**把 2v2 的限制套到 1v1 的牌組上。
 *
 * 官方在公告裡特別說明過，被 2v2 禁掉的那張傳奇在 1v1 的表現是合理的。
 */
export type BanFormat = 'constructed' | 'constructed-2v2';

export type BanEntry = {
  /** 官方禁卡表上的原文，照抄不修改 —— 使用者要拿這個字去對官方公告。 */
  official: string;
  /**
   * 我們卡池裡的正式卡名。
   * `null` = 這張卡屬於我們還沒收錄的系列（目前只收錄 Origins）。
   */
  name: string | null;
  /** 這張卡所屬系列，用來說明為什麼我們沒有它。 */
  set: string;
  /** 在哪些賽制被禁。 */
  formats: readonly BanFormat[];
};

const BOTH: readonly BanFormat[] = ['constructed', 'constructed-2v2'];

/**
 * 依據 2026-07-16 版官方禁卡表。
 *
 * `name` 欄位每一筆都實際查證過對得到卡片（或確認不在我們收錄的系列裡），
 * 沒有一筆是照著官方字面抄的。
 */
export const BAN_LIST: readonly BanEntry[] = [
  // ── 構築賽禁用卡片 ──
  { official: 'Called Shot', name: null, set: 'SFD', formats: BOTH },
  { official: 'Draven, Vanquisher', name: null, set: 'SFD', formats: BOTH },
  { official: 'Fight or Flight', name: 'Fight or Flight', set: 'OGN', formats: BOTH },
  { official: 'Scrapheap', name: 'Scrapheap', set: 'OGN', formats: BOTH },
  { official: 'Stealthy Pursuer', name: 'Stealthy Pursuer', set: 'OGN', formats: BOTH },

  // ── 構築賽禁用戰場 ──
  { official: "The Arena's Greatest", name: "The Arena's Greatest", set: 'OGN', formats: BOTH },
  { official: "Aspirant's Climb", name: "Aspirant's Climb", set: 'OGN', formats: BOTH },
  // 官方寫「Dreaming Tree」，少了開頭的 The —— 這一筆正是不能照字面比對的原因
  { official: 'Dreaming Tree', name: 'The Dreaming Tree', set: 'OGN', formats: BOTH },
  { official: 'Obelisk of Power', name: 'Obelisk of Power', set: 'OGN', formats: BOTH },
  { official: "Reaver's Row", name: "Reaver's Row", set: 'OGN', formats: BOTH },

  // ── 只有 2v2 禁用的傳奇 ──
  // 官方卡表全系列都查不到「Master Yi, Wuju Bladesman」這個名字；
  // 試煉場（OGS）的這張傳奇 tag 是 Master Yi，就是官方公告指的那張。
  {
    official: 'Master Yi, Wuju Bladesman',
    name: 'Wuju Bladesman - Starter',
    set: 'OGS',
    formats: ['constructed-2v2'],
  },
];

/**
 * 這張卡在指定賽制是否被禁；有的話回傳那一筆資料（介面要顯示官方原文）。
 *
 * 用**卡名**比對而不是卡號：禁卡表是針對卡名的，所以異畫版、不同卡號的
 * 同一張卡一樣被禁，用卡名比對才會自動涵蓋到。
 */
export function bannedEntryFor(card: Card, format: BanFormat = 'constructed'): BanEntry | null {
  for (const entry of BAN_LIST) {
    if (entry.name === card.name && entry.formats.includes(format)) return entry;
  }
  return null;
}

/** 這張卡在任一賽制被禁 —— 圖鑑用這個決定要不要掛標籤。 */
export function banEntriesFor(card: Card): BanEntry[] {
  return BAN_LIST.filter((e) => e.name === card.name);
}

/**
 * 一組卡片裡有哪些在指定賽制被禁 —— 同名只回報一次。
 *
 * 牌組編輯器與復盤盤面都需要這個判斷，抽出來共用；
 * 兩邊各寫一份的話，遲早會有一邊漏掉某個區域（備牌是最容易漏的）。
 */
export function bannedAmong(
  cards: readonly Card[],
  format: BanFormat = 'constructed',
): { card: Card; entry: BanEntry }[] {
  const seen = new Set<string>();
  const out: { card: Card; entry: BanEntry }[] = [];
  for (const card of cards) {
    if (seen.has(card.name)) continue;
    const entry = bannedEntryFor(card, format);
    if (!entry) continue;
    seen.add(card.name);
    out.push({ card, entry });
  }
  return out;
}
