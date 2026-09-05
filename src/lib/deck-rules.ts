/**
 * 牌組構築規則與合法性檢查。
 *
 * ── 資料來源 ────────────────────────────────────────────────────
 * 每一條規則都標註了官方《符文戰場》核心規則的條號
 * （官方簡中版，2026-07-17 更新，取自 playloltcg.com 官方規則 API）。
 *
 * 這件事很重要：先前寫關鍵字說明時憑印象寫了十五條，其中五條是錯的。
 * 遊戲規則寫錯不會有人發現 —— 玩家只會照著錯的檢查去組牌。
 * 所以這裡每一條都能追溯到官方原文。
 *
 * ── 查證過程中發現社群資料的兩處錯誤 ──────────────────────────
 *
 *   主牌組  社群普遍寫「恰好 40 張」，官方是「含**至少** 40 張」（103.2）
 *           照社群版做的話，玩家組 42 張會被我們誤判為違規。
 *
 *   戰場    社群寫「固定 3 張」，官方是「數量取決於遊戲模式」（103.4.a）；
 *           1v1 模式為每人帶 3 張、實際只用 1 張（485.4.a）。
 */

import type { Card, Domain } from './types';
import { BAN_LIST_VERSION, bannedEntryFor } from './ban-list';
import type { TextLang } from './i18n';

/** 官方核心規則的版本，介面上會標示，方便日後對照。 */
export const RULES_VERSION = {
  document: '《符文戰場》核心規則（官方簡中版）',
  updated: '2026-07-17',
  url: 'https://cdn.playloltcg.com/lol/2026/07/2026-07-23/6f47b6ebe57341a5bb5f4bed5548d051.pdf',
};

/**
 * 賽事規則是**另一份文件**，條號體系也不同（4xx、6xx）。
 * 它會在核心規則之上再加限制，例如主牌組必須「恰好」40 張。
 * 引用時務必標明是哪一份，否則使用者查不到。
 */
export const TOURNAMENT_RULES_VERSION = {
  document: 'Riftbound Tournament Rules（官方英文版）',
  updated: '2026-07-16',
  url: 'https://cmsassets.rgpub.io/sanity/files/dsfx7636/news_live/503da65669ced10598d62925a6f6bc15111af726.pdf',
};

/**
 * 賽事構築的額外限制。
 *
 * 這些**不是**核心規則，只在正式賽事適用。因此檢查結果標為「提醒」而非「錯誤」——
 * 隨便跟朋友玩不受這些限制。
 */
export const TOURNAMENT_REQUIREMENTS = {
  /** 601.1.b　賽事中主牌組必須「恰好」40 張（核心規則只說「至少」） */
  mainDeckExact: 40,
  /** 601.1.c.1　備牌上限 10 張（是上限，不是固定張數） */
  sideboardMax: 10,
  /** 402.1　恰好 3 張戰場，且**每張名稱都不同** */
  battlefieldCount: 3,
} as const;

/**
 * 1v1 模式的構築需求（官方核心規則 485：1v1 決鬥 / 486：1v1 比賽）。
 *
 * 之所以把數字集中在這裡而不是散落在檢查邏輯裡：日後官方調整或要支援
 * 其他遊戲模式時，只要改這一處。
 */
export const DECK_REQUIREMENTS = {
  /** 主牌組最少張數（103.2）。注意是「至少」，不是「恰好」。 */
  mainDeckMin: 40,
  /** 同名卡上限，含選定英雄（103.2.b、103.2.b.1）。 */
  copiesPerName: 3,
  /** 專屬卡在整副牌組中的總數上限（103.2.d.1）。 */
  signatureTotal: 3,
  /** 符文牌組張數（103.3.a）。 */
  runeDeckSize: 12,
  /** 1v1 模式每人要帶的戰場數（485.4.a）。 */
  battlefieldCount: 3,
} as const;

// ─── 牌組資料結構 ────────────────────────────────────────────────

export type Deck = {
  /** 傳奇卡 id。未選為 null。 */
  legendId: string | null;
  /** 選定英雄的卡 id。未選為 null。它同時也是主牌組的一張。 */
  championId: string | null;
  /** 主牌組：卡片 id → 張數（含選定英雄）。 */
  main: Record<string, number>;
  /** 符文牌組：卡片 id → 張數。 */
  runes: Record<string, number>;
  /** 戰場：卡片 id → 張數（同名只能 1 張，所以實際上都是 1）。 */
  battlefields: Record<string, number>;
  /**
   * 備牌：卡片 id → 張數。
   *
   * 只有賽事才有備牌（賽事規則 403.1「某些賽事」）。上限 10 張（601.1.c.1），
   * 而且**同名卡上限是主牌組與備牌合計**（601.1.c.3、403.3）——
   * 這是最容易忽略的一條。
   */
  sideboard: Record<string, number>;
};

