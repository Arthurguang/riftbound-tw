'use client';


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
 * ── 分頁狀態由外面掌握 ──────────────────────────────────────────
 * 點桌上的卡要自動切到「卡片」，不然點了沒反應會以為壞掉。
 *
 * 這件事原本是在這裡用 useEffect 監看選取變化來做的 —— 但**點同一張卡
 * 兩次時選取沒有變**，effect 就不會再跑。所以改成由 ReplayBoard 在處理
 * 點擊時直接設定分頁，那是「使用者按了」而不是「值變了」，永遠可靠。
 */
export function BoardRail({
  tab,
  onTabChange,
  turn,
  card,
  opponent,
  you,
  analysis,
}: {
  tab: RailTab;
  onTabChange: (tab: RailTab) => void;
  turn: React.ReactNode;
  card: React.ReactNode;
  opponent: React.ReactNode;
  you: React.ReactNode;
  /** 永遠顯示在分頁列下方 —— 不管上面切到哪一塊都看得到。 */
  analysis: React.ReactNode;
}) {

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
            onClick={() => onTabChange(t.id)}
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

      {/*
       * 分析永遠在最下面。
       *
       * 「手牌打不打得出來」與「抽到的機率」是復盤的**目的本身** ——
       * 擺盤面是手段，看數字才是目的。藏在某個分頁裡等於每次都要先切過去，
       * 所以固定放在這裡，不管上面開哪一塊都看得到。
       */}
      <div className="shrink-0">{analysis}</div>
    </div>
  );
}
