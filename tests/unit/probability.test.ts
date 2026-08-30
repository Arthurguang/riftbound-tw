/**
 * 超幾何分布的測試。
 *
 * 這一組刻意用**外部可查證的已知答案**當基準（撲克牌的經典題目、
 * 手算得出的組合數），而不是「跑一次程式，把輸出當成期望值」——
 * 後者只能證明程式沒變，不能證明程式是對的。
 *
 * 機率是這個工具唯一的產品。算錯了，使用者會照著錯的數字組牌。
 */

import { describe, expect, it } from 'vitest';
import {
  atLeast,
  atMost,
  binomial,
  distribution,
  exactly,
  expectedCount,
  isValidInput,
  multivariate,
  multivariateAtLeast,
} from '../../src/lib/probability';

/** 比較浮點數時容許的誤差。 */
const near = (actual: number, expected: number, digits = 10) =>
  expect(actual).toBeCloseTo(expected, digits);

describe('組合數', () => {
  it('小數字對得上手算的結果', () => {
    expect(binomial(5, 0)).toBe(1n);
    expect(binomial(5, 5)).toBe(1n);
    expect(binomial(5, 2)).toBe(10n);
    expect(binomial(10, 3)).toBe(120n);
  });

  it('撲克牌的經典數字：52 選 5 有 2,598,960 種', () => {
    expect(binomial(52, 5)).toBe(2598960n);
    expect(binomial(52, 2)).toBe(1326n);
    expect(binomial(49, 6)).toBe(13983816n); // 樂透 49 選 6
  });

  it('超過浮點數精確範圍時仍然完全正確', () => {
    // C(60, 30) 遠大於 2^53，用一般數字算會開始失真
    expect(binomial(60, 30)).toBe(118264581564861424n);
    expect(binomial(60, 30) > 9007199254740991n).toBe(true);
  });

  it('對稱性：C(n, k) = C(n, n-k)', () => {
    for (let n = 0; n <= 40; n += 7) {
      for (let k = 0; k <= n; k += 3) {
        expect(binomial(n, k)).toBe(binomial(n, n - k));
      }
    }
  });

  it('帕斯卡遞迴：C(n, k) = C(n-1, k-1) + C(n-1, k)', () => {
    for (let n = 1; n <= 30; n += 1) {
      for (let k = 1; k < n; k += 1) {
        expect(binomial(n, k)).toBe(binomial(n - 1, k - 1) + binomial(n - 1, k));
      }
    }
  });

  it('不合理的參數回傳 0 而不是崩潰或 NaN', () => {
    expect(binomial(5, 6)).toBe(0n);
    expect(binomial(-1, 2)).toBe(0n);
    expect(binomial(5, -1)).toBe(0n);
    expect(binomial(5.5, 2)).toBe(0n);
  });
});

describe('參數驗證', () => {
  it('接受合理的參數', () => {
    expect(isValidInput({ population: 40, successes: 3, draws: 4 })).toBe(true);
    expect(isValidInput({ population: 40, successes: 0, draws: 0 })).toBe(true);
  });

  it('拒絕不合理的參數', () => {
    expect(isValidInput({ population: 0, successes: 0, draws: 0 })).toBe(false);
    expect(isValidInput({ population: 40, successes: 41, draws: 4 })).toBe(false);
    expect(isValidInput({ population: 40, successes: 3, draws: 41 })).toBe(false);
    expect(isValidInput({ population: 40, successes: -1, draws: 4 })).toBe(false);
    expect(isValidInput({ population: 40.5, successes: 3, draws: 4 })).toBe(false);
  });
});

describe('剛好抽到 k 張', () => {
  it('撲克牌經典題：52 張抽 5 張，剛好 1 張 A', () => {
    // C(4,1) × C(48,4) / C(52,5) = 4 × 194580 / 2598960
    near(exactly({ population: 52, successes: 4, draws: 5 }, 1), 778320 / 2598960);
  });

  it('抽 5 張全部是 A 的機率 = 0（只有 4 張 A）', () => {
    expect(exactly({ population: 52, successes: 4, draws: 5 }, 5)).toBe(0);
  });

  it('牌堆全是目標牌時，抽幾張就中幾張', () => {
    expect(exactly({ population: 10, successes: 10, draws: 4 }, 4)).toBe(1);
    expect(exactly({ population: 10, successes: 10, draws: 4 }, 3)).toBe(0);
  });

  it('牌堆沒有目標牌時，必定抽到 0 張', () => {
    expect(exactly({ population: 40, successes: 0, draws: 7 }, 0)).toBe(1);
    expect(exactly({ population: 40, successes: 0, draws: 7 }, 1)).toBe(0);
  });
});

describe('至少抽到 k 張', () => {
  it('40 張牌組放 3 張，開局 4 張抽到至少 1 張', () => {
    // 1 - C(37,4)/C(40,4) = 1 - 66045/91390
    const expected = 1 - 66045 / 91390;
    near(atLeast({ population: 40, successes: 3, draws: 4 }, 1), expected);
    // 大約 27.7%
    expect(atLeast({ population: 40, successes: 3, draws: 4 }, 1)).toBeGreaterThan(0.27);
    expect(atLeast({ population: 40, successes: 3, draws: 4 }, 1)).toBeLessThan(0.28);
  });

  it('至少 0 張必定成立', () => {
    expect(atLeast({ population: 40, successes: 3, draws: 4 }, 0)).toBe(1);
    expect(atLeast({ population: 40, successes: 0, draws: 4 }, 0)).toBe(1);
  });

  it('要求超過牌堆裡的張數時機率為 0', () => {
    expect(atLeast({ population: 40, successes: 3, draws: 10 }, 4)).toBe(0);
    expect(atLeast({ population: 40, successes: 10, draws: 3 }, 4)).toBe(0);
  });

  it('抽越多張，至少抽到 1 張的機率越高（單調遞增）', () => {
    let previous = 0;
    for (let draws = 1; draws <= 40; draws += 1) {
      const p = atLeast({ population: 40, successes: 3, draws }, 1);
      expect(p).toBeGreaterThanOrEqual(previous);
      previous = p;
    }
    expect(previous).toBe(1); // 抽光整副牌一定會抽到
  });

  it('放越多張，抽到的機率越高', () => {
    let previous = 0;
    for (let copies = 0; copies <= 40; copies += 1) {
      const p = atLeast({ population: 40, successes: copies, draws: 4 }, 1);
      expect(p).toBeGreaterThanOrEqual(previous);
      previous = p;
    }
  });
});

