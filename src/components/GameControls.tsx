'use client';

import { useState } from 'react';
import { cardName } from '@/lib/cards';
import {
  beginTurn,
  drawCards,
  handEntries,
  mulligan,
  startGame,
  summonRunes,
} from '@/lib/board-actions';
import { hasDeck, type BoardState } from '@/lib/board-state';
import { TURN_RULES } from '@/lib/draw-model';
import type { TextLang } from '@/lib/i18n';
import type { Card } from '@/lib/types';

/**
 * 規則流程的模擬控制列。
 *
 * ── 這是什麼 ────────────────────────────────────────────────────
 * 復盤板原本只能手動擺卡。這裡把**規則明文寫死的固定流程**做成按鈕，
 * 讓你不必自己一張一張擺：開局抽幾張、每回合召幾張符文、什麼時候喚醒。
 * 每個按鈕都標著它依據的官方條號 —— 它在**示範規則**，不是在執行遊戲。
 *
 * ── 這不是什麼 ──────────────────────────────────────────────────
 * 這**不是對戰系統**：沒有配對、沒有對手連線、沒有勝負判定，
 * 也不檢查你打的牌合不合法。那些需要規則引擎，而本站明確不做。
 *
 * 用詞刻意避開「開始遊戲」「對戰」這類說法 —— 這是研究工具，
 * 讓使用者一眼就知道自己在用什麼，不該以為能在這裡跟別人打牌。
 */
