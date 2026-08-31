'use client';

import { useState } from 'react';
import { cardName } from '@/lib/cards';
import { swapWithSideboard } from '@/lib/board-state';
import { TOURNAMENT_REQUIREMENTS, totalCards, type Deck } from '@/lib/deck-rules';
import type { TextLang } from '@/lib/i18n';
import type { Card } from '@/lib/types';

/**
 * 局間換牌（賽事規則 403.4）。
 *
 * 為什麼復盤板需要這個：備牌在對局進行中**不在場上**，它只在局間
 * 1 換 1 地換進主牌組（403.4、403.5「第一局不能用備牌」）。
 * 所以要復盤第二、三局，得先把換牌結果反映出來，牌堆的計算才正確。
 *
 * 這裡只做搬移，不強制 1 換 1 —— 換到一半的中間狀態本來就會不平衡。
 * 前後張數直接顯示出來，讓使用者自己確認符不符合 403.4.c。
 */
export function SideboardSwap({
  deck,
  byId,
  lang,
  onChange,
}: {
  deck: Deck;
  byId: Map<string, Card>;
  lang: TextLang;
  onChange: (next: Deck) => void;
}) {
  const [open, setOpen] = useState(false);

  const sideboardSize = totalCards(deck.sideboard);
  const mainSize = totalCards(deck.main);

  // 沒有備牌就不用顯示這個功能
  if (sideboardSize === 0 && !open) return null;

  const rows = (pile: Record<string, number>) =>
    Object.entries(pile)
      .map(([id, qty]) => ({ card: byId.get(id), qty }))
      .filter((e): e is { card: Card; qty: number } => Boolean(e.card) && e.qty > 0)
      .sort((a, b) => a.card.number - b.card.number);

  const exact = TOURNAMENT_REQUIREMENTS.mainDeckExact;

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mb-3 w-full rounded-lg border border-dashed border-line px-3 py-1.5 text-xs text-ink-dim transition-colors hover:border-accent hover:text-accent-soft"
      >
        調整主牌組與備牌（備牌 {sideboardSize} 張）
      </button>
    );
  }

  return (
    <section className="mb-3 rounded-lg border border-accent/30 bg-surface-1 p-2.5" data-sideboard-swap>
      <div className="mb-2 flex flex-wrap items-baseline gap-x-2">
        <h4 className="text-sm font-semibold text-ink">局間換牌</h4>
        <span
          className="rounded bg-surface-2 px-1 font-mono text-[0.65rem] text-ink-faint"
          title="賽事規則條號"
        >
          403.4
        </span>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="ml-auto text-xs text-ink-dim hover:text-ink"
        >
          收合
        </button>
      </div>

      <p className="mb-2 text-[0.7rem] leading-relaxed text-ink-faint">
        備牌在對局中不在場上，只在局間 1 換 1 換進主牌組（403.4）；
        第一局不能用備牌（403.5）。換完後主牌組仍要符合張數要求（403.4.c）。
      </p>

      <div className="grid gap-2 sm:grid-cols-2">
        <div>
          <p className="mb-1 text-xs text-ink-dim">
            主牌組{' '}
            <strong className={mainSize === exact ? 'text-emerald-300' : 'text-amber-300'}>
              {mainSize}
            </strong>
            <span className="text-ink-faint"> / 賽事要求 {exact}</span>
          </p>
          <ul className="max-h-48 space-y-0.5 overflow-y-auto">
            {rows(deck.main).map(({ card, qty }) => (
              <li key={card.id} className="flex items-center gap-1 text-xs">
                <span className="min-w-0 flex-1 truncate text-ink">{cardName(card, lang)}</span>
                <span className="shrink-0 text-ink-faint">×{qty}</span>
                <button
                  type="button"
                  aria-label={`把 ${cardName(card, lang)} 換到備牌`}
                  onClick={() => onChange(swapWithSideboard(deck, card.id, 'toSideboard'))}
                  className="h-5 w-5 shrink-0 rounded border border-line text-[0.65rem] text-ink-dim hover:border-accent hover:text-accent-soft"
                  title="換到備牌"
                >
                  →
                </button>
              </li>
            ))}
          </ul>
        </div>

        <div>
          <p className="mb-1 text-xs text-ink-dim">
            備牌{' '}
            <strong
              className={
                sideboardSize <= TOURNAMENT_REQUIREMENTS.sideboardMax
                  ? 'text-ink'
                  : 'text-amber-300'
              }
            >
              {sideboardSize}
            </strong>
            <span className="text-ink-faint"> / 上限 {TOURNAMENT_REQUIREMENTS.sideboardMax}</span>
          </p>
          {rows(deck.sideboard).length === 0 ? (
            <p className="text-[0.7rem] text-ink-faint">備牌是空的</p>
          ) : (
            <ul className="max-h-48 space-y-0.5 overflow-y-auto">
              {rows(deck.sideboard).map(({ card, qty }) => (
                <li key={card.id} className="flex items-center gap-1 text-xs">
                  <button
                    type="button"
                    aria-label={`把 ${cardName(card, lang)} 換進主牌組`}
                    onClick={() => onChange(swapWithSideboard(deck, card.id, 'toMain'))}
                    className="h-5 w-5 shrink-0 rounded border border-line text-[0.65rem] text-ink-dim hover:border-accent hover:text-accent-soft"
                    title="換進主牌組"
                  >
                    ←
                  </button>
                  <span className="min-w-0 flex-1 truncate text-ink">{cardName(card, lang)}</span>
                  <span className="shrink-0 text-ink-faint">×{qty}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}
