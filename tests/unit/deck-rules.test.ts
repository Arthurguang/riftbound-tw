/**
 * 牌組構築規則測試。
 *
 * 本專案曾經憑印象寫錯遊戲規則並上線（PROGRESS.md 第 11 號問題）。
 * 從那之後的原則是：規則相關的程式碼，每一條都要有測試釘住，
 * 而且測試裡要寫明官方條號，讓任何人都能自行查證。
 *
 * 這裡特別釘住兩個「社群普遍寫錯、官方規則書其實不是這樣」的地方：
 *   · 主牌組是「至少 40 張」，不是「剛好 40 張」（103.2）
 *   · 戰場數量取決於遊戲模式，1v1 是 3 張（485.4.a）
 */

import { describe, expect, it } from 'vitest';
import {
  DECK_REQUIREMENTS,
  EMPTY_DECK,
  checkLegality,
  matchesIdentity,
  totalCards,
  zoneForCard,
  type Deck,
} from '../../src/lib/deck-rules';
import { ALL_CARDS } from '../../src/lib/cards';
import type { Card } from '../../src/lib/types';

const byId = new Map(ALL_CARDS.map((c) => [c.id, c]));

const legends = ALL_CARDS.filter((c) => c.types.includes('legend'));
const runes = ALL_CARDS.filter((c) => c.types.includes('rune'));
const battlefields = ALL_CARDS.filter((c) => c.types.includes('battlefield'));

/** 挑一張確定存在的傳奇，並取得它能合法搭配的卡。 */
const legend = legends[0]!;
const legalCards = ALL_CARDS.filter(
  (c) =>
    zoneForCard(c) === 'main' &&
    matchesIdentity(c, legend.domains) &&
    !c.types.includes('legend'),
);

/** 組出一副「除了指定缺陷外都合法」的牌組，方便逐條測試。 */
function buildDeck(overrides: Partial<Deck> = {}): Deck {
  const main: Record<string, number> = {};
  let count = 0;
  for (const card of legalCards) {
    if (count >= DECK_REQUIREMENTS.mainDeckMin) break;
    // 每張最多 3 張（103.2.b）
    const take = Math.min(3, DECK_REQUIREMENTS.mainDeckMin - count);
    main[card.id] = take;
    count += take;
  }

  const rune = runes[0]!;
  // 選定英雄必須與傳奇共享英雄標籤（103.2.a.2）
  const champion = legalCards.find(
    (c) => c.subtype === 'champion' && c.tags.some((tag) => legend.tags.includes(tag)),
  );

  return {
    legendId: legend.id,
    championId: champion?.id ?? null,
    main: champion && !main[champion.id] ? { ...main, [champion.id]: 1 } : main,
    runes: { [rune.id]: DECK_REQUIREMENTS.runeDeckSize },
    battlefields: Object.fromEntries(
      battlefields.slice(0, DECK_REQUIREMENTS.battlefieldCount).map((b) => [b.id, 1]),
    ),
    ...overrides,
  };
}

describe('官方數字（核心規則）', () => {
  it('主牌組至少 40 張 —— 是下限而非定額（103.2）', () => {
    expect(DECK_REQUIREMENTS.mainDeckMin).toBe(40);
  });

  it('同名卡最多 3 張（103.2.b）', () => {
    expect(DECK_REQUIREMENTS.copiesPerName).toBe(3);
  });

  it('符文牌組剛好 12 張（103.3.a）', () => {
    expect(DECK_REQUIREMENTS.runeDeckSize).toBe(12);
  });

  it('1v1 需要 3 張戰場（485.4.a）', () => {
    expect(DECK_REQUIREMENTS.battlefieldCount).toBe(3);
  });
});

describe('特性相符（103.1.b）', () => {
  it('無特性的卡任何傳奇都能用', () => {
    const colorless = ALL_CARDS.find((c) => c.domains.every((d) => d === 'colorless'));
    expect(colorless).toBeDefined();
    expect(matchesIdentity(colorless!, ['fury'])).toBe(true);
  });

  // 103.1.b.4：「如果一張卡牌擁有多種特性，則它只能加入符文特性與其所有特性相同的卡組中」
  it('雙特性卡需要傳奇「同時」擁有兩種特性 —— 是子集，不是交集（103.1.b.4）', () => {
    const dual = ALL_CARDS.find(
      (c) => c.domains.filter((d) => d !== 'colorless').length === 2,
    );
    expect(dual).toBeDefined();

    const traits = dual!.domains.filter((d) => d !== 'colorless');
    // 傳奇只有其中一種 → 不合法（這是最容易寫錯的地方）
    expect(matchesIdentity(dual!, [traits[0]!])).toBe(false);
    // 傳奇兩種都有 → 合法
    expect(matchesIdentity(dual!, traits)).toBe(true);
  });

  it('傳奇有多餘的特性不影響合法性', () => {
    const single = ALL_CARDS.find(
      (c) => c.domains.filter((d) => d !== 'colorless').length === 1,
    );
    const trait = single!.domains.find((d) => d !== 'colorless')!;
    expect(matchesIdentity(single!, [trait, 'chaos', 'order'])).toBe(true);
  });
});

describe('卡片該放進哪個區域', () => {
  it('指示物不能放進任何牌組區域', () => {
    const token = ALL_CARDS.find((c) => c.subtype === 'token');
    expect(token).toBeDefined();
    expect(zoneForCard(token!)).toBeNull();
  });

  it('符文、戰場、傳奇各自歸位', () => {
    expect(zoneForCard(runes[0]!)).toBe('runes');
    expect(zoneForCard(battlefields[0]!)).toBe('battlefields');
    expect(zoneForCard(legend)).toBe('legend');
  });
});

