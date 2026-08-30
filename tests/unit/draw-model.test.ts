/**
 * 符文戰場抽牌與資源模型的測試。
 *
 * 每個常數都對應一條官方規則，測試裡也寫上條號，
 * 這樣任何人（包括未來的我）都能拿規則書逐條核對。
 */

import { describe, expect, it } from 'vitest';
import {
  TURN_RULES,
  cardsSeenByTurn,
  earliestTurn,
  formatPercent,
  oddsAfterMulligan,
  oddsByTurn,
  resourceCurve,
  runeOddsByTurn,
  runesNeeded,
  runesSummonedByTurn,
  unpayableDomains,
} from '../../src/lib/draw-model';
import { atLeast } from '../../src/lib/probability';
import { ALL_CARDS } from '../../src/lib/cards';
import type { Card } from '../../src/lib/types';

const byId = new Map(ALL_CARDS.map((c) => [c.id, c]));

describe('官方數字', () => {
  it('開局抽 4 張（規則 116）', () => {
    expect(TURN_RULES.openingHand).toBe(4);
  });

  it('手牌調度最多換 2 張（規則 117.1）', () => {
    expect(TURN_RULES.mulliganMax).toBe(2);
  });

  it('每回合召出 2 張符文（規則 315.3.b）', () => {
    expect(TURN_RULES.runesPerTurn).toBe(2);
  });

  it('每回合抽 1 張牌（規則 315.4.b）', () => {
    expect(TURN_RULES.cardsPerTurn).toBe(1);
  });

  it('後手第一個召出階段多召 1 張（規則 485.7）', () => {
    expect(TURN_RULES.secondPlayerBonusRune).toBe(1);
  });

  it('符文牌組 12 張（規則 103.3.a）', () => {
    expect(TURN_RULES.runeDeckSize).toBe(12);
  });
});

describe('看過幾張牌', () => {
  it('第 0 回合就是開局手牌 4 張', () => {
    expect(cardsSeenByTurn(0)).toBe(4);
  });

  it('之後每回合多 1 張', () => {
    expect(cardsSeenByTurn(1)).toBe(5);
    expect(cardsSeenByTurn(3)).toBe(7);
    expect(cardsSeenByTurn(10)).toBe(14);
  });

  it('負數或非整數不會算出奇怪的結果', () => {
    expect(cardsSeenByTurn(-1)).toBe(4);
    expect(cardsSeenByTurn(1.5)).toBe(4);
  });
});

describe('召出幾張符文', () => {
  it('先手：每回合 2 張', () => {
    expect(runesSummonedByTurn(1, true)).toBe(2);
    expect(runesSummonedByTurn(3, true)).toBe(6);
  });

  it('後手：第一回合 3 張，之後每回合 2 張（485.7）', () => {
    expect(runesSummonedByTurn(1, false)).toBe(3);
    expect(runesSummonedByTurn(2, false)).toBe(5);
    expect(runesSummonedByTurn(3, false)).toBe(7);
  });

  it('上限是符文牌組的 12 張，第 6 回合召完', () => {
    expect(runesSummonedByTurn(6, true)).toBe(12);
    expect(runesSummonedByTurn(20, true)).toBe(12);
    expect(runesSummonedByTurn(20, false)).toBe(12);
  });

  it('後手比先手早一回合達到同樣的符文數', () => {
    for (let turn = 1; turn <= 5; turn += 1) {
      expect(runesSummonedByTurn(turn, false)).toBeGreaterThanOrEqual(
        runesSummonedByTurn(turn, true),
      );
    }
  });

  it('第 0 回合還沒召出任何符文', () => {
    expect(runesSummonedByTurn(0, true)).toBe(0);
    expect(runesSummonedByTurn(0, false)).toBe(0);
  });
});

describe('打出一張卡需要幾張符文', () => {
  it('法力費用與符能費用相加（131.2、131.3、164.2）', () => {
    const withPower = ALL_CARDS.find((c) => c.energy !== null && c.power !== null)!;
    expect(runesNeeded(withPower)).toBe(withPower.energy! + withPower.power!);
  });

  it('沒有符能費用的卡就只算法力費用（131.3.b）', () => {
    const noPower = ALL_CARDS.find((c) => c.energy !== null && c.power === null)!;
    expect(runesNeeded(noPower)).toBe(noPower.energy);
  });

  it('沒有費用的卡（傳奇、符文、戰場）回傳 null', () => {
    const legend = ALL_CARDS.find((c) => c.types.includes('legend'))!;
    expect(legend.energy).toBeNull();
    expect(runesNeeded(legend)).toBeNull();
  });

  it('資料裡每一張有費用的卡都算得出需求，且是合理的正整數', () => {
    for (const card of ALL_CARDS.filter((c) => c.energy !== null)) {
      const needed = runesNeeded(card)!;
      expect(Number.isInteger(needed)).toBe(true);
      expect(needed).toBeGreaterThanOrEqual(0);
      expect(needed).toBeLessThanOrEqual(20);
    }
  });
});

