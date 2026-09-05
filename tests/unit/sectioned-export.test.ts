/**
 * 分區英文牌表的測試。
 *
 * 這個格式是**給其他工具讀的**，所以測試的重點不是「字串長得漂亮」，
 * 而是三件會讓對方解析器失敗的事：
 *
 *   1. 卡名一定是官方英文（對方的資料庫以英文為索引）
 *   2. 沒有任何多餘的字（卡號、署名、收藏標記都會被當成卡片）
 *   3. 我們自己匯得回來 —— 這是唯一能自動驗證的正確性下限
 *
 * 第 3 點最重要：我們無法在測試裡連到別人的網站，但如果連自己的解析器
 * 都讀不回來，那格式一定有問題。
 */

import { describe, expect, it } from 'vitest';
import { toSectionedText } from '../../src/lib/deck-export';
import { legendFullName } from '../../src/lib/cards';
import { importDeck, inferChampion } from '../../src/lib/deck-import';
import { ALL_CARDS } from '../../src/lib/cards';
import type { Deck } from '../../src/lib/deck-rules';
import type { Card } from '../../src/lib/types';

const byId = new Map(ALL_CARDS.map((c) => [c.id, c]));

/*
 * 傳奇與選定英雄要真的成對 —— 規則 103.2.a.2 要求選定英雄的標籤
 * 與傳奇相符，隨便挑兩張湊不成一副合法牌組，也測不出真實流程。
 */
const pair = ALL_CARDS.filter((c) => c.types.includes('legend'))
  .map((lg) => ({
    legend: lg,
    champion: ALL_CARDS.find(
      (c) => c.subtype === 'champion' && c.tags.some((t) => lg.tags.includes(t)),
    ),
  }))
  .find((p): p is { legend: Card; champion: Card } => Boolean(p.champion))!;

const legend = pair.legend;
const champion = pair.champion;
const battlefield = ALL_CARDS.find((c) => c.types.includes('battlefield'))!;
const battlefield2 = ALL_CARDS.find(
  (c) => c.types.includes('battlefield') && c.name !== battlefield.name,
)!;
const rune = ALL_CARDS.find((c) => c.types.includes('rune'))!;
const unit = ALL_CARDS.find((c) => c.types.includes('unit') && c.subtype !== 'champion')!;
const spell = ALL_CARDS.find((c) => c.types.includes('spell'))!;

const deck: Deck = {
  legendId: legend.id,
  championId: champion.id,
  main: { [champion.id]: 1, [unit.id]: 3, [spell.id]: 2 },
  runes: { [rune.id]: 12 },
  battlefields: { [battlefield.id]: 1, [battlefield2.id]: 1 },
  sideboard: { [spell.id]: 1 },
};

describe('分區英文牌表', () => {
  const text = toSectionedText(deck, byId);

  it('每個非空區段都有 "標題:" 那一行', () => {
    expect(text).toContain('Legend:');
    expect(text).toContain('Champion:');
    expect(text).toContain('Main Deck:');
    expect(text).toContain('Runes:');
    expect(text).toContain('Battlefields:');
    expect(text).toContain('Sideboard:');
  });

  it('空的區段不會留下空標題', () => {
    const noSide = toSectionedText({ ...deck, sideboard: {} }, byId);
    expect(noSide).not.toContain('Sideboard:');
    expect(noSide).toContain('Main Deck:');
  });

  it('卡片行是「張數 空格 英文卡名」', () => {
    expect(text).toContain(`12 ${rune.name}`);
    expect(text).toContain(`3 ${unit.name}`);
    expect(text).toContain(`1 ${battlefield.name}`);
  });

  it('用官方英文卡名，不受介面語言影響', () => {
    // 這個格式沒有語言參數 —— 傳不進中文，所以不可能輸出中文
    expect(toSectionedText).toHaveLength(2); // (deck, byId)
    // 內容裡不該出現任何中日韓字元
    expect(text).not.toMatch(/[一-鿿]/);
  });

  it('不含卡號、署名、收藏標記 —— 那些會被對方當成卡片', () => {
    expect(text).not.toContain(unit.code);
    expect(text).not.toContain('符文戰場資料庫');
    expect(text).not.toContain('缺');
    expect(text).not.toMatch(/^—/m);
  });

  it('同名不同版的卡併成一行 —— 分兩行可能被對方當成覆蓋', () => {
    // 找兩張同名但不同卡號的符文（異畫版）
    const twins = ALL_CARDS.filter((c) => c.types.includes('rune')).filter(
      (c, _i, all) => all.some((o) => o.name === c.name && o.id !== c.id),
    );
    if (twins.length < 2) return; // 這個卡池沒有同名符文就跳過

    const a = twins[0]!;
    const b = twins.find((c) => c.name === a.name && c.id !== a.id)!;
    const out = toSectionedText({ ...deck, runes: { [a.id]: 8, [b.id]: 4 } }, byId);

    const runeLines = out
      .split('\n\n')
      .find((block) => block.startsWith('Runes:'))!
      .split('\n')
      .slice(1);

    expect(runeLines).toEqual([`12 ${a.name}`]);
  });

  it('選定英雄只出現一次 —— 兩區都列會被算成兩張', () => {
    const text2 = toSectionedText(deck, byId);
    const occurrences = text2.split('\n').filter((l) => l.endsWith(` ${champion.name}`));
    expect(occurrences).toEqual([`1 ${champion.name}`]);
  });

  it('不含牌組名稱 —— 對方有自己的名稱欄位', () => {
    // 第一行就是第一個區段標題，前面沒有別的
    expect(text.split('\n')[0]).toBe('Legend:');
  });

  it('區段之間空一行，區段內不空行', () => {
    expect(text).toContain('\n\nChampion:');
    // 「標題:」的下一行一定是卡片，不會是空行
    for (const [, next] of [...text.matchAll(/^(\w[\w ]*):\n(.*)$/gm)]) {
      expect(next).not.toBe('');
    }
  });
});

