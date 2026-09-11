import { describe, expect, it } from 'vitest';
import { BACKDROP_VARIANTS, backdropIntensity, isBackdropVariant } from '../../src/lib/ambience';

describe('背景動畫設定', () => {
  it('首頁完整呈現，其他頁面（工具頁）比較淡', () => {
    expect(backdropIntensity('/')).toBe(1);
    for (const path of ['/cards', '/cards/ogn-001-298', '/rules', '/deck', '/odds', '/replay']) {
      expect(backdropIntensity(path)).toBeLessThan(1);
      expect(backdropIntensity(path)).toBeGreaterThan(0);
    }
  });

  /*
   * 風格是從 localStorage 讀回來的 —— 瀏覽器裡的東西永遠不可信（安全憲法第一條），
   * 只接受已知的三個值，其他一律當作沒存過。
   */
  it('只接受已知的三種風格', () => {
    for (const variant of BACKDROP_VARIANTS) expect(isBackdropVariant(variant)).toBe(true);
    for (const bad of [null, undefined, '', 'EMBERS', 'fire', 42, '<script>alert(1)</script>']) {
      expect(isBackdropVariant(bad)).toBe(false);
    }
  });
});
