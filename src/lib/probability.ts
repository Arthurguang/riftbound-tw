/**
 * 超幾何分布 —— 抽牌機率的數學基礎。
 *
 * ── 為什麼用 BigInt 而不是浮點數 ────────────────────────────────
 * 組合數長得很快：C(60, 30) 已經超過 9,007,199,254,740,991
 * （JavaScript 一般數字能精確表示的上限），再算下去就會開始失真。
 *
 * 這裡全程用 BigInt 做**精確的整數運算**，只在最後一步除法時才轉成小數。
 * 這樣算出來的機率不是「大概」，是真的正確 ——
 * 這也是為什麼這個階段值得先做：數學可以百分之百驗證，
 * 不像勝率模擬需要一整套規則引擎才談得上準確。
 *
 * 所有函式都不牽涉遊戲規則，純粹是數學。
 * 符文戰場專屬的部分放在 draw-model.ts。
 */

/** 放大倍率：BigInt 相除前先乘上這個數，保留 15 位有效數字。 */
const PRECISION = 10n ** 15n;

/**
 * 組合數 C(n, k)：從 n 個裡面選 k 個有幾種選法。
 *
 * 用乘除交替的寫法（而不是先算三個階乘再相除），
 * 每一步都保證整除，數字不會膨脹到不必要的大小。
 */
export function binomial(n: number, k: number): bigint {
  if (!Number.isInteger(n) || !Number.isInteger(k)) return 0n;
  if (k < 0 || n < 0 || k > n) return 0n;

  // C(n, k) = C(n, n-k)，取小的那邊算比較快
  const kk = BigInt(Math.min(k, n - k));
  const nn = BigInt(n);

  let result = 1n;
  for (let i = 0n; i < kk; i += 1n) {
    result = (result * (nn - i)) / (i + 1n);
  }
  return result;
}

/** BigInt 的分數轉小數。分母為 0 時回傳 0。 */
function ratio(numerator: bigint, denominator: bigint): number {
  if (denominator === 0n) return 0;
  return Number((numerator * PRECISION) / denominator) / Number(PRECISION);
}

export type HypergeometricInput = {
  /** 牌堆總張數 */
  population: number;
  /** 牌堆裡「你要的牌」有幾張 */
  successes: number;
  /** 你抽幾張 */
  draws: number;
};

/** 參數是否合理。介面上要據此提示，而不是回傳一個沒有意義的數字。 */
export function isValidInput({ population, successes, draws }: HypergeometricInput): boolean {
  return (
    Number.isInteger(population) &&
    Number.isInteger(successes) &&
    Number.isInteger(draws) &&
    population > 0 &&
    successes >= 0 &&
    draws >= 0 &&
    successes <= population &&
    draws <= population
  );
}

/**
 * 抽到「剛好 k 張」目標牌的機率。
 *
 *            C(K, k) × C(N-K, n-k)
 *   P(X=k) = ─────────────────────
 *                   C(N, n)
 *
 * N 牌堆總數、K 目標牌張數、n 抽幾張、k 抽中幾張。
 */
export function exactly(input: HypergeometricInput, k: number): number {
  if (!isValidInput(input) || !Number.isInteger(k) || k < 0) return 0;
  const { population: N, successes: K, draws: n } = input;

  if (k > K || k > n) return 0;
  if (n - k > N - K) return 0; // 剩下的牌不夠湊

  return ratio(binomial(K, k) * binomial(N - K, n - k), binomial(N, n));
}

/** 抽到「至少 k 張」的機率 —— 實務上最常問的就是這個（至少 1 張）。 */
export function atLeast(input: HypergeometricInput, k: number): number {
  if (!isValidInput(input) || !Number.isInteger(k)) return 0;
  if (k <= 0) return 1;

  const { population: N, successes: K, draws: n } = input;
  const max = Math.min(K, n);
  if (k > max) return 0;

  // 從 k 累加到上限。用精確整數相加，最後才除一次。
  let numerator = 0n;
  for (let i = k; i <= max; i += 1) {
    numerator += binomial(K, i) * binomial(N - K, n - i);
  }
  return ratio(numerator, binomial(N, n));
}

