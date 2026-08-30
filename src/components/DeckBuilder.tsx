'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { DeckZonePanel } from './DeckZonePanel';
import { DeckImport } from './DeckImport';
import { DeckLegality } from './DeckLegality';
import { DeckExport } from './DeckExport';
import { CardPicker } from './CardPicker';
import { cardName } from '@/lib/cards';
import {
  checkLegality,
  DECK_REQUIREMENTS,
  TOURNAMENT_REQUIREMENTS,
  EMPTY_DECK,
  matchesIdentity,
  totalCards,
  zoneForCard,
  type Deck,
} from '@/lib/deck-rules';
import { buildCodeIndex, decodeDeck, encodeDeck } from '@/lib/deck-url';

/** 空牌組編出來長什麼樣。用來判斷網址要不要帶 d 參數。 */
const EMPTY_ENCODED = encodeDeck(EMPTY_DECK, []);
import {
  loadCollection,
  loadTracking,
  saveCollection,
  saveTracking,
  type Collection,
} from '@/lib/collection';
import { deckRows } from '@/lib/deck-export';
import { readArtLang, readTextLang, DEFAULT_ART_LANG, DEFAULT_TEXT_LANG } from '@/lib/i18n';
import type { Card, Taxonomy } from '@/lib/types';

/**
 * 牌組編輯器。
 *
 * 全部在瀏覽器端運作：
 *   · 牌組編碼在網址裡 —— 分享不需要伺服器或資料庫
 *   · 收藏記錄存在瀏覽器 localStorage —— 不會上傳到任何地方
 *
 * 這維持了本站「零使用者資料」的架構。沒有資料庫，就沒有東西可以外洩。
 */