export const EMPTY_DECK: Deck = {
  legendId: null,
  championId: null,
  main: {},
  runes: {},
  battlefields: {},
  sideboard: {},
};

/** 一張卡該放進牌組的哪一區。 */
export type DeckZone = 'legend' | 'main' | 'runes' | 'battlefields';

export function zoneForCard(card: Card): DeckZone | null {
  if (card.subtype === 'token') return null; // 指示物不是可放進牌組的卡
  if (card.types.includes('legend')) return 'legend';
  if (card.types.includes('rune')) return 'runes';
  if (card.types.includes('battlefield')) return 'battlefields';
  return 'main';
}

export const totalCards = (zone: Record<string, number>): number =>
  Object.values(zone).reduce((sum, n) => sum + n, 0);

/**
 * 整副牌組實際需要的張數（卡片 id → 張數）。
 *
 * 用來算「還缺哪些牌」，也用在匯出。
 *
 * 注意**不能**把 championId 另外加一張：選定英雄本來就是主牌組的一張
 * （核心規則 103.2），加了會變成需要兩張，缺卡清單就會多算。
 */
export function deckNeeds(deck: Deck): Record<string, number> {
  const needs: Record<string, number> = {};
  const add = (id: string, qty: number) => {
    if (qty > 0) needs[id] = (needs[id] ?? 0) + qty;
  };

  if (deck.legendId) add(deck.legendId, 1);
  // 備牌也要實際擁有，所以缺卡計算要含進去
  for (const zone of [deck.main, deck.runes, deck.battlefields, deck.sideboard]) {
    for (const [id, qty] of Object.entries(zone)) add(id, qty);
  }
  return needs;
}

// ─── 符文特性（領域）檢查 ────────────────────────────────────────

/**
 * 一張卡的特性是否符合傳奇的特性。
 *
 * 官方規則 103.1.b.3　只有一種特性 → 只能加入特性與之相同的卡組
 * 官方規則 103.1.b.4　擁有多種特性 → 只能加入「所有特性都符合」的卡組
 *
 * 沒有特性的卡（我們資料裡標為 colorless）不受這條限制 ——
 * 規則 134.1 說「大多數卡牌擁有一個或多個特性」，
 * 135.2.e.6.b 提到「如果卡牌沒有特性⋯」，可見那是合法狀態。
 *
 * 注意這是「子集」而不是「有交集」：一張熾烈＋靈光的卡，
 * 只有熾烈靈光的傳奇能用；熾烈混沌的傳奇**不能**用。
 */
export function matchesIdentity(card: Card, legendDomains: readonly Domain[]): boolean {
  const traits = card.domains.filter((d) => d !== 'colorless');
  if (traits.length === 0) return true;
  return traits.every((d) => legendDomains.includes(d));
}

// ─── 合法性檢查 ──────────────────────────────────────────────────

export type Severity = 'error' | 'warning';

export type LegalityIssue = {
  severity: Severity;
  /** 官方規則條號，讓使用者能自行查證。 */
  rule: string;
  message: Record<TextLang, string>;
};

export type LegalityResult = {
  legal: boolean;
  issues: LegalityIssue[];
  counts: {
    main: number;
    runes: number;
    battlefields: number;
    sideboard: number;
    signatures: number;
  };
};

const msg = (tw: string, cn: string, en: string): Record<TextLang, string> => ({
  'zh-TW': tw,
  'zh-CN': cn,
  en,
});

