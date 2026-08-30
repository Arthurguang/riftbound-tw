'use client';

import { useMemo, useState } from 'react';
import { applyFilters, buildSearchIndex, EMPTY_FILTERS } from '@/lib/search';
import { cardImageUrl, cardName, cardSubtitle } from '@/lib/cards';
import { DOMAIN_LABELS } from '@/lib/labels';
import { DomainDot } from './CardBadges';
import { zoneForCard, type Deck } from '@/lib/deck-rules';
import type { ArtLang, TextLang } from '@/lib/i18n';
import type { Card, Domain, Taxonomy } from '@/lib/types';

/** 選卡面板的分頁。對應牌組的各個區域。 */
const TABS = [
  { id: 'legend', label: '傳奇' },
  { id: 'main', label: '主牌組' },
  { id: 'runes', label: '符文' },
  { id: 'battlefields', label: '戰場' },
] as const;

type TabId = (typeof TABS)[number]['id'];

export function CardPicker({
  cards,
  taxonomy,
  lang,
  art,
  legend,
  deck,
  collection,
  trackCollection,
  onAdd,
  onChooseLegend,
  onChooseChampion,
  onCollectionChange,
  matchesIdentity,
}: {
  cards: Card[];
  taxonomy: Taxonomy;
  lang: TextLang;
  art: ArtLang;
  legend: Card | undefined;
  deck: Deck;
  collection: Record<string, number> | null;
  trackCollection: boolean;
  onAdd: (cardId: string, next: number) => void;
  onChooseLegend: (cardId: string | null) => void;
  onChooseChampion: (cardId: string) => void;
  onCollectionChange: (cardId: string, qty: number) => void;
  matchesIdentity: (card: Card, legendDomains: readonly Domain[]) => boolean;
}) {
  const [tab, setTab] = useState<TabId>('legend');
  const [query, setQuery] = useState('');
  const [domainFilter, setDomainFilter] = useState<Domain[]>([]);
  const [onlyMatching, setOnlyMatching] = useState(true);
  const [onlyOwned, setOnlyOwned] = useState(false);

  const index = useMemo(() => buildSearchIndex(cards, taxonomy.tagLabels), [cards, taxonomy]);

  const visible = useMemo(() => {
    const filtered = applyFilters(
      cards,
      { ...EMPTY_FILTERS, query, domains: domainFilter },
      index,
      lang,
    );

    return filtered.filter((card) => {
      // 指示物是遊戲中產生的，不能放進牌組（核心規則 103）
      const zone = zoneForCard(card);
      if (zone === null) return false;
      if (zone !== tab) return false;

      // 只顯示符合傳奇特性的卡（核心規則 103.2.c）
      if (onlyMatching && legend && tab !== 'legend' && !matchesIdentity(card, legend.domains)) {
        return false;
      }
      if (onlyOwned && collection && (collection[card.id] ?? 0) === 0) return false;
      return true;
    });
  }, [
    cards,
    query,
    domainFilter,
    index,
    lang,
    tab,
    onlyMatching,
    legend,
    matchesIdentity,
    onlyOwned,
    collection,
  ]);

  const qtyInDeck = (card: Card): number => {
    const zone = zoneForCard(card);
    if (zone === 'legend') return deck.legendId === card.id ? 1 : 0;
    if (zone === null) return 0;
    return deck[zone][card.id] ?? 0;
  };

  return (
    <div className="min-w-0">
      {/* 分頁 */}
      <div role="tablist" aria-label="牌組區域" className="mb-3 flex flex-wrap gap-1.5">
        {TABS.map((t) => (
          <button
            key={t.id}
            role="tab"
            type="button"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            className={`rounded-lg border px-3 py-1.5 text-sm transition-colors ${
              tab === t.id
                ? 'border-accent bg-accent/10 text-accent-soft'
                : 'border-line text-ink-dim hover:border-surface-3 hover:text-ink'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* 搜尋與篩選 */}
      <div className="mb-3 space-y-2">
        <label htmlFor="picker-search" className="sr-only">
          搜尋卡牌
        </label>
        <input
          id="picker-search"
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="搜尋卡名、能力文字、標籤…"
          className="w-full rounded-lg border border-line bg-surface-1 px-3 py-2 text-sm text-ink placeholder:text-ink-faint focus:border-accent focus:outline-none"
        />

        <div className="flex flex-wrap items-center gap-1.5">
          {taxonomy.domains.map((d) => {
            const active = domainFilter.includes(d);
            return (
              <button
                key={d}
                type="button"
                aria-pressed={active}
                onClick={() =>
                  setDomainFilter((prev) =>
                    prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d],
                  )
                }
                className={`flex items-center gap-1 rounded-full border px-2 py-1 text-xs transition-colors ${
                  active
                    ? 'border-accent bg-accent/10 text-accent-soft'
                    : 'border-line text-ink-dim hover:border-surface-3'
                }`}
              >
                <DomainDot domain={d} />
                {DOMAIN_LABELS[d][lang]}
              </button>
            );
          })}
        </div>

        <div className="flex flex-wrap gap-3 text-xs text-ink-dim">
          {legend && tab !== 'legend' && (
            <label className="flex items-center gap-1.5">
              <input
                type="checkbox"
                checked={onlyMatching}
                onChange={(e) => setOnlyMatching(e.target.checked)}
                className="accent-current"
              />
              只顯示符合「{cardName(legend, lang)}」特性的卡
            </label>
          )}
          {trackCollection && (
            <label className="flex items-center gap-1.5">
              <input
                type="checkbox"
                checked={onlyOwned}
                onChange={(e) => setOnlyOwned(e.target.checked)}
                className="accent-current"
              />
              只顯示我擁有的
            </label>
          )}
          <span className="ml-auto text-ink-faint">{visible.length} 張</span>
        </div>
      </div>

      {/* 卡片網格 */}
      {visible.length === 0 ? (
        <p className="rounded-lg border border-dashed border-line px-4 py-8 text-center text-sm text-ink-faint">
          沒有符合條件的卡牌
        </p>
      ) : (
        <ul
          data-testid="picker-list"
          className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5"
        >
          {visible.map((card) => {
            const inDeck = qtyInDeck(card);
            const owned = collection?.[card.id] ?? 0;
            const isLegendTab = tab === 'legend';
            const subtitle = cardSubtitle(card, lang);

            return (
              <li
                key={card.id}
                className={`rounded-lg border bg-surface-1 p-2 ${
                  inDeck > 0 ? 'border-accent/50' : 'border-line'
                }`}
              >
                <div className="relative mb-1.5">
                  <img
                    src={cardImageUrl(card, 300, art)}
                    alt=""
                    loading="lazy"
                    referrerPolicy="no-referrer"
                    className={`w-full rounded object-cover ${
                      card.orientation === 'landscape' ? 'aspect-[1.4/1]' : 'aspect-[0.716/1]'
                    }`}
                  />
                  {inDeck > 0 && (
                    <span className="absolute right-1 top-1 rounded bg-accent px-1.5 py-0.5 text-xs font-semibold text-black">
                      {inDeck}
                    </span>
                  )}
                </div>

                <p className="truncate text-xs font-medium text-ink" title={cardName(card, lang)}>
                  {cardName(card, lang)}
                </p>
                {subtitle && <p className="truncate text-[0.65rem] text-ink-faint">{subtitle}</p>}

                {isLegendTab ? (
                  <button
                    type="button"
                    onClick={() => onChooseLegend(card.id)}
                    className={`mt-1.5 w-full rounded border px-2 py-1 text-xs transition-colors ${
                      deck.legendId === card.id
                        ? 'border-accent bg-accent/15 text-accent-soft'
                        : 'border-line text-ink-dim hover:border-accent hover:text-accent-soft'
                    }`}
                  >
                    {deck.legendId === card.id ? '已選為傳奇' : '選為傳奇'}
                  </button>
                ) : (
                  <div className="mt-1.5 flex items-center gap-1">
                    <button
                      type="button"
                      aria-label={`從牌組移除 ${cardName(card, lang)}`}
                      onClick={() => onAdd(card.id, inDeck - 1)}
                      disabled={inDeck === 0}
                      className="h-6 flex-1 rounded border border-line text-xs text-ink-dim hover:border-surface-3 hover:text-ink disabled:opacity-30"
                    >
                      −
                    </button>
                    <button
                      type="button"
                      aria-label={`加入牌組 ${cardName(card, lang)}`}
                      onClick={() => onAdd(card.id, inDeck + 1)}
                      className="h-6 flex-1 rounded border border-line text-xs text-ink-dim hover:border-accent hover:text-accent-soft"
                    >
                      +
                    </button>
                  </div>
                )}

                {/* 選定英雄：只有主牌組裡的英雄單位可以指定（核心規則 103.2.a.2） */}
                {tab === 'main' && card.subtype === 'champion' && (
                  <button
                    type="button"
                    onClick={() => onChooseChampion(card.id)}
                    className={`mt-1 w-full rounded border px-2 py-1 text-[0.65rem] transition-colors ${
                      deck.championId === card.id
                        ? 'border-emerald-500/60 bg-emerald-500/10 text-emerald-300'
                        : 'border-line text-ink-faint hover:border-emerald-500/60 hover:text-emerald-300'
                    }`}
                  >
                    {deck.championId === card.id ? '選定英雄' : '設為選定英雄'}
                  </button>
                )}

                {trackCollection && (
                  <div className="mt-1 flex items-center justify-between gap-1 border-t border-line pt-1">
                    <span className="text-[0.65rem] text-ink-faint">擁有</span>
                    <div className="flex items-center gap-0.5">
                      <button
                        type="button"
                        aria-label={`減少擁有張數 ${cardName(card, lang)}`}
                        onClick={() => onCollectionChange(card.id, owned - 1)}
                        disabled={owned === 0}
                        className="h-5 w-5 rounded border border-line text-[0.65rem] text-ink-dim disabled:opacity-30"
                      >
                        −
                      </button>
                      <span className="w-4 text-center text-[0.7rem] text-ink">{owned}</span>
                      <button
                        type="button"
                        aria-label={`增加擁有張數 ${cardName(card, lang)}`}
                        onClick={() => onCollectionChange(card.id, owned + 1)}
                        className="h-5 w-5 rounded border border-line text-[0.65rem] text-ink-dim"
                      >
                        +
                      </button>
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
