'use client';

import { useEffect, useRef, useState } from 'react';
import { cardImageUrl, cardName } from '@/lib/cards';
import {
  moveFromPile,
  orderedPile,
  ZONE_LABELS,
  ZONE_RULES,
  type BoardZone,
  type PlayerBoard,
  type StackZone,
} from '@/lib/board-state';
import type { ArtLang, TextLang } from '@/lib/i18n';
import type { Card } from '@/lib/types';

/**
 * 廢牌堆與放逐區 —— 桌上只放**一疊**，點開才看內容。
 *
 * ── 為什麼收成一疊 ──────────────────────────────────────────────
 * 原本這兩區跟手牌一樣把每張卡攤開。對局打到後段常有十幾張，
 * 攤開會把整條桌面撐長 —— 使用者的原話是「會拉長整個復盤的牌面」。
 * 實體對局的廢牌堆、放逐區也是一疊，要查才翻開。
 *
 * ── 順序 ────────────────────────────────────────────────────────
 * 視窗裡照**進入順序**排：最上面（最後進去）的排第一個。
 * 官方規則 108.2、108.6 都說這兩區沒有順序 —— 記順序純粹是為了復盤回顧，
 * 視窗裡有寫明，避免被誤會成規則。
 */

/**
 * 從這一疊可以搬去哪裡。比 MOVE_TARGETS 多了戰場：有些效果會從廢牌堆直接打出單位。
 * 另一個疊（廢牌堆 ⇄ 放逐區）也在裡面 —— 「把廢牌堆的卡放逐」是常見效果。
 */
const TARGETS: Record<StackZone, BoardZone[]> = {
  discard: ['hand', 'base', 'bf0', 'bf1', 'exile'],
  exile: ['hand', 'base', 'bf0', 'bf1', 'discard'],
};

