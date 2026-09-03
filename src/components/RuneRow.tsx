'use client';

import { useEffect, useRef } from 'react';
import { cardImageUrl, cardName } from '@/lib/cards';
import { pileSize, type Pile } from '@/lib/board-state';
import type { ArtLang, TextLang } from '@/lib/i18n';
import type { Card } from '@/lib/types';

/**
 * 場上的符文 —— 一張一張攤開。
 *
 * ── 為什麼要跟基地分開、而且不能疊 ──────────────────────────────
 * 符文放在基地（107.1.c），資料上跟其他常駐物同一疊。但操作上完全不同：
 * 它是**資源**，每一張各自有活躍／休眠（414、415），使用者要能指定
 * 「這三張橫著、那兩張直著」。
 *
 * 疊成一張加數量角標就做不到這件事 —— 只能整批切換。
 * 所以這裡把 N 張攤成 N 個格子，每一格是獨立的一張。
 *
 * ── 一張一張怎麼對應到資料 ──────────────────────────────────────
 * 盤面模型裡休眠是「這個卡號有幾張休眠」的計數，不是每張各自的旗標。
 * 攤開時就約定：**前 dormant 張畫成休眠**。點第 i 張時看它現在是哪種，
 * 是休眠就把計數減一、是活躍就加一 —— 使用者看到的效果就是「點哪張換哪張」。
 *
 * ── 點一下切換、點兩下放回牌堆 ──────────────────────────────────
 * 這兩個是同一顆按鈕上的兩種操作，所以單擊要等一小段時間確認不是雙擊。
 * 延遲只在符文上有，其他地方的點擊仍然是立即的。
 */
const DOUBLE_CLICK_MS = 220;

export function RuneRow({
  runes,
  dormant,
  byId,
  lang,
  art,
  onDormantChange,
  onRemove,
}: {
  /** 基地上屬於符文的那些卡。 */
  runes: Pile;
  dormant: Pile;
  byId: Map<string, Card>;
  lang: TextLang;
  art: ArtLang;
  onDormantChange: (cardId: string, count: number) => void;
  onRemove: (cardId: string) => void;
}) {
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  // 元件收起或卸載時要把還沒觸發的單擊清掉，否則會對著已消失的盤面動作
  useEffect(() => {
    const pending = timers.current;
    return () => {
      for (const id of pending.values()) clearTimeout(id);
      pending.clear();
    };
  }, []);

  const entries = Object.entries(runes)
    .map(([id, qty]) => ({ card: byId.get(id), qty }))
    .filter((e): e is { card: Card; qty: number } => Boolean(e.card) && e.qty > 0)
    .sort((a, b) => a.card.number - b.card.number);

  const total = pileSize(runes);
  const active = entries.reduce((sum, e) => sum + e.qty - (dormant[e.card.id] ?? 0), 0);

  return (
    <section
      className="rounded-lg border border-accent/30 bg-surface-1 p-2"
      data-zone="runes"
      data-testid="rune-row"
    >
      <div className="mb-1.5 flex shrink-0 flex-wrap items-baseline gap-x-1.5">
        <h4 className="text-xs font-semibold text-ink">符文</h4>
        <span className="text-xs text-accent-soft" data-testid="rune-active">
          {active}
        </span>
        <span className="text-[0.65rem] text-ink-faint">活躍 / 場上 {total}</span>
        <span
          className="rounded bg-surface-2 px-1 font-mono text-[0.6rem] text-ink-faint"
          title="符文位於玩家的基地"
        >
          107.1.c
        </span>
        <span className="text-[0.6rem] text-ink-faint">點一下換活躍／休眠，點兩下放回牌堆</span>
      </div>

      {entries.length === 0 ? (
        <p className="rounded border border-dashed border-line px-2 py-3 text-center text-[0.7rem] text-ink-faint">
          場上還沒有符文
        </p>
      ) : (
        <div className="flex flex-wrap content-start gap-1">
          {entries.flatMap(({ card, qty }) => {
            const sleeping = dormant[card.id] ?? 0;
            const name = cardName(card, lang);

            return Array.from({ length: qty }, (_, index) => {
              const isDormant = index < sleeping;

              const toggle = () => onDormantChange(card.id, isDormant ? sleeping - 1 : sleeping + 1);

              return (
                <button
                  key={`${card.id}-${index}`}
                  type="button"
                  data-rune={card.id}
                  data-dormant={isDormant ? 'true' : undefined}
                  aria-label={`${name}（第 ${index + 1} 張，${isDormant ? '休眠' : '活躍'}）`}
                  title={`${name}　${isDormant ? '休眠（414.1）' : '活躍（415.1）'}\n點一下切換，點兩下放回牌堆`}
                  onClick={() => {
                    // 等一下下，確認不是雙擊
                    const key = `${card.id}-${index}`;
                    const existing = timers.current.get(key);
                    if (existing) clearTimeout(existing);
                    timers.current.set(
                      key,
                      setTimeout(() => {
                        timers.current.delete(key);
                        toggle();
                      }, DOUBLE_CLICK_MS),
                    );
                  }}
                  onDoubleClick={() => {
                    const key = `${card.id}-${index}`;
                    const existing = timers.current.get(key);
                    if (existing) {
                      clearTimeout(existing);
                      timers.current.delete(key);
                    }
                    // 放回牌堆的同時，休眠計數不能超過剩下的張數
                    if (isDormant) onDormantChange(card.id, Math.max(0, sleeping - 1));
                    onRemove(card.id);
                  }}
                  className={`shrink-0 rounded transition-transform hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
                    isDormant ? 'opacity-80 ring-1 ring-amber-500/60' : ''
                  }`}
                >
                  <img
                    src={cardImageUrl(card, 120, art)}
                    alt={name}
                    loading="lazy"
                    referrerPolicy="no-referrer"
                    /* 休眠在實體對局就是把卡打橫（414.1），所以直接轉 90 度 */
                    className={`rounded object-cover ${
                      isDormant ? 'h-[34px] w-[48px] rotate-90' : 'h-[48px] w-[34px]'
                    }`}
                  />
                </button>
              );
            });
          })}
        </div>
      )}
    </section>
  );
}
