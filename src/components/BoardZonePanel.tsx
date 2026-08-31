'use client';

import { cardImageUrl, cardName } from '@/lib/cards';
import { pileSize, ZONE_RULES, type BoardZone, type Pile } from '@/lib/board-state';
import type { ArtLang, TextLang } from '@/lib/i18n';
import type { Card } from '@/lib/types';

const ZONE_LABELS: Record<BoardZone, string> = {
  hand: '手牌',
  base: '基地（場上）',
  discard: '廢牌堆',
  exile: '放逐區',
};

/** 可以搬去哪些區域。順序照實際使用頻率排。 */
const MOVE_TARGETS: Record<BoardZone, BoardZone[]> = {
  hand: ['base', 'discard', 'exile'],
  base: ['discard', 'hand', 'exile'],
  discard: ['hand', 'base', 'exile'],
  exile: ['hand', 'base', 'discard'],
};

const SHORT: Record<BoardZone, string> = {
  hand: '手',
  base: '場',
  discard: '廢',
  exile: '逐',
};

/**
 * 盤面上的一個區域。
 *
 * 每個區域標明官方條號，理由跟牌組合法性檢查一樣：
 * 使用者要能自己去規則書查證我們沒有亂編。
 */
export function BoardZonePanel({
  zone,
  pile,
  byId,
  lang,
  art,
  onMove,
  onRemove,
  extra,
}: {
  zone: BoardZone;
  pile: Pile;
  byId: Map<string, Card>;
  lang: TextLang;
  art: ArtLang;
  onMove: (cardId: string, to: BoardZone) => void;
  onRemove: (cardId: string) => void;
  /** 額外的控制項，例如手牌的「未知張數」。 */
  extra?: React.ReactNode;
}) {
  const entries = Object.entries(pile)
    .map(([id, qty]) => ({ card: byId.get(id), qty }))
    .filter((e): e is { card: Card; qty: number } => Boolean(e.card) && e.qty > 0)
    .sort((a, b) => a.card.number - b.card.number);

  const total = pileSize(pile);
  const { rule, hidden } = ZONE_RULES[zone];

  return (
    <section className="rounded-lg border border-line bg-surface-1 p-2.5" data-zone={zone}>
      <div className="mb-2 flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <h4 className="text-sm font-semibold text-ink">{ZONE_LABELS[zone]}</h4>
        <span className="text-sm text-ink-dim">{total}</span>
        <span
          className="rounded bg-surface-2 px-1 font-mono text-[0.65rem] text-ink-faint"
          title="官方規則條號"
        >
          {rule}
        </span>
        {hidden && (
          <span className="text-[0.65rem] text-ink-faint" title="核心規則 108.7.c">
            私密資訊
          </span>
        )}
        {extra}
      </div>

      {entries.length === 0 ? (
        <p className="rounded border border-dashed border-line px-2 py-1.5 text-xs text-ink-faint">
          空
        </p>
      ) : (
        <ul className="space-y-1">
          {entries.map(({ card, qty }) => (
            <li
              key={card.id}
              className="flex items-center gap-1.5 rounded border border-line px-1.5 py-1"
            >
              <img
                src={cardImageUrl(card, 60, art)}
                alt=""
                loading="lazy"
                referrerPolicy="no-referrer"
                className="h-7 w-5 shrink-0 rounded-sm object-cover"
              />
              <span className="min-w-0 flex-1 truncate text-xs text-ink" title={cardName(card, lang)}>
                {cardName(card, lang)}
              </span>
              {qty > 1 && <span className="shrink-0 text-xs text-ink-dim">×{qty}</span>}

              <div className="flex shrink-0 gap-0.5">
                {MOVE_TARGETS[zone].map((target) => (
                  <button
                    key={target}
                    type="button"
                    title={`搬到${ZONE_LABELS[target]}`}
                    aria-label={`把 ${cardName(card, lang)} 從${ZONE_LABELS[zone]}搬到${ZONE_LABELS[target]}`}
                    onClick={() => onMove(card.id, target)}
                    className="h-5 w-5 rounded border border-line text-[0.65rem] text-ink-dim hover:border-accent hover:text-accent-soft"
                  >
                    {SHORT[target]}
                  </button>
                ))}
                <button
                  type="button"
                  title="放回牌堆"
                  aria-label={`把 ${cardName(card, lang)} 放回牌堆`}
                  onClick={() => onRemove(card.id)}
                  className="h-5 w-5 rounded border border-line text-[0.65rem] text-ink-dim hover:border-rose-500/60 hover:text-rose-300"
                >
                  ↺
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