export function StackedPile({
  zone,
  player,
  side,
  byId,
  lang,
  art,
  onChange,
  onInspect,
  selected,
}: {
  zone: StackZone;
  player: PlayerBoard;
  side: 'you' | 'opponent';
  byId: Map<string, Card>;
  lang: TextLang;
  art: ArtLang;
  onChange: (next: PlayerBoard) => void;
  /** 在右側欄檢視某張卡的大圖與能力文字。 */
  onInspect: (cardId: string) => void;
  /** 右側欄目前選中的是這一疊裡的卡。 */
  selected: boolean;
}) {
  const [open, setOpen] = useState(false);
  /** 視窗裡點選的是第幾張（進入順序的索引）。 */
  const [picked, setPicked] = useState<number | null>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);

  const label = ZONE_LABELS[zone];
  // 最早進入的在前；畫面上要最上面的在前，所以反過來
  const order = orderedPile(player, zone);
  const stack = order
    .map((cardId, index) => ({ card: byId.get(cardId), index }))
    .filter((e): e is { card: Card; index: number } => Boolean(e.card))
    .reverse();
  const top = stack[0]?.card;
  const owner = side === 'you' ? '你' : '對手';
  const pickedCard = picked === null ? undefined : byId.get(order[picked] ?? '');
  const titleId = `pile-title-${zone}-${side}`;

  // 瀏覽器內建的 <dialog> 會處理焦點鎖定與 Esc 關閉（同首頁的傳奇說明視窗）
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  const close = () => {
    setOpen(false);
    setPicked(null);
  };

  const move = (to: BoardZone | 'deck') => {
    if (picked === null) return;
    onChange(moveFromPile(player, zone, picked, to));
    setPicked(null);
  };

  return (
    <section
      className="flex w-[84px] shrink-0 flex-col rounded-lg border border-line bg-surface-1 p-1.5"
      data-zone={zone}
      data-owner={side}
    >
      <h4 className="mb-1 flex shrink-0 items-baseline gap-1 whitespace-nowrap text-xs font-semibold text-ink">
        {label}
        <span className="font-normal text-ink-dim" data-testid="pile-count">
          {order.length}
        </span>
      </h4>

      {top ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label={`${owner}的${label}（${order.length} 張）：點開依進入順序檢視`}
          title={`最上面：${cardName(top, lang)}　點開看全部 ${order.length} 張`}
          data-testid="pile-stack"
          className={`relative mt-1 self-start rounded transition-transform hover:scale-105 focus-visible:scale-105 focus-visible:outline-none ${
            selected ? 'ring-2 ring-accent' : ''
          }`}
        >
          {/* 後面兩層是「一疊」的厚度 */}
          {order.length > 2 && (
            <span className="absolute left-1.5 top-[-6px] h-[68px] w-[48px] rounded border border-line bg-surface-3" />
          )}
          {order.length > 1 && (
            <span className="absolute left-[3px] top-[-3px] h-[68px] w-[48px] rounded border border-line bg-surface-2" />
          )}
          <img
            src={cardImageUrl(top, 160, art)}
            alt={cardName(top, lang)}
            loading="lazy"
            referrerPolicy="no-referrer"
            className="relative h-[68px] w-[48px] rounded object-cover"
          />
          <span className="absolute -right-1 -top-1 rounded bg-surface-2 px-1 text-[0.6rem] font-semibold text-ink shadow">
            {order.length}
          </span>
        </button>
      ) : (
        <p className="rounded border border-dashed border-line px-1 py-3 text-center text-[0.65rem] text-ink-faint">
          空
        </p>
      )}

      <dialog
        ref={dialogRef}
        aria-labelledby={titleId}
        data-testid="pile-dialog"
        onClose={close}
        onClick={(event) => {
          // 點到視窗外面的遮罩也關閉
          if (event.target === event.currentTarget) close();
        }}
        className="legend-dialog"
      >
        <div className="relative p-5">
          <h2 id={titleId} className="pr-10 text-lg font-bold text-ink">
            {owner}的{label}（{order.length} 張）
          </h2>
          <p className="mt-1 text-xs leading-relaxed text-ink-faint">
            照進入順序排列：<strong className="text-ink-dim">左上是最上面（最後進去的）</strong>
            ，編號是第幾張進入。
            官方規則 {ZONE_RULES[zone].rule} 說{label}的卡牌「無排序，可以重新整理」——
            這裡記下順序只是方便復盤回顧，不是規則要求。
          </p>

          {stack.length === 0 ? (
            <p className="mt-4 text-sm text-ink-dim">{label}是空的。</p>
          ) : (
            <ol className="mt-4 flex flex-wrap gap-2" data-testid="pile-list">
              {stack.map(({ card, index }, position) => (
                <li key={`${index}-${card.id}`}>
                  <button
                    type="button"
                    onClick={() => setPicked(index)}
                    aria-pressed={picked === index}
                    aria-label={`${label}的 ${cardName(card, lang)}　第 ${index + 1} 張進入${
                      position === 0 ? '（最上面）' : ''
                    }`}
                    data-card={card.id}
                    data-order={index + 1}
                    className={`relative block rounded transition-transform hover:scale-105 focus-visible:scale-105 focus-visible:outline-none ${
                      picked === index ? 'ring-2 ring-accent' : ''
                    }`}
                  >
                    <img
                      src={cardImageUrl(card, 160, art)}
                      alt={cardName(card, lang)}
                      loading="lazy"
                      referrerPolicy="no-referrer"
                      className={`rounded object-cover ${
                        card.orientation === 'landscape' ? 'h-[64px] w-[90px]' : 'h-[90px] w-[64px]'
                      }`}
                    />
                    <span className="absolute -left-1 -top-1 rounded bg-surface-2 px-1 font-mono text-[0.6rem] text-ink shadow">
                      {index + 1}
                    </span>
                    {position === 0 && (
                      <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 whitespace-nowrap rounded bg-accent px-1 text-[0.55rem] font-semibold text-surface">
                        最上面
                      </span>
                    )}
                  </button>
                </li>
              ))}
            </ol>
          )}

          {pickedCard && picked !== null && (
            <div
              className="mt-4 flex flex-wrap items-center gap-1.5 rounded border border-accent/40 bg-surface-2/60 p-2"
              data-testid="pile-actions"
            >
              <span className="text-xs text-ink-dim">
                第 {picked + 1} 張「{cardName(pickedCard, lang)}」搬到
              </span>
              {TARGETS[zone].map((target) => (
                <button
                  key={target}
                  type="button"
                  onClick={() => move(target)}
                  className="rounded border border-line px-2 py-1 text-xs text-ink-dim hover:border-accent hover:text-accent-soft"
                >
                  {ZONE_LABELS[target]}
                </button>
              ))}
              <button
                type="button"
                onClick={() => move('deck')}
                className="rounded border border-line px-2 py-1 text-xs text-ink-dim hover:border-rose-500/60 hover:text-rose-300"
              >
                放回牌堆
              </button>
              <button
                type="button"
                onClick={() => {
                  onInspect(pickedCard.id);
                  close();
                }}
                className="ml-auto rounded border border-line px-2 py-1 text-xs text-ink-dim hover:border-accent hover:text-accent-soft"
              >
                查看能力文字
              </button>
            </div>
          )}

          <button
            type="button"
            aria-label={`關閉${label}`}
            onClick={close}
            className="absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-full bg-surface-2 text-ink-dim transition-colors hover:text-ink"
          >
            ✕
          </button>
        </div>
      </dialog>
    </section>
  );
}
