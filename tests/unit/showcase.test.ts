import { describe, expect, it } from 'vitest';
import {
  SECONDS_PER_CARD,
  SHOWCASE_SIZE,
  angleForIndex,
  frontFromAngle,
  pickShowcase,
  ringRadius,
  snapAngle,
  speedDegPerSec,
} from '../../src/lib/showcase';

describe('傳奇展示台的轉盤計算', () => {
  // 16 張卡，每張相隔 22.5 度
  it('角度換成正前方是第幾張：轉超過一圈、往回轉、停在兩張中間都對', () => {
    expect(frontFromAngle(0, 16)).toBe(0);
    expect(frontFromAngle(22.5, 16)).toBe(1);
    expect(frontFromAngle(360 + 22.5, 16)).toBe(1);
    expect(frontFromAngle(-22.5, 16)).toBe(15);
    expect(frontFromAngle(11, 16)).toBe(0);
    expect(frontFromAngle(12, 16)).toBe(1);
    expect(frontFromAngle(5, 0)).toBe(0);
  });

  it('放開拖曳時對齊到最近的一張', () => {
    expect(snapAngle(100, 16)).toBe(90);
    expect(snapAngle(-10, 16)).toBeCloseTo(0);
    expect(snapAngle(-12, 16)).toBe(-22.5);
    expect(snapAngle(42, 0)).toBe(42);
  });

  it('轉到指定的卡時走最近的方向，不會倒轉一整圈', () => {
    expect(angleForIndex(350, 0, 16)).toBe(360);
    expect(angleForIndex(10, 15, 16)).toBe(-22.5);
    expect(angleForIndex(720 + 3, 2, 16)).toBe(720 + 45);
    expect(angleForIndex(33, 4, 0)).toBe(33);
  });

  /*
   * 每張卡平平的貼在一個正多邊形的一邊上（卡面朝外），半徑是多邊形中心到邊的距離。
   * 多邊形的邊長是 2r·tan(π/n)；邊長不小於卡寬，相鄰兩張卡就不會互相穿插。
   */
  it('轉盤半徑讓相鄰兩張卡不重疊，卡越多圈越大', () => {
    const width = 180;
    for (const count of [5, 8, 12, 16, 24]) {
      const r = ringRadius(width, count);
      expect(2 * r * Math.tan(Math.PI / count)).toBeGreaterThanOrEqual(width);
    }
    expect(ringRadius(width, 16)).toBeGreaterThan(ringRadius(width, 8));
  });
});

/**
 * 2026-10-13 使用者回饋：「轉動太快」「傳奇會越來越多，改成每次隨機挑 20 位」。
 *
 * 這兩件事其實是同一個問題的兩面：張數變多之後，固定的角速度會讓卡片
 * 一張接一張閃過去。所以速度改成以「每張卡停在正前方幾秒」定義。
 */
describe('展示台的張數與速度', () => {
  it('每張卡露臉的時間固定，與張數無關', () => {
    for (const count of [8, 16, 20, 57]) {
      const secondsPerTurn = 360 / speedDegPerSec(count);
      expect(secondsPerTurn / count).toBeCloseTo(SECONDS_PER_CARD);
    }
  });

  it('卡越多轉越慢，而且不會除以零', () => {
    expect(speedDegPerSec(57)).toBeLessThan(speedDegPerSec(16));
    expect(speedDegPerSec(0)).toBe(0);
  });

  it('修正前的速度（每秒 6 度）在 57 位時每張不到 1.1 秒 —— 這就是「太快」', () => {
    const oldSecondsPerCard = 360 / 6 / 57;
    expect(oldSecondsPerCard).toBeLessThan(1.1);
    expect(SECONDS_PER_CARD).toBeGreaterThan(oldSecondsPerCard);
  });

  it('挑出來的張數正確，而且不會重複挑到同一張', () => {
    const pool = Array.from({ length: 57 }, (_, i) => i);
    const picked = pickShowcase(pool, SHOWCASE_SIZE);
    expect(picked).toHaveLength(SHOWCASE_SIZE);
    expect(new Set(picked).size).toBe(SHOWCASE_SIZE);
    for (const item of picked) expect(pool).toContain(item);
  });

  it('池子比要挑的少時，就全部拿出來（不會補 undefined）', () => {
    const pool = [1, 2, 3];
    expect(pickShowcase(pool, 20).sort()).toEqual([1, 2, 3]);
    expect(pickShowcase([], 20)).toEqual([]);
  });

  /*
   * 真的有洗過：用固定的亂數序列驗結果，而不是「跑幾次看起來不一樣」——
   * 那種測試會偶發紅燈，而偶發紅燈比沒有測試還糟。
   */
  it('真的有洗牌，不是每次都回傳前 20 張', () => {
    const pool = Array.from({ length: 10 }, (_, i) => i);
    // random 一律回 0 → Fisher–Yates 會把每一張都換到最前面，順序必定改變
    const picked = pickShowcase(pool, 10, () => 0);
    expect(picked).not.toEqual(pool);
    expect([...picked].sort((a, b) => a - b)).toEqual(pool);
  });

  it('原本的陣列不會被改掉（純函式）', () => {
    const pool = [1, 2, 3, 4, 5];
    pickShowcase(pool, 2, () => 0.5);
    expect(pool).toEqual([1, 2, 3, 4, 5]);
  });
});
