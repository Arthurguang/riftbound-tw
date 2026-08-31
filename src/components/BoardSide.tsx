'use client';

import { useMemo, useState } from 'react';
import { cardName } from '@/lib/cards';
import { DeckImport } from './DeckImport';
import { BoardZonePanel } from './BoardZonePanel';
import { RuneTracker } from './RuneTracker';
import {
  BOARD_ZONES,
  foreignCards,
  handSize,
  hasDeck,
  moveCard,
  remainingDeck,
  runesOnBase,
  setInPile,
  type BoardZone,
  type PlayerBoard,
} from '@/lib/board-state';
import { runesNeeded } from '@/lib/draw-model';
import { atLeast } from '@/lib/probability';
import { formatPercent } from '@/lib/draw-model';
import type { ArtLang, TextLang } from '@/lib/i18n';
import type { Card } from '@/lib/types';

/**
 * 盤面上的一方。
 *
 * 「你」與「對手」用同一個元件，差別只在對手預設用「未知手牌張數」——
 * 依規則 108.7.c 手牌是私密資訊、108.7.e 張數是公開資訊。
 */
/**
 * 「加到」可以選哪些區域。
 *
 * 戰場不在這裡：單位先加到基地或手牌，再用卡片列上的「戰一 / 戰二」
 * 按鈕移過去 —— 這樣比較貼近實際流程（198.1：位置包括戰場和基地）。
 */
const ADD_TARGETS = ['hand', 'base', 'discard', 'exile'] as const;
const ADD_LABELS: Record<(typeof ADD_TARGETS)[number], string> = {
  hand: '手牌',
  base: '基地',
  discard: '廢牌堆',
  exile: '放逐',
};

