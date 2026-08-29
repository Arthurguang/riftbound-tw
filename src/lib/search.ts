/**
 * 圖鑑的搜尋、篩選與排序邏輯。
 *
 * 全部在瀏覽器端執行（376 張卡的資料只有幾百 KB），
 * 因此沒有任何搜尋請求會送到伺服器，也就沒有伺服器端的注入風險。
 */

import { cardName, cardTextToPlain } from './cards';
import type { TextLang } from './i18n';
import { RARITY_ORDER } from './labels';
import type { Card, CardType, Domain, Rarity, SetId, Taxonomy } from './types';

/** 排序選項。label 為三語對照。 */
export const SORT_OPTIONS = [
  { id: 'number-asc', label: { 'zh-TW': '卡號（小到大）', 'zh-CN': '卡号（小到大）', en: 'Card # ascending' } },
  { id: 'number-desc', label: { 'zh-TW': '卡號（大到小）', 'zh-CN': '卡号（大到小）', en: 'Card # descending' } },
  { id: 'name-asc', label: { 'zh-TW': '卡名（順序）', 'zh-CN': '卡名（顺序）', en: 'Name (A→Z)' } },
  { id: 'name-desc', label: { 'zh-TW': '卡名（反序）', 'zh-CN': '卡名（反序）', en: 'Name (Z→A)' } },
  { id: 'energy-asc', label: { 'zh-TW': '能量（低到高）', 'zh-CN': '费用（低到高）', en: 'Energy (low→high)' } },
  { id: 'energy-desc', label: { 'zh-TW': '能量（高到低）', 'zh-CN': '费用（高到低）', en: 'Energy (high→low)' } },
  { id: 'might-asc', label: { 'zh-TW': '力量（低到高）', 'zh-CN': '战力（低到高）', en: 'Might (low→high)' } },
  { id: 'might-desc', label: { 'zh-TW': '力量（高到低）', 'zh-CN': '战力（高到低）', en: 'Might (high→low)' } },
  { id: 'rarity-asc', label: { 'zh-TW': '稀有度（低到高）', 'zh-CN': '稀有度（低到高）', en: 'Rarity (low→high)' } },
  { id: 'rarity-desc', label: { 'zh-TW': '稀有度（高到低）', 'zh-CN': '稀有度（高到低）', en: 'Rarity (high→low)' } },
] as const satisfies readonly { id: string; label: Record<TextLang, string> }[];

export type SortId = (typeof SORT_OPTIONS)[number]['id'];

export const DEFAULT_SORT: SortId = 'number-asc';

export function isSortId(value: string): value is SortId {
  return SORT_OPTIONS.some((option) => option.id === value);
}

export type Filters = {
  query: string;
  sets: SetId[];
  types: CardType[];
  domains: Domain[];
  rarities: Rarity[];
  energies: number[];
  mights: number[];
  tags: string[];
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
 * 建立搜尋索引。
 *
 * 三種語言的卡名、能力文字與標籤全部放進同一份索引 ——
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

function sortCards(cards: Card[], sort: SortId, lang: TextLang): Card[] {
  const sorted = [...cards];
  switch (sort) {
    case 'number-asc':
      return sorted.sort((a, b) => a.set.localeCompare(b.set) || a.number - b.number);
    case 'number-desc':
      return sorted.sort((a, b) => a.set.localeCompare(b.set) || b.number - a.number);
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
    if (query !== '' && !matchesQuery(card, query, index)) return false;
    return true;
  });

  return sortCards(result, filters.sort, lang);
}
