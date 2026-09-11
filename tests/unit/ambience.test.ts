import { describe, expect, it } from 'vitest';
import { backdropIntensity } from '../../src/lib/ambience';

describe('背景動畫設定', () => {
  it('首頁完整呈現，其他頁面（工具頁）比較淡', () => {
    expect(backdropIntensity('/')).toBe(1);
    for (const path of ['/cards', '/cards/ogn-001-298', '/rules', '/deck', '/odds', '/replay']) {
      expect(backdropIntensity(path)).toBeLessThan(1);
      expect(backdropIntensity(path)).toBeGreaterThan(0);
    }
  });
});