describe('至少與最多互為補數', () => {
  it('atMost(k) = 1 − atLeast(k+1)', () => {
    const input = { population: 40, successes: 6, draws: 12 };
    for (let k = 0; k <= 6; k += 1) {
      near(atMost(input, k), 1 - atLeast(input, k + 1));
    }
  });

  it('atLeast(1) = 1 − exactly(0)', () => {
    const input = { population: 52, successes: 4, draws: 5 };
    near(atLeast(input, 1), 1 - exactly(input, 0));
  });
});

describe('分布', () => {
  it('所有可能情況的機率加起來剛好是 1', () => {
    for (const input of [
      { population: 40, successes: 3, draws: 4 },
      { population: 52, successes: 4, draws: 5 },
      { population: 60, successes: 12, draws: 20 },
      { population: 12, successes: 12, draws: 6 },
    ]) {
      const sum = distribution(input).reduce((a, b) => a + b, 0);
      near(sum, 1);
    }
  });

  it('分布的長度是「可能抽到的最大張數」加一', () => {
    expect(distribution({ population: 40, successes: 3, draws: 10 })).toHaveLength(4);
    expect(distribution({ population: 40, successes: 10, draws: 3 })).toHaveLength(4);
  });

  it('期望值等於 n × K / N，也等於分布的加權平均', () => {
    const input = { population: 40, successes: 3, draws: 12 };
    near(expectedCount(input), (12 * 3) / 40);

    const mean = distribution(input).reduce((sum, p, k) => sum + p * k, 0);
    near(mean, expectedCount(input));
  });
});

describe('多類別（多變量超幾何分布）', () => {
  it('撲克牌：52 張抽 5 張，剛好 1 張 A 和 1 張 K', () => {
    // C(4,1) × C(4,1) × C(44,3) / C(52,5) = 16 × 13244 / 2598960
    near(multivariate(52, [4, 4], [1, 1], 5), 211904 / 2598960);
  });

  it('退化成單類別時，結果與 exactly() 一致', () => {
    for (let k = 0; k <= 3; k += 1) {
      near(
        multivariate(40, [3], [k], 4),
        exactly({ population: 40, successes: 3, draws: 4 }, k),
      );
    }
  });

  it('所有可能的組合加起來是 1', () => {
    let total = 0;
    for (let a = 0; a <= 4; a += 1) {
      for (let b = 0; b <= 4; b += 1) {
        if (a + b > 5) continue;
        total += multivariate(52, [4, 4], [a, b], 5);
      }
    }
    near(total, 1);
  });

  it('要的張數超過牌堆裡的張數時回傳 0', () => {
    expect(multivariate(40, [3, 5], [4, 0], 7)).toBe(0);
    expect(multivariate(40, [3, 5], [3, 5], 7)).toBe(0); // 8 張 > 抽 7 張
  });

  it('陣列長度不一致時回傳 0，不會算出亂七八糟的數字', () => {
    expect(multivariate(40, [3, 5], [1], 7)).toBe(0);
  });
});

describe('每一類都至少抽到指定張數', () => {
  it('只有一類時等同於 atLeast()', () => {
    for (let k = 0; k <= 3; k += 1) {
      near(
        multivariateAtLeast(40, [3], [k], 4),
        atLeast({ population: 40, successes: 3, draws: 4 }, k),
      );
    }
  });

  it('最低要求全是 0 時機率為 1', () => {
    near(multivariateAtLeast(40, [3, 5], [0, 0], 4), 1);
  });

  it('最低要求加起來超過抽牌數時為 0', () => {
    expect(multivariateAtLeast(40, [3, 5], [3, 3], 5)).toBe(0);
  });

  it('同時要 A 和 K 的機率，低於只要 A 的機率', () => {
    const both = multivariateAtLeast(52, [4, 4], [1, 1], 5);
    const onlyAce = atLeast({ population: 52, successes: 4, draws: 5 }, 1);
    expect(both).toBeGreaterThan(0);
    expect(both).toBeLessThan(onlyAce);
  });

  it('結果永遠落在 0 到 1 之間', () => {
    for (let draws = 1; draws <= 12; draws += 1) {
      const p = multivariateAtLeast(40, [3, 6, 9], [1, 1, 1], draws);
      expect(p).toBeGreaterThanOrEqual(0);
      expect(p).toBeLessThanOrEqual(1);
    }
  });

  it('抽越多張，同時滿足多個條件的機率越高', () => {
    let previous = 0;
    for (let draws = 3; draws <= 40; draws += 1) {
      const p = multivariateAtLeast(40, [3, 6], [1, 2], draws);
      expect(p).toBeGreaterThanOrEqual(previous - 1e-12);
      previous = p;
    }
    near(previous, 1);
  });
});
