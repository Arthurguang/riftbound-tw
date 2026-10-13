/**
 * 圖鑑的搜尋、篩選與排序邏輯。
 *
 * 全部在瀏覽器端執行，因此沒有任何搜尋請求會送到伺服器，也就沒有伺服器端的注入風險。
 *
 * ⚠️ 2026-10-13 收錄六個系列後，卡牌資料從 376 張變成 1368 張，
 * 圖鑑頁送到瀏覽器的資料也跟著變大（壓縮後約 450 KB）。
 * 代價記在 PROGRESS.md，之後要做「只送畫面用得到的欄位」的瘦身。
 */

import { bannedEntryFor } from './ban-list';
import { cardName, cardTextToPlain } from './cards';
import { errataFor } from './errata';
import type { TextLang } from './i18n';
import { CARD_FACE_TW, KEYWORD_LABELS, RARITY_ORDER } from './labels';
import {
  SET_IDS,
  type Card,
  type CardType,
  type Domain,
  type Keyword,
  type Rarity,
  type SetId,
  type Taxonomy,
} from './types';

/** 排序選項。label 為三語對照。 */
export const SORT_OPTIONS = [
  // 標籤要說得出排序規則 —— 使用者看不懂順序時，第一個會看的就是這裡
  { id: 'number-asc', label: { 'zh-TW': '系列與卡號（舊→新）', 'zh-CN': '系列与卡号（旧→新）', en: 'Set & card # (oldest first)' } },
  { id: 'number-desc', label: { 'zh-TW': '系列與卡號（新→舊）', 'zh-CN': '系列与卡号（新→旧）', en: 'Set & card # (newest first)' } },
  { id: 'name-asc', label: { 'zh-TW': '卡名（順序）', 'zh-CN': '卡名（顺序）', en: 'Name (A→Z)' } },
  { id: 'name-desc', label: { 'zh-TW': '卡名（反序）', 'zh-CN': '卡名（反序）', en: 'Name (Z→A)' } },
  { id: 'energy-asc', label: { 'zh-TW': '能量（低到高）', 'zh-CN': '费用（低到高）', en: 'Energy (low→high)' } },
  { id: 'energy-desc', label: { 'zh-TW': '能量（高到低）', 'zh-CN': '费用（高到低）', en: 'Energy (high→low)' } },
  { id: 'might-asc', label: { 'zh-TW': '戰力（低到高）', 'zh-CN': '战力（低到高）', en: 'Might (low→high)' } },
  { id: 'might-desc', label: { 'zh-TW': '戰力（高到低）', 'zh-CN': '战力（高到低）', en: 'Might (high→low)' } },
  { id: 'rarity-asc', label: { 'zh-TW': '稀有度（低到高）', 'zh-CN': '稀有度（低到高）', en: 'Rarity (low→high)' } },
  { id: 'rarity-desc', label: { 'zh-TW': '稀有度（高到低）', 'zh-CN': '稀有度（高到低）', en: 'Rarity (high→low)' } },
] as const satisfies readonly { id: string; label: Record<TextLang, string> }[];

export type SortId = (typeof SORT_OPTIONS)[number]['id'];

export const DEFAULT_SORT: SortId = 'number-asc';

export function isSortId(value: string): value is SortId {
  return SORT_OPTIONS.some((option) => option.id === value);
}

/**
 * 「標記」篩選 —— 不屬於官方分類法，是我們額外標出來的兩種特殊狀態。
 *
 * 放在同一組是因為兩者性質一樣：都不是卡片的官方屬性（卡種、領域、稀有度那些
 * 是官方 API 給的），而是**要另外查資料才知道**的事。禁卡要對照禁卡表，
 * 衍生物要看 subtype。混進 taxonomy 會讓「這是官方分類」這件事變得模糊。
 */
export const MARKS = ['banned', 'errata', 'token'] as const;
export type Mark = (typeof MARKS)[number];

export type Filters = {
  query: string;
  sets: SetId[];
  types: CardType[];
  domains: Domain[];
  rarities: Rarity[];
  energies: number[];
  mights: number[];
  tags: string[];
  marks: Mark[];
  sort: SortId;
};

export const EMPTY_FILTERS: Filters = {
  query: '',
  sets: [],
  types: [],
  domains: [],
  rarities: [],
  energies: [],
  mights: [],
  tags: [],
  marks: [],
  sort: DEFAULT_SORT,
};

export function isFiltered(filters: Filters): boolean {
  return (
    filters.query.trim() !== '' ||
    filters.sets.length > 0 ||
    filters.types.length > 0 ||
    filters.domains.length > 0 ||
    filters.rarities.length > 0 ||
    filters.energies.length > 0 ||
    filters.mights.length > 0 ||
    filters.tags.length > 0
  );
}

