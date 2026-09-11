import { describe, expect, it } from 'vitest';
import { angleForIndex, frontFromAngle, ringRadius, snapAngle } from '../../src/lib/showcase';

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
