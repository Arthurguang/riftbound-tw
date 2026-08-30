/**
 * 牌組構築規則測試。
 *
 * 本專案曾經憑印象寫錯遊戲規則並上線（PROGRESS.md 第 11 號問題）。
 * 從那之後的原則是：規則相關的程式碼，每一條都要有測試釘住，
 * 而且測試裡要寫明官方條號，讓任何人都能自行查證。
 *
 * 這裡特別釘住兩個「社群普遍寫錯、官方規則書其實不是這樣」的地方：
 *   · 主牌組是「至少 40 張」，不是「剛好 40 張」（103.2）
 *   · 戰場數量取決於遊戲模式，1v1 是 3 張（485.4.a）
 */

import { describe, expect, it } from 'vitest';
import {
  DECK_REQUIREMENTS,
  TOURNAMENT_REQUIREMENTS,
  EMPTY_DECK,
  checkLegality,
  matchesIdentity,
  totalCards,
  zoneForCard,
  type Deck,
} from '../../src/lib/deck-rules';
import { ALL_CARDS } from '../../src/lib/cards';
import type { Card } from '../../src/lib/types';

const byId = new Map(ALL_CARDS.map((c) => [c.id, c]));

const legends = ALL_CARDS.filter((c) => c.types.includes('legend'));
const runes = ALL_CARDS.filter((c) => c.types.includes('rune'));
const battlefields = ALL_CARDS.filter((c) => c.types.includes('battlefield'));

/** 挑一張確定存在的傳奇，並取得它能合法搭配的卡。 */
const legend = legends[0]!;
const legalCards = ALL_CARDS.filter(
  (c) =>
    zoneForCard(c) === 'main' &&
    matchesIdentity(c, legend.domains) &&
    !c.types.includes('legend'),
);

/** 組出一副「除了指定缺陷外都合法」的牌組，方便逐條測試。 */
function buildDeck(overrides: Partial<Deck> = {}): Deck {
  const rune = runes[0]!;
  // 選定英雄必須與傳奇共享英雄標籤（103.2.a.2）
  const champion = legalCards.find(
    (c) => c.subtype === 'champion' && c.tags.some((tag) => legend.tags.includes(tag)),
  );

  /*
   * 主牌組要湊到「剛好」40 張。
   *
   * 選定英雄本來就算主牌組的一張（103.2），所以要先把它放進去再補其他卡 ——
   * 先填滿 40 再補英雄會變成 41 張，賽事規則 601.1.b 就會跳提醒。
   */
  const main: Record<string, number> = {};
  let count = 0;
  if (champion) {
    main[champion.id] = 1;
    count = 1;
  }
  for (const card of legalCards) {
    if (count >= DECK_REQUIREMENTS.mainDeckMin) break;
    if (main[card.id]) continue;
    // 每張最多 3 張（103.2.b）
    const take = Math.min(3, DECK_REQUIREMENTS.mainDeckMin - count);
    main[card.id] = take;
    count += take;
  }

  return {
    legendId: legend.id,
    championId: champion?.id ?? null,
    main,
    runes: { [rune.id]: DECK_REQUIREMENTS.runeDeckSize },
    battlefields: Object.fromEntries(
      battlefields.slice(0, DECK_REQUIREMENTS.battlefieldCount).map((b) => [b.id, 1]),
    ),
    sideboard: {},
    ...overrides,
  };
}

describe('官方數字（核心規則）', () => {
  it('主牌組至少 40 張 —— 是下限而非定額（103.2）', () => {
    expect(DECK_REQUIREMENTS.mainDeckMin).toBe(40);
  });

  it('同名卡最多 3 張（103.2.b）', () => {
    expect(DECK_REQUIREMENTS.copiesPerName).toBe(3);
  });

  it('符文牌組剛好 12 張（103.3.a）', () => {
    expect(DECK_REQUIREMENTS.runeDeckSize).toBe(12);
  });

  it('1v1 需要 3 張戰場（485.4.a）', () => {
    expect(DECK_REQUIREMENTS.battlefieldCount).toBe(3);
  });
});

