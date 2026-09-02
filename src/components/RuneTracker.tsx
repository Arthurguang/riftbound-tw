'use client';

import { cardName } from '@/lib/cards';
import { DomainDot } from './CardBadges';
import { CardHover } from './CardHover';
import {
  activeRunesOnBase,
  dormantCount,
  setDormant,
  setInPile,
  type PlayerBoard,
} from '@/lib/board-state';
import { runesSummonedByTurn } from '@/lib/draw-model';
import type { ArtLang, TextLang } from '@/lib/i18n';
import type { Card, Domain } from '@/lib/types';

/**
 * 場上符文的獨立控制。
 *
 * 為什麼要獨立出來：符文是復盤時最關鍵的數字（決定你這回合付得起什麼），
 * 藏在通用的「加卡到盤面」流程裡太難找 —— 使用者實際反映找不到。
 *
 * 符文只會在基地（107.1.c「受玩家控制的常駐牌和符文位於該玩家的基地」），
 * 不會移到戰場上，所以這裡直接操作基地那一疊。
 */
export function RuneTracker({
  player,
  byId,
  lang,
  art,
  turn,
  onThePlay,
  onChange,
}: {
  player: PlayerBoard;
  byId: Map<string, Card>;
  lang: TextLang;
  art: ArtLang;
  turn: number;
  onThePlay: boolean;
  onChange: (next: PlayerBoard) => void;
}) {
  /** 這一方牌組裡有哪幾種符文。沒設定牌組時不顯示。 */
  const runeTypes = Object.keys(player.deck.runes)
    .map((id) => byId.get(id))
    .filter((c): c is Card => Boolean(c))
    .sort((a, b) => a.number - b.number);

  if (runeTypes.length === 0) return null;

  /** 場上總共幾張符文，以及其中活躍的有幾張。 */
  const onBase = runeTypes.reduce((sum, card) => sum + (player.base[card.id] ?? 0), 0);
  const active = activeRunesOnBase(player, byId);
  const expected = runesSummonedByTurn(turn, onThePlay);

  const setQty = (cardId: string, qty: number) => {
    onChange({ ...player, base: setInPile(player.base, cardId, qty) });
  };

  /** 一鍵補到照規則應該有的張數，依牌組比例平均分配。 */
  const fillToExpected = () => {
    let next = player.base;
    // 先把現有的符文清掉，再依牌組比例重新分配
    for (const card of runeTypes) next = setInPile(next, card.id, 0);

    const totalInDeck = runeTypes.reduce(
      (sum, card) => sum + (player.deck.runes[card.id] ?? 0),
      0,
    );
    if (totalInDeck === 0) return;

    let left = expected;
    for (const [i, card] of runeTypes.entries()) {
      const share =
        i === runeTypes.length - 1
          ? left
          : Math.min(
              left,
              Math.round((expected * (player.deck.runes[card.id] ?? 0)) / totalInDeck),
            );
      if (share > 0) next = setInPile(next, card.id, share);
      left -= share;
    }
    onChange({ ...player, base: next });
  };

  return (
    <section className="mb-3 rounded-lg border border-accent/30 bg-surface-1 p-2.5" data-runes>
      <div className="mb-2 flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <h4 className="text-sm font-semibold text-ink">場上符文</h4>
        <span className="text-sm text-accent-soft" data-testid="rune-total">
          {active}
        </span>
        <span className="text-xs text-ink-faint">
          活躍 / 場上 {onBase}
        </span>
        <span
          className="rounded bg-surface-2 px-1 font-mono text-[0.65rem] text-ink-faint"
          title="符文位於玩家的基地"
        >
          107.1.c
        </span>
        <button
          type="button"
          onClick={fillToExpected}
          className="ml-auto rounded border border-line px-2 py-0.5 text-[0.7rem] text-ink-dim hover:border-accent hover:text-accent-soft"
          title={`第 ${turn} 回合照規則應召出 ${expected} 張（315.3.b、485.7）`}
        >
          補到 {expected} 張
        </button>
      </div>

      <ul className="space-y-1">
        {runeTypes.map((card) => {
          const qty = player.base[card.id] ?? 0;
          const inDeck = player.deck.runes[card.id] ?? 0;
          const domain = card.domains.find((d) => d !== 'colorless') ?? card.domains[0];

          return (
            <li key={card.id} className="flex items-center gap-2">
              {domain && <DomainDot domain={domain as Domain} />}
              <span className="min-w-0 flex-1 text-xs text-ink">
                <CardHover card={card} lang={lang} art={art}>
                  {cardName(card, lang)}
                </CardHover>
              </span>
              <span className="shrink-0 text-[0.7rem] text-ink-faint">牌組 {inDeck}</span>

              {/* 休眠的符文不能消耗來產生法力（164.2.a、414.1） */}
              {qty > 0 && (
                <button
                  type="button"
                  aria-label={`切換 ${cardName(card, lang)} 的休眠張數`}
                  title="休眠代表耗盡了能量（414.1），不能消耗來產生法力"
                  onClick={() => {
                    const current = dormantCount(player, 'base', card.id);
                    onChange(setDormant(player, 'base', card.id, current >= qty ? 0 : current + 1));
                  }}
                  className={`shrink-0 rounded border px-1 text-[0.65rem] ${
                    dormantCount(player, 'base', card.id) > 0
                      ? 'border-amber-500/50 text-amber-300'
                      : 'border-emerald-500/40 text-emerald-300'
                  }`}
                >
                  {dormantCount(player, 'base', card.id) > 0
                    ? `休眠 ${dormantCount(player, 'base', card.id)}`
                    : '全活躍'}
                </button>
              )}

              <div className="flex shrink-0 items-center gap-0.5">
                <button
                  type="button"
                  aria-label={`減少場上的 ${cardName(card, lang)}`}
                  onClick={() => setQty(card.id, qty - 1)}
                  disabled={qty === 0}
                  className="h-6 w-6 rounded border border-line text-xs text-ink-dim disabled:opacity-30 hover:border-surface-3 hover:text-ink"
                >
                  −
                </button>
                <span className="w-6 text-center text-sm text-ink">{qty}</span>
                <button
                  type="button"
                  aria-label={`增加場上的 ${cardName(card, lang)}`}
                  onClick={() => setQty(card.id, qty + 1)}
                  className="h-6 w-6 rounded border border-line text-xs text-ink-dim hover:border-accent hover:text-accent-soft"
                >
                  +
                </button>
              </div>
            </li>
          );
        })}
      </ul>

      <p className="mt-1.5 text-[0.7rem] leading-relaxed text-ink-faint">
        第 {turn} 回合照規則應該召出過 <strong className="text-ink-dim">{expected}</strong> 張
        （315.3.b、485.7）。實際會更少 —— 回收符文取得符能後那張符文永久離場（164.2.b）。
        <br />
        只有<strong className="text-ink-dim">活躍</strong>的符文能消耗來產生法力（164.2.a）；
        休眠代表「耗盡了能量」（414.1），喚醒階段才會全部變回活躍（415.3.a）。
      </p>
    </section>
  );
}
