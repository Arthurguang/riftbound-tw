'use client';
import { HelpTip } from './HelpTip';

import { useMemo, useState } from 'react';
import { cardName } from '@/lib/cards';
import { NextDrawOdds } from './NextDrawOdds';
import {
  activeRunesOnBase,
  canPlayByTiming,
  remainingDeck,
  timingKeywords,
  turnStateId,
  TURN_STATE_INFO,
  type BoardState,
} from '@/lib/board-state';
import { runesNeeded } from '@/lib/draw-model';
import type { TextLang } from '@/lib/i18n';
import type { Card } from '@/lib/types';

/**
 * 分析區 —— 手牌打不打得出來，以及下一張抽到什麼的機率。
 *
 * ── 為什麼獨立出來、而且永遠在 ──────────────────────────────────
 * 這兩個數字是**復盤的目的本身**：擺盤面是手段，看數字才是目的。
 * 先前它們藏在某一方的第四個子分頁裡，要看一眼得先選對邊、再切對分頁 ——
 * 使用者反映想「隨時都可以檢視」。
 *
 * 所以搬出來固定放在側欄分頁列的下方，不管上面切到哪一塊都看得到。
 * 裡面自帶一個你／對手的切換，因為兩邊的數字都有人要看。
 *
 * ── 這裡只算，不建議 ────────────────────────────────────────────
 * 時機與資源分成**兩個獨立的檢查**，因為「打不出來」有兩種完全不同的
 * 原因，混成一個燈號會讓人不知道該補資源還是該等時機。
 * 也**不判斷目標或卡牌自身的其他限制** —— 那需要規則引擎，本站不做。
 */
export function BoardAnalysis({
  board,
  byId,
  lang,
}: {
  board: BoardState;
  byId: Map<string, Card>;
  lang: TextLang;
}) {
  const [side, setSide] = useState<'you' | 'opponent'>('you');
  const player = board[side];

  const remaining = useMemo(() => remainingDeck(player), [player]);

  /** 只有**活躍**的符文算資源（164.2.a）；休眠代表耗盡了能量（414.1）。 */
  const runes = activeRunesOnBase(player, byId);
  const state = turnStateId(board.phase);
  const isTurnPlayer = board.activePlayer === side;

  const playable = useMemo(
    () =>
      Object.entries(player.hand)
        .map(([id, qty]) => ({ card: byId.get(id), qty }))
        .filter((e): e is { card: Card; qty: number } => Boolean(e.card) && e.qty > 0)
        .map(({ card }) => {
          const needed = runesNeeded(card);
          return {
            card,
            needed,
            timingOk: canPlayByTiming(card, state, isTurnPlayer),
            resourceOk: needed === null || needed <= runes,
            timing: timingKeywords(card),
          };
        }),
    [player.hand, byId, runes, state, isTurnPlayer],
  );

  return (
    <section
      className="rounded-lg border border-accent/30 bg-surface-1 p-2"
      data-testid="board-analysis"
      data-analysis-side={side}
    >
      <div className="mb-2 flex flex-wrap items-center gap-x-2 gap-y-1">
        <h3 className="text-xs font-semibold text-ink">分析</h3>
        <div className="flex rounded border border-line p-0.5">
          {(
            [
              { id: 'you', text: '你' },
              { id: 'opponent', text: '對手' },
            ] as const
          ).map((option) => (
            <button
              key={option.id}
              type="button"
              aria-pressed={side === option.id}
              onClick={() => setSide(option.id)}
              data-analysis-tab={option.id}
              className={`rounded px-2 py-0.5 text-[0.7rem] transition-colors ${
                side === option.id
                  ? 'bg-accent/15 text-accent-soft'
                  : 'text-ink-dim hover:text-ink'
              }`}
            >
              {option.text}
            </button>
          ))}
        </div>
        <span className="text-[0.65rem] text-ink-faint">
          {TURN_STATE_INFO[state].label}　基地上 {runes} 張活躍符文
        </span>
      </div>

      {playable.length === 0 ? (
        <p className="rounded border border-dashed border-line px-2 py-2 text-center text-[0.7rem] text-ink-faint">
          這一方手上還沒有牌
        </p>
      ) : (
        <section data-testid="playable-hand">
          <h4 className="mb-1 flex items-center gap-1.5 text-[0.7rem] font-semibold text-ink">
            手牌現在打不打得出來
            <HelpTip label="可打性判斷的說明">
              兩個獨立的檢查：<strong className="text-ink">時機</strong>
              （回合狀態允不允許，307–310）與<strong className="text-ink">資源</strong>
              （符文夠不夠，131.2、131.3、164.2）。
              <br />
              <br />
              <strong className="text-ink">不判斷目標或卡牌自身的其他限制</strong>
              —— 那需要規則引擎。
            </HelpTip>
          </h4>
          <ul className="space-y-1">
            {playable.map(({ card, needed, timingOk, resourceOk, timing }) => (
              <li key={card.id} className="flex flex-wrap items-center gap-1.5 text-[0.7rem]">
                <span className={timingOk && resourceOk ? 'text-emerald-300' : 'text-ink-faint'}>
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
                    timingOk
                      ? 'bg-emerald-500/15 text-emerald-300'
                      : 'bg-rose-500/15 text-rose-300'
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

      <NextDrawOdds remaining={remaining} byId={byId} lang={lang} />
    </section>
  );
}