describe('特性相符（103.1.b）', () => {
  it('無特性的卡任何傳奇都能用', () => {
    const colorless = ALL_CARDS.find((c) => c.domains.every((d) => d === 'colorless'));
    expect(colorless).toBeDefined();
    expect(matchesIdentity(colorless!, ['fury'])).toBe(true);
  });

  // 103.1.b.4：「如果一張卡牌擁有多種特性，則它只能加入符文特性與其所有特性相同的卡組中」
  it('雙特性卡需要傳奇「同時」擁有兩種特性 —— 是子集，不是交集（103.1.b.4）', () => {
    const dual = ALL_CARDS.find(
      (c) => c.domains.filter((d) => d !== 'colorless').length === 2,
    );
    expect(dual).toBeDefined();

    const traits = dual!.domains.filter((d) => d !== 'colorless');
    // 傳奇只有其中一種 → 不合法（這是最容易寫錯的地方）
    expect(matchesIdentity(dual!, [traits[0]!])).toBe(false);
    // 傳奇兩種都有 → 合法
    expect(matchesIdentity(dual!, traits)).toBe(true);
  });

  it('傳奇有多餘的特性不影響合法性', () => {
    const single = ALL_CARDS.find(
      (c) => c.domains.filter((d) => d !== 'colorless').length === 1,
    );
    const trait = single!.domains.find((d) => d !== 'colorless')!;
    expect(matchesIdentity(single!, [trait, 'chaos', 'order'])).toBe(true);
  });
});

describe('卡片該放進哪個區域', () => {
  it('指示物不能放進任何牌組區域', () => {
    const token = ALL_CARDS.find((c) => c.subtype === 'token');
    expect(token).toBeDefined();
    expect(zoneForCard(token!)).toBeNull();
  });

  it('符文、戰場、傳奇各自歸位', () => {
    expect(zoneForCard(runes[0]!)).toBe('runes');
    expect(zoneForCard(battlefields[0]!)).toBe('battlefields');
    expect(zoneForCard(legend)).toBe('legend');
  });
});

describe('合法性檢查', () => {
  it('空牌組會逐條指出缺什麼，且每條都附官方條號', () => {
    const result = checkLegality(EMPTY_DECK, byId);
    expect(result.legal).toBe(false);
    expect(result.issues.length).toBeGreaterThanOrEqual(4);
    for (const issue of result.issues) {
      // 條號格式如 103.2 / 485.4.a —— 沒有條號的訊息不該存在
      expect(issue.rule).toMatch(/^\d{3}(\.\d+)*(\.[a-z])?(\.\d+)?$/);
      expect(issue.message['zh-TW'].length).toBeGreaterThan(0);
      expect(issue.message['zh-CN'].length).toBeGreaterThan(0);
      expect(issue.message.en.length).toBeGreaterThan(0);
    }
  });

  it('組好的牌組通過檢查', () => {
    const result = checkLegality(buildDeck(), byId);
    expect(result.issues.filter((i) => i.severity === 'error')).toEqual([]);
    expect(result.legal).toBe(true);
  });

  it('主牌組超過 40 張仍然合法 —— 40 是下限不是定額', () => {
    const deck = buildDeck();
    const extra = legalCards.find((c) => !deck.main[c.id]);
    const bigger = { ...deck, main: { ...deck.main, [extra!.id]: 3 } };

    expect(totalCards(bigger.main)).toBeGreaterThan(DECK_REQUIREMENTS.mainDeckMin);
    expect(checkLegality(bigger, byId).legal).toBe(true);
  });

  it('主牌組少於 40 張會被擋下', () => {
    const deck = buildDeck();
    const firstId = Object.keys(deck.main)[0]!;
    const short = { ...deck, main: { ...deck.main } };
    delete short.main[firstId];

    const result = checkLegality(short, byId);
    expect(result.legal).toBe(false);
    expect(result.issues.some((i) => i.rule.startsWith('103.2'))).toBe(true);
  });

  it('同名卡超過 3 張會被擋下（103.2.b）', () => {
    const deck = buildDeck();
    const firstId = Object.keys(deck.main)[0]!;
    const tooMany = { ...deck, main: { ...deck.main, [firstId]: 4 } };

    const result = checkLegality(tooMany, byId);
    expect(result.issues.some((i) => i.rule === '103.2.b')).toBe(true);
  });

  it('符文不是 12 張會被擋下（103.3.a）', () => {
    const deck = buildDeck();
    const runeId = Object.keys(deck.runes)[0]!;
    const wrong = { ...deck, runes: { [runeId]: 11 } };

    expect(checkLegality(wrong, byId).issues.some((i) => i.rule === '103.3.a')).toBe(true);
  });

  it('戰場不是 3 張會被擋下（485.4.a）', () => {
    const deck = buildDeck();
    const wrong = { ...deck, battlefields: { [battlefields[0]!.id]: 1 } };

    expect(checkLegality(wrong, byId).issues.some((i) => i.rule === '485.4.a')).toBe(true);
  });

  it('不符合傳奇特性的卡會被擋下（103.1.b）', () => {
    const deck = buildDeck();
    const offending = ALL_CARDS.find(
      (c) => zoneForCard(c) === 'main' && !matchesIdentity(c, legend.domains),
    );
    expect(offending).toBeDefined();

    const wrong = { ...deck, main: { ...deck.main, [offending!.id]: 1 } };
    expect(checkLegality(wrong, byId).issues.some((i) => i.rule === '103.1.b')).toBe(true);
  });

  it('counts 回報的張數與實際相符', () => {
    const deck = buildDeck();
    const result = checkLegality(deck, byId);
    expect(result.counts.main).toBe(totalCards(deck.main));
    expect(result.counts.runes).toBe(DECK_REQUIREMENTS.runeDeckSize);
    expect(result.counts.battlefields).toBe(DECK_REQUIREMENTS.battlefieldCount);
  });

  it('不會因為資料裡有壞掉的 id 就崩潰', () => {
    const broken: Deck = {
      legendId: 'does-not-exist',
      championId: 'nope',
      main: { 'not-a-card': 3 },
      runes: {},
      battlefields: {},
      sideboard: {},
    };
    expect(() => checkLegality(broken, byId)).not.toThrow();
    expect(checkLegality(broken, byId).legal).toBe(false);
  });
});