/**
 * 檢查牌組是否符合 1v1 構築規則。
 *
 * 設計原則：**只檢查我們能從官方規則明確推導的事**。
 *
 * ── 禁卡表：原本不查，後來改成要查 ──────────────────────────────
 *
 * 這裡原本寫著「禁卡表不在這裡檢查，寧可不擋，也不要讓玩家以為通過檢查
 * 就一定合法」。那個判斷被一件事推翻了：把本站匯出的牌表貼到別的社群工具，
 * 對方的驗證器跳出「'Aspirant's Climb' is banned in Standard Constructed」——
 * **而那副牌是本站判定為合法組出來的**。
 *
 * 也就是說「不擋」並沒有比較保守，它只是把錯誤留給使用者在賽場上發現。
 *
 * 所以改成要查，但用「提醒」而不是「錯誤」，理由跟賽事構築限制一樣：
 * 禁卡表只在正式賽事適用，隨便跟朋友玩不受限制。
 * 介面上會一併標示禁卡表的版本日期（BAN_LIST_VERSION）—— 這份資料沒有 API，
 * 不會自己更新，使用者有權知道它可能過期。
 */
export function checkLegality(deck: Deck, cardsById: Map<string, Card>): LegalityResult {
  const issues: LegalityIssue[] = [];
  const get = (id: string) => cardsById.get(id);

  const legend = deck.legendId ? get(deck.legendId) : undefined;
  const mainCount = totalCards(deck.main);
  const runeCount = totalCards(deck.runes);
  const battlefieldCount = totalCards(deck.battlefields);

  // 專屬卡總數（103.2.d.1）——跨所有區域計算
  const sideboardCount = totalCards(deck.sideboard);
  const allEntries = [
    ...Object.entries(deck.main),
    ...Object.entries(deck.runes),
    ...Object.entries(deck.battlefields),
    ...Object.entries(deck.sideboard),
  ];
  const signatureCount = allEntries.reduce(
    (sum, [id, qty]) => sum + (get(id)?.subtype === 'signature' ? qty : 0),
    0,
  );

  // ── 傳奇（103.1）──
  if (!legend) {
    issues.push({
      severity: 'error',
      rule: '103.1',
      message: msg('尚未選擇傳奇卡。', '尚未选择传奇卡。', 'No Legend selected.'),
    });
  }

  // ── 主牌組張數（103.2）——「至少」40 張 ──
  if (mainCount < DECK_REQUIREMENTS.mainDeckMin) {
    const short = DECK_REQUIREMENTS.mainDeckMin - mainCount;
    issues.push({
      severity: 'error',
      rule: '103.2',
      message: msg(
        `主牌組至少需要 ${DECK_REQUIREMENTS.mainDeckMin} 張，目前 ${mainCount} 張，還缺 ${short} 張。`,
        `主牌堆至少需要 ${DECK_REQUIREMENTS.mainDeckMin} 张，目前 ${mainCount} 张，还缺 ${short} 张。`,
        `Main deck needs at least ${DECK_REQUIREMENTS.mainDeckMin} cards; you have ${mainCount} (${short} short).`,
      ),
    });
  }

  /*
   * ── 選定英雄（103.2.a）──
   *
   * 官方規則確實要求指定一張選定英雄：
   *   103.2　　　主牌堆包含「一張選定英雄單位」
   *   103.2.a.1　遊戲開始時置於英雄區域
   *   402.1　　　賽事：40 張「including a chosen champion」
   *
   * 但這裡刻意標成「提醒」而不是「錯誤」，是使用者的選擇 ——
   * 邊組牌邊被紅字擋著很煩，而且隨意玩的時候沒人在意這條。
   * 訊息裡保留條號並寫明官方要求，這樣要帶去賽事的人不會被誤導。
   *
   * 另外：還沒選傳奇時不顯示這條。沒有傳奇就無從指定英雄（103.2.a.2
   * 要求標籤一致），那時候提醒只是噪音。
   */
  const champion = deck.championId ? get(deck.championId) : undefined;
  if (!champion) {
    if (legend) {
      issues.push({
        severity: 'warning',
        rule: '103.2.a',
        message: msg(
          '尚未指定選定英雄。官方規則要求主牌組包含一張選定英雄，正式賽事會檢查這一項。',
          '尚未指定选定英雄。官方规则要求主牌堆包含一张选定英雄，正式赛事会检查这一项。',
          'No Chosen Champion selected. The official rules require one in your main deck, and tournaments check for it.',
        ),
      });
    }
  } else {
    if (champion.subtype !== 'champion') {
      issues.push({
        severity: 'error',
        rule: '103.2.a.2',
        message: msg(
          `選定英雄必須是英雄單位，「${champion.name}」不是。`,
          `选定英雄必须是英雄单位，「${champion.name}」不是。`,
          `The Chosen Champion must be a Champion Unit; "${champion.name}" is not.`,
        ),
      });
    }
    if (legend) {
      // 英雄標籤必須一致：傳奇的標籤要出現在英雄的標籤裡
      const shared = champion.tags.filter((tag) => legend.tags.includes(tag));
      if (shared.length === 0) {
        issues.push({
          severity: 'error',
          rule: '103.2.a.2',
          message: msg(
            `選定英雄的英雄標籤必須與傳奇一致。「${champion.name}」與「${legend.name}」沒有共同標籤。`,
            `选定英雄的英雄标签必须与传奇一致。「${champion.name}」与「${legend.name}」没有共同标签。`,
            `The Chosen Champion must share a champion tag with your Legend. "${champion.name}" and "${legend.name}" share none.`,
          ),
        });
      }
    }
    if (!deck.main[champion.id]) {
      issues.push({
        severity: 'error',
        rule: '103.2',
        message: msg(
          '選定英雄也算主牌組的一張，請把它加進主牌組。',
          '选定英雄也算主牌堆的一张，请把它加进主牌堆。',
          'The Chosen Champion counts as one of your main deck cards — add it to the main deck.',
        ),
      });
    }
  }

  // ── 同名卡上限（103.2.b）──
  // 官方是以「卡名」計算，不是以卡片 id —— 同一張卡的不同版本（異畫）同名。
  //
  // 有備牌時，上限是**主牌組與備牌合計**（賽事規則 601.1.c.3、403.3）。
  // 這是最容易被忽略的一條：主牌組 3 張、備牌再放 1 張就超了。
  const byName = new Map<string, number>();
  for (const [id, qty] of [...Object.entries(deck.main), ...Object.entries(deck.sideboard)]) {
    const card = get(id);
    if (!card) continue;
    byName.set(card.name, (byName.get(card.name) ?? 0) + qty);
  }
  for (const [name, qty] of byName) {
    if (qty > DECK_REQUIREMENTS.copiesPerName) {
      issues.push({
        severity: 'error',
        rule: '103.2.b',
        message: msg(
          `「${name}」有 ${qty} 張，同名卡最多 ${DECK_REQUIREMENTS.copiesPerName} 張（含選定英雄與備牌）。`,
          `「${name}」有 ${qty} 张，同名卡最多 ${DECK_REQUIREMENTS.copiesPerName} 张（含选定英雄与备牌）。`,
          `"${name}" appears ${qty} times; the limit is ${DECK_REQUIREMENTS.copiesPerName} per name (including your Chosen Champion and sideboard).`,
        ),
      });
    }
  }

  // ── 專屬卡總數（103.2.d）──
  if (signatureCount > DECK_REQUIREMENTS.signatureTotal) {
    issues.push({
      severity: 'error',
      rule: '103.2.d.1',
      message: msg(
        `專屬卡共 ${signatureCount} 張，整副牌組最多 ${DECK_REQUIREMENTS.signatureTotal} 張。`,
        `专属卡共 ${signatureCount} 张，整副卡组最多 ${DECK_REQUIREMENTS.signatureTotal} 张。`,
        `You have ${signatureCount} Signature cards; the limit is ${DECK_REQUIREMENTS.signatureTotal} in total.`,
      ),
    });
  }
  if (legend) {
    for (const [id, qty] of allEntries) {
      const card = get(id);
      if (!card || card.subtype !== 'signature' || qty === 0) continue;
      if (card.tags.filter((tag) => legend.tags.includes(tag)).length === 0) {
        issues.push({
          severity: 'error',
          rule: '103.2.d.2',
          message: msg(
            `專屬卡「${card.name}」的英雄標籤與傳奇「${legend.name}」不符。`,
            `专属卡「${card.name}」的英雄标签与传奇「${legend.name}」不符。`,
            `Signature card "${card.name}" does not share a champion tag with "${legend.name}".`,
          ),
        });
      }
    }
  }

  // ── 符文牌組（103.3.a）——恰好 12 張 ──
  if (runeCount !== DECK_REQUIREMENTS.runeDeckSize) {
    issues.push({
      severity: 'error',
      rule: '103.3.a',
      message: msg(
        `符文牌組需要剛好 ${DECK_REQUIREMENTS.runeDeckSize} 張，目前 ${runeCount} 張。`,
        `符文牌堆需要刚好 ${DECK_REQUIREMENTS.runeDeckSize} 张，目前 ${runeCount} 张。`,
        `The rune deck must contain exactly ${DECK_REQUIREMENTS.runeDeckSize} cards; you have ${runeCount}.`,
      ),
    });
  }

  // ── 戰場（485.4.a、103.4.c）──
  if (battlefieldCount !== DECK_REQUIREMENTS.battlefieldCount) {
    issues.push({
      severity: 'error',
      rule: '485.4.a',
      message: msg(
        `1v1 模式需要 ${DECK_REQUIREMENTS.battlefieldCount} 張戰場，目前 ${battlefieldCount} 張。`,
        `1v1 模式需要 ${DECK_REQUIREMENTS.battlefieldCount} 张战场，目前 ${battlefieldCount} 张。`,
        `1v1 requires ${DECK_REQUIREMENTS.battlefieldCount} battlefields; you have ${battlefieldCount}.`,
      ),
    });
  }
  for (const [id, qty] of Object.entries(deck.battlefields)) {
    if (qty > 1) {
      const card = get(id);
      issues.push({
        severity: 'error',
        rule: '103.4.c',
        message: msg(
          `戰場「${card?.name ?? id}」有 ${qty} 張，同名戰場只能 1 張。`,
          `战场「${card?.name ?? id}」有 ${qty} 张，同名战场只能 1 张。`,
          `Battlefield "${card?.name ?? id}" appears ${qty} times; only one of each name is allowed.`,
        ),
      });
    }
  }

  // ── 符文特性（103.1.b）──
  if (legend) {
    for (const [id, qty] of allEntries) {
      const card = get(id);
      if (!card || qty === 0) continue;
      if (!matchesIdentity(card, legend.domains)) {
        issues.push({
          severity: 'error',
          rule: '103.1.b',
          message: msg(
            `「${card.name}」的特性不符合傳奇「${legend.name}」的符文特性。`,
            `「${card.name}」的特性不符合传奇「${legend.name}」的符文特性。`,
            `"${card.name}" does not match the rune identity of "${legend.name}".`,
          ),
        });
      }
    }
  }

  // ── 賽事禁卡表 ──
  //
  // 用卡名比對（禁卡表針對的是卡名，異畫版一樣被禁）。
  // 只查 1v1 構築的表 —— 2v2 另外多禁一張傳奇，那不適用於這裡。
  {
    const flagged = new Set<string>();
    for (const [id, qty] of allEntries) {
      if (qty <= 0) continue;
      const card = get(id);
      if (!card || flagged.has(card.name)) continue;
      const ban = bannedEntryFor(card, 'constructed');
      if (!ban) continue;
      flagged.add(card.name);
      issues.push({
        severity: 'warning',
        rule: `禁卡表 ${BAN_LIST_VERSION.updated}`,
        message: msg(
          `「${card.name}」在正式賽事的構築賽制被禁用（官方列為「${ban.official}」）。`,
          `「${card.name}」在正式赛事的构筑赛制被禁用（官方列为「${ban.official}」）。`,
          `"${card.name}" is banned in sanctioned Constructed play (listed officially as "${ban.official}").`,
        ),
      });
    }
  }

  // ── 備牌（賽事規則 403、601.1.c）──
  //
  // 備牌只有正式賽事才有（403.1「某些賽事」），所以這裡的問題一律是「提醒」，
  // 隨便跟朋友玩不受限制。
  if (sideboardCount > TOURNAMENT_REQUIREMENTS.sideboardMax) {
    issues.push({
      severity: 'warning',
      rule: '601.1.c.1',
      message: msg(
        `備牌 ${sideboardCount} 張，賽事上限是 ${TOURNAMENT_REQUIREMENTS.sideboardMax} 張。`,
        `备牌 ${sideboardCount} 张，赛事上限是 ${TOURNAMENT_REQUIREMENTS.sideboardMax} 张。`,
        `Sideboard has ${sideboardCount} cards; the tournament limit is ${TOURNAMENT_REQUIREMENTS.sideboardMax}.`,
      ),
    });
  }

  // 601.1.c.2　備牌只能放「主牌組放得下」的卡
  for (const [id, qty] of Object.entries(deck.sideboard)) {
    if (qty <= 0) continue;
    const card = get(id);
    if (!card) continue;
    if (zoneForCard(card) !== 'main') {
      issues.push({
        severity: 'warning',
        rule: '601.1.c.2',
        message: msg(
          `備牌只能放主牌組的卡，「${card.name}」不是。`,
          `备牌只能放主牌堆的卡，「${card.name}」不是。`,
          `A sideboard may only contain valid Main Deck cards; "${card.name}" is not one.`,
        ),
      });
    }
  }

  // ── 賽事構築：主牌組必須「恰好」40 張（601.1.b）──
  //
  // 核心規則 103.2 只說「至少」40 張，賽事規則在其上加嚴。
  // 兩者都是對的，適用場合不同 —— 所以這裡是提醒，不是錯誤。
  if (mainCount > TOURNAMENT_REQUIREMENTS.mainDeckExact) {
    issues.push({
      severity: 'warning',
      rule: '601.1.b',
      message: msg(
        `主牌組 ${mainCount} 張。核心規則允許超過 40 張，但正式賽事要求恰好 ${TOURNAMENT_REQUIREMENTS.mainDeckExact} 張。`,
        `主牌堆 ${mainCount} 张。核心规则允许超过 40 张，但正式赛事要求刚好 ${TOURNAMENT_REQUIREMENTS.mainDeckExact} 张。`,
        `Main deck has ${mainCount} cards. The Core Rules allow more than 40, but tournament play requires exactly ${TOURNAMENT_REQUIREMENTS.mainDeckExact}.`,
      ),
    });
  }

  // ── 戰場名稱必須各不相同（賽事規則 402.1）──
  {
    const seen = new Map<string, number>();
    for (const [id, qty] of Object.entries(deck.battlefields)) {
      if (qty <= 0) continue;
      const card = get(id);
      if (!card) continue;
      seen.set(card.name, (seen.get(card.name) ?? 0) + qty);
    }
    for (const [name, qty] of seen) {
      if (qty > 1) {
        issues.push({
          severity: 'warning',
          rule: '402.1',
          message: msg(
            `戰場「${name}」有 ${qty} 張。賽事要求 3 張戰場的名稱各不相同。`,
            `战场「${name}」有 ${qty} 张。赛事要求 3 张战场的名称各不相同。`,
            `Battlefield "${name}" appears ${qty} times; tournament play requires three battlefields each with a unique name.`,
          ),
        });
      }
    }
  }

  // ── 指示物不能放進牌組 ──
  for (const [id, qty] of allEntries) {
    const card = get(id);
    if (card?.subtype === 'token' && qty > 0) {
      issues.push({
        severity: 'error',
        rule: '—',
        message: msg(
          `「${card.name}」是指示物，不能放進牌組。`,
          `「${card.name}」是指示物，不能放进卡组。`,
          `"${card.name}" is a token and cannot be included in a deck.`,
        ),
      });
    }
  }

  return {
    legal: issues.every((i) => i.severity !== 'error'),
    issues,
    counts: {
      main: mainCount,
      runes: runeCount,
      battlefields: battlefieldCount,
      sideboard: sideboardCount,
      signatures: signatureCount,
    },
  };
}