describe('合法性檢查', () => {
  it('空牌組會逐條指出缺什麼，且每條都附官方條號', () => {
    const result = checkLegality(EMPTY_DECK, byId);
    expect(result.legal).toBe(false);
    expect(result.issues.length).toBeGreaterThanOrEqual(5);
    for (const issue of result.issues) {
      // 條號格式如 103.2 / 485.4.a —— 沒有條號的訊息不該存在
      expect(issue.rule).toMatch(/^\d{3}(\.\d+)*(\.[a-z])?(\.\d+)?$/);
      expect(issue.message['zh-TW'].length).toBeGreaterThan(0);
      expect(issue.message['zh-CN'].length).toBeGreaterThan(0);
      expect(issue.message.en.length).toBeGreaterThan(0);
    }
  });

  it('組好的牌組通過檢查', () => {
    const result = checkLegality(buildDeck(), byId);
    expect(result.issues.filter((i) => i.severity === 'error')).toEqual([]);
    expect(result.legal).toBe(true);
  });

  it('主牌組超過 40 張仍然合法 —— 40 是下限不是定額', () => {
    const deck = buildDeck();
    const extra = legalCards.find((c) => !deck.main[c.id]);
    const bigger = { ...deck, main: { ...deck.main, [extra!.id]: 3 } };

    expect(totalCards(bigger.main)).toBeGreaterThan(DECK_REQUIREMENTS.mainDeckMin);
    expect(checkLegality(bigger, byId).legal).toBe(true);
  });

  it('主牌組少於 40 張會被擋下', () => {
    const deck = buildDeck();
    const firstId = Object.keys(deck.main)[0]!;
    const short = { ...deck, main: { ...deck.main } };
    delete short.main[firstId];

    const result = checkLegality(short, byId);
    expect(result.legal).toBe(false);
    expect(result.issues.some((i) => i.rule.startsWith('103.2'))).toBe(true);
  });

  it('同名卡超過 3 張會被擋下（103.2.b）', () => {
    const deck = buildDeck();
    const firstId = Object.keys(deck.main)[0]!;
    const tooMany = { ...deck, main: { ...deck.main, [firstId]: 4 } };

    const result = checkLegality(tooMany, byId);
    expect(result.issues.some((i) => i.rule === '103.2.b')).toBe(true);
  });

  it('符文不是 12 張會被擋下（103.3.a）', () => {
    const deck = buildDeck();
    const runeId = Object.keys(deck.runes)[0]!;
    const wrong = { ...deck, runes: { [runeId]: 11 } };

    expect(checkLegality(wrong, byId).issues.some((i) => i.rule === '103.3.a')).toBe(true);
  });

  it('戰場不是 3 張會被擋下（485.4.a）', () => {
    const deck = buildDeck();
    const wrong = { ...deck, battlefields: { [battlefields[0]!.id]: 1 } };

    expect(checkLegality(wrong, byId).issues.some((i) => i.rule === '485.4.a')).toBe(true);
  });

  it('不符合傳奇特性的卡會被擋下（103.1.b）', () => {
    const deck = buildDeck();
    const offending = ALL_CARDS.find(
      (c) => zoneForCard(c) === 'main' && !matchesIdentity(c, legend.domains),
    );
    expect(offending).toBeDefined();

    const wrong = { ...deck, main: { ...deck.main, [offending!.id]: 1 } };
    expect(checkLegality(wrong, byId).issues.some((i) => i.rule === '103.1.b')).toBe(true);
  });

  it('counts 回報的張數與實際相符', () => {
    const deck = buildDeck();
    const result = checkLegality(deck, byId);
    expect(result.counts.main).toBe(totalCards(deck.main));
    expect(result.counts.runes).toBe(DECK_REQUIREMENTS.runeDeckSize);
    expect(result.counts.battlefields).toBe(DECK_REQUIREMENTS.battlefieldCount);
  });

  it('不會因為資料裡有壞掉的 id 就崩潰', () => {
    const broken: Deck = {
      legendId: 'does-not-exist',
      championId: 'nope',
      main: { 'not-a-card': 3 },
      runes: {},
      battlefields: {},
    };
    expect(() => checkLegality(broken, byId)).not.toThrow();
    expect(checkLegality(broken, byId).legal).toBe(false);
  });
});

describe('選定英雄（103.2.a）', () => {
  it('沒指定選定英雄會被擋下', () => {
    const deck = buildDeck({ championId: null });
    expect(checkLegality(deck, byId).issues.some((i) => i.rule.startsWith('103.2.a'))).toBe(true);
  });

  it('選定英雄必須是英雄單位，不能是普通單位', () => {
    const deck = buildDeck();
    const notChampion = legalCards.find((c) => c.subtype !== 'champion')!;
    const wrong = {
      ...deck,
      championId: notChampion.id,
      main: { ...deck.main, [notChampion.id]: 1 },
    };
    expect(checkLegality(wrong, byId).issues.some((i) => i.rule.startsWith('103.2.a'))).toBe(true);
  });
});

describe('資料本身', () => {
  it('每張卡的 subtype 都是已知值', () => {
    const allowed = new Set(['champion', 'signature', 'token', null]);
    for (const card of ALL_CARDS as Card[]) {
      expect(allowed.has(card.subtype)).toBe(true);
    }
  });

  it('資料裡有足夠的傳奇、符文與戰場可以組牌', () => {
    expect(legends.length).toBeGreaterThan(0);
    expect(runes.length).toBeGreaterThan(0);
    expect(battlefields.length).toBeGreaterThanOrEqual(DECK_REQUIREMENTS.battlefieldCount);
  });
});