export function DeckBuilder({ cards, taxonomy }: { cards: Card[]; taxonomy: Taxonomy }) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const params = useMemo(
    () => new URLSearchParams(searchParams.toString()),
    [searchParams],
  );
  const lang = readTextLang(params);
  const art = readArtLang(params);

  const byId = useMemo(() => new Map(cards.map((c) => [c.id, c])), [cards]);
  const codeIndex = useMemo(() => buildCodeIndex(cards), [cards]);
  const validIds = useMemo(() => new Set(cards.map((c) => c.id)), [cards]);

  // 網址是使用者可編造的輸入，decodeDeck 會逐項比對真實卡片後才採用
  const initial = useMemo(
    () => decodeDeck(params.get('d') ?? '', codeIndex),
    // 只在第一次掛載時讀取；之後由本元件掌握狀態
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const [deck, setDeck] = useState<Deck>(initial.deck);
  const [deckName, setDeckName] = useState('我的牌組');
  const [ready, setReady] = useState(false);

  /**
   * 收藏資料只存在瀏覽器，因此必須在掛載後才讀取
   * （伺服器端渲染時讀不到 localStorage）。
   */
  const [collection, setCollection] = useState<Collection>({});
  const [trackCollection, setTrackCollection] = useState(false);
  const [saveFailed, setSaveFailed] = useState(false);

  useEffect(() => {
    const stored = loadCollection(validIds);
    setCollection(stored);
    setTrackCollection(loadTracking(Object.keys(stored).length > 0));
    setReady(true);
  }, [validIds]);

  // 把牌組寫回網址，讓使用者可以直接複製連結分享
  useEffect(() => {
    if (!ready) return;
    const next = new URLSearchParams();
    const encoded = encodeDeck(deck, cards);
    // 空牌組不必污染網址
    if (encoded !== EMPTY_ENCODED) next.set('d', encoded);
    if (lang !== DEFAULT_TEXT_LANG) next.set('lang', lang);
    if (art !== DEFAULT_ART_LANG) next.set('art', art);

    const qs = next.toString();
    const url = qs === '' ? '/deck' : `/deck?${qs}`;
    if (`${window.location.pathname}${window.location.search}` !== url) {
      router.replace(url, { scroll: false });
    }
  }, [deck, cards, lang, art, ready, router]);

  const legend = deck.legendId ? byId.get(deck.legendId) : undefined;
  const legality = useMemo(() => checkLegality(deck, byId), [deck, byId]);

  // ── 操作 ──────────────────────────────────────────────────────

  const setQty = useCallback(
    (cardId: string, next: number, zoneOverride?: 'sideboard') => {
      const card = byId.get(cardId);
      if (!card) return;
      const zone = zoneOverride ?? zoneForCard(card);
      if (!zone || zone === 'legend') return;

      setDeck((prev) => {
        const updated = { ...prev[zone] };
        if (next <= 0) delete updated[cardId];
        else updated[cardId] = Math.min(next, 99);

        const result = { ...prev, [zone]: updated };
        // 選定英雄若被移出主牌組，就取消它的選定英雄身分
        if (zone === 'main' && prev.championId === cardId && next <= 0) {
          result.championId = null;
        }
        return result;
      });
    },
    [byId],
  );

  /**
   * 備牌加減。
   *
   * 備牌不是卡片的屬性而是玩家的選擇，所以不能沿用 zoneForCard —— 
   * 但仍要擋掉不能進主牌組的卡（賽事規則 601.1.c.2）。
   */
  const setSideboard = useCallback(
    (cardId: string, next: number) => {
      const card = byId.get(cardId);
      if (!card || zoneForCard(card) !== 'main') return;

      setDeck((prev) => {
        const updated = { ...prev.sideboard };
        if (next <= 0) delete updated[cardId];
        else updated[cardId] = Math.min(next, 99);
        return { ...prev, sideboard: updated };
      });
    },
    [byId],
  );

  const chooseLegend = useCallback((cardId: string | null) => {
    setDeck((prev) => ({ ...prev, legendId: cardId }));
  }, []);

  const chooseChampion = useCallback(
    (cardId: string) => {
      setDeck((prev) => {
        const main = { ...prev.main };
        // 選定英雄同時也是主牌組的一張（核心規則 103.2）
        if (!main[cardId]) main[cardId] = 1;
        return { ...prev, championId: cardId, main };
      });
    },
    [],
  );

  const clearDeck = useCallback(() => setDeck(EMPTY_DECK), []);

  const updateCollection = useCallback((cardId: string, qty: number) => {
    setCollection((prev) => {
      const next = { ...prev };
      if (qty <= 0) delete next[cardId];
      else next[cardId] = Math.min(qty, 999);
      setSaveFailed(!saveCollection(next));
      return next;
    });
  }, []);

  /** 開關收藏記錄。這是使用者的偏好，要記住，不能從資料反推。 */
  const setTracking = useCallback((on: boolean) => {
    setTrackCollection(on);
    saveTracking(on);
  }, []);

  const replaceCollection = useCallback(
    (next: Collection) => {
      setCollection(next);
      setSaveFailed(!saveCollection(next));
      setTracking(true);
    },
    [setTracking],
  );

  // ── 衍生資料 ──────────────────────────────────────────────────

  const rows = useMemo(() => deckRows(deck, byId), [deck, byId]);
  const rowsFor = (zone: 'main' | 'runes' | 'battlefields' | 'sideboard') =>
    rows.filter((r) => r.zone === zone).map(({ card, qty }) => ({ card, qty }));

  /** 費用曲線（只看主牌組）。 */
  const curve = useMemo(() => {
    const buckets = new Map<number, number>();
    for (const [id, qty] of Object.entries(deck.main)) {
      const energy = byId.get(id)?.energy;
      if (energy === null || energy === undefined) continue;
      const key = Math.min(energy, 7); // 7 以上合併顯示
      buckets.set(key, (buckets.get(key) ?? 0) + qty);
    }
    return buckets;
  }, [deck.main, byId]);

  const maxCurve = Math.max(1, ...curve.values());

  return (
    <div className="mx-auto w-full max-w-[1400px] px-4 py-8 sm:px-6" data-deck-ready={ready}>
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight text-ink sm:text-3xl">牌組編輯器</h1>
        <p className="mt-1 max-w-3xl text-sm text-ink-dim">
          牌組完整編碼在網址裡，複製網址就能分享 —— 不需要註冊，也不會上傳到任何地方。
        </p>
      </header>

      {initial.dropped > 0 && (
        <p className="mb-4 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-300">
          網址中有 {initial.dropped} 段無法辨識的內容已被略過（可能是舊格式或損毀的連結）。
        </p>
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,420px)_minmax(0,1fr)]">
        {/* ── 左側：牌組 ── */}
        <div>
          <div className="mb-4 flex items-center gap-2">
            <label htmlFor="deck-name" className="sr-only">
              牌組名稱
            </label>
            <input
              id="deck-name"
              type="text"
              value={deckName}
              maxLength={60}
              onChange={(e) => setDeckName(e.target.value)}
              className="min-w-0 flex-1 rounded-lg border border-line bg-surface-1 px-3 py-2 text-sm text-ink focus:border-accent focus:outline-none"
            />
            <button
              type="button"
              onClick={clearDeck}
              className="shrink-0 rounded-lg border border-line px-3 py-2 text-xs text-ink-dim hover:border-surface-3 hover:text-ink"
            >
              清空
            </button>
          </div>

          <DeckImport
            cards={cards}
            byId={byId}
            onImport={(imported, importedName) => {
              setDeck(imported);
              if (importedName) setDeckName(importedName.slice(0, 60));
            }}
          />

          <DeckLegality result={legality} lang={lang} />

          {/* 傳奇 */}
          <section className="mb-5">
            <h3 className="mb-2 text-sm font-semibold text-ink">傳奇</h3>
            {legend ? (
              <div className="flex items-center justify-between gap-2 rounded-lg border border-accent/40 bg-accent/5 px-3 py-2">
                <span className="truncate text-sm text-ink">{cardName(legend, lang)}</span>
                <button
                  type="button"
                  onClick={() => chooseLegend(null)}
                  className="shrink-0 text-xs text-ink-dim hover:text-accent-soft"
                >
                  更換
                </button>
              </div>
            ) : (
              <p className="rounded-lg border border-dashed border-line px-3 py-2 text-xs text-ink-faint">
                請先從右側選一張傳奇 —— 它決定你能使用哪些特性的卡
              </p>
            )}
          </section>

          <DeckZonePanel
            zone="main"
            rows={rowsFor('main')}
            lang={lang}
            art={art}
            collection={trackCollection ? collection : null}
            onChange={setQty}
            requirement={`至少 ${DECK_REQUIREMENTS.mainDeckMin}`}
          />
          <DeckZonePanel
            zone="runes"
            rows={rowsFor('runes')}
            lang={lang}
            art={art}
            collection={trackCollection ? collection : null}
            onChange={setQty}
            requirement={`需要 ${DECK_REQUIREMENTS.runeDeckSize}`}
          />
          <DeckZonePanel
            zone="battlefields"
            rows={rowsFor('battlefields')}
            lang={lang}
            art={art}
            collection={trackCollection ? collection : null}
            onChange={setQty}
            requirement={`需要 ${DECK_REQUIREMENTS.battlefieldCount}`}
          />

          <DeckZonePanel
            zone="sideboard"
            rows={rowsFor('sideboard')}
            lang={lang}
            art={art}
            collection={trackCollection ? collection : null}
            onChange={(id, next) => setSideboard(id, next)}
            requirement={`賽事上限 ${TOURNAMENT_REQUIREMENTS.sideboardMax}`}
          />

          {/* 費用曲線 */}
          {totalCards(deck.main) > 0 && (
            <section className="mb-5">
              <h3 className="mb-2 text-sm font-semibold text-ink">費用曲線</h3>
              <div className="flex items-end gap-1.5">
                {Array.from({ length: 8 }, (_, energy) => {
                  const count = curve.get(energy) ?? 0;
                  return (
                    <div key={energy} className="flex flex-1 flex-col items-center gap-1">
                      <span className="text-[0.65rem] text-ink-faint">{count || ''}</span>
                      <div
                        className={`w-full rounded-t bg-accent/60 curve-bar-${Math.round((count / maxCurve) * 10)}`}
                      />
                      <span className="text-[0.65rem] text-ink-faint">
                        {energy === 7 ? '7+' : energy}
                      </span>
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          <DeckExport
            deck={deck}
            deckName={deckName}
            byId={byId}
            cards={cards}
            lang={lang}
            collection={collection}
            trackCollection={trackCollection}
            saveFailed={saveFailed}
            onCollectionReplace={replaceCollection}
            onTrackChange={setTracking}
          />
        </div>

        {/* ── 右側：選卡 ── */}
        <CardPicker
          cards={cards}
          taxonomy={taxonomy}
          lang={lang}
          art={art}
          legend={legend}
          deck={deck}
          collection={trackCollection ? collection : null}
          sideboardCount={legality.counts.sideboard}
          onAdd={setQty}
          onSideboard={setSideboard}
          onChooseLegend={chooseLegend}
          onChooseChampion={chooseChampion}
          onCollectionChange={updateCollection}
          trackCollection={trackCollection}
          matchesIdentity={matchesIdentity}
        />
      </div>
    </div>
  );
}