/*
 * 官方 API 把傳奇的名字拆成兩半：name 只有稱號（Daughter of the Void），
 * 英雄名放在 tags（["Kai'Sa"]）。但牌表上寫的是合起來的
 * 「Kai'Sa, Daughter of the Void」—— 繁中資料本來就是合的，只有英文是拆的。
 *
 * 這個差異先前害我們匯出的牌表貼到別的社群工具時，傳奇那一行被判成找不到卡。
 */
describe('傳奇的完整卡名', () => {
  it('全部傳奇都剛好一個 tag，組法沒有例外', () => {
    const legends = ALL_CARDS.filter((c) => c.types.includes('legend'));
    expect(legends.length).toBeGreaterThan(0);
    for (const l of legends) expect(l.tags).toHaveLength(1);
  });

  it('匯出時補上英雄名前綴', () => {
    const kaisa = ALL_CARDS.find((c) => c.code === 'OGN-247/298')!;
    expect(kaisa.name).toBe('Daughter of the Void');
    expect(legendFullName(kaisa)).toBe("Kai'Sa, Daughter of the Void");

    const text = toSectionedText({ ...deck, legendId: kaisa.id }, byId);
    expect(text).toContain("1 Kai'Sa, Daughter of the Void");
  });

  it('非傳奇卡不動它的名字 —— 英雄卡本來就是完整的', () => {
    const unitCard = ALL_CARDS.find((c) => c.subtype === 'champion')!;
    expect(legendFullName(unitCard)).toBe(unitCard.name);
  });

  it('匯入認得完整名稱 —— 貼別家工具的牌表也讀得進來', () => {
    const kaisa = ALL_CARDS.find((c) => c.code === 'OGN-247/298')!;
    const result = importDeck(["Legend:", "1 Kai'Sa, Daughter of the Void"].join('\n'), ALL_CARDS);
    expect(result.deck.legendId).toBe(kaisa.id);
    expect(result.issues).toEqual([]);
  });

  it('只寫稱號也還是認得 —— 不能因為改格式就讓舊牌表壞掉', () => {
    const kaisa = ALL_CARDS.find((c) => c.code === 'OGN-247/298')!;
    const result = importDeck(['Legend:', '1 Daughter of the Void'].join('\n'), ALL_CARDS);
    expect(result.deck.legendId).toBe(kaisa.id);
  });
});

describe('來回互轉 —— 匯出的東西自己讀得回來', () => {
  it('每一區的張數與卡片都和原本一樣', () => {
    const text = toSectionedText(deck, byId);
    const result = importDeck(text, ALL_CARDS);

    // 一行都不能有問題 —— 任何一張認不出來就代表格式有錯
    expect(result.issues).toEqual([]);
    expect(result.deck.legendId).toBe(legend.id);

    /*
     * championId 由 inferChampion 補上，不是 importDeck 的職責
     * （介面就是這樣接的，見 DeckImport.tsx:49）。
     * 這裡照實際流程走，測的才是使用者真的會遇到的結果。
     */
    expect(inferChampion(result.deck, byId)).toBe(champion.id);
    expect(result.deck.main).toEqual(deck.main);
    expect(result.deck.runes).toEqual(deck.runes);
    expect(result.deck.battlefields).toEqual(deck.battlefields);
    expect(result.deck.sideboard).toEqual(deck.sideboard);
  });

  it('沒有備牌的牌組也轉得回來', () => {
    const noSide = { ...deck, sideboard: {} };
    const result = importDeck(toSectionedText(noSide, byId), ALL_CARDS);
    expect(result.deck.sideboard).toEqual({});
    expect(result.deck.main).toEqual(noSide.main);
  });

  it('"Champion:" 這個標題認得出來（原本只認 Chosen）', () => {
    const result = importDeck(
      ['Champion:', `1 ${champion.name}`, '', 'Runes:', `12 ${rune.name}`].join('\n'),
      ALL_CARDS,
    );
    expect(result.deck.main[champion.id]).toBe(1);
    expect(result.deck.runes[rune.id]).toBe(12);
  });
});
