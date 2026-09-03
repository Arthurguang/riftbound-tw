/**
 * 符文戰場的抽牌與資源模型。
 *
 * probability.ts 是純數學，這裡才把遊戲規則套上去。
 * **每一個數字都標明官方條號**，理由跟 deck-rules.ts 一樣：
 * 這個專案曾經憑印象寫錯規則並上線，之後的原則是任何規則相關的斷言
 * 都要能讓使用者自行查證。
 */

import { atLeast, binomial, type HypergeometricInput } from './probability';
import type { Card, Domain } from './types';

/** 規則常數。改動任何一個都要附上出處。 */
export const TURN_RULES = {
  /** 116　每名玩家各抽四張牌 */
  openingHand: 4,
  /** 117.1　手牌調度最多選兩張擱置 */
  mulliganMax: 2,
  /** 315.3.b　回合玩家從符文牌堆召出兩張符文 */
  runesPerTurn: 2,
  /** 315.4.b　回合玩家抽一張牌 */
  cardsPerTurn: 1,
  /** 485.7　1v1：後手玩家在自己首個召出階段額外召出一張符文 */
  secondPlayerBonusRune: 1,
  /** 103.3.a　符文牌組固定 12 張 */
  runeDeckSize: 12,
} as const;

/**
 * 到第 N 回合為止，你總共看過幾張主牌組的牌。
 *
 * 開局 4 張（116），之後每回合的抽牌階段抽 1 張（315.4.b）。
 * 注意這裡不含任何卡牌能力提供的額外抽牌 —— 那需要規則引擎才算得準。
 */
export function cardsSeenByTurn(turn: number): number {
  if (!Number.isInteger(turn) || turn < 0) return TURN_RULES.openingHand;
  return TURN_RULES.openingHand + turn * TURN_RULES.cardsPerTurn;
}

/**
 * 全域第 N 回合時，指定的一方已經打過幾個「自己的」回合。
 *
 * ── 兩種「回合」的差別 ──────────────────────────────────────────
 * 復盤板的回合數是**全域交替**的：先手打第 1 回合，對手打第 2 回合，
 * 先手再打第 3 回合。但抽牌與召符文是「每個人在**自己**的回合各做一次」，
 * 所以算符文與抽牌時要換算成那一方自己打過幾個回合。
 *
 *   全域第 5 回合 → 先手打過 3 個自己的回合、後手打過 2 個
 *
 * ⚠️ 官方核心規則 PDF 用的是 CID 字型，中文抽不出可讀文字，
 * 所以**這個編號慣例沒有從官方文件逐字查證過** —— 它是實體對局與
 * 各家模擬器的通行做法。介面上有把定義寫出來讓使用者自己判斷。
 */
export function ownTurns(globalTurn: number, isOnThePlay: boolean): number {
  if (!Number.isInteger(globalTurn) || globalTurn <= 0) return 0;
  // 先手拿奇數回合，後手拿偶數回合
  return isOnThePlay ? Math.ceil(globalTurn / 2) : Math.floor(globalTurn / 2);
}

/**
 * 到第 N 回合為止，你場上召出過幾張符文。
 *
 * 每回合 2 張（315.3.b），後手第一個召出階段多 1 張（485.7），
 * 上限是符文牌組的 12 張（103.3.a）—— 第 6 回合就會召完。
 */
export function runesSummonedByTurn(turn: number, onThePlay: boolean): number {
  if (!Number.isInteger(turn) || turn <= 0) return 0;
  const bonus = onThePlay ? 0 : TURN_RULES.secondPlayerBonusRune;
  return Math.min(TURN_RULES.runeDeckSize, turn * TURN_RULES.runesPerTurn + bonus);
}

/**
 * 打出一張卡需要幾張符文。
 *
 * 費用分兩種（131.2、131.3）：
 *   法力費用　卡面左上角的數字　→ 消耗符文取得（164.2.a）
 *   符能費用　縱向排列的符號　　→ **回收**符文取得（164.2.b）
 *
 * 兩種都要用到符文，所以需要的符文張數是兩者相加。
 *
 * ⚠️ 這是「這一回合要打出這張卡，場上至少要有幾張符文」的下限。
 * 回收掉的符文會永久離場（164.2.b），因此前幾回合若已經回收過，
 * 實際可用的符文會比這個數字少。介面上必須把這個前提講清楚。
 */
export function runesNeeded(card: Card): number | null {
  if (card.energy === null) return null; // 傳奇、符文、戰場沒有費用
  return card.energy + (card.power ?? 0);
}

