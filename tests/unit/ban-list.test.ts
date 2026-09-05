/**
 * 禁卡表的測試。
 *
 * 這份資料跟站上其他資料不同：**它是人工維護的，而且沒有 API 可以對答案**。
 * 所以測試的重點不是「函式行為對不對」，而是**這份人工對應有沒有腐爛**。
 *
 * 最關鍵的是「還沒收錄的系列」那組測試 —— 等我們收錄 SFD 之後，
 * 那些原本 name=null 的禁卡會突然真的存在於卡池裡。如果沒有人記得回來
 * 補上對應，禁卡檢查就會**靜靜地漏掉它們**。那組測試會在那一刻變紅燈，
 * 強迫我們處理。這是這個檔案存在的主要理由。
 */

import { describe, expect, it } from 'vitest';
import { ALL_CARDS } from '../../src/lib/cards';
import { BAN_LIST, BAN_LIST_VERSION, banEntriesFor, bannedEntryFor } from '../../src/lib/ban-list';
import { checkLegality, EMPTY_DECK } from '../../src/lib/deck-rules';
import type { Card } from '../../src/lib/types';

const byId = new Map(ALL_CARDS.map((c) => [c.id, c]));
const byName = (name: string): Card | undefined => ALL_CARDS.find((c) => c.name === name);

describe('禁卡表的資料本身', () => {
  it('有標示版本日期與官方出處 —— 使用者要能自己查證', () => {
    expect(BAN_LIST_VERSION.updated).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(BAN_LIST_VERSION.url.startsWith('https://playriftbound.com/')).toBe(true);
  });

  it('官方原文不重複', () => {
    const names = BAN_LIST.map((e) => e.official);
    expect(new Set(names).size).toBe(names.length);
  });

  it('每一筆都至少屬於一個賽制', () => {
    for (const e of BAN_LIST) expect(e.formats.length).toBeGreaterThan(0);
  });
});

describe('人工對應有沒有對到真的卡片', () => {
  it('有填卡名的，卡池裡一定找得到', () => {
    for (const e of BAN_LIST) {
      if (e.name === null) continue;
      expect(byName(e.name), `禁卡表的「${e.official}」對應到「${e.name}」，但卡池裡沒有這張卡`)
        .toBeDefined();
    }
  });

  it('填 null 的，卡池裡確實沒有 —— 收錄新系列後這條會變紅燈，提醒回來補', () => {
    for (const e of BAN_LIST) {
      if (e.name !== null) continue;
      const exists = ALL_CARDS.some(
        (c) => c.name === e.official || `${c.tags[0] ?? ''}, ${c.name}` === e.official,
      );
      expect(
        exists,
        `禁卡「${e.official}」（${e.set}）現在已經在卡池裡了，請把它的 name 欄位填上，否則禁卡檢查會漏掉它`,
      ).toBe(false);
    }
  });

  /*
   * 這條把「不能照字面比對」這個教訓釘住。
   * 官方禁卡表寫「Dreaming Tree」，我們卡池裡叫「The Dreaming Tree」——
   * 如果有人哪天「順手」把 name 改成跟 official 一樣，這條會馬上擋下來。
   */
  it('官方寫法與實際卡名不同的那幾筆，差異還在', () => {
    const tree = BAN_LIST.find((e) => e.official === 'Dreaming Tree');
    expect(tree?.name).toBe('The Dreaming Tree');
    expect(byName('Dreaming Tree')).toBeUndefined();
    expect(byName('The Dreaming Tree')).toBeDefined();

    const yi = BAN_LIST.find((e) => e.official === 'Master Yi, Wuju Bladesman');
    expect(yi?.name).toBe('Wuju Bladesman - Starter');
    expect(byName('Master Yi, Wuju Bladesman')).toBeUndefined();
  });
});

describe('查詢函式', () => {
  it('1v1 構築認得被禁的戰場', () => {
    const card = byName("Aspirant's Climb")!;
    expect(bannedEntryFor(card, 'constructed')?.official).toBe("Aspirant's Climb");
  });

  it('沒被禁的卡回傳 null', () => {
    const ok = ALL_CARDS.find((c) => banEntriesFor(c).length === 0)!;
    expect(bannedEntryFor(ok, 'constructed')).toBeNull();
  });

  /*
   * 官方公告特別說明過：被 2v2 禁掉的那張傳奇，在 1v1 的表現是合理的。
   * 把 2v2 的限制套到 1v1 會平白擋掉一張能用的卡 —— 那比漏掉還糟。
   */
  it('只在 2v2 被禁的傳奇，不會影響 1v1', () => {
    const yi = byName('Wuju Bladesman - Starter')!;
    expect(bannedEntryFor(yi, 'constructed')).toBeNull();
    expect(bannedEntryFor(yi, 'constructed-2v2')?.official).toBe('Master Yi, Wuju Bladesman');
    // 圖鑑仍要標示得出來（它確實在某個賽制被禁）
    expect(banEntriesFor(yi)).toHaveLength(1);
  });
});

describe('接進牌組合法性檢查', () => {
  const banned = byName("Aspirant's Climb")!;

  it('放了禁卡會跳提醒，而且引用得到禁卡表版本', () => {
    const result = checkLegality({ ...EMPTY_DECK, battlefields: { [banned.id]: 1 } }, byId);
    const hit = result.issues.filter((i) => i.rule.startsWith('禁卡表'));
    expect(hit).toHaveLength(1);
    expect(hit[0]!.severity).toBe('warning');
    expect(hit[0]!.rule).toContain(BAN_LIST_VERSION.updated);
    expect(hit[0]!.message['zh-TW']).toContain("Aspirant's Climb");
  });

  /*
   * 提醒而不是錯誤 —— 禁卡表只在正式賽事適用，跟朋友隨便玩不受限制。
   * 這跟站上既有的賽事構築限制（備牌上限、主牌組恰好 40 張）是同一個標準。
   */
  it('是提醒不是錯誤 —— 不影響 legal 判定', () => {
    const clean = checkLegality(EMPTY_DECK, byId);
    const withBan = checkLegality({ ...EMPTY_DECK, battlefields: { [banned.id]: 1 } }, byId);
    expect(withBan.legal).toBe(clean.legal);
  });

  it('同一張禁卡放很多張，只提醒一次 —— 不要洗版', () => {
    const result = checkLegality({ ...EMPTY_DECK, battlefields: { [banned.id]: 3 } }, byId);
    expect(result.issues.filter((i) => i.rule.startsWith('禁卡表'))).toHaveLength(1);
  });

  it('備牌裡的禁卡一樣會被抓到', () => {
    const spell = byName('Fight or Flight')!;
    const result = checkLegality({ ...EMPTY_DECK, sideboard: { [spell.id]: 1 } }, byId);
    expect(result.issues.some((i) => i.message['zh-TW'].includes('Fight or Flight'))).toBe(true);
  });

  it('乾淨的牌組不會冒出禁卡提醒', () => {
    const ok = ALL_CARDS.find((c) => c.types.includes('battlefield') && !banEntriesFor(c).length)!;
    const result = checkLegality({ ...EMPTY_DECK, battlefields: { [ok.id]: 1 } }, byId);
    expect(result.issues.some((i) => i.rule.startsWith('禁卡表'))).toBe(false);
  });
});
