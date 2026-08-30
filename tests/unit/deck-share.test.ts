/**
 * 牌組分享與收藏的測試。
 *
 * 這一組的重點全部在**不可信輸入**：
 *   · 網址是任何人都能編造的
 *   · localStorage 是使用者可以自行編輯的
 *   · 匯入的 CSV 檔案是使用者提供的
 *
 * 三者都必須逐項驗證後才准進入應用程式狀態。
 * 這裡就是把「驗證確實存在」這件事釘死。
 */

import { describe, expect, it } from 'vitest';
import { ALL_CARDS } from '../../src/lib/cards';
import { EMPTY_DECK, zoneForCard, type Deck } from '../../src/lib/deck-rules';
import { buildCodeIndex, decodeDeck, encodeDeck, shortCode } from '../../src/lib/deck-url';
import { loadCollection } from '../../src/lib/collection';
import {
  annotateRows,
  collectionFromCsv,
  collectionToCsv,
  deckRows,
  safeFilename,
  shortSummary,
  toCsv,
  toPlainText,
} from '../../src/lib/deck-export';

const byId = new Map(ALL_CARDS.map((c) => [c.id, c]));
const index = buildCodeIndex(ALL_CARDS);
const validIds = new Set(ALL_CARDS.map((c) => c.id));

const legend = ALL_CARDS.find((c) => c.types.includes('legend'))!;
const rune = ALL_CARDS.find((c) => c.types.includes('rune'))!;
const battlefield = ALL_CARDS.find((c) => c.types.includes('battlefield'))!;
const unit = ALL_CARDS.find((c) => c.types.includes('unit') && c.subtype !== 'token')!;

const sample: Deck = {
  legendId: legend.id,
  championId: null,
  main: { [unit.id]: 3 },
  runes: { [rune.id]: 12 },
  battlefields: { [battlefield.id]: 3 },
};

describe('短代碼', () => {
  it('每張卡的短代碼在整個資料集中唯一', () => {
    const codes = ALL_CARDS.map(shortCode);
    expect(new Set(codes).size).toBe(codes.length);
  });

  it('短代碼只含小寫英數，可以安全放進網址', () => {
    for (const card of ALL_CARDS) {
      expect(shortCode(card)).toMatch(/^[a-z0-9*]+$/);
    }
  });
});

describe('網址編碼', () => {
  it('編碼後再解碼會得到同一副牌組', () => {
    const decoded = decodeDeck(encodeDeck(sample, ALL_CARDS), index);
    expect(decoded.deck).toEqual(sample);
    expect(decoded.dropped).toBe(0);
  });

  it('空牌組來回一致', () => {
    const decoded = decodeDeck(encodeDeck(EMPTY_DECK, ALL_CARDS), index);
    expect(decoded.deck).toEqual(EMPTY_DECK);
  });

  it('張數為 1 時省略數量，網址比較短', () => {
    const one: Deck = { ...EMPTY_DECK, main: { [unit.id]: 1 } };
    expect(encodeDeck(one, ALL_CARDS)).toContain(shortCode(unit));
    expect(encodeDeck(one, ALL_CARDS)).not.toContain('x1');
  });

  // ── 以下是安全性測試：惡意或損毀的網址都不能污染狀態 ──

  it('認不得的卡片代碼會被丟棄並回報', () => {
    const result = decodeDeck('1|nope999|||xxx001x3|', index);
    expect(result.deck.legendId).toBeNull();
    expect(result.deck.runes).toEqual({});
    expect(result.dropped).toBeGreaterThan(0);
  });

  it('版本號不符時整份不採用', () => {
    const result = decodeDeck(`9|${shortCode(legend)}|||`, index);
    expect(result.deck).toEqual(EMPTY_DECK);
  });

  it('離譜的張數會被拒絕，不會癱瘓瀏覽器', () => {
    // 兩位數上限：x99 是合法的，x999 連格式都不符
    expect(decodeDeck(`1|||${shortCode(unit)}x999||`, index).deck.main).toEqual({});
    expect(decodeDeck(`1|||${shortCode(unit)}x0||`, index).deck.main).toEqual({});
  });

  it('注入型的內容不會被當成卡片', () => {
    const attacks = [
      '1|||<script>alert(1)</script>||',
      '1|||javascript:alert(1)||',
      "1|||'; DROP TABLE cards; --||",
      '1|||../../etc/passwd||',
      '1|||%3Cscript%3E||',
      '1|||__proto__x3||',
      '1|||constructorx3||',
    ];
    for (const attack of attacks) {
      const result = decodeDeck(attack, index);
      expect(result.deck.main).toEqual({});
      expect(result.dropped).toBeGreaterThan(0);
    }
  });

  it('原型污染攻擊不會改到 Object.prototype', () => {
    decodeDeck('1|||__proto__x3.constructorx3||', index);
    expect(({} as Record<string, unknown>)['polluted']).toBeUndefined();
    expect(Object.prototype).not.toHaveProperty('polluted');
  });

  it('超長網址不會無限展開', () => {
    const huge = `1|||${Array.from({ length: 5000 }, () => `${shortCode(unit)}x99`).join('.')}||`;
    const result = decodeDeck(huge, index);
    // 只處理前 300 段
    expect(Object.keys(result.deck.main).length).toBeLessThanOrEqual(1);
    expect(result.deck.main[unit.id]).toBeLessThanOrEqual(300 * 99);
  });

  it('空字串與亂碼都安全回到空牌組', () => {
    expect(decodeDeck('', index).deck).toEqual(EMPTY_DECK);
    expect(decodeDeck('garbage', index).deck).toEqual(EMPTY_DECK);
  });
});

