'use client';

import { useMemo, useState } from 'react';
import { cardName } from '@/lib/cards';
import { DeckImport } from './DeckImport';
import { RuneTracker } from './RuneTracker';
import { SideboardSwap } from './SideboardSwap';
import { ChampionZone } from './ChampionZone';
import {
  canPlayByTiming,
  foreignCards,
  hasDeck,
  remainingDeck,
  activeRunesOnBase,
  entersDormant,
  isInPlayZone,
  setDormant,
  setInPile,
  timingKeywords,
  turnStateId,
  TURN_STATE_INFO,
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
 * 「加到」可以直接選任何區域。
 *
 * 第一版刻意只讓人加到基地或手牌，再用搬移按鈕移到戰場 —— 使用者反映
 * 這樣復盤太慢。直接選目的地才對，少一步就是少一步。
 */
const ADD_TARGETS = ['hand', 'base', 'bf0', 'bf1', 'discard', 'exile'] as const;
const ADD_LABELS: Record<(typeof ADD_TARGETS)[number], string> = {
  hand: '手牌',
  base: '基地',
  bf0: '戰一',
  bf1: '戰二',
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
  phase,
  isTurnPlayer,
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
  /** 回合狀態（308、309），決定手牌哪幾張現在打得出來。 */
  phase: { duel: boolean; chain: boolean };
  /** 現在是不是這一方的回合（310.1.a）。 */
  isTurnPlayer: boolean;
  onChange: (next: PlayerBoard) => void;
}) {
  const [adding, setAdding] = useState<BoardZone>('hand');
  const [query, setQuery] = useState('');

  const remaining = useMemo(() => remainingDeck(player), [player]);
  const foreign = useMemo(() => foreignCards(player), [player]);
  /**
   * 只有**活躍**的符文算資源：消耗符文取得法力（164.2.a）要它是活躍的，
   * 休眠代表「耗盡了能量」（414.1）。
   */
  const runes = activeRunesOnBase(player, byId);

  /** 可以加進盤面的候選卡：以這副牌組為主，找不到時退回全部卡片。 */
  const candidates = useMemo(() => {
    const q = query.trim().toLowerCase();
    const pool = hasDeck(player)
      ? [
          ...Object.keys(player.deck.main),
          ...Object.keys(player.deck.runes),
          ...Object.keys(player.deck.battlefields),
          // 備牌不列入：對局中它不在場上（403.4、403.5）
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
    const card = byId.get(cardId);
    const next: PlayerBoard = {
      ...player,
      [zone]: setInPile(player[zone], cardId, (player[zone][cardId] ?? 0) + 1),
    };

    /*
     * 進場的預設狀態依卡種而定：
     *   143.4、359.2.c　單位以休眠狀態進場
     *   359.2.d　　　　 非單位裝備以活躍狀態進場
     *   430.2.a　　　　 符文預設以活躍狀態召出
     *
     * 這只是預設 —— [急速] 之類的效果會改變它（143.4.a），使用者可以自己切。
     */
    if (card && isInPlayZone(zone) && entersDormant(card)) {
      const already = next.dormant[zone][cardId] ?? 0;
      onChange(setDormant(next, zone, cardId, already + 1));
      return;
    }
    onChange(next);
  };

  const state = turnStateId(phase);

  /**
   * 手牌裡每一張的兩個獨立檢查：
   *   時機　目前的回合狀態允不允許打出（307–310）
   *   資源　基地上的符文夠不夠付（131.2、131.3、164.2）
   *
   * 分開顯示是刻意的 —— 「打不出來」有兩種完全不同的原因，
   * 混成一個燈號會讓人不知道該補資源還是該等時機。
   */
  const playable = useMemo(() => {
    return Object.entries(player.hand)
      .map(([id, qty]) => ({ card: byId.get(id), qty }))
      .filter((e): e is { card: Card; qty: number } => Boolean(e.card) && e.qty > 0)
      .map(({ card }) => {
        const needed = runesNeeded(card);
        const timing = timingKeywords(card);
        return {
          card,
          needed,
          timingOk: canPlayByTiming(card, state, isTurnPlayer),
          resourceOk: needed === null || needed <= runes,
          timing,
        };
      });
  }, [player.hand, byId, runes, state, isTurnPlayer]);

  return (
    <div
      className="min-w-0 rounded-lg border border-line p-3"
      data-edit-side={isOpponent ? 'opponent' : 'you'}
    >
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-base font-semibold text-ink">編輯：{title}</h3>
      </div>

      <DeckImport
        cards={cards}
        byId={byId}
        onImport={(deck) =>
          onChange({
            ...player,
            deck,
            /*
             * 匯入後直接把選定英雄放進英雄區域。
             * 103.2.a.1：遊戲開始時這張卡置於英雄區域 —— 它不在牌堆裡，
             * 不自動擺出來的話牌堆張數會多算一張。
             */
            champion: deck.championId ? setInPile({}, deck.championId, 1) : {},
          })
        }
      />

      {!hasDeck(player) ? (
        <p className="rounded-lg border border-dashed border-line px-3 py-4 text-center text-xs text-ink-faint">
          先匯入這一方的牌組，才能算出牌堆裡還剩什麼
        </p>
      ) : (
        <>
          <ChampionZone
            player={player}
            byId={byId}
            lang={lang}
            art={art}
            onChange={onChange}
          />

          <SideboardSwap
            deck={player.deck}
            byId={byId}
            lang={lang}
            onChange={(deck) => onChange({ ...player, deck })}
          />

          <RuneTracker
            player={player}
            byId={byId}
            lang={lang}
            art={art}
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

          {/* 手牌現在打不打得出來 */}
          {playable.length > 0 && (
            <section
              className="mt-3 rounded-lg border border-line bg-surface-1 p-2.5"
              data-testid="playable-hand"
            >
              <h4 className="mb-1 text-sm font-semibold text-ink">
                手牌現在打不打得出來
                <span className="ml-2 text-xs font-normal text-ink-faint">
                  {TURN_STATE_INFO[state].label}　基地上 {runes} 張符文
                </span>
              </h4>
              <p className="mb-2 text-[0.7rem] leading-relaxed text-ink-faint">
                分成兩個獨立的檢查：<strong className="text-ink-dim">時機</strong>
                （回合狀態允不允許，307–310）與<strong className="text-ink-dim">資源</strong>
                （符文夠不夠，131.2、131.3、164.2）。
                <strong className="text-ink-dim">不判斷目標或卡牌自身的其他限制</strong>
                —— 那需要規則引擎。
              </p>
              <ul className="space-y-1">
                {playable.map(({ card, needed, timingOk, resourceOk, timing }) => (
                  <li key={card.id} className="flex flex-wrap items-center gap-1.5 text-[0.7rem]">
                    <span
                      className={
                        timingOk && resourceOk ? 'text-emerald-300' : 'text-ink-faint'
                      }
                    >
                      {cardName(card, lang)}
                    </span>
                    {timing.reaction && (
                      <span className="rounded bg-sky-500/15 px-1 text-sky-300">反應</span>
                    )}
                    {timing.action && (
                      <span className="rounded bg-violet-500/15 px-1 text-violet-300">迅捷</span>
                    )}
                    <span
                      className={`rounded px-1 ${
                        timingOk ? 'bg-emerald-500/15 text-emerald-300' : 'bg-rose-500/15 text-rose-300'
                      }`}
                    >
                      時機{timingOk ? '可' : '不可'}
                    </span>
                    <span
                      className={`rounded px-1 ${
                        resourceOk
                          ? 'bg-emerald-500/15 text-emerald-300'
                          : 'bg-amber-500/15 text-amber-300'
                      }`}
                      title={needed === null ? '這張卡沒有費用' : `需要 ${needed} 張符文`}
                    >
                      資源{resourceOk ? '夠' : `差 ${(needed ?? 0) - runes}`}
                    </span>
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
