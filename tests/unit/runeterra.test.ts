/**
 * 領域徽章與傳奇列的測試。
 *
 * 首頁的傳奇數量與篩選結果都是從卡牌資料算出來的 —— 這裡用資料驗證，
 * 不靠記憶。哪天新系列加入傳奇，數量類的測試會先紅燈提醒，
 * 但首頁本身不用改（數量不寫死）。
 */

import { describe, expect, it } from 'vitest';
import { ALL_CARDS, TAXONOMY } from '../../src/lib/cards';
import {
  DOMAIN_ESSENCE,
  matchesDomains,
  OPPOSITE,
  pairKey,
  playDomains,
  RING,
  toggleDomain,
} from '../../src/lib/runeterra-core';
import {
  allLegends,
  championTagOf,
  REGION_TAGS,
  showcaseLegends,
} from '../../src/lib/runeterra';

describe('領域的基本資料', () => {
  it('對立關係是對稱的，而且排成一列時對立的兩個剛好隔三格', () => {
    RING.forEach((domain, i) => {
      expect(OPPOSITE[OPPOSITE[domain]]).toBe(domain);
      expect(OPPOSITE[domain]).toBe(RING[(i + 3) % 6]);
    });
  });

  it('每個領域都有三種語言的風格描述', () => {
    for (const domain of RING) {
      expect(DOMAIN_ESSENCE[domain]['zh-TW'].length).toBeGreaterThan(0);
      expect(DOMAIN_ESSENCE[domain]['zh-CN'].length).toBeGreaterThan(0);
      expect(DOMAIN_ESSENCE[domain].en.length).toBeGreaterThan(0);
    }
  });
});

describe('傳奇清單', () => {
  const legends = allLegends(ALL_CARDS);

  it('跟卡牌資料裡的傳奇卡名數量一致（同名異畫只算一次）', () => {
    const names = new Set(ALL_CARDS.filter((c) => c.types.includes('legend')).map((c) => c.name));
    expect(legends).toHaveLength(names.size);
  });

  /* 數量快照：資料變了會先紅燈，提醒看一下首頁是否需要調整說明文字。 */
  it('目前是 16 位：起源 12 位＋試煉場 4 位', () => {
    expect(legends.filter((l) => l.set === 'OGN')).toHaveLength(12);
    expect(legends.filter((l) => l.set === 'OGS')).toHaveLength(4);
  });

  it('起源系列排在前面', () => {
    const firstStarter = legends.findIndex((l) => l.set === 'OGS');
    expect(legends.slice(firstStarter).every((l) => l.set === 'OGS')).toBe(true);
  });

  it('每位傳奇剛好兩個領域', () => {
    for (const legend of legends) expect(playDomains(legend)).toHaveLength(2);
  });

  /*
   * 這條說明為什麼放棄第一版「一組領域畫一條線」的設計：
   * 同一組領域不只一位傳奇，一條線對應不了。
   */
  it('有些領域組合不只一位傳奇', () => {
    const keys = legends.map((l) => {
      const [a, b] = playDomains(l);
      return pairKey(a!, b!);
    });
    expect(new Set(keys).size).toBeLessThan(keys.length);
  });
});

describe('領域篩選', () => {
  it('點新的就加入，點已選的就取消', () => {
    expect(toggleDomain([], 'fury')).toEqual(['fury']);
    expect(toggleDomain(['fury'], 'mind')).toEqual(['fury', 'mind']);
    expect(toggleDomain(['fury', 'mind'], 'fury')).toEqual(['mind']);
  });

  it('最多兩個：選第三個時換掉最早選的那個', () => {
    expect(toggleDomain(['fury', 'mind'], 'chaos')).toEqual(['mind', 'chaos']);
  });

  it('沒選＝全部符合；選一個＝含有它；選兩個＝兩個都要有', () => {
    expect(matchesDomains(['fury', 'mind'], [])).toBe(true);
    expect(matchesDomains(['fury', 'mind'], ['fury'])).toBe(true);
    expect(matchesDomains(['fury', 'mind'], ['fury', 'mind'])).toBe(true);
    expect(matchesDomains(['fury', 'mind'], ['fury', 'chaos'])).toBe(false);
  });

  it('用真實資料：熾烈＋混沌有兩位傳奇（起源與試煉場各一）', () => {
    const matched = allLegends(ALL_CARDS).filter((l) =>
      matchesDomains(playDomains(l), ['fury', 'chaos']),
    );
    expect(matched.map((l) => l.set).sort()).toEqual(['OGN', 'OGS']);
  });

  it('用真實資料：對立的兩個領域目前沒有傳奇', () => {
    for (const domain of RING) {
      const matched = allLegends(ALL_CARDS).filter((l) =>
        matchesDomains(playDomains(l), [domain, OPPOSITE[domain]]),
      );
      expect(matched).toHaveLength(0);
    }
  });
});

/*
 * 區域地圖已經拿掉，區域標籤只剩一個用途：分辨卡片標籤裡哪個是英雄、哪個是區域。
 */
describe('區域標籤', () => {
  it('每個區域標籤都真的存在於卡牌資料', () => {
    for (const tag of REGION_TAGS) expect(TAXONOMY.tags).toContain(tag);
  });

  it('傳奇的英雄標籤不會被誤認成區域名稱', () => {
    for (const legend of allLegends(ALL_CARDS)) {
      const champion = championTagOf(legend);
      if (champion) expect(REGION_TAGS.has(champion)).toBe(false);
    }
  });
});

describe('首頁主視覺挑的傳奇', () => {
  const picked = showcaseLegends(allLegends(ALL_CARDS), 5);

  it('挑出 5 位，不重複', () => {
    expect(picked).toHaveLength(5);
    expect(new Set(picked.map((c) => c.name)).size).toBe(5);
  });

  it('五張卡合起來涵蓋全部六個領域 —— 畫面帶進六種領域的顏色', () => {
    const domains = new Set(picked.flatMap((c) => playDomains(c)));
    expect(domains.size).toBe(6);
  });

  it('要的數量比傳奇還多時，就全部給，不會出錯', () => {
    const legends = allLegends(ALL_CARDS);
    expect(showcaseLegends(legends, legends.length + 5)).toHaveLength(legends.length);
  });
});