/**
 * 最快能在第幾回合打出這張卡（只看資源，不看有沒有抽到）。
 * 回傳 null 代表這張卡沒有費用，或在符文用完前都付不起。
 */
export function earliestTurn(card: Card, onThePlay: boolean): number | null {
  const needed = runesNeeded(card);
  if (needed === null) return null;
  if (needed === 0) return 1;

  // 符文最多 12 張，超過就永遠付不起（在沒有其他資源手段的前提下）
  for (let turn = 1; turn <= TURN_RULES.runeDeckSize; turn += 1) {
    if (runesSummonedByTurn(turn, onThePlay) >= needed) return turn;
  }
  return null;
}

// ─── 抽到的機率 ──────────────────────────────────────────────────

export type DrawOdds = {
  turn: number;
  /** 到這個回合為止看過幾張牌 */
  cardsSeen: number;
  /** 至少抽到指定張數的機率 */
  probability: number;
};

/**
 * 逐回合算出「至少抽到 k 張」的機率。
 *
 * turn = 0 代表開局手牌（還沒進入任何回合）。
 */
export function oddsByTurn(
  deckSize: number,
  copies: number,
  wanted: number,
  turns: number,
): DrawOdds[] {
  return Array.from({ length: turns + 1 }, (_, turn) => {
    const cardsSeen = Math.min(deckSize, cardsSeenByTurn(turn));
    return {
      turn,
      cardsSeen,
      probability: atLeast({ population: deckSize, successes: copies, draws: cardsSeen }, wanted),
    };
  });
}

/**
 * 手牌調度後「至少拿到 1 張」的機率。
 *
 * 官方的調度流程（117.1–117.3）順序很重要：
 *   1. 從手上挑最多兩張**擱置**
 *   2. 抽等量的牌
 *   3. 最後才把擱置的牌洗回牌組
 *
 * 也就是說補抽的牌是從**不含那幾張擱置牌**的牌堆裡抽的。
 * 很多牌組工具沒有處理這個順序，算出來會略有偏差。
 *
 * 這裡假設的策略是：開局沒抽到目標牌時，換掉 mulligan 張非目標牌。
 * 真實玩家的取捨當然更複雜，所以介面上要標明這個前提。
 */
export function oddsAfterMulligan(
  deckSize: number,
  copies: number,
  mulligan: number,
): number {
  const hand = TURN_RULES.openingHand;
  const input: HypergeometricInput = { population: deckSize, successes: copies, draws: hand };

  const hit = atLeast(input, 1);
  if (mulligan <= 0) return hit;

  const swaps = Math.min(mulligan, TURN_RULES.mulliganMax, hand);

  // 開局沒中的機率
  const missed = 1 - hit;
  if (missed === 0) return 1;

  // 沒中的情況下，目標牌全都還在剩下的牌堆裡
  const remaining = deckSize - hand;
  if (remaining < swaps || remaining <= 0) return hit;

  // 補抽 swaps 張、至少中 1 張
  const rescue = atLeast(
    { population: remaining, successes: copies, draws: swaps },
    1,
  );

  return hit + missed * rescue;
}

// ─── 牌組順暢度 ──────────────────────────────────────────────────

export type TurnResource = {
  turn: number;
  /** 場上召出過幾張符文 */
  runes: number;
  /** 到這回合為止看過幾張牌 */
  cardsSeen: number;
  /** 主牌組裡有幾張這回合付得起（不看有沒有抽到） */
  affordable: number;
  /** 佔主牌組的比例 */
  affordableRatio: number;
};

/**
 * 逐回合的資源與可施放牌數。
 *
 * counts 是「卡片 id → 張數」，byId 用來查卡片資料。
 */
export function resourceCurve(
  main: Record<string, number>,
  byId: Map<string, Card>,
  onThePlay: boolean,
  turns: number,
): TurnResource[] {
  const entries = Object.entries(main)
    .map(([id, qty]) => ({ card: byId.get(id), qty }))
    .filter((e): e is { card: Card; qty: number } => Boolean(e.card));

  const total = entries.reduce((sum, e) => sum + e.qty, 0);

  return Array.from({ length: turns }, (_, index) => {
    const turn = index + 1;
    const runes = runesSummonedByTurn(turn, onThePlay);

    const affordable = entries.reduce((sum, { card, qty }) => {
      const needed = runesNeeded(card);
      return needed !== null && needed <= runes ? sum + qty : sum;
    }, 0);

    return {
      turn,
      runes,
      cardsSeen: cardsSeenByTurn(turn),
      affordable,
      affordableRatio: total === 0 ? 0 : affordable / total,
    };
  });
}

