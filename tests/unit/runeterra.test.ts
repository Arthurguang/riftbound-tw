/**
 * 符文陣圖的測試。
 *
 * 首頁寫著「十二位傳奇，一人一組、不重複」—— 這是一句關於卡牌資料的陳述，
 * 所以要用資料驗證，而不是相信它。哪天新系列加入第十三位傳奇，
 * 或官方調整了某位傳奇的領域，這裡會先紅燈，網站上那句話就不會悄悄變成錯的。
 */

import { describe, expect, it } from 'vitest';
import { ALL_CARDS, TAXONOMY } from '../../src/lib/cards';
import {
  DOMAIN_ESSENCE,
  nonOppositePairs,
  OPPOSITE,
  pairKey,
  playDomains,
  RING,
} from '../../src/lib/runeterra-core';
import { originLegends, REGIONS, regionStat } from '../../src/lib/runeterra';

describe('符文陣的結構', () => {
  it('對立的兩個領域在環上相對而立', () => {
    RING.forEach((domain, i) => {
      expect(OPPOSITE[domain]).toBe(RING[(i + 3) % 6]);
    });
  });

  it('不對立的配對剛好 12 組，而且沒有一組是對立的', () => {
    const pairs = nonOppositePairs();
    expect(pairs).toHaveLength(12);
    for (const [a, b] of pairs) expect(OPPOSITE[a]).not.toBe(b);
  });

  it('每個領域都有三種語言的風格描述', () => {
    for (const domain of RING) {
      expect(DOMAIN_ESSENCE[domain]['zh-TW'].length).toBeGreaterThan(0);
      expect(DOMAIN_ESSENCE[domain]['zh-CN'].length).toBeGreaterThan(0);
      expect(DOMAIN_ESSENCE[domain].en.length).toBeGreaterThan(0);
    }
  });
});

describe('首頁那句話：起源系列的十二位傳奇一人一組', () => {
  const legends = originLegends(ALL_CARDS);

  it('起源系列剛好 12 位傳奇', () => {
    expect(legends).toHaveLength(12);
  });

  it('每位傳奇剛好兩個不對立的領域', () => {
    for (const legend of legends) {
      const [a, b] = playDomains(legend);
      expect(a).toBeDefined();
      expect(b).toBeDefined();
      expect(OPPOSITE[a!]).not.toBe(b);
    }
  });

  it('十二位傳奇的領域組合互不重複，正好涵蓋全部 12 組', () => {
    const keys = legends.map((l) => {
      const [a, b] = playDomains(l);
      return pairKey(a!, b!);
    });
    expect(new Set(keys).size).toBe(12);
    const all = new Set(nonOppositePairs().map(([a, b]) => pairKey(a, b)));
    for (const key of keys) expect(all.has(key)).toBe(true);
  });

  /*
   * 為什麼只算起源：試煉場的入門傳奇和起源傳奇共用同樣的組合。
   * 這條測試把這件事釘住 —— 如果有人「順手」把試煉場也算進來，
   * 首頁那句「一人一組」就不成立了。
   */
  it('試煉場的傳奇會跟起源的組合重複 —— 所以陣圖只畫起源', () => {
    const originKeys = new Set(
      legends.map((l) => {
        const [a, b] = playDomains(l);
        return pairKey(a!, b!);
      }),
    );
    const starters = ALL_CARDS.filter((c) => c.set === 'OGS' && c.types.includes('legend'));
    expect(starters.length).toBeGreaterThan(0);
    for (const starter of starters) {
      const [a, b] = playDomains(starter);
      expect(originKeys.has(pairKey(a!, b!))).toBe(true);
    }
  });
});

describe('區域資料', () => {
  it('每個區域標籤都真的存在於卡牌資料', () => {
    for (const region of REGIONS) expect(TAXONOMY.tags).toContain(region.tag);
  });

  it('區域的卡數是從資料算出來的，而且同名卡只算一次', () => {
    for (const region of REGIONS) {
      const stat = regionStat(ALL_CARDS, region.tag);
      const names = new Set(ALL_CARDS.filter((c) => c.tags.includes(region.tag)).map((c) => c.name));
      expect(stat.count).toBe(names.size);
      expect(stat.count).toBeGreaterThan(0);
    }
  });

  it('英雄名單不會把區域名稱本身當成英雄', () => {
    const regionTags = new Set(REGIONS.map((r) => r.tag));
    for (const region of REGIONS) {
      for (const champion of regionStat(ALL_CARDS, region.tag).champions) {
        expect(regionTags.has(champion)).toBe(false);
      }
    }
  });

  it('每個區域都有三種語言的簡介', () => {
    for (const region of REGIONS) {
      expect(region.lore['zh-TW'].length).toBeGreaterThan(0);
      expect(region.lore['zh-CN'].length).toBeGreaterThan(0);
      expect(region.lore.en.length).toBeGreaterThan(0);
    }
  });
});
