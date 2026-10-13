/**
 * 流派徽章與傳奇列的測試。
 *
 * 首頁的傳奇數量與篩選結果都是從卡牌資料算出來的 —— 這裡用資料驗證，
 * 不靠記憶。哪天新系列加入傳奇，數量類的測試會先紅燈提醒，
 * 但首頁本身不用改（數量不寫死）。
 */

import { describe, expect, it } from 'vitest';
import { ALL_CARDS, TAXONOMY } from '../../src/lib/cards';
import { SET_IDS } from '../../src/lib/types';
import {
  DOMAIN_ESSENCE,
  matchesDomains,
  OPPOSITE,
  pairKey,
  playDomains,
  RING,
  toggleDomain,
} from '../../src/lib/runeterra-core';
import { allLegends, championTagOf, REGION_TAGS } from '../../src/lib/runeterra';

describe('流派的基本資料', () => {
  it('對立關係是對稱的，而且排成一列時對立的兩個剛好隔三格', () => {
    RING.forEach((domain, i) => {
      expect(OPPOSITE[OPPOSITE[domain]]).toBe(domain);
      expect(OPPOSITE[domain]).toBe(RING[(i + 3) % 6]);
    });
  });

  it('每個流派都有三種語言的風格描述', () => {
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

  /*
   * 數量快照：資料變了會先紅燈，提醒看一下首頁是否需要調整說明文字。
   * 2026-10-13 收錄六個系列後從 16 位變成 57 位。
   */
  it('目前是 57 位，六個系列都有', () => {
    const bySet: Record<string, number> = {
      OGN: 12, OGS: 4, RAD: 8, SFD: 12, UNL: 12, VEN: 9,
    };
    for (const [set, count] of Object.entries(bySet)) {
      expect(legends.filter((l) => l.set === set), `${set} 傳奇數`).toHaveLength(count);
    }
    expect(legends).toHaveLength(57);
  });

  it('依系列的官方順序排列，同系列依卡號', () => {
    const order = legends.map((l) => SET_IDS.indexOf(l.set));
    expect(order).toEqual([...order].sort((a, b) => a - b));
    for (const set of SET_IDS) {
      const numbers = legends.filter((l) => l.set === set).map((l) => l.number);
      expect(numbers, `${set} 卡號順序`).toEqual([...numbers].sort((a, b) => a - b));
    }
  });

  it('每位傳奇剛好兩個流派', () => {
    for (const legend of legends) expect(playDomains(legend)).toHaveLength(2);
  });

  /*
   * 這條說明為什麼放棄第一版「一組流派畫一條線」的設計：
   * 同一組流派不只一位傳奇，一條線對應不了。
   */
  it('有些流派組合不只一位傳奇', () => {
    const keys = legends.map((l) => {
      const [a, b] = playDomains(l);
      return pairKey(a!, b!);
    });
    expect(new Set(keys).size).toBeLessThan(keys.length);
  });
});

describe('流派篩選', () => {
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

  it('用真實資料：狂怒＋渾沌每個系列都有一位傳奇', () => {
    const matched = allLegends(ALL_CARDS).filter((l) =>
      matchesDomains(playDomains(l), ['fury', 'chaos']),
    );
    expect(matched.map((l) => l.set).sort()).toEqual([...SET_IDS].sort());
  });

  /*
   * 2026-10-13 更新：原本這條寫「對立的兩個流派沒有傳奇」，
   * 收錄 Vendetta 後不再成立 —— 該系列刻意做了三位跨對立流派的傳奇
   * （VEN-139 狂怒＋平靜、VEN-149 心智＋身體、VEN-155 渾沌＋秩序）。
   *
   * 這是官方設計的改變，不是資料壞掉，所以改成記錄「哪幾組對立有傳奇」。
   * 之後再出跨對立的傳奇時這條會紅燈，提醒回來確認首頁的篩選說明。
   */
  it('用真實資料：跨對立流派的傳奇只有 Vendetta 那三位', () => {
    const crossing = allLegends(ALL_CARDS).filter((l) => {
      const [a, b] = playDomains(l);
      return a !== undefined && b !== undefined && OPPOSITE[a] === b;
    });
    expect(crossing.map((l) => l.code).sort()).toEqual([
      'VEN-139/166',
      'VEN-149/166',
      'VEN-155/166',
    ]);
    // 篩選器照樣找得到它們 —— 選了對立的兩個流派不會變成空清單
    for (const legend of crossing) {
      const [a, b] = playDomains(legend);
      expect(matchesDomains(playDomains(legend), [a!, b!])).toBe(true);
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