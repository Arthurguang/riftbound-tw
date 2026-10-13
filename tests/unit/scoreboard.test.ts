/**
 * 計分板的狀態規則。
 *
 * 這個工具唯一會出錯的方式就是「數字跑掉」——
 * 所以邊界（0、上限）與「讀回來的東西不合法」這兩件事測得最細。
 * 存回瀏覽器的內容是**不可信輸入**：使用者可以用開發者工具改它。
 */

import { describe, expect, it } from 'vitest';
import {
  FRESH_MS,
  INITIAL_STATE,
  MAX_ROUND,
  MAX_SCORE,
  TARGETS,
  addScore,
  parseState,
  reachedTarget,
  resetScores,
  setRound,
  setTarget,
  toggleFacing,
  type ScoreState,
} from '../../src/lib/scoreboard';

const state = (patch: Partial<ScoreState> = {}): ScoreState => ({ ...INITIAL_STATE, ...patch });

describe('加減分', () => {
  it('加分就加上去，不動另一方', () => {
    const next = addScore(state(), 'a', 1);
    expect(next.scores.a).toBe(1);
    expect(next.scores.b).toBe(0);
  });

  it('不會低於 0 —— 官方規則：玩家的分數無法低於 0 分', () => {
    expect(addScore(state(), 'a', -1).scores.a).toBe(0);
    expect(addScore(state({ scores: { a: 1, b: 0 } }), 'a', -5).scores.a).toBe(0);
  });

  it('不會超過上限', () => {
    expect(addScore(state({ scores: { a: MAX_SCORE, b: 0 } }), 'a', 1).scores.a).toBe(MAX_SCORE);
  });

  /*
   * 達到勝利分數後**還是能加減**。
   * 鎖住看起來很貼心，但記錯分數時就改不回來了 ——
   * 而且判定勝負不是這個工具的事。
   */
  it('達到勝利分數之後照樣可以加減', () => {
    const won = state({ scores: { a: 8, b: 0 } });
    expect(addScore(won, 'a', 1).scores.a).toBe(9);
    expect(addScore(won, 'a', -1).scores.a).toBe(7);
  });

  it('原本的狀態不會被改掉（純函式）', () => {
    const before = state();
    addScore(before, 'a', 1);
    expect(before.scores.a).toBe(0);
  });
});

describe('勝利分數', () => {
  it('只收官方的兩個數字', () => {
    for (const target of TARGETS) expect(setTarget(state(), target).target).toBe(target);
  });

  it('其他數字一律忽略，不是「盡量接受」', () => {
    for (const bad of [0, 7, 12, 99, -8, 8.5, Number.NaN]) {
      expect(setTarget(state(), bad).target, `${bad}`).toBe(INITIAL_STATE.target);
    }
  });

  it('達標判斷用的是「大於等於」', () => {
    expect(reachedTarget(state({ scores: { a: 7, b: 0 } }), 'a')).toBe(false);
    expect(reachedTarget(state({ scores: { a: 8, b: 0 } }), 'a')).toBe(true);
    expect(reachedTarget(state({ scores: { a: 9, b: 0 } }), 'a')).toBe(true);
    // 換成 11 分制之後，8 分就不算達標了
    expect(reachedTarget(state({ scores: { a: 8, b: 0 }, target: 11 }), 'a')).toBe(false);
  });
});

describe('回合與版面', () => {
  it('回合最小是 1，沒有第 0 回合', () => {
    expect(setRound(state(), 0).round).toBe(1);
    expect(setRound(state(), -3).round).toBe(1);
  });

  it('回合有上限', () => {
    expect(setRound(state(), MAX_ROUND + 50).round).toBe(MAX_ROUND);
  });

  it('對坐模式是開關', () => {
    expect(toggleFacing(state()).facing).toBe(true);
    expect(toggleFacing(toggleFacing(state())).facing).toBe(false);
  });
});

describe('開新的一局', () => {
  it('分數與回合歸零，但保留勝利分數與對坐模式', () => {
    const before = state({ scores: { a: 5, b: 3 }, round: 7, target: 11, facing: true });
    const after = resetScores(before);
    expect(after.scores).toEqual({ a: 0, b: 0 });
    expect(after.round).toBe(1);
    expect(after.target).toBe(11);
    expect(after.facing).toBe(true);
  });
});

describe('讀回存檔 —— 這是不可信輸入', () => {
  const now = 1_700_000_000_000;
  const valid = { scores: { a: 3, b: 5 }, target: 8, round: 4, facing: true, savedAt: now - 1000 };

  it('合法的內容讀得回來', () => {
    expect(parseState(valid, now)).toEqual({
      scores: { a: 3, b: 5 },
      target: 8,
      round: 4,
      facing: true,
    });
  });

  it('超過保鮮期就當作上一局，不還原', () => {
    expect(parseState({ ...valid, savedAt: now - FRESH_MS - 1 }, now)).toBeNull();
  });

  it('存檔時間在未來（改過系統時間或被竄改）一律不信', () => {
    expect(parseState({ ...valid, savedAt: now + 60_000 }, now)).toBeNull();
  });

  /*
   * 這一組就是 PROGRESS.md 問題 67 的教訓：
   * `Number("0x5")` 是 5、`Number("1e1")` 是 10。
   * 寬鬆解析會讓奇怪的字串變成合法分數，所以這裡只接受真正的非負整數。
   */
  it('分數必須是真正的非負整數，字串與小數都不收', () => {
    for (const bad of ['3', '0x5', '1e1', 3.5, -1, Number.NaN, Infinity, null, undefined]) {
      expect(parseState({ ...valid, scores: { a: bad, b: 0 } }, now), `${String(bad)}`).toBeNull();
    }
  });

  it('分數超過上限不收', () => {
    expect(parseState({ ...valid, scores: { a: MAX_SCORE + 1, b: 0 } }, now)).toBeNull();
  });

  it('勝利分數不在官方清單裡就不收', () => {
    expect(parseState({ ...valid, target: 7 }, now)).toBeNull();
  });

  it('回合不合理不收', () => {
    expect(parseState({ ...valid, round: 0 }, now)).toBeNull();
    expect(parseState({ ...valid, round: MAX_ROUND + 1 }, now)).toBeNull();
  });

  it('缺欄位、型別不對、根本不是物件都不收', () => {
    for (const bad of [null, undefined, 42, 'hello', [], {}, { ...valid, facing: 'true' }]) {
      expect(parseState(bad, now), JSON.stringify(bad) ?? 'undefined').toBeNull();
    }
  });
});
