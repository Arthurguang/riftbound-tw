'use client';

import { cardImageUrl, cardName, cardText, cardTextToPlain } from '@/lib/cards';
import { ZONE_RULES, type BoardZone } from '@/lib/board-state';
import type { ArtLang, TextLang } from '@/lib/i18n';
import type { Card } from '@/lib/types';

/** 這個區域的卡可以搬去哪裡。與 BoardZonePanel 的定義一致。 */
const MOVE_TARGETS: Record<BoardZone, BoardZone[]> = {
  champion: ['base', 'bf0', 'bf1', 'discard'],
  hand: ['base', 'bf0', 'bf1', 'discard'],
  base: ['bf0', 'bf1', 'discard', 'hand'],
  bf0: ['base', 'bf1', 'discard'],
  bf1: ['base', 'bf0', 'discard'],
  discard: ['hand', 'base', 'exile'],
  exile: ['hand', 'base', 'discard'],
};

const ZONE_LABELS: Record<BoardZone | FixedZone, string> = {
  legend: '傳奇區域',
  battlefield: '戰場',
  champion: '英雄區域',
  hand: '手牌',
  base: '基地',
  bf0: '戰場一',
  bf1: '戰場二',
  discard: '廢牌堆',
  exile: '放逐區',
};

/**
 * 有些卡在盤面上是**固定的**，不會在區域之間移動：
 *   · 傳奇整場都在傳奇區域（103.2.a）
 *   · 戰場在遊戲開始就擺定（485.4.a、485.5）
 *
 * 它們仍然要看得到大圖與能力文字，所以也能被選取 ——
 * 只是檢視面板不會給搬移按鈕。
 */
export type FixedZone = 'legend' | 'battlefield';

export type Selection = {
  side: 'you' | 'opponent';
  zone: BoardZone | FixedZone;
  cardId: string;
};

const isFixed = (zone: BoardZone | FixedZone): zone is FixedZone =>
  zone === 'legend' || zone === 'battlefield';

/**
 * 選中卡片的檢視與操作面板。
 *
 * ── 為什麼是固定面板，不是浮動提示 ──────────────────────────────
 * 原本用滑鼠 hover 跳出浮層。使用者反映「有時會跳有時不會」——
 * 兩個原因都是浮層的先天問題：
 *
 *   1. 浮層固定畫在卡名下方，卡片靠近視窗底部時就跑到畫面外
 *   2. 浮層要贏過後面的兄弟元素才看得到，堆疊順序很脆弱
 *
 * 固定面板兩個問題都不存在：位置永遠一樣，永遠在最上層。
 * 這也是參考網站的做法 —— 檢視中的卡顯示在右側固定欄。
 *
 * 卡片上的 hover 放大仍然保留，那只是「這張是哪張」的快速提示。
 */
export function CardInspector({
  selection,
  card,
  qty,
  dormant,
  lang,
  art,
  onMove,
  onRemove,
  onDormant,
  onClose,
}: {
  selection: Selection | null;
  card: Card | undefined;
  qty: number;
  dormant: number;
  lang: TextLang;
  art: ArtLang;
  onMove: (to: BoardZone) => void;
  onRemove: () => void;
  onDormant: (count: number) => void;
  onClose: () => void;
}) {
  if (!selection || !card) {
    return (
      <aside
        className="rounded-lg border border-dashed border-line p-4 text-center text-xs text-ink-faint"
        data-testid="card-inspector"
      >
        點盤面上任何一張卡，這裡會顯示大圖與可以做的事
      </aside>
    );
  }

  const { zone, side } = selection;
  const fixed = isFixed(zone);
  const inPlay = zone === 'base' || zone === 'bf0' || zone === 'bf1';
  const btn =
    'rounded border border-line px-2 py-1 text-[0.7rem] text-ink-dim transition-colors hover:border-accent hover:text-accent-soft';

  return (
    <aside
      className="rounded-lg border border-accent/40 bg-surface-1 p-3"
      data-testid="card-inspector"
      data-inspecting={card.id}
    >
      <div className="mb-2 flex flex-wrap items-baseline gap-x-2">
        <h3 className="text-sm font-semibold text-ink">{cardName(card, lang)}</h3>
        <span className="text-[0.7rem] text-ink-faint">
          {side === 'you' ? '你' : '對手'}的{ZONE_LABELS[zone]}
          {qty > 1 && ` ×${qty}`}
        </span>
        <span
          className="rounded bg-surface-2 px-1 font-mono text-[0.65rem] text-ink-faint"
          title="官方規則條號"
        >
          {fixed ? (zone === 'legend' ? '103.2.a' : '107.2') : ZONE_RULES[zone].rule}
        </span>
        <button type="button" onClick={onClose} className={`ml-auto ${btn}`}>
          關閉
        </button>
      </div>

      <div className="flex gap-3">
        <img
          src={cardImageUrl(card, 400, art)}
          alt={cardName(card, lang)}
          referrerPolicy="no-referrer"
          className="w-[150px] shrink-0 rounded-lg border border-line"
        />

        <div className="min-w-0 flex-1 space-y-2">
          <p className="text-[0.7rem] leading-relaxed text-ink-dim">
            {cardTextToPlain(cardText(card, lang)) || '（這張卡沒有能力文字）'}
          </p>

          {fixed ? (
            <p className="text-[0.65rem] leading-relaxed text-ink-faint">
              {zone === 'legend'
                ? '傳奇整場都在傳奇區域（103.2.a），不會移動到其他地方。'
                : '戰場在遊戲開始時就擺定（485.4.a、485.5），整場不會換。'}
            </p>
          ) : (
          <div>
            <p className="mb-1 text-[0.65rem] text-ink-faint">搬到</p>
            <div className="flex flex-wrap gap-1">
              {(fixed ? [] : MOVE_TARGETS[zone]).map((target) => (
                <button key={target} type="button" onClick={() => onMove(target)} className={btn}>
                  {ZONE_LABELS[target]}
                </button>
              ))}
              {zone !== 'champion' && (
                <button type="button" onClick={onRemove} className={btn}>
                  放回牌堆
                </button>
              )}
            </div>
          </div>
          )}

          {inPlay && (
            <div>
              <p className="mb-1 text-[0.65rem] text-ink-faint">
                活躍／休眠（414、415）—— 休眠在桌上就是把卡打橫
              </p>
              <div className="flex flex-wrap gap-1">
                <button type="button" onClick={() => onDormant(0)} className={btn}>
                  全部活躍
                </button>
                <button type="button" onClick={() => onDormant(qty)} className={btn}>
                  全部休眠
                </button>
                {qty > 1 && (
                  <span className="self-center text-[0.65rem] text-ink-faint">
                    目前休眠 {dormant} / {qty}
                  </span>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </aside>
  );
}
