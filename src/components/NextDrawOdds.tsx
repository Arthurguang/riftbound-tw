'use client';

import { useMemo, useState } from 'react';
import { cardName } from '@/lib/cards';
import { type remainingDeck } from '@/lib/board-state';
import { formatPercent } from '@/lib/draw-model';
import { atLeast } from '@/lib/probability';
import type { TextLang } from '@/lib/i18n';
import type { Card } from '@/lib/types';

/**
 * 從**當下的牌堆**算下一張抽到什麼的機率。
 *
 * 這是復盤最實用的數字：牌堆已經被手牌、廢牌堆、放逐消耗過，
 * 剩下的組成跟開局完全不同。
 */
export function NextDrawOdds({
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