describe('最快能在第幾回合打出', () => {
  it('1 費無符能的卡，先手第 1 回合就打得出來', () => {
    const cheap = ALL_CARDS.find((c) => c.energy === 1 && c.power === null)!;
    expect(earliestTurn(cheap, true)).toBe(1);
  });

  it('需求越高，可打出的回合越晚（單調）', () => {
    const cards = ALL_CARDS.filter((c) => c.energy !== null);
    for (const card of cards) {
      const turn = earliestTurn(card, true);
      if (turn === null) continue;
      expect(runesSummonedByTurn(turn, true)).toBeGreaterThanOrEqual(runesNeeded(card)!);
      if (turn > 1) {
        expect(runesSummonedByTurn(turn - 1, true)).toBeLessThan(runesNeeded(card)!);
      }
    }
  });

  it('後手不會比先手晚打出', () => {
    for (const card of ALL_CARDS.filter((c) => c.energy !== null)) {
      const first = earliestTurn(card, true);
      const second = earliestTurn(card, false);
      if (first === null || second === null) continue;
      expect(second).toBeLessThanOrEqual(first);
    }
  });

  it('需求超過 12 張符文的卡回傳 null —— 光靠符文付不起', () => {
    const impossible = { energy: 13, power: null } as Card;
    expect(earliestTurn(impossible, true)).toBeNull();
  });
});

describe('逐回合抽到的機率', () => {
  it('第 0 回合就是開局 4 張的機率', () => {
    const odds = oddsByTurn(40, 3, 1, 5);
    expect(odds[0]!.cardsSeen).toBe(4);
    expect(odds[0]!.probability).toBeCloseTo(
      atLeast({ population: 40, successes: 3, draws: 4 }, 1),
      12,
    );
  });

  it('機率隨回合單調上升', () => {
    const odds = oddsByTurn(40, 3, 1, 20);
    for (let i = 1; i < odds.length; i += 1) {
      expect(odds[i]!.probability).toBeGreaterThanOrEqual(odds[i - 1]!.probability);
    }
  });

  it('看過的牌數不會超過牌組張數', () => {
    for (const row of oddsByTurn(40, 3, 1, 60)) {
      expect(row.cardsSeen).toBeLessThanOrEqual(40);
    }
  });

  it('抽光整副牌組時機率為 1', () => {
    const odds = oddsByTurn(40, 3, 1, 40);
    expect(odds.at(-1)!.probability).toBeCloseTo(1, 12);
  });
});

describe('手牌調度（規則 117.1–117.3）', () => {
  it('不調度時就是開局 4 張的機率', () => {
    const plain = atLeast({ population: 40, successes: 3, draws: 4 }, 1);
    expect(oddsAfterMulligan(40, 3, 0)).toBeCloseTo(plain, 12);
  });

  it('調度後機率提高', () => {
    const plain = oddsAfterMulligan(40, 3, 0);
    expect(oddsAfterMulligan(40, 3, 1)).toBeGreaterThan(plain);
    expect(oddsAfterMulligan(40, 3, 2)).toBeGreaterThan(oddsAfterMulligan(40, 3, 1));
  });

  it('補抽的牌來自「不含擱置牌」的牌堆 —— 官方順序是先抽再洗回', () => {
    // 手動照 117.1→117.2→117.3 算一次，跟函式對答案
    const N = 40;
    const K = 3;
    const hand = 4;
    const hit = atLeast({ population: N, successes: K, draws: hand }, 1);
    const rescue = atLeast({ population: N - hand, successes: K, draws: 2 }, 1);
    const expected = hit + (1 - hit) * rescue;

    expect(oddsAfterMulligan(N, K, 2)).toBeCloseTo(expected, 12);
  });

  it('換牌數超過官方上限 2 張時，以 2 張計算', () => {
    expect(oddsAfterMulligan(40, 3, 5)).toBeCloseTo(oddsAfterMulligan(40, 3, 2), 12);
  });

  it('牌組沒有目標牌時，怎麼換都是 0', () => {
    expect(oddsAfterMulligan(40, 0, 2)).toBe(0);
  });

  it('牌組全是目標牌時必定命中', () => {
    expect(oddsAfterMulligan(40, 40, 2)).toBe(1);
  });

  it('結果永遠在 0 到 1 之間', () => {
    for (let copies = 0; copies <= 40; copies += 1) {
      for (const m of [0, 1, 2]) {
        const p = oddsAfterMulligan(40, copies, m);
        expect(p).toBeGreaterThanOrEqual(0);
        expect(p).toBeLessThanOrEqual(1);
      }
    }
  });
});