describe('收藏的讀取驗證', () => {
  const fakeStorage = (value: string) => {
    const store = new Map([['riftbound-tw.collection.v1', value]]);
    // 模擬瀏覽器環境
    (globalThis as { window?: unknown }).window = {
      localStorage: {
        getItem: (k: string) => store.get(k) ?? null,
        setItem: (k: string, v: string) => void store.set(k, v),
      },
    };
  };

  it('不存在的卡號會被剔除', () => {
    fakeStorage(JSON.stringify({ [unit.id]: 2, 'fake-card-id': 5 }));
    const loaded = loadCollection(validIds);
    expect(loaded).toEqual({ [unit.id]: 2 });
  });

  it('不合理的張數會被剔除', () => {
    fakeStorage(
      JSON.stringify({ [unit.id]: -1, [rune.id]: 1.5, [legend.id]: 99999, [battlefield.id]: 2 }),
    );
    expect(loadCollection(validIds)).toEqual({ [battlefield.id]: 2 });
  });

  it('非數字的值會被剔除', () => {
    fakeStorage(JSON.stringify({ [unit.id]: 'lots', [rune.id]: null, [legend.id]: 1 }));
    expect(loadCollection(validIds)).toEqual({ [legend.id]: 1 });
  });

  it('損毀的 JSON 不會讓頁面壞掉', () => {
    fakeStorage('{not json at all');
    expect(loadCollection(validIds)).toEqual({});
  });

  it('陣列或字串等錯誤結構會被拒絕', () => {
    fakeStorage(JSON.stringify([1, 2, 3]));
    expect(loadCollection(validIds)).toEqual({});
    fakeStorage(JSON.stringify('hello'));
    expect(loadCollection(validIds)).toEqual({});
  });
});