/**
 * 把文字正規化，讓搜尋不受大小寫、標點與多餘空白影響。
 *
 * 中文不像英文有空白分詞，所以這裡「不」把中文字元之間插入空白 ——
 * 保留原樣才能讓「符文」這種連續詞正確比對到。
 */
function normalize(text: string): string {
  return text
    .toLowerCase()
    .replaceAll('’', "'")
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

/** 每張卡預先算好的搜尋索引。 */
export type SearchIndex = Map<string, string>;

/**
 * 這張卡的關鍵字，三種語言加上卡面實際印的字。
 *
 * 能力文字轉純文字時，關鍵字是以**英文**存進索引的（cardTextToPlain 取 token.name），
 * 所以在這之前，打「坦克」或「壁壘」都搜不到任何卡 —— 使用者回報的第一個問題。
 * 繁中要兩套都收：規則書寫「坦克」，卡面印「壁壘」，玩家兩種都可能打。
 */
function keywordTerms(card: Card): string {
  const names = new Set<Keyword>();
  for (const block of card.text) {
    const tokenLists = block.kind === 'paragraph' ? [block.tokens] : block.items;
    for (const tokens of tokenLists) {
      for (const token of tokens) {
        if (token.type === 'keyword') names.add(token.name);
      }
    }
  }

  return [...names]
    .flatMap((name) => [
      KEYWORD_LABELS[name]['zh-TW'],
      KEYWORD_LABELS[name]['zh-CN'],
      CARD_FACE_TW[name] ?? '',
    ])
    .join(' ');
}

/**
 * 建立搜尋索引。
 *
 * 三種語言的卡名、能力文字、標籤與關鍵字全部放進同一份索引 ——
 * 這樣不論介面切在哪一種語言，打「阿璃」「阿狸」「Ahri」都找得到同一張卡。
 */
export function buildSearchIndex(cards: Card[], tagLabels: Taxonomy['tagLabels']): SearchIndex {
  return new Map(
    cards.map((card) => {
      const tagTerms = card.tags.flatMap((tag) => {
        const label = tagLabels[tag];
        return label ? [tag, label.cn, label.tw] : [tag];
      });

      return [
        card.id,
        normalize(
          [
            card.name,
            // 英文副標（Ahri, **Alluring**）—— 2026-10-13 起官方把它從卡名裡拆出來
            card.subtitle ?? '',
            card.code,
            card.artists.join(' '),
            cardTextToPlain(card.text),
            tagTerms.join(' '),
            card.zh.cn?.name ?? '',
            card.zh.cn?.subtitle ?? '',
            card.zh.cn ? cardTextToPlain(card.zh.cn.text) : '',
            card.zh.tw?.name ?? '',
            card.zh.tw?.subtitle ?? '',
            card.zh.tw ? cardTextToPlain(card.zh.tw.text) : '',
            keywordTerms(card),
          ].join(' '),
        ),
      ];
    }),
  );
}

function matchesQuery(card: Card, query: string, index: SearchIndex): boolean {
  const haystack = index.get(card.id);
  if (haystack === undefined) return false;
  // 多個關鍵字必須全部命中（AND），這樣「ahri unit」能有效縮小範圍。
  return normalize(query)
    .split(' ')
    .filter(Boolean)
    .every((term) => haystack.includes(term));
}

const COLLATOR: Record<TextLang, Intl.Collator> = {
  'zh-TW': new Intl.Collator('zh-Hant'),
  'zh-CN': new Intl.Collator('zh-Hans'),
  en: new Intl.Collator('en'),
};

/** 依目前語言的卡名排序 —— 中文卡名要用中文的排序規則才合理。 */
const compareByName = (a: Card, b: Card, lang: TextLang) =>
  COLLATOR[lang].compare(cardName(a, lang), cardName(b, lang));

/** 數值排序時，把「沒有這個數值」的卡一律排到最後。 */
function compareNullableNumber(a: number | null, b: number | null, descending: boolean): number {
  if (a === null && b === null) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return descending ? b - a : a - b;
}

/**
 * 卡號裡字母前綴的順序：一般卡 → 衍生物(T) → 符文(R) → 特別卡(SP)。
 *
 * 官方的收藏編號本來就是分開編的（UNL-001 與 UNL-T01 是兩套號碼）。
 * 不分開的話，UNL-T01 的 number 是 1，會夾在 UNL-001 旁邊 ——
 * 使用者看到的就是「排序沒有邏輯」。
 */
const PREFIX_ORDER: Record<string, number> = { '': 0, T: 1, R: 2, SP: 3 };

/**
 * 同一個系列裡的順序：先看卡號前綴，再看號碼，最後才是異畫版的後綴。
 * 這樣 019 與 019a 一定相鄰，而且 019 在前。
 */
function compareWithinSet(a: Card, b: Card): number {
  return (
    (PREFIX_ORDER[a.codePrefix ?? ''] ?? 9) - (PREFIX_ORDER[b.codePrefix ?? ''] ?? 9) ||
    a.number - b.number ||
    (a.variant ?? '').localeCompare(b.variant ?? '')
  );
}

/** 系列的先後：依官方發售順序（SET_IDS），不是英文字母順序。 */
const compareSet = (a: Card, b: Card) => SET_IDS.indexOf(a.set) - SET_IDS.indexOf(b.set);

function sortCards(cards: Card[], sort: SortId, lang: TextLang): Card[] {
  const sorted = [...cards];
  switch (sort) {
    /*
     * 預設排序 ——「先系列、後卡號」。
     *
     * 2026-10-13 修正兩件讓它看起來毫無邏輯的事：
     *   1. 系列原本照英文字母排，所以第五代（RAD）夾在第一代與第二代中間
     *   2. 衍生物與符文的號碼跟一般卡混在一起（UNL-T01 排在 UNL-001 旁邊）
     * 圖鑑在這個排序下會分段顯示系列標題，使用者看得到分界。
     */
    case 'number-asc':
      return sorted.sort((a, b) => compareSet(a, b) || compareWithinSet(a, b));
    case 'number-desc':
      return sorted.sort((a, b) => -compareSet(a, b) || -compareWithinSet(a, b));
    case 'name-asc':
      return sorted.sort((a, b) => compareByName(a, b, lang) || a.number - b.number);
    case 'name-desc':
      return sorted.sort((a, b) => compareByName(b, a, lang) || a.number - b.number);
    case 'energy-asc':
      return sorted.sort((a, b) => compareNullableNumber(a.energy, b.energy, false) || compareByName(a, b, lang));
    case 'energy-desc':
      return sorted.sort((a, b) => compareNullableNumber(a.energy, b.energy, true) || compareByName(a, b, lang));
    case 'might-asc':
      return sorted.sort((a, b) => compareNullableNumber(a.might, b.might, false) || compareByName(a, b, lang));
    case 'might-desc':
      return sorted.sort((a, b) => compareNullableNumber(a.might, b.might, true) || compareByName(a, b, lang));
    case 'rarity-asc':
      return sorted.sort((a, b) => RARITY_ORDER[a.rarity] - RARITY_ORDER[b.rarity] || compareByName(a, b, lang));
    case 'rarity-desc':
      return sorted.sort((a, b) => RARITY_ORDER[b.rarity] - RARITY_ORDER[a.rarity] || compareByName(a, b, lang));
  }
}

/**
 * 套用所有篩選條件並排序。
 *
 * 同一組（例如「卡種」）內的多選是 OR，不同組之間是 AND —— 這是卡牌資料庫的慣例。
 */
/** 這張卡有沒有某個標記。 */
export function hasMark(card: Card, mark: Mark): boolean {
  if (mark === 'token') return card.subtype === 'token';
  if (mark === 'errata') return errataFor(card) !== null;
  return bannedEntryFor(card, 'constructed') !== null;
}

export function applyFilters(
  cards: Card[],
  filters: Filters,
  index: SearchIndex,
  lang: TextLang,
): Card[] {
  const query = filters.query.trim();

  const result = cards.filter((card) => {
    if (filters.sets.length > 0 && !filters.sets.includes(card.set)) return false;
    if (filters.types.length > 0 && !card.types.some((t) => filters.types.includes(t))) return false;
    if (filters.domains.length > 0 && !card.domains.some((d) => filters.domains.includes(d))) {
      return false;
    }
    if (filters.rarities.length > 0 && !filters.rarities.includes(card.rarity)) return false;
    if (filters.energies.length > 0 && (card.energy === null || !filters.energies.includes(card.energy))) {
      return false;
    }
    if (filters.mights.length > 0 && (card.might === null || !filters.mights.includes(card.might))) {
      return false;
    }
    if (filters.tags.length > 0 && !card.tags.some((t) => filters.tags.includes(t))) return false;
    /*
     * 標記之間是 OR 而不是 AND：勾兩個要看到聯集。
     *
     * 一開始的理由是「沒有卡同時是禁卡又是衍生物，用 AND 會直接空白」。
     * 加入勘誤之後這個理由更站得住 —— 現在**確實有卡同時被禁又有勘誤**
     *（The Dreaming Tree），但使用者勾兩個框想看的顯然還是「這兩類都給我看」。
     */
    if (filters.marks.length > 0 && !filters.marks.some((m) => hasMark(card, m))) return false;
    if (query !== '' && !matchesQuery(card, query, index)) return false;
    return true;
  });

  return sortCards(result, filters.sort, lang);
}
