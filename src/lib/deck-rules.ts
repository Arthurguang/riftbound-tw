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
import type { TextLang } from './i18n';

/** 官方核心規則的版本，介面上會標示，方便日後對照。 */
export const RULES_VERSION = {
  document: '《符文戰場》核心規則（官方簡中版）',
  updated: '2026-07-17',
  url: 'https://cdn.playloltcg.com/lol/2026/07/2026-07-23/6f47b6ebe57341a5bb5f4bed5548d051.pdf',
};

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
};

export const EMPTY_DECK: Deck = {
  legendId: null,
  championId: null,
  main: {},
  runes: {},
  battlefields: {},
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
 * 賽制限制（禁卡表、可用系列）不在這裡檢查 —— 那需要另一份官方文件，
 * 而且會隨賽制變動。寧可不擋，也不要讓玩家以為通過檢查就一定合法。
 */
export function checkLegality(deck: Deck, cardsById: Map<string, Card>): LegalityResult {
  const issues: LegalityIssue[] = [];
  const get = (id: string) => cardsById.get(id);

  const legend = deck.legendId ? get(deck.legendId) : undefined;
  const mainCount = totalCards(deck.main);
  const runeCount = totalCards(deck.runes);
  const battlefieldCount = totalCards(deck.battlefields);

  // 專屬卡總數（103.2.d.1）——跨所有區域計算
  const allEntries = [
    ...Object.entries(deck.main),
    ...Object.entries(deck.runes),
    ...Object.entries(deck.battlefields),
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

  // ── 選定英雄（103.2.a）──
  const champion = deck.championId ? get(deck.championId) : undefined;
  if (!champion) {
    issues.push({
      severity: 'error',
      rule: '103.2.a',
      message: msg('尚未指定選定英雄。', '尚未指定选定英雄。', 'No Chosen Champion selected.'),
    });
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
  const byName = new Map<string, number>();
  for (const [id, qty] of Object.entries(deck.main)) {
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
          `「${name}」有 ${qty} 張，同名卡最多 ${DECK_REQUIREMENTS.copiesPerName} 張（含選定英雄）。`,
          `「${name}」有 ${qty} 张，同名卡最多 ${DECK_REQUIREMENTS.copiesPerName} 张（含选定英雄）。`,
          `"${name}" appears ${qty} times; the limit is ${DECK_REQUIREMENTS.copiesPerName} per name (including your Chosen Champion).`,
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
      signatures: signatureCount,
    },
  };
}

/**
 * 我們**沒有**檢查的事情，介面上必須說清楚。
 *
 * 讓玩家以為「通過檢查 = 一定合法」比不檢查更危險。
 */
export const NOT_CHECKED = msg(
  '本工具只檢查核心規則的構築限制，不包含賽制規定（禁卡表、可用系列等）—— 那需要另一份會隨賽制變動的官方文件。參加正式賽事前請自行對照官方賽事規則與禁卡表。',
  '本工具只检查核心规则的构筑限制，不包含赛制规定（禁卡表、可用系列等）—— 那需要另一份会随赛制变动的官方文件。参加正式赛事前请自行对照官方赛事规则与禁卡表。',
  'This tool checks core-rules deck construction only. Format legality (ban list, legal sets) is not checked — consult the official tournament rules and ban list before competitive play.',
);