describe('缺卡計算', () => {
  /** 取某個卡名那一列的收藏狀況。 */
  const statusOf = (deck: Deck, collection: Record<string, number>, cardId: string) =>
    annotateRows(deck, byId, collection).find((r) => r.card.name === byId.get(cardId)!.name);

  it('沒有收藏時，牌組需要的每一張都算缺', () => {
    const deck = { ...EMPTY_DECK, main: { [unit.id]: 3 } };
    const status = statusOf(deck, {}, unit.id);
    expect(status).toMatchObject({ owned: 0, short: 3 });
  });

  it('湊齊了就不算缺', () => {
    const deck = { ...EMPTY_DECK, main: { [unit.id]: 3 } };
    expect(statusOf(deck, { [unit.id]: 3 }, unit.id)).toMatchObject({ short: 0 });
    // 有多的也不會算成負數
    expect(statusOf(deck, { [unit.id]: 5 }, unit.id)).toMatchObject({ owned: 5, short: 0 });
  });

  it('部分擁有時只算差額', () => {
    const deck = { ...EMPTY_DECK, main: { [unit.id]: 3 } };
    expect(statusOf(deck, { [unit.id]: 1 }, unit.id)).toMatchObject({ owned: 1, short: 2 });
  });

  it('異畫版與普通版同名，應該視為同一張卡', () => {
    // 找一組同名的不同版本
    const groups = new Map<string, string[]>();
    for (const card of ALL_CARDS) {
      groups.set(card.name, [...(groups.get(card.name) ?? []), card.id]);
    }
    const pair = [...groups.values()].find((ids) => ids.length >= 2);
    expect(pair).toBeDefined();

    const [normalId, altId] = pair as [string, string];
    // 牌組要 2 張普通版，手上有 2 張異畫版 → 不算缺
    const deck = { ...EMPTY_DECK, main: { [normalId]: 2 } };
    expect(statusOf(deck, { [altId]: 2 }, normalId)).toMatchObject({ short: 0 });
  });

  it('同名卡出現在多列時，數字只算一次 —— 否則加總會重複', () => {
    const groups = new Map<string, string[]>();
    for (const card of ALL_CARDS) {
      if (zoneForCard(card) !== 'main') continue;
      groups.set(card.name, [...(groups.get(card.name) ?? []), card.id]);
    }
    const pair = [...groups.values()].find((ids) => ids.length >= 2);
    expect(pair).toBeDefined();

    const [a, b] = pair as [string, string];
    const deck = { ...EMPTY_DECK, main: { [a]: 1, [b]: 1 } };
    const rows = annotateRows(deck, byId, {});

    const withNumbers = rows.filter((r) => r.short !== null);
    expect(withNumbers).toHaveLength(1);
    expect(withNumbers[0]!.short).toBe(2); // 兩列合計需要 2 張
    expect(shortSummary(rows).cards).toBe(2);
  });

  it('選定英雄不會被重複計算 —— 它本來就是主牌組的一張', () => {
    const champion = ALL_CARDS.find((c) => c.subtype === 'champion')!;
    const deck = { ...EMPTY_DECK, championId: champion.id, main: { [champion.id]: 1 } };

    // deckRows 會為了顯示各列一次（選定英雄 + 主牌組），但需求只有 1 張
    expect(deckRows(deck, byId).filter((r) => r.card.id === champion.id)).toHaveLength(2);
    expect(shortSummary(annotateRows(deck, byId, {})).cards).toBe(1);
  });

  it('沒開啟收藏記錄時，每一列都不帶收藏數字', () => {
    const deck = { ...EMPTY_DECK, main: { [unit.id]: 3 } };
    for (const row of annotateRows(deck, byId, null)) {
      expect(row.owned).toBeNull();
      expect(row.short).toBeNull();
    }
    expect(shortSummary(annotateRows(deck, byId, null)).cards).toBe(0);
  });
});