describe('資源曲線', () => {
  const cheap = ALL_CARDS.find((c) => c.energy === 1 && c.power === null)!;
  const pricey = ALL_CARDS.find((c) => (c.energy ?? 0) >= 8)!;

  it('便宜的卡第 1 回合就付得起，貴的還不行', () => {
    const curve = resourceCurve({ [cheap.id]: 3, [pricey.id]: 3 }, byId, true, 8);
    expect(curve[0]!.affordable).toBe(3);
    expect(curve[0]!.runes).toBe(2);
  });

  it('可施放的張數隨回合單調上升', () => {
    const curve = resourceCurve({ [cheap.id]: 3, [pricey.id]: 3 }, byId, true, 10);
    for (let i = 1; i < curve.length; i += 1) {
      expect(curve[i]!.affordable).toBeGreaterThanOrEqual(curve[i - 1]!.affordable);
    }
  });

  it('比例是相對於主牌組總張數', () => {
    const curve = resourceCurve({ [cheap.id]: 3, [pricey.id]: 1 }, byId, true, 3);
    expect(curve[0]!.affordableRatio).toBeCloseTo(3 / 4, 12);
  });

  it('空牌組不會除以零', () => {
    const curve = resourceCurve({}, byId, true, 3);
    expect(curve[0]!.affordableRatio).toBe(0);
    expect(curve[0]!.affordable).toBe(0);
  });

  it('不存在的卡片 id 會被忽略而不是崩潰', () => {
    expect(() => resourceCurve({ 'not-a-card': 3 }, byId, true, 3)).not.toThrow();
    expect(resourceCurve({ 'not-a-card': 3 }, byId, true, 3)[0]!.affordable).toBe(0);
  });
});

describe('符能特性付不付得起（規則 163.2.a）', () => {
  const runes = ALL_CARDS.filter((c) => c.types.includes('rune'));

  it('符文牌組沒有對應特性時，有符能費用的卡會被標出來', () => {
    const furyRune = runes.find((r) => r.domains.includes('fury'))!;
    // 找一張有符能費用、且特性不含熾烈的卡
    const offending = ALL_CARDS.find(
      (c) =>
        c.power !== null &&
        c.domains.some((d) => d !== 'colorless') &&
        !c.domains.includes('fury'),
    )!;

    const result = unpayableDomains(
      { [offending.id]: 3 },
      { [furyRune.id]: 12 },
      byId,
    );
    expect(result).toContain(offending.id);
  });

  it('特性相符時不會被標出來', () => {
    const furyRune = runes.find((r) => r.domains.includes('fury'))!;
    const fine = ALL_CARDS.find(
      (c) => c.power !== null && c.domains.filter((d) => d !== 'colorless').join() === 'fury',
    )!;

    expect(unpayableDomains({ [fine.id]: 3 }, { [furyRune.id]: 12 }, byId)).toEqual([]);
  });

  it('沒有符能費用的卡不受這條限制（131.3.b）', () => {
    const furyRune = runes.find((r) => r.domains.includes('fury'))!;
    const noPower = ALL_CARDS.find(
      (c) => c.power === null && c.energy !== null && !c.domains.includes('fury'),
    )!;

    expect(unpayableDomains({ [noPower.id]: 3 }, { [furyRune.id]: 12 }, byId)).toEqual([]);
  });

  it('空的符文牌組不會崩潰', () => {
    expect(() => unpayableDomains({}, {}, byId)).not.toThrow();
  });
});

describe('百分比顯示', () => {
  it('極小但非零的機率不顯示成 0%', () => {
    expect(formatPercent(0.0000001)).toBe('<0.01%');
    expect(formatPercent(0)).toBe('0%');
  });

  it('極接近 1 但不是 1 的機率不顯示成 100%', () => {
    expect(formatPercent(0.999999)).toBe('>99.99%');
    expect(formatPercent(1)).toBe('100%');
  });

  it('一般數值保留一位小數', () => {
    expect(formatPercent(0.5)).toBe('50.0%');
    expect(formatPercent(0.2765)).toBe('27.7%');
  });

  it('小於 1% 時多給一位小數', () => {
    expect(formatPercent(0.005)).toBe('0.50%');
  });

  it('不合理的輸入顯示破折號而不是 NaN', () => {
    expect(formatPercent(Number.NaN)).toBe('—');
    expect(formatPercent(-1)).toBe('—');
  });
});