export function GameControls({
  board,
  byId,
  lang,
  onChange,
}: {
  board: BoardState;
  byId: Map<string, Card>;
  lang: TextLang;
  onChange: (next: BoardState) => void;
}) {
  const [side, setSide] = useState<'you' | 'opponent'>('you');
  const [swapping, setSwapping] = useState<string[]>([]);

  const player = board[side];
  const ready = hasDeck(player);

  const apply = (next: typeof player) => onChange({ ...board, [side]: next });

  const label = side === 'you' ? '你' : '對手';
  const btn =
    'rounded-lg border border-line px-3 py-1.5 text-xs text-ink-dim transition-colors hover:border-accent hover:text-accent-soft disabled:cursor-not-allowed disabled:opacity-40';

  const hand = handEntries(player, byId);

  return (
    <section
      className="mb-4 rounded-lg border border-accent/30 bg-surface-1 p-3"
      data-testid="game-controls"
    >
      <div className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-2">
        <h2 className="text-sm font-semibold text-ink">模擬規則流程</h2>
        <span
          className="rounded bg-surface-2 px-1 font-mono text-[0.65rem] text-ink-faint"
          title="每個動作都依官方核心規則的固定流程"
        >
          115–117、315
        </span>

        <div className="flex rounded-lg border border-line p-0.5">
          {(
            [
              { id: 'you', text: '你' },
              { id: 'opponent', text: '對手' },
            ] as const
          ).map((option) => (
            <button
              key={option.id}
              type="button"
              aria-pressed={side === option.id}
              onClick={() => {
                setSide(option.id);
                setSwapping([]);
              }}
              className={`rounded px-3 py-1 text-xs transition-colors ${
                side === option.id ? 'bg-accent/15 text-accent-soft' : 'text-ink-dim hover:text-ink'
              }`}
            >
              {option.text}
            </button>
          ))}
        </div>

        <span className="text-xs text-ink-faint">
          目前編輯：{label}
          {board.activePlayer === side && '（回合方）'}
        </span>
      </div>

      {!ready ? (
        <p className="text-xs text-ink-faint">先匯入 {label} 的牌組才能模擬</p>
      ) : (
        <>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className={btn}
              title="清空場面，把選定英雄放進英雄區域，抽四張開局手牌（116、133.4）。這是重設盤面，不是開始一場對戰。"
              onClick={() => {
                apply(startGame(player));
                setSwapping([]);
              }}
            >
              重設成開局狀態
            </button>

            <button
              type="button"
              className={btn}
              title="從主牌堆抽一張（315.4.b）"
              onClick={() => apply(drawCards(player, 1))}
            >
              抽一張
            </button>

            <button
              type="button"
              className={btn}
              title={`從符文牌堆召出 ${TURN_RULES.runesPerTurn} 張（315.3.b）`}
              onClick={() => apply(summonRunes(player, TURN_RULES.runesPerTurn))}
            >
              召出 {TURN_RULES.runesPerTurn} 張符文
            </button>

            <button
              type="button"
              className={btn}
              title="喚醒（415.3.a）＋召出符文（315.3.b、485.7）＋抽一張（315.4.b）"
              onClick={() => {
                onChange(beginTurn(board, side));
                setSwapping([]);
              }}
            >
              推進 {label} 一個回合
            </button>
          </div>

          {/* 手牌調度 */}
          {hand.length > 0 && (
            <div className="mt-3 rounded border border-line p-2">
              <div className="mb-1.5 flex flex-wrap items-baseline gap-x-2">
                <h3 className="text-xs font-semibold text-ink">手牌調度</h3>
                <span
                  className="rounded bg-surface-2 px-1 font-mono text-[0.65rem] text-ink-faint"
                  title="官方規則條號"
                >
                  117
                </span>
                <span className="text-[0.65rem] text-ink-faint">
                  選最多 {TURN_RULES.mulliganMax} 張換掉（已選 {swapping.length}）
                </span>
                <button
                  type="button"
                  disabled={swapping.length === 0}
                  onClick={() => {
                    apply(mulligan(player, swapping));
                    setSwapping([]);
                  }}
                  className={`ml-auto ${btn}`}
                >
                  換掉這 {swapping.length} 張
                </button>
              </div>

              <ul className="flex flex-wrap gap-1">
                {hand.map(({ card, qty }) => {
                  const picked = swapping.filter((id) => id === card.id).length;
                  const canPick = swapping.length < TURN_RULES.mulliganMax && picked < qty;

                  return (
                    <li key={card.id}>
                      <button
                        type="button"
                        aria-pressed={picked > 0}
                        onClick={() =>
                          setSwapping((prev) =>
                            picked > 0 && !canPick
                              ? prev.filter((id) => id !== card.id)
                              : canPick
                                ? [...prev, card.id]
                                : prev.filter((id) => id !== card.id),
                          )
                        }
                        className={`rounded border px-1.5 py-0.5 text-[0.7rem] transition-colors ${
                          picked > 0
                            ? 'border-accent bg-accent/10 text-accent-soft'
                            : 'border-line text-ink-dim hover:border-surface-3'
                        }`}
                      >
                        {cardName(card, lang)}
                        {qty > 1 && ` ×${qty}`}
                        {picked > 0 && ` （換 ${picked}）`}
                      </button>
                    </li>
                  );
                })}
              </ul>

              <p className="mt-1.5 text-[0.65rem] leading-relaxed text-ink-faint">
                官方順序：先擱置最多兩張（117.1）→ 抽等量的牌（117.2）→
                <strong className="text-ink-dim">最後才把擱置的牌洗回去</strong>（117.3）。
                所以補抽的牌來自不含那幾張的牌堆。
              </p>
            </div>
          )}

          <p className="mt-2 text-[0.7rem] leading-relaxed text-ink-faint">
            <strong className="text-ink-dim">這不是對戰系統</strong>
            —— 沒有配對、沒有對手連線、沒有勝負判定，也不檢查你打的牌合不合法。
            這幾個按鈕只是把規則寫死的固定流程自動化，省得你一張一張擺。
            <br />
            抽牌與召符文是<strong className="text-ink-dim">依剩餘張數加權隨機</strong>的。
            這跟從洗好的牌堆抽在機率上完全等價 —— 規則 114 說牌堆要洗牌、
            108.4.d 說遊戲中牌堆順序是隱密資訊，對玩家而言就是均勻隨機且未知。
          </p>
        </>
      )}
    </section>
  );
}