describe('匯出格式', () => {
  it('CSV 開頭有 BOM —— 否則 Excel 開啟中文會亂碼', () => {
    expect(toCsv(sample, byId, 'zh-TW').charCodeAt(0)).toBe(0xfeff);
    expect(collectionToCsv({ [unit.id]: 2 }, byId, 'zh-TW').charCodeAt(0)).toBe(0xfeff);
  });

  it('含逗號或引號的卡名會被正確跳脫', () => {
    const withComma = ALL_CARDS.find((c) => c.name.includes(','));
    expect(withComma).toBeDefined();

    const csv = toCsv({ ...EMPTY_DECK, main: { [withComma!.id]: 1 } }, byId, 'en');
    const dataLine = csv.split('\r\n')[1]!;
    // 名稱被引號包住 → 欄位數才會正確
    expect(dataLine).toContain(`"${withComma!.name}"`);
  });

  it('三種語言都能匯出且欄位數一致', () => {
    for (const lang of ['zh-TW', 'zh-CN', 'en'] as const) {
      const lines = toCsv(sample, byId, lang).split('\r\n');
      const headerCols = lines[0]!.split(',').length;
      expect(headerCols).toBe(9);
      expect(lines.length).toBe(deckRows(sample, byId).length + 1);
    }
  });

  it('純文字牌表包含每一張卡與規則版本', () => {
    const text = toPlainText(sample, byId, 'zh-TW', '測試牌組');
    expect(text).toContain('測試牌組');
    expect(text).toContain(unit.code);
    expect(text).toContain('規則依據');
  });

  it('收藏 CSV 可以來回還原', () => {
    const original = { [unit.id]: 3, [rune.id]: 12, [battlefield.id]: 1 };
    const csv = collectionToCsv(original, byId, 'zh-TW');
    const result = collectionFromCsv(csv, ALL_CARDS);

    expect(result.collection).toEqual(original);
    expect(result.skipped).toBe(0);
  });

  it('匯入時無法辨識的列會被略過而不是整份失敗', () => {
    const csv = [
      '卡號,卡名,英文卡名,擁有張數',
      `${unit.code},x,x,2`,
      'NOT-A-CARD,x,x,3',
      `${rune.code},x,x,999999`,
      '',
    ].join('\r\n');

    const result = collectionFromCsv(csv, ALL_CARDS);
    expect(result.collection).toEqual({ [unit.id]: 2 });
    expect(result.imported).toBe(1);
    expect(result.skipped).toBe(2);
  });

  it('匯入惡意內容不會產生任何項目', () => {
    const csv = [
      '=cmd|\'/c calc\'!A1,x,x,1',
      '<script>alert(1)</script>,x,x,1',
      '__proto__,x,x,1',
      'constructor,x,x,1',
    ].join('\r\n');

    const result = collectionFromCsv(csv, ALL_CARDS);
    expect(result.collection).toEqual({});
    expect(Object.prototype).not.toHaveProperty('polluted');
  });

  // ── 牌組與缺卡合併在同一份檔案 ──

  it('沒開啟收藏時，匯出的檔案跟以前完全一樣', () => {
    const csv = toCsv(sample, byId, 'zh-TW');
    expect(csv.split('\r\n')[0]!.split(',')).toHaveLength(9);
    expect(csv).not.toContain('還缺');
    expect(toPlainText(sample, byId, 'zh-TW', '測試')).not.toContain('還需要蒐集');
  });

  it('開啟收藏後，CSV 多出「擁有」「還缺」兩欄', () => {
    const csv = toCsv(sample, byId, 'zh-TW', { [unit.id]: 1 });
    const header = csv.split('\r\n')[0]!.split(',');

    expect(header).toHaveLength(11);
    expect(header.slice(-2)).toEqual(['擁有', '還缺']);

    // 牌組要 3 張、手上 1 張 → 該列的最後兩欄是 1 與 2
    const unitLine = csv.split('\r\n').find((l) => l.includes(unit.code))!;
    expect(unitLine.split(',').slice(-2)).toEqual(['1', '2']);
  });

  it('CSV 是單一張表：一列標題、沒有空行、列數等於牌組列數', () => {
    // 含逗號的卡名（資料裡有 80 張）也要能正確包在引號裡，
    // 所以這裡不用逗號數量判斷，改驗「一份檔案就是一張表」這個性質。
    const withComma = ALL_CARDS.find((c) => c.name.includes(','))!;
    const deck = { ...sample, main: { ...sample.main, [withComma.id]: 1 } };
    const csv = toCsv(deck, byId, 'zh-TW', { [unit.id]: 1 });
    const lines = csv.split('\r\n');

    expect(lines.filter((l) => l.trim() === '')).toEqual([]);
    expect(lines).toHaveLength(deckRows(deck, byId).length + 1);
    expect(lines[0]).toContain('還缺');
    // 標題只出現一次 —— 沒有第二張表接在後面
    expect(lines.filter((l) => l === lines[0])).toHaveLength(1);
    expect(csv).toContain(`"${withComma.name}"`);
  });

  it('純文字牌表把缺卡標在該列，並在最後附上彙整清單', () => {
    const text = toPlainText(sample, byId, 'zh-TW', '測試牌組', { [unit.id]: 1 });

    expect(text).toContain('還需要蒐集');
    expect(text).toContain('共缺');
    // 缺卡直接標在該張卡那一列
    expect(text).toMatch(new RegExp(`${unit.code.replace(/[/]/g, '\/')}.*缺 2`));
  });

  it('全部湊齊時，檔案會明說已湊齊而不是留白', () => {
    const full = {
      [legend.id]: 1,
      [unit.id]: 3,
      [rune.id]: 12,
      [battlefield.id]: 3,
    };
    const text = toPlainText(sample, byId, 'zh-TW', '測試', full);

    expect(text).toContain('已經湊齊');
    expect(text).not.toContain('共缺');
  });

  it('三種語言的合併欄位都有對應翻譯', () => {
    const expected = {
      'zh-TW': ['擁有', '還缺'],
      'zh-CN': ['拥有', '还缺'],
      en: ['Owned', 'Short'],
    } as const;

    for (const lang of ['zh-TW', 'zh-CN', 'en'] as const) {
      const header = toCsv(sample, byId, lang, {}).split('\r\n')[0]!.split(',');
      expect(header.slice(-2)).toEqual([...expected[lang]]);
    }
  });

  it('檔名會去掉檔案系統不允許的字元', () => {
    expect(safeFilename('a/b\\c:d*e?f"g<h>i|j', 'csv')).toBe('abcdefghij.csv');
    expect(safeFilename('   ', 'csv')).toBe('deck.csv');
    expect(safeFilename('x'.repeat(200), 'png')).toBe(`${'x'.repeat(60)}.png`);
  });
});