export function BoardSide({
  title,
  player,
  cards,
  byId,
  lang,
  art,
  isOpponent,
  turn,
  onThePlay,
  onChange,
}: {
  /** 顯示的名稱，同時也是各輸入框 id 的前綴。 */
  title: string;
  player: PlayerBoard;
  cards: Card[];
  byId: Map<string, Card>;
  lang: TextLang;
  art: ArtLang;
  isOpponent: boolean;
  /** 目前回合，用來提示照規則應該召出幾張符文。 */
  turn: number;
  onThePlay: boolean;
  onChange: (next: PlayerBoard) => void;
}) {
  const [adding, setAdding] = useState<BoardZone>('hand');
  const [query, setQuery] = useState('');

  const remaining = useMemo(() => remainingDeck(player), [player]);
  const foreign = useMemo(() => foreignCards(player), [player]);
  const runes = runesOnBase(player, byId);

  /** 可以加進盤面的候選卡：以這副牌組為主，找不到時退回全部卡片。 */
  const candidates = useMemo(() => {
    const q = query.trim().toLowerCase();
    const pool = hasDeck(player)
      ? [
          ...Object.keys(player.deck.main),
          ...Object.keys(player.deck.runes),
          ...Object.keys(player.deck.battlefields),
          ...Object.keys(player.deck.sideboard),
          ...(player.deck.legendId ? [player.deck.legendId] : []),
        ]
          .map((id) => byId.get(id))
          .filter((c): c is Card => Boolean(c))
      : cards;

    const filtered =
      q === ''
        ? pool
        : pool.filter(
            (c) =>
              c.name.toLowerCase().includes(q) ||
              (c.zh.tw?.name ?? '').toLowerCase().includes(q) ||
              (c.zh.cn?.name ?? '').toLowerCase().includes(q) ||
              c.code.toLowerCase().includes(q),
          );

    return filtered.sort((a, b) => a.number - b.number).slice(0, 40);
  }, [player, byId, cards, query]);

  const addCard = (zone: BoardZone, cardId: string) => {
    onChange({ ...player, [zone]: setInPile(player[zone], cardId, (player[zone][cardId] ?? 0) + 1) });
  };

  /** 目前這回合付得起的手牌（只看資源，不判斷時機或合法性）。 */
  const affordable = useMemo(() => {
    return Object.entries(player.hand)
      .map(([id, qty]) => ({ card: byId.get(id), qty }))
      .filter((e): e is { card: Card; qty: number } => Boolean(e.card) && e.qty > 0)
      .map(({ card }) => ({ card, needed: runesNeeded(card) }))
      .filter((e) => e.needed !== null)
      .map((e) => ({ ...e, ok: (e.needed ?? 0) <= runes }));
  }, [player.hand, byId, runes]);

  return (
    <div
      className="min-w-0 rounded-lg border border-line p-3"
      data-side={isOpponent ? 'opponent' : 'you'}
    >
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-base font-semibold text-ink">{title}</h3>
        <span className="text-xs text-ink-dim">
          手牌 {handSize(player)}　牌堆 {remaining.mainSize}　符文 {runes}
        </span>
      </div>

      <DeckImport
        cards={cards}
        byId={byId}
        onImport={(deck) => onChange({ ...player, deck })}
      />

      {!hasDeck(player) ? (
        <p className="rounded-lg border border-dashed border-line px-3 py-4 text-center text-xs text-ink-faint">
          先匯入這一方的牌組，才能算出牌堆裡還剩什麼
        </p>
      ) : (
        <>
          <RuneTracker
            player={player}
            byId={byId}
            lang={lang}
            turn={turn}
            onThePlay={onThePlay}
            onChange={onChange}
          />

          {/* 加卡到盤面 */}
          <div className="mb-3 space-y-2 rounded-lg border border-line bg-surface-1 p-2.5">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-xs text-ink-dim">加到</span>
              {ADD_TARGETS.map((zone) => (
                <button
                  key={zone}
                  type="button"
                  aria-pressed={adding === zone}
                  onClick={() => setAdding(zone)}
                  className={`rounded px-2 py-1 text-xs transition-colors ${
                    adding === zone
                      ? 'bg-accent/15 text-accent-soft'
                      : 'text-ink-dim hover:text-ink'
                  }`}
                >
                  {ADD_LABELS[zone]}
                </button>
              ))}
            </div>

            <label htmlFor={`board-search-${title}`} className="sr-only">
              搜尋要加入的卡
            </label>
            <input
              id={`board-search-${title}`}
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="搜尋卡名或卡號…"
              className="w-full rounded border border-line bg-surface px-2 py-1.5 text-xs text-ink placeholder:text-ink-faint focus:border-accent focus:outline-none"
            />

            <ul className="flex max-h-40 flex-wrap gap-1 overflow-y-auto">
              {candidates.map((card) => (
                <li key={card.id}>
                  <button
                    type="button"
                    onClick={() => addCard(adding, card.id)}
                    className="rounded border border-line px-1.5 py-0.5 text-[0.7rem] text-ink-dim hover:border-accent hover:text-accent-soft"
                  >
                    {cardName(card, lang)}
                  </button>
                </li>
              ))}
            </ul>
          </div>

          {/* 四個區域 */}
          <div className="space-y-2">
            {BOARD_ZONES.map((zone) => (
              <BoardZonePanel
                key={zone}
                zone={zone}
                pile={player[zone]}
                byId={byId}
                lang={lang}
                art={art}
                onMove={(cardId, to) => onChange(moveCard(player, zone, to, cardId))}
                onRemove={(cardId) =>
                  onChange({
                    ...player,
                    [zone]: setInPile(player[zone], cardId, (player[zone][cardId] ?? 0) - 1),
                  })
                }
                extra={
                  zone === 'hand' && isOpponent ? (
                    <label className="ml-auto flex items-center gap-1 text-[0.7rem] text-ink-dim">
                      不知道內容的
                      <input
                        type="number"
                        min={0}
                        max={99}
                        value={player.unknownHand}
                        onChange={(e) => {
                          const next = Number(e.target.value);
                          if (!Number.isFinite(next)) return;
                          onChange({
                            ...player,
                            unknownHand: Math.max(0, Math.min(99, Math.round(next))),
                          });
                        }}
                        className="w-12 rounded border border-line bg-surface px-1 py-0.5 text-xs text-ink focus:border-accent focus:outline-none"
                        aria-label="對手手牌中你不知道內容的張數"
                      />
                      張
                    </label>
                  ) : undefined
                }
              />
            ))}
          </div>

          {/* 擺錯的提示 */}
          {remaining.overflow.length > 0 && (
            <div className="mt-2 rounded border border-rose-500/40 bg-rose-500/10 p-2 text-xs">
              <p className="text-rose-300">盤面上有卡片超過牌組裡的張數：</p>
              <ul className="mt-1 space-y-0.5">
                {remaining.overflow.map((o) => {
                  const card = byId.get(o.cardId);
                  return (
                    <li key={o.cardId} className="text-rose-200/80">
                      {card ? cardName(card, lang) : o.cardId}：牌組 {o.inDeck} 張，盤面已有{' '}
                      {o.onBoard} 張
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          {foreign.length > 0 && (
            <p className="mt-2 rounded border border-amber-500/40 bg-amber-500/10 p-2 text-xs text-amber-200/80">
              盤面上有 {foreign.length} 種卡不在這副牌組裡。遊戲中確實可能出現
              （指示物、被效果加入的卡），但這會讓牌堆的計算失準，請確認是否為預期。
            </p>
          )}

          {/* 這回合付得起什麼 */}
          {affordable.length > 0 && (
            <section className="mt-3 rounded-lg border border-line bg-surface-1 p-2.5">
              <h4 className="mb-1 text-sm font-semibold text-ink">
                手牌裡現在付得起的
                <span className="ml-2 text-xs font-normal text-ink-faint">
                  基地上 {runes} 張符文
                </span>
              </h4>
              <p className="mb-2 text-[0.7rem] leading-relaxed text-ink-faint">
                只比較「法力＋符能」與符文張數（131.2、131.3、164.2）。
                <strong className="text-ink-dim">不判斷時機、目標或能力是否合法</strong>
                —— 那需要規則引擎。
              </p>
              <ul className="flex flex-wrap gap-1">
                {affordable.map(({ card, needed, ok }) => (
                  <li
                    key={card.id}
                    className={`rounded border px-1.5 py-0.5 text-[0.7rem] ${
                      ok
                        ? 'border-emerald-500/50 text-emerald-300'
                        : 'border-line text-ink-faint line-through'
                    }`}
                    title={`需要 ${needed} 張符文`}
                  >
                    {cardName(card, lang)} · {needed}
                  </li>
                ))}
              </ul>
            </section>
          )}

          {/* 從當下盤面算機率 */}
          <NextDrawOdds remaining={remaining} byId={byId} lang={lang} />
        </>
      )}
    </div>
  );
}

/**
 * 從**當下的牌堆**算下一張抽到什麼的機率。
 *
 * 這是復盤最實用的數字：牌堆已經被手牌、廢牌堆、放逐消耗過，
 * 剩下的組成跟開局完全不同。
 */
function NextDrawOdds({
  remaining,
  byId,
  lang,
}: {
  remaining: ReturnType<typeof remainingDeck>;
  byId: Map<string, Card>;
  lang: TextLang;
}) {
  const [draws, setDraws] = useState(1);

  const rows = useMemo(() => {
    if (remaining.mainSize <= 0) return [];
    return Object.entries(remaining.main)
      .map(([id, qty]) => ({ card: byId.get(id), qty }))
      .filter((e): e is { card: Card; qty: number } => Boolean(e.card))
      .map(({ card, qty }) => ({
        card,
        qty,
        p: atLeast(
          { population: remaining.mainSize, successes: qty, draws: Math.min(draws, remaining.mainSize) },
          1,
        ),
      }))
      .sort((a, b) => b.p - a.p || a.card.number - b.card.number)
      .slice(0, 12);
  }, [remaining, byId, draws]);

  if (rows.length === 0) return null;

  return (
    <section
      data-testid="next-draw-odds"
      className="mt-3 rounded-lg border border-line bg-surface-1 p-2.5"
    >
      <div className="mb-1 flex flex-wrap items-baseline justify-between gap-2">
        <h4 className="text-sm font-semibold text-ink">接下來抽到的機率</h4>
        <label className="flex items-center gap-1 text-xs text-ink-dim">
          再抽
          <input
            type="number"
            min={1}
            max={Math.max(1, remaining.mainSize)}
            value={draws}
            onChange={(e) => {
              const next = Number(e.target.value);
              if (!Number.isFinite(next)) return;
              setDraws(Math.max(1, Math.min(remaining.mainSize, Math.round(next))));
            }}
            className="w-12 rounded border border-line bg-surface px-1 py-0.5 text-xs text-ink focus:border-accent focus:outline-none"
            aria-label="再抽幾張"
          />
          張
        </label>
      </div>
      <p className="mb-2 text-[0.7rem] text-ink-faint">
        以牌堆剩下的 {remaining.mainSize} 張計算。只顯示機率最高的 12 種。
      </p>
      <ul className="space-y-0.5">
        {rows.map(({ card, qty, p }) => (
          <li key={card.id} className="flex items-center gap-2 text-xs">
            <span className="min-w-0 flex-1 truncate text-ink">{cardName(card, lang)}</span>
            <span className="shrink-0 text-ink-faint">牌堆 {qty}</span>
            <span className="w-14 shrink-0 text-right font-mono text-ink-dim">
              {formatPercent(p)}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
