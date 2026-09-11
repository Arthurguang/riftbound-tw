import { describe, expect, it } from 'vitest';
import { backdropEnabled, backdropIntensity } from '../../src/lib/ambience';

describe('背景動畫設定', () => {
  it('首頁完整呈現，其他頁面（工具頁）比較淡', () => {
    expect(backdropIntensity('/')).toBe(1);
    for (const path of ['/cards', '/cards/ogn-001-298', '/rules', '/deck', '/odds', '/replay']) {
      expect(backdropIntensity(path)).toBeLessThan(1);
      expect(backdropIntensity(path)).toBeGreaterThan(0);
    }
  });

  /*
   * 復盤頁的牌桌蓋滿整個畫面，而且 WebKit 每次更新畫面都會重畫整片固定背景（實測拖慢 2 倍多），
   * 所以只有復盤頁不放背景。
   */
  it('對局復盤頁不放背景，其他頁面都放', () => {
    expect(backdropEnabled('/replay')).toBe(false);
    for (const path of ['/', '/cards', '/cards/ogn-001-298', '/rules', '/deck', '/odds', '/replayx']) {
      expect(backdropEnabled(path)).toBe(true);
    }
  });
});
