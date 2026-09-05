'use client';
import { HelpTip } from './HelpTip';

/**
 * 戰力加成的計數器 —— 挑一個數字，拖到場上的卡片上。
 *
 * ── 為什麼需要 ──────────────────────────────────────────────────
 * 卡牌、傳奇、法術會在某些時刻給單位增益（「這回合 +N 力量」之類）。
 * 那些數字**不在卡面上**，復盤時最容易記錯的就是這個 ——
 * 「這隻現在到底幾點」往往決定了戰場打不打得贏。
 *
 * ── 為什麼用拖曳 ────────────────────────────────────────────────
 * 點卡片已經有別的意思（選取、開檢視面板），再疊一個「套用加成」上去
 * 會互相打架。拖曳把「要給多少」與「給誰」分成兩個動作，語意乾淨。
 *
 * 但拖曳對鍵盤與觸控都不友善，**而且 WebKit（Safari）的 HTML5 拖放本來就
 * 不可靠** —— 這是先在 WebKit 的端對端測試上失敗才發現的，不是猜的。
 *
 * 所以拖曳只是「比較快」的那條路，另外還有兩條到得了同一個地方：
 *   · 點一下數字讓它「待命」，再點場上的卡就套用（每個瀏覽器都能用）
 *   · 檢視面板裡的 +／−／清除（鍵盤也用得到，也只有這裡能減少）
 */

/** 常用的加成值。多數效果落在這個範圍，需要別的數字就用檢視面板調。 */
const PRESETS = [1, 2, 3, 5] as const;

/** 拖曳時放在 dataTransfer 裡的型別標記，避免跟其他拖放來源混淆。 */
export const BUFF_DRAG_TYPE = 'application/x-riftbound-buff';

export function BuffPalette({
  armed,
  onArm,
}: {
  /** 目前待命中的加成值，沒有就是 null。 */
  armed: number | null;
  /** 點一下數字讓它待命；再點同一個就取消。 */
  onArm: (amount: number | null) => void;
}) {
  return (
    <section
      className="rounded-lg border border-line bg-surface-1 p-2"
      data-testid="buff-palette"
    >
      <div className="mb-1.5 flex flex-wrap items-baseline gap-x-2">
        <h3 className="text-xs font-semibold text-ink">戰力加成</h3>
        <HelpTip label="戰力加成的說明">
          加成是<strong className="text-ink">你自己記的數字</strong>，本站不會替你判斷哪張卡
          在什麼時候該有幾點 —— 那需要規則引擎。
          <br />
          <br />
          同一區有兩張同名單位時，加成算在<strong className="text-ink">整疊</strong>上
          （跟休眠一樣是模型的既有限制）。
        </HelpTip>
        <span className="text-[0.65rem] text-ink-faint">
          {armed === null
            ? '點一下數字再點卡片，或直接把數字拖過去'
            : `+${armed} 待命中 —— 點場上的卡片套用，或再按一次取消`}
        </span>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {PRESETS.map((amount) => (
          <button
            key={amount}
            type="button"
            draggable
            aria-pressed={armed === amount}
            onClick={() => onArm(armed === amount ? null : amount)}
            onDragStart={(e) => {
              e.dataTransfer.setData(BUFF_DRAG_TYPE, String(amount));
              // 有些瀏覽器要求同時設定 text/plain 才會啟動拖曳
              e.dataTransfer.setData('text/plain', `+${amount}`);
              e.dataTransfer.effectAllowed = 'copy';
            }}
            data-buff-chip={amount}
            title={`點一下讓 +${amount} 待命，再點場上的卡片；也可以直接拖過去`}
            className={`cursor-grab select-none rounded border px-2 py-1 text-xs font-semibold transition-colors active:cursor-grabbing ${
              armed === amount
                ? 'border-emerald-400 bg-emerald-500/30 text-emerald-200 ring-2 ring-emerald-400'
                : 'border-emerald-500/50 bg-emerald-500/10 text-emerald-300 hover:border-emerald-400'
            }`}
          >
            +{amount}
          </button>
        ))}
      </div>

    </section>
  );
}
