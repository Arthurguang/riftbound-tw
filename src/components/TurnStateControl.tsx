'use client';

import { TURN_STATE_INFO, turnStateId, type BoardState } from '@/lib/board-state';

/**
 * 回合狀態（規則 307–310）。
 *
 * 官方把回合狀態拆成兩個獨立維度，疊加成四種狀態：
 *   308　普通狀態 ⇄ 法術對決狀態（是否正在對決或戰鬥）
 *   309　開環狀態 ⇄ 閉環狀態（結算鏈是否存在）
 *
 * 這直接決定「現在能打出什麼」——
 * 資料裡 93 張法術有 27 張兩個時機關鍵字都沒有，177 張單位只有 3 張有，
 * 所以絕大多數卡只能在普通開環打出。復盤時這是關鍵資訊。
 */
export function TurnStateControl({
  board,
  onChange,
}: {
  board: BoardState;
  onChange: (next: Partial<BoardState>) => void;
}) {
  const state = turnStateId(board.phase);
  const info = TURN_STATE_INFO[state];

  const toggle = (key: 'duel' | 'chain') =>
    onChange({ phase: { ...board.phase, [key]: !board.phase[key] } });

  return (
    <section
      className="mb-4 rounded-lg border border-line bg-surface-1 p-3"
      data-testid="turn-state"
    >
      <div className="mb-2 flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="flex items-center gap-2">
          <span className="text-sm text-ink-dim">現在是</span>
          <div className="flex rounded-lg border border-line p-0.5">
            {(
              [
                { id: 'you', label: '你的回合' },
                { id: 'opponent', label: '對手的回合' },
              ] as const
            ).map((option) => (
              <button
                key={option.id}
                type="button"
                aria-pressed={board.activePlayer === option.id}
                onClick={() => onChange({ activePlayer: option.id })}
                className={`rounded px-3 py-1 text-xs transition-colors ${
                  board.activePlayer === option.id
                    ? 'bg-accent/15 text-accent-soft'
                    : 'text-ink-dim hover:text-ink'
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>

        <label className="flex items-center gap-1.5 text-xs text-ink-dim">
          <input
            type="checkbox"
            checked={board.phase.duel}
            onChange={() => toggle('duel')}
            className="accent-current"
          />
          正在法術對決或戰鬥中
          <span className="rounded bg-surface-2 px-1 font-mono text-[0.65rem] text-ink-faint">
            308.1
          </span>
        </label>

        <label className="flex items-center gap-1.5 text-xs text-ink-dim">
          <input
            type="checkbox"
            checked={board.phase.chain}
            onChange={() => toggle('chain')}
            className="accent-current"
          />
          結算鏈上有東西
          <span className="rounded bg-surface-2 px-1 font-mono text-[0.65rem] text-ink-faint">
            309.1
          </span>
        </label>
      </div>

      <p className="text-xs leading-relaxed text-ink">
        目前是
        <strong className="mx-1 text-accent-soft" data-testid="turn-state-label">
          {info.label}
        </strong>
        <span className="rounded bg-surface-2 px-1 font-mono text-[0.65rem] text-ink-faint">
          {info.rule}
        </span>
        <span className="ml-2 text-ink-dim">{info.allows}</span>
      </p>
    </section>
  );
}