describe('選定英雄（103.2.a）', () => {
  /*
   * 官方規則要求指定選定英雄（103.2「一張選定英雄單位」、402.1
   * 「including a chosen champion」），但本站刻意標成「提醒」而非「錯誤」，
   * 讓人可以邊組邊調整。訊息裡必須保留條號與「官方規則要求」的字樣，
   * 否則要帶去賽事的人會被誤導。
   */
  it('沒指定選定英雄是「提醒」，不會擋下牌組', () => {
    const deck = buildDeck({ championId: null });
    const result = checkLegality(deck, byId);

    const issue = result.issues.find((i) => i.rule === '103.2.a');
    expect(issue).toBeDefined();
    expect(issue?.severity).toBe('warning');
    expect(result.legal).toBe(true);
  });

  it('提醒訊息要說明官方規則其實有要求', () => {
    const deck = buildDeck({ championId: null });
    const issue = checkLegality(deck, byId).issues.find((i) => i.rule === '103.2.a')!;

    expect(issue.message['zh-TW']).toContain('官方規則要求');
    expect(issue.message['zh-CN']).toContain('官方规则要求');
    expect(issue.message.en).toMatch(/official rules require/i);
  });

  it('還沒選傳奇時不提這條 —— 那時候無從指定英雄', () => {
    const result = checkLegality(EMPTY_DECK, byId);
    expect(result.issues.some((i) => i.rule === '103.2.a')).toBe(false);
    // 該提的是「先選傳奇」
    expect(result.issues.some((i) => i.rule === '103.1')).toBe(true);
  });

  it('指定了不合規的英雄仍然是錯誤 —— 那是主動選錯，不是還沒選', () => {
    const deck = buildDeck();
    const notChampion = legalCards.find((c) => c.subtype !== 'champion')!;
    const wrong = {
      ...deck,
      championId: notChampion.id,
      main: { ...deck.main, [notChampion.id]: 1 },
    };
    const result = checkLegality(wrong, byId);

    const issue = result.issues.find((i) => i.rule === '103.2.a.2');
    expect(issue?.severity).toBe('error');
    expect(result.legal).toBe(false);
  });

});

describe('資料本身', () => {
  it('每張卡的 subtype 都是已知值', () => {
    const allowed = new Set(['champion', 'signature', 'token', null]);
    for (const card of ALL_CARDS as Card[]) {
      expect(allowed.has(card.subtype)).toBe(true);
    }
  });

  it('資料裡有足夠的傳奇、符文與戰場可以組牌', () => {
    expect(legends.length).toBeGreaterThan(0);
    expect(runes.length).toBeGreaterThan(0);
    expect(battlefields.length).toBeGreaterThanOrEqual(DECK_REQUIREMENTS.battlefieldCount);
  });
});