describe('符文的機率（規則 114、430.1、108.5.d）', () => {
  const runes = ALL_CARDS.filter((c) => c.types.includes('rune'));
  const fury = runes.find((r) => r.domains.includes('fury'))!;
  const calm = runes.find((r) => r.domains.includes('calm'))!;

  it('單色符文牌組必定召出該顏色', () => {
    const odds = runeOddsByTurn({ [fury.id]: 12 }, byId, true, 6);
    expect(odds).toHaveLength(1);
    expect(odds[0]!.domain).toBe('fury');
    expect(odds[0]!.inDeck).toBe(12);
    expect(odds[0]!.byTurn[0]).toBeCloseTo(1, 12);
  });

  it('雙色 6/6，先手第 1 回合召 2 張，至少 1 張熾烈 = 1 − C(6,2)/C(12,2)', () => {
    const odds = runeOddsByTurn({ [fury.id]: 6, [calm.id]: 6 }, byId, true, 6);
    const furyRow = odds.find((o) => o.domain === 'fury')!;

    // C(6,2)=15, C(12,2)=66 → 1 − 15/66 ≈ 0.7727
    expect(furyRow.byTurn[0]).toBeCloseTo(1 - 15 / 66, 12);
  });

  it('機率隨回合單調上升，第 6 回合召完必定為 1', () => {
    const odds = runeOddsByTurn({ [fury.id]: 3, [calm.id]: 9 }, byId, true, 8);
    const furyRow = odds.find((o) => o.domain === 'fury')!;

    for (let i = 1; i < furyRow.byTurn.length; i += 1) {
      expect(furyRow.byTurn[i]).toBeGreaterThanOrEqual(furyRow.byTurn[i - 1]!);
    }
    expect(furyRow.byTurn.at(-1)).toBeCloseTo(1, 12);
  });

  it('後手第 1 回合多召 1 張，機率比先手高（485.7）', () => {
    const first = runeOddsByTurn({ [fury.id]: 3, [calm.id]: 9 }, byId, true, 3);
    const second = runeOddsByTurn({ [fury.id]: 3, [calm.id]: 9 }, byId, false, 3);

    const f = first.find((o) => o.domain === 'fury')!.byTurn[0]!;
    const s = second.find((o) => o.domain === 'fury')!.byTurn[0]!;
    expect(s).toBeGreaterThan(f);
  });

  it('要「至少 2 張」的機率低於「至少 1 張」', () => {
    const one = runeOddsByTurn({ [fury.id]: 4, [calm.id]: 8 }, byId, true, 6, 1);
    const two = runeOddsByTurn({ [fury.id]: 4, [calm.id]: 8 }, byId, true, 6, 2);

    const a = one.find((o) => o.domain === 'fury')!.byTurn[0]!;
    const b = two.find((o) => o.domain === 'fury')!.byTurn[0]!;
    expect(b).toBeLessThan(a);
  });

  it('放越多張該顏色，機率越高', () => {
    let previous = 0;
    for (let n = 0; n <= 12; n += 2) {
      const odds = runeOddsByTurn(
        n === 0 ? { [calm.id]: 12 } : { [fury.id]: n, [calm.id]: 12 - n },
        byId,
        true,
        3,
      );
      const p = odds.find((o) => o.domain === 'fury')?.byTurn[0] ?? 0;
      expect(p).toBeGreaterThanOrEqual(previous);
      previous = p;
    }
  });

  it('空的符文牌組回傳空陣列，不會除以零', () => {
    expect(runeOddsByTurn({}, byId, true, 6)).toEqual([]);
  });

  it('不存在的卡片 id 會被忽略', () => {
    expect(() => runeOddsByTurn({ 'not-a-card': 12 }, byId, true, 6)).not.toThrow();
    expect(runeOddsByTurn({ 'not-a-card': 12 }, byId, true, 6)).toEqual([]);
  });

  it('每個機率都落在 0 到 1 之間', () => {
    for (const row of runeOddsByTurn({ [fury.id]: 5, [calm.id]: 7 }, byId, false, 8, 3)) {
      for (const p of row.byTurn) {
        expect(p).toBeGreaterThanOrEqual(0);
        expect(p).toBeLessThanOrEqual(1);
      }
    }
  });
});
