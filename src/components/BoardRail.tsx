'use client';

import { useEffect, useState } from 'react';

export type RailTab = 'turn' | 'card' | 'opponent' | 'you';

const TABS: { id: RailTab; label: string; hint: string }[] = [
  { id: 'turn', label: '回合', hint: '先後手、回合數、回合狀態' },
  { id: 'card', label: '卡片', hint: '選中那張卡的大圖與操作' },
  { id: 'opponent', label: '對手', hint: '對手的匯入、加卡、備牌、符文' },
  { id: 'you', label: '你', hint: '你的匯入、加卡、備牌、符文' },
];

/**
 * 右側控制欄 —— 一次只展開一組。
 *
 * ── 為什麼不全部攤開 ────────────────────────────────────────────
 * 前一版把所有控制項一路往下排。桌子雖然固定住了，但側欄本身變得很長，
 * 使用者反映「匯入牌組後右側列的功能還是需要滾動」。
 *
 * 這些控制項有個共同性質：**同一時間只會用到一組**。
 * 你在調對手盤面時不會同時在改自己的符文。所以改成頂部一排按鈕，
 * 按哪個才展開哪個 —— 側欄高度就固定了，不再越用越長。
 *
 * ── 點卡片會自動切到「卡片」 ────────────────────────────────────
 * 不然點了桌上的卡卻沒反應（面板收在另一個分頁裡），會以為壞掉。
 */
export function BoardRail({
  selectionKey,
  turn,
  card,
  opponent,
  you,
}: {
  /**
   * 目前選中的卡的識別字串（沒有選就是 null）。
   * 一變動就自動切到「卡片」分頁 —— 讓點擊有立即的回應。
   */
  selectionKey: string | null;
  turn: React.ReactNode;
  card: React.ReactNode;
  opponent: React.ReactNode;
  you: React.ReactNode;
}) {
  const [tab, setTab] = useState<RailTab>('you');

  useEffect(() => {
    if (selectionKey) setTab('card');
  }, [selectionKey]);

  const panels: Record<RailTab, React.ReactNode> = { turn, card, opponent, you };

  return (
    <div className="flex min-h-0 flex-col gap-2" data-testid="board-rail">
      <div className="flex shrink-0 gap-1 rounded-lg border border-line bg-surface-1 p-1">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            aria-pressed={tab === t.id}
            title={t.hint}
            onClick={() => setTab(t.id)}
            data-rail-tab={t.id}
            className={`flex-1 rounded px-2 py-1.5 text-xs transition-colors ${
              tab === t.id
                ? 'bg-accent/15 font-semibold text-accent-soft'
                : 'text-ink-dim hover:text-ink'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/*
       * 四組面板**全部保持掛載**，只切換顯示。
       *
       * 一開始是只渲染當前那一組，但那樣切分頁會把面板卸載重建，
       * 使用者選好的狀態（例如「加到戰一」）就被重置 —— 去別的分頁瞄一眼
       * 回來，選擇就沒了。這是真的功能退步，不是只有測試會踩到。
       */}
      <div className="min-h-0 flex-1 overflow-y-auto pr-1" data-rail-panel={tab}>
        {TABS.map((t) => (
          <div key={t.id} hidden={tab !== t.id} data-rail-content={t.id}>
            {panels[t.id]}
          </div>
        ))}
      </div>
    </div>
  );
}
