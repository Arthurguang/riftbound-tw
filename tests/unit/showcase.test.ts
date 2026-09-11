import { describe, expect, it } from 'vitest';
import { frontIndex, ringRadius, shortestStep } from '../../src/lib/showcase';

describe('傳奇展示台的轉盤計算', () => {
  it('累計步數換成第幾張，轉超過一圈、往回轉都對', () => {
    expect(frontIndex(0, 16)).toBe(0);
    expect(frontIndex(17, 16)).toBe(1);
    expect(frontIndex(-1, 16)).toBe(15);
    expect(frontIndex(-17, 16)).toBe(15);
    expect(frontIndex(5, 0)).toBe(0);
  });

  it('轉到指定的卡時走最近的方向', () => {
    expect(shortestStep(0, 1, 16)).toBe(1);
    expect(shortestStep(0, 15, 16)).toBe(-1);
    expect(shortestStep(15, 0, 16)).toBe(1);
    expect(shortestStep(3, 3, 16)).toBe(0);
    // 剛好半圈：往下一位
    expect(shortestStep(0, 8, 16)).toBe(8);
    expect(shortestStep(2, 1, 0)).toBe(0);
  });

  /*
   * 每張卡平平的貼在一個正多邊形的一邊上（卡面朝外），半徑是多邊形中心到邊的距離。
   * 多邊形的邊長是 2r·tan(π/n)；邊長不小於卡寬，相鄰兩張卡就不會互相穿插。
   */
  it('轉盤半徑讓相鄰兩張卡不重疊，卡越多圈越大', () => {
    const width = 132;
    for (const count of [5, 8, 12, 16, 24]) {
      const r = ringRadius(width, count);
      expect(2 * r * Math.tan(Math.PI / count)).toBeGreaterThanOrEqual(width);
    }
    expect(ringRadius(width, 16)).toBeGreaterThan(ringRadius(width, 8));
  });
});