/**
 * 我們**沒有**檢查的事情，介面上必須說清楚。
 *
 * 讓玩家以為「通過檢查 = 一定合法」比不檢查更危險。
 */
/**
 * 介面上要誠實說明「這個檢查涵蓋什麼、不涵蓋什麼」。
 *
 * 這段文字原本寫「不包含禁卡表」。現在已經會查禁卡表了，
 * **這種說明如果沒跟著改，比不做功能還糟** —— 使用者會以為自己還要另外查，
 * 或反過來以為我們什麼都查了。所以改動檢查邏輯時，這段一定要一起看。
 */
export const NOT_CHECKED = msg(
  `本工具檢查核心規則的構築限制，並會對照 ${BAN_LIST_VERSION.updated} 版的官方構築賽禁卡表（1v1）。禁卡表沒有官方 API，是人工維護的，官方更新後本站可能有落差；可用系列與輪替也不在檢查範圍。參加正式賽事前請自行對照官方公告。`,
  `本工具检查核心规则的构筑限制，并会对照 ${BAN_LIST_VERSION.updated} 版的官方构筑赛禁卡表（1v1）。禁卡表没有官方 API，是人工维护的，官方更新后本站可能有落差；可用系列与轮替也不在检查范围。参加正式赛事前请自行对照官方公告。`,
  `This tool checks core-rules deck construction and the official 1v1 Constructed ban list as of ${BAN_LIST_VERSION.updated}. The ban list has no official API and is maintained by hand, so it may lag behind official updates; legal sets and rotation are not checked. Confirm against official announcements before competitive play.`,
);
