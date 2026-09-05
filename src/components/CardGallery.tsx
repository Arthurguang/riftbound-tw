'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { CardTile } from './CardTile';
import { FilterPanel } from './FilterPanel';
import {
  applyFilters,
  buildSearchIndex,
  isFiltered,
  isSortId,
  EMPTY_FILTERS,
  SORT_OPTIONS,
} from '@/lib/search';
import type { Filters } from '@/lib/search';
import { filtersFromParams, filtersToQueryString } from '@/lib/filters-url';
import { DEFAULT_ART_LANG, DEFAULT_TEXT_LANG, readArtLang, readTextLang, t } from '@/lib/i18n';
import type { Card, Taxonomy } from '@/lib/types';

/**
 * 圖鑑主畫面。
 *
 * 所有搜尋與篩選都在瀏覽器端完成 —— 不會有任何請求送到伺服器，
 * 因此也就不存在伺服器端的注入或資料外洩風險。
 *
 * 篩選條件與語言設定都同步到網址，使用者可以直接複製網址分享。
 */
export function CardGallery({ cards, taxonomy }: { cards: Card[]; taxonomy: Taxonomy }) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const lang = readTextLang(new URLSearchParams(searchParams.toString()));
  const art = readArtLang(new URLSearchParams(searchParams.toString()));
  const strings = t(lang);

  // 網址是使用者可編造的輸入，filtersFromParams 會逐項比對允許清單後才採用。
  const [filters, setFilters] = useState<Filters>(() =>
    filtersFromParams(new URLSearchParams(searchParams.toString()), taxonomy.tags),
  );
  const [showFilters, setShowFilters] = useState(false);

  // 搜尋索引包含三種語言的卡名與能力文字，只算一次。
  const index = useMemo(() => buildSearchIndex(cards, taxonomy.tagLabels), [cards, taxonomy]);
  const results = useMemo(
    () => applyFilters(cards, filters, index, lang),
    [cards, filters, index, lang],
  );

  /** 保留語言設定的查詢字串（語言與篩選是兩件事，切換其一不該清掉另一個）。 */
  const langQuery = useMemo(() => {
    const params = new URLSearchParams();
    if (lang !== DEFAULT_TEXT_LANG) params.set('lang', lang);
    if (art !== DEFAULT_ART_LANG) params.set('art', art);
    return params.toString();
  }, [lang, art]);

  // 把目前的篩選狀態寫回網址（用 replace，不污染上一頁/下一頁的歷史紀錄）。
  useEffect(() => {
    const parts = [filtersToQueryString(filters), langQuery].filter(Boolean);
    const qs = parts.join('&');
    const next = qs === '' ? '/cards' : `/cards?${qs}`;
    const current = `${window.location.pathname}${window.location.search}`;
    if (next !== current) router.replace(next, { scroll: false });
  }, [filters, langQuery, router]);

  /**
   * 卡片連結。
   *
   * 把**目前的篩選條件也帶進去** —— 詳細頁的「回到卡牌圖鑑」要靠它把使用者
   * 送回原本篩好的畫面。先前只帶語言，所以點進一張卡再返回，
   * 辛苦篩好的條件就全部沒了。
   *
   * （瀏覽器的上一頁本來就會回到篩好的網址，因為篩選是用 router.replace
   * 寫在同一筆歷史紀錄上。壞掉的一直是頁面裡那個返回連結。）
   */
  const cardHref = (id: string) => {
    const qs = [filtersToQueryString(filters), langQuery].filter(Boolean).join('&');
    return qs === '' ? `/cards/${id}` : `/cards/${id}?${qs}`;
  };
  const active = isFiltered(filters);

  return (
    <div className="mx-auto w-full max-w-[1400px] px-4 py-8 sm:px-6">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
          {strings.galleryTitle}
        </h1>
        <p className="mt-1 text-sm text-ink-dim">{strings.gallerySubtitle(cards.length)}</p>
      </header>

      {/* 搜尋列 —— 刻意不用 <form>，因此不需要放寬 CSP 的 form-action。 */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <label htmlFor="card-search" className="sr-only">
            {strings.searchLabel}
          </label>
          <input
            id="card-search"
            type="search"
            value={filters.query}
            maxLength={100}
            placeholder={strings.searchPlaceholder}
            onChange={(e) => setFilters({ ...filters, query: e.target.value })}
            className="w-full rounded-lg border border-line bg-surface-1 px-3.5 py-2.5 text-sm text-ink placeholder:text-ink-faint focus:border-accent focus:outline-none"
          />
        </div>

        <div className="flex items-center gap-2">
          <label htmlFor="card-sort" className="sr-only">
            {strings.sortLabel}
          </label>
          <select
            id="card-sort"
            value={filters.sort}
            onChange={(e) => {
              const value = e.target.value;
              if (isSortId(value)) setFilters({ ...filters, sort: value });
            }}
            className="rounded-lg border border-line bg-surface-1 px-3 py-2.5 text-sm text-ink focus:border-accent focus:outline-none"
          >
            {SORT_OPTIONS.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label[lang]}
              </option>
            ))}
          </select>

          <button
            type="button"
            onClick={() => setShowFilters((v) => !v)}
            aria-expanded={showFilters}
            aria-controls="filter-panel"
            className="rounded-lg border border-line bg-surface-1 px-3 py-2.5 text-sm text-ink hover:border-surface-3"
          >
            {showFilters ? strings.hideFilters : strings.showFilters}
          </button>
        </div>
      </div>

      <div className="mt-3 flex items-center justify-between gap-3 text-sm">
        <p className="text-ink-dim">{strings.resultCount(results.length)}</p>
        {active && (
          <button
            type="button"
            onClick={() => setFilters({ ...EMPTY_FILTERS, sort: filters.sort })}
            className="text-accent-soft hover:underline"
          >
            {strings.clearFilters}
          </button>
        )}
      </div>

      {showFilters && (
        <div
          id="filter-panel"
          className="mt-4 rounded-xl border border-line bg-surface-1/60 p-4 sm:p-5"
        >
          <FilterPanel
            taxonomy={taxonomy}
            filters={filters}
            lang={lang}
            onChange={setFilters}
          />
        </div>
      )}

      {results.length === 0 ? (
        <p className="mt-16 text-center text-ink-dim">{strings.noResults}</p>
      ) : (
        <ul className="mt-6 grid grid-cols-2 gap-x-3 gap-y-5 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
          {results.map((card) => (
            <li key={card.id}>
              <CardTile card={card} lang={lang} art={art} href={cardHref(card.id)} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