/** 抽到「最多 k 張」的機率。 */
export function atMost(input: HypergeometricInput, k: number): number {
  if (!isValidInput(input)) return 0;
  if (k < 0) return 0;
  return 1 - atLeast(input, k + 1);
}

/** 抽到的張數分布，索引就是張數。用來畫分布圖。 */
export function distribution(input: HypergeometricInput): number[] {
  if (!isValidInput(input)) return [];
  const max = Math.min(input.successes, input.draws);
  return Array.from({ length: max + 1 }, (_, k) => exactly(input, k));
}

/** 期望值 = n × K / N。 */
export function expectedCount(input: HypergeometricInput): number {
  if (!isValidInput(input)) return 0;
  const { population, successes, draws } = input;
  return (draws * successes) / population;
}

// ─── 多類別 ──────────────────────────────────────────────────────

/**
 * 多變量超幾何分布：一次問「每一類各抽到幾張」的機率。
 *
 * 例如「開局 4 張裡剛好 2 張符文、1 張單位、1 張法術」。
 *
 * categories 是每一類在牌堆裡的張數，wanted 是各類要抽到的張數。
 * 兩個陣列長度必須相同。牌堆裡不屬於任何一類的牌會自動視為「其他」。
 */
export function multivariate(
  population: number,
  categories: number[],
  wanted: number[],
  draws: number,
): number {
  if (categories.length !== wanted.length) return 0;
  if (!Number.isInteger(population) || population <= 0) return 0;
  if (!Number.isInteger(draws) || draws < 0 || draws > population) return 0;

  const totalInCategories = categories.reduce((sum, c) => sum + c, 0);
  const totalWanted = wanted.reduce((sum, w) => sum + w, 0);

  if (totalInCategories > population) return 0;
  if (totalWanted > draws) return 0;

  for (const [i, count] of categories.entries()) {
    const want = wanted[i] ?? 0;
    if (!Number.isInteger(count) || count < 0) return 0;
    if (!Number.isInteger(want) || want < 0 || want > count) return 0;
  }

  // 「其他」那一類：牌堆剩下的牌，要抽的張數是總抽數減掉指定的部分
  const others = population - totalInCategories;
  const wantedOthers = draws - totalWanted;
  if (wantedOthers > others) return 0;

  let numerator = binomial(others, wantedOthers);
  for (const [i, count] of categories.entries()) {
    numerator *= binomial(count, wanted[i] ?? 0);
  }

  return ratio(numerator, binomial(population, draws));
}

/**
 * 「每一類都至少抽到指定張數」的機率。
 *
 * 例如「開局手牌裡至少 1 張傳奇單位**而且**至少 2 張低費卡」。
 * 用列舉所有符合條件的組合來算 —— 牌堆與手牌都很小，列舉完全跑得動。
 */
export function multivariateAtLeast(
  population: number,
  categories: number[],
  minimums: number[],
  draws: number,
): number {
  if (categories.length !== minimums.length) return 0;
  if (categories.length === 0) return 1;

  const totalMin = minimums.reduce((sum, m) => sum + m, 0);
  if (totalMin > draws) return 0;

  let total = 0;

  /** 逐類遞迴列舉「這一類抽到幾張」的所有可能。 */
  const walk = (index: number, picked: number[], used: number) => {
    if (index === categories.length) {
      total += multivariate(population, categories, picked, draws);
      return;
    }
    const inDeck = categories[index] ?? 0;
    const min = minimums[index] ?? 0;
    // 後面各類至少還要用掉這麼多張
    const reservedForRest = minimums.slice(index + 1).reduce((sum, m) => sum + m, 0);
    const max = Math.min(inDeck, draws - used - reservedForRest);

    for (let take = min; take <= max; take += 1) {
      walk(index + 1, [...picked, take], used + take);
    }
  };

  walk(0, [], 0);
  return Math.min(1, total);
}