describe('備牌（賽事規則 403、601.1.c）', () => {
  const spare = legalCards.find((c) => !buildDeck().main[c.id])!;

  it('備牌上限 10 張（601.1.c.1），而且是上限不是固定張數', () => {
    expect(TOURNAMENT_REQUIREMENTS.sideboardMax).toBe(10);

    // 剛好 10 張不該有問題
    const ok = buildDeck({ sideboard: { [spare.id]: 3 } });
    expect(checkLegality(ok, byId).issues.some((i) => i.rule === '601.1.c.1')).toBe(false);
  });

  it('超過 10 張會被提醒', () => {
    const many: Record<string, number> = {};
    let count = 0;
    for (const card of legalCards) {
      if (count >= 11) break;
      many[card.id] = 1;
      count += 1;
    }
    const deck = buildDeck({ sideboard: many });
    expect(checkLegality(deck, byId).issues.some((i) => i.rule === '601.1.c.1')).toBe(true);
  });

  it('備牌問題是「提醒」而不是「錯誤」—— 只有賽事才有備牌（403.1）', () => {
    const many = Object.fromEntries(legalCards.slice(0, 11).map((c) => [c.id, 1]));
    const result = checkLegality(buildDeck({ sideboard: many }), byId);

    const sideIssues = result.issues.filter((i) => i.rule.startsWith('601.1.c'));
    expect(sideIssues.length).toBeGreaterThan(0);
    expect(sideIssues.every((i) => i.severity === 'warning')).toBe(true);
  });

  it('同名卡上限橫跨主牌組與備牌（601.1.c.3、403.3）', () => {
    const deck = buildDeck();
    const firstId = Object.keys(deck.main).find((id) => deck.main[id] === 3)!;

    // 主牌組已有 3 張，備牌再放 1 張就超過上限
    const over = { ...deck, sideboard: { [firstId]: 1 } };
    expect(checkLegality(over, byId).issues.some((i) => i.rule === '103.2.b')).toBe(true);

    // 主牌組 2 張 + 備牌 1 張 = 3 張，剛好不超過
    const fine = {
      ...deck,
      main: { ...deck.main, [firstId]: 2 },
      sideboard: { [firstId]: 1 },
    };
    expect(checkLegality(fine, byId).issues.some((i) => i.rule === '103.2.b')).toBe(false);
  });

  it('備牌只能放主牌組的卡（601.1.c.2）', () => {
    const deck = buildDeck({ sideboard: { [runes[0]!.id]: 1 } });
    expect(checkLegality(deck, byId).issues.some((i) => i.rule === '601.1.c.2')).toBe(true);
  });

  it('備牌張數會回報在 counts 裡', () => {
    const deck = buildDeck({ sideboard: { [spare.id]: 2 } });
    expect(checkLegality(deck, byId).counts.sideboard).toBe(2);
  });
});

describe('賽事構築的額外限制', () => {
  it('主牌組超過 40 張：核心規則允許，賽事不允許（103.2 vs 601.1.b）', () => {
    const deck = buildDeck();
    const extra = legalCards.find((c) => !deck.main[c.id])!;
    const bigger = { ...deck, main: { ...deck.main, [extra.id]: 3 } };

    const result = checkLegality(bigger, byId);
    // 核心規則層面仍然合法
    expect(result.legal).toBe(true);
    // 但賽事會被擋，所以要提醒
    const warn = result.issues.find((i) => i.rule === '601.1.b');
    expect(warn).toBeDefined();
    expect(warn?.severity).toBe('warning');
  });

  it('剛好 40 張不會有賽事提醒', () => {
    expect(checkLegality(buildDeck(), byId).issues.some((i) => i.rule === '601.1.b')).toBe(false);
  });

  it('戰場名稱必須各不相同（402.1）', () => {
    const groups = new Map<string, string[]>();
    for (const card of battlefields) {
      groups.set(card.name, [...(groups.get(card.name) ?? []), card.id]);
    }
    const dup = [...groups.values()].find((ids) => ids.length >= 2);
    if (!dup) return; // 資料裡沒有同名戰場就跳過

    const deck = buildDeck({
      battlefields: { [dup[0]!]: 1, [dup[1]!]: 1, [battlefields[2]!.id]: 1 },
    });
    expect(checkLegality(deck, byId).issues.some((i) => i.rule === '402.1')).toBe(true);
  });

  it('同一張戰場放兩張會被提醒（402.1）', () => {
    const deck = buildDeck({ battlefields: { [battlefields[0]!.id]: 2, [battlefields[1]!.id]: 1 } });
    expect(checkLegality(deck, byId).issues.some((i) => i.rule === '402.1')).toBe(true);
  });
});
