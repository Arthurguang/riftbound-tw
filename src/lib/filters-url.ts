/**
 * 篩選狀態 ⇄ 網址查詢字串的轉換。
 *
 * 讓使用者可以把「篩好的結果」直接複製網址分享出去。
 *
 * 資安注意：網址是使用者可以任意編造的輸入。
 * 因此解析時一律比對允許清單，任何無法辨識的值直接丟棄，
 * 不讓它進入應用程式狀態。
 */

import { CARD_TYPES, DOMAINS, RARITIES, SET_IDS } from './types';
import type { CardType, Domain, Rarity, SetId } from './types';
import { DEFAULT_SORT, EMPTY_FILTERS, isSortId, MARKS, type Filters, type Mark } from './search';

/** 搜尋字串的長度上限，避免有人塞一段超長字串進網址。 */
const MAX_QUERY_LENGTH = 100;

/** 數值篩選的合理上限，超過就忽略。 */
const MAX_NUMERIC_VALUE = 99;

function readList<T extends string>(
  params: URLSearchParams,
  key: string,
  allowed: readonly T[],
): T[] {
  const raw = params.get(key);
  if (!raw) return [];
  const allowedSet = new Set<string>(allowed);
  // 去重 + 只保留允許清單內的值。
  return [...new Set(raw.split(','))].filter((v): v is T => allowedSet.has(v));
}

function readNumbers(params: URLSearchParams, key: string): number[] {
  const raw = params.get(key);
  if (!raw) return [];
  return [...new Set(raw.split(','))]
    .map(Number)
    .filter((n) => Number.isInteger(n) && n >= 0 && n <= MAX_NUMERIC_VALUE);
}

function readTags(params: URLSearchParams, allowedTags: readonly string[]): string[] {
  const raw = params.get('tag');
  if (!raw) return [];
  const allowedSet = new Set(allowedTags);
  return [...new Set(raw.split(','))].filter((tag) => allowedSet.has(tag));
}

export function filtersFromParams(
  params: URLSearchParams,
  allowedTags: readonly string[],
): Filters {
  const sortParam = params.get('sort') ?? '';
  const query = (params.get('q') ?? '').slice(0, MAX_QUERY_LENGTH);

  return {
    ...EMPTY_FILTERS,
    query,
    sets: readList<SetId>(params, 'set', SET_IDS),
    types: readList<CardType>(params, 'type', CARD_TYPES),
    domains: readList<Domain>(params, 'domain', DOMAINS),
    rarities: readList<Rarity>(params, 'rarity', RARITIES),
    energies: readNumbers(params, 'energy'),
    mights: readNumbers(params, 'might'),
    tags: readTags(params, allowedTags),
    marks: readList<Mark>(params, 'mark', MARKS),
    sort: isSortId(sortParam) ? sortParam : DEFAULT_SORT,
  };
}

export function filtersToQueryString(filters: Filters): string {
  const params = new URLSearchParams();
  const setList = (key: string, values: readonly (string | number)[]) => {
    if (values.length > 0) params.set(key, values.join(','));
  };

  if (filters.query.trim() !== '') params.set('q', filters.query.trim());
  setList('set', filters.sets);
  setList('type', filters.types);
  setList('domain', filters.domains);
  setList('rarity', filters.rarities);
  setList('energy', filters.energies);
  setList('might', filters.mights);
  setList('tag', filters.tags);
  setList('mark', filters.marks);
  if (filters.sort !== DEFAULT_SORT) params.set('sort', filters.sort);

  return params.toString();
}