/**
 * 符能費用的特性，是否有對應的符文可以支付。
 *
 * 符能有特性之分（163.2.a），而且「特性通常與召出它的符文相同」
 * （163.2.a.1）—— 也就是說你的符文牌組裡如果沒有熾烈符文，
 * 就付不起熾烈的符能費用。
 *
 * 回傳付不起的卡片 id。這是純結構性的檢查，不牽涉機率。
 */
export function unpayableDomains(
  main: Record<string, number>,
  runeDeck: Record<string, number>,
  byId: Map<string, Card>,
): string[] {
  // 符文牌組提供哪些特性
  const available = new Set<Domain>();
  for (const [id, qty] of Object.entries(runeDeck)) {
    if (qty <= 0) continue;
    const rune = byId.get(id);
    if (!rune) continue;
    for (const domain of rune.domains) available.add(domain);
  }

  const unpayable: string[] = [];
  for (const [id, qty] of Object.entries(main)) {
    if (qty <= 0) continue;
    const card = byId.get(id);
    if (!card || !card.power) continue; // 沒有符能費用就不受這條限制

    const traits = card.domains.filter((d) => d !== 'colorless');
    // 卡片的每一種特性都要有對應的符文才付得起
    if (traits.length > 0 && !traits.every((d) => available.has(d))) {
      unpayable.push(id);
    }
  }
  return unpayable;
}

/** 給介面用的百分比字串。極小但非零的機率不顯示成 0%。 */
export function formatPercent(p: number): string {
  if (!Number.isFinite(p) || p < 0) return '—';
  if (p === 0) return '0%';
  if (p === 1) return '100%';
  if (p < 0.0001) return '<0.01%';
  if (p > 0.9999) return '>99.99%';
  return `${(p * 100).toFixed(p < 0.01 ? 2 : 1)}%`;
}

/** 提供給測試與介面：組合數是否大到需要 BigInt（說明用）。 */
export const exceedsSafeInteger = (n: number, k: number): boolean =>
  binomial(n, k) > BigInt(Number.MAX_SAFE_INTEGER);

// ─── 符文的機率 ──────────────────────────────────────────────────

/**
 * 符文也是隨機的 —— 這一點常被忽略。
 *
 * 規則 114　　主牌堆與**符文牌堆都要洗牌**
 * 規則 430.1　召出是從符文牌堆**頂部**抽取
 * 規則 108.5.d　符文牌堆的順序是隱密資訊
 *
 * 所以「第 N 回合我手上有幾張熾烈符文」跟抽牌一樣是超幾何分布的問題，
 * 母體是符文牌組的 12 張（103.3.a）。
 */
export type RuneOdds = {
  domain: Domain;
  /** 符文牌組裡這個特性有幾張 */
  inDeck: number;
  /** 每回合「至少召出 1 張」的機率，索引 0 對應第 1 回合 */
  byTurn: number[];
};

/**
 * 逐回合算出各特性符文「至少召出 k 張」的機率。
 *
 * 為什麼是「至少 k 張」而不是「至少 1 張」：符能費用可能要 2 點以上
 * （資料裡最高 4 點），一張符文只換得到 1 點符能（164.2.b），
 * 所以要問的是「湊得齊幾點」。
 */
export function runeOddsByTurn(
  runeDeck: Record<string, number>,
  byId: Map<string, Card>,
  onThePlay: boolean,
  turns: number,
  wanted = 1,
): RuneOdds[] {
  // 依特性彙總符文牌組
  const countByDomain = new Map<Domain, number>();
  let total = 0;
  for (const [id, qty] of Object.entries(runeDeck)) {
    if (qty <= 0) continue;
    const card = byId.get(id);
    if (!card) continue;
    total += qty;
    for (const domain of card.domains) {
      countByDomain.set(domain, (countByDomain.get(domain) ?? 0) + qty);
    }
  }
  if (total === 0) return [];

  return [...countByDomain.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([domain, inDeck]) => ({
      domain,
      inDeck,
      byTurn: Array.from({ length: turns }, (_, index) => {
        const summoned = Math.min(total, runesSummonedByTurn(index + 1, onThePlay));
        return atLeast({ population: total, successes: inDeck, draws: summoned }, wanted);
      }),
    }));
}
