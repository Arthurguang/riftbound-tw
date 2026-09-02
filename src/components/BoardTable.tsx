'use client';

import { cardName } from '@/lib/cards';
import { BoardZonePanel } from './BoardZonePanel';
import {
  activeRunesOnBase,
  handSize,
  isInPlayZone,
  moveCard,
  remainingDeck,
  setDormant,
  setInPile,
  wakeAll,
  type BoardState,
  type BoardZone,
  type PlayerBoard,
} from '@/lib/board-state';
import type { ArtLang, TextLang } from '@/lib/i18n';
import type { Card } from '@/lib/types';

/**
 * 盤面的空間版面 —— 像一張真的牌桌。
 *
 * ── 為什麼要這樣排 ──────────────────────────────────────────────
 * 原本是左右兩欄，各自一份「手牌／基地／戰一／戰二／廢牌堆／放逐」清單。
 * 資料是對的，但看起來是兩份表格，不是一張桌子 —— 復盤時最想看的
 * 「這個戰場上雙方各有什麼」被拆到兩欄裡，要左右對照才拼得回來。
 *
 * 改成實體對局的座位方式：
 *
 *     對手（上）　摘要在最上緣
 *     ─────────────────────────────
 *     戰場一        │      戰場二        ← 中間，雙方共用
 *       對手的      │        對手的
 *       你的        │        你的
 *     ─────────────────────────────
 *     你（下）　摘要在最下緣
 *
 * 兩方的區域用**相同的左右順序**，這樣同一種區域在畫面上會上下對齊，
 * 「雙方廢牌堆各有什麼」一眼就能對照。只有摘要列的位置是鏡像的 ——
 * 各自貼著自己那側的桌邊，跟實體對局一樣。
 *
 * 戰場擺中間是關鍵：規則 198.1 說「位置」包含基地與各個戰場，
 * 而戰鬥就是發生在戰場上。把同一個戰場的雙方單位上下相鄰擺，
 * 「這裡打得贏嗎」一眼就看得出來，不必左右對照。
 *
 * ── 這裡只顯示與搬移，不做編輯 ─────────────────────────────────
 * 加卡、匯入牌組、備牌調度、符文追蹤、手牌可打性分析都留在下面的
 * 編輯面板（BoardSide）。**看盤面**與**改盤面**分開，是這次調整的重點。
 */

/**
 * 一方的非戰場區域，由左至右固定這個順序。
 *
 * 兩方用同一個順序，對照才方便 —— 想比「雙方廢牌堆各有什麼」時，
 * 兩邊的廢牌堆在畫面上是上下對齊的。
 */
const STRIP_ZONES = ['champion', 'base', 'hand', 'discard', 'exile'] as const;

function PlayerStrip({
  player,
  label,
  isOpponent,
  byId,
  lang,
  art,
  onChange,
}: {
  player: PlayerBoard;
  label: string;
  isOpponent: boolean;
  byId: Map<string, Card>;
  lang: TextLang;
  art: ArtLang;
  onChange: (next: PlayerBoard) => void;
}) {
  const remaining = remainingDeck(player);
  const runes = activeRunesOnBase(player, byId);

  const summary = (
    <div className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-1">
      <h3 className="text-sm font-semibold text-ink">{label}</h3>
      <span className="text-xs text-ink-dim" data-testid="side-summary">
        手牌 {handSize(player)}　牌堆 {remaining.mainSize}　活躍符文 {runes}
      </span>
      <button
        type="button"
        onClick={() => onChange(wakeAll(player))}
        title="喚醒階段：把控制的所有非法術遊戲物體設為活躍（415.3.a）"
        className="rounded border border-line px-2 py-0.5 text-[0.7rem] text-ink-dim hover:border-accent hover:text-accent-soft"
      >
        全部喚醒
      </button>
    </div>
  );

  const panels = (
    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
      {STRIP_ZONES.map((zone) => (
        <ZoneCell
          key={zone}
          zone={zone}
          player={player}
          isOpponent={isOpponent}
          byId={byId}
          lang={lang}
          art={art}
          onChange={onChange}
        />
      ))}
    </div>
  );

  return (
    <div
      className="rounded-lg border border-line bg-surface/40 p-3"
      data-side={isOpponent ? 'opponent' : 'you'}
      data-testid={isOpponent ? 'strip-opponent' : 'strip-you'}
    >
      {/* 對手的摘要放在最上面、你的放在最下面 —— 都在離桌邊近的那側 */}
      {isOpponent ? (
        <>
          {summary}
          {panels}
        </>
      ) : (
        <>
          {panels}
          <div className="mt-2">{summary}</div>
        </>
      )}
    </div>
  );
}

/** 單一區域的格子。把重複的搬移／移除／休眠接線收在一處。 */
function ZoneCell({
  zone,
  player,
  isOpponent,
  byId,
  lang,
  art,
  onChange,
  label,
}: {
  zone: BoardZone;
  player: PlayerBoard;
  isOpponent: boolean;
  byId: Map<string, Card>;
  lang: TextLang;
  art: ArtLang;
  onChange: (next: PlayerBoard) => void;
  label?: string;
}) {
  return (
    <BoardZonePanel
      zone={zone}
      owner={isOpponent ? 'opponent' : 'you'}
      label={label}
      pile={player[zone]}
      byId={byId}
      lang={lang}
      art={art}
      dormant={isInPlayZone(zone) ? player.dormant[zone] : undefined}
      onDormantChange={
        isInPlayZone(zone)
          ? (cardId, count) => onChange(setDormant(player, zone, cardId, count))
          : undefined
      }
      onMove={(cardId, to) => onChange(moveCard(player, zone, to, cardId))}
      onRemove={(cardId) =>
        onChange({
          ...player,
          [zone]: setInPile(player[zone], cardId, (player[zone][cardId] ?? 0) - 1),
        })
      }
      extra={
        zone === 'hand' && isOpponent ? (
          <label className="ml-auto flex items-center gap-1 text-[0.7rem] text-ink-dim">
            不知道內容的
            <input
              type="number"
              min={0}
              max={99}
              value={player.unknownHand}
              onChange={(e) => {
                const next = Number(e.target.value);
                if (!Number.isFinite(next)) return;
                onChange({
                  ...player,
                  unknownHand: Math.max(0, Math.min(99, Math.round(next))),
                });
              }}
              className="w-12 rounded border border-line bg-surface px-1 py-0.5 text-xs text-ink focus:border-accent focus:outline-none"
              aria-label="對手手牌中你不知道內容的張數"
            />
            張
          </label>
        ) : undefined
      }
    />
  );
}

export function BoardTable({
  board,
  byId,
  lang,
  art,
  onChange,
}: {
  board: BoardState;
  byId: Map<string, Card>;
  lang: TextLang;
  art: ArtLang;
  onChange: (next: BoardState) => void;
}) {
  const setSide = (side: 'you' | 'opponent') => (next: PlayerBoard) =>
    onChange({ ...board, [side]: next });

  const active = (side: 'you' | 'opponent') =>
    board.activePlayer === side ? 'border-accent/50' : 'border-line';

  return (
    <div className="space-y-2" data-testid="board-table">
      {/* ── 對手（上） ── */}
      <div className={`rounded-lg border ${active('opponent')}`}>
        <PlayerStrip
          player={board.opponent}
          label={`對手${board.activePlayer === 'opponent' ? '（回合方）' : ''}`}
          isOpponent
          byId={byId}
          lang={lang}
          art={art}
          onChange={setSide('opponent')}
        />
      </div>

      {/* ── 戰場（中間，雙方共用） ── */}
      <div className="grid gap-2 lg:grid-cols-2" data-testid="battlefield-row">
        {([0, 1] as const).map((index) => {
          const zone = (index === 0 ? 'bf0' : 'bf1') as BoardZone;
          const cardId = board.battlefields[index];
          const card = cardId ? byId.get(cardId) : undefined;

          return (
            <section
              key={zone}
              data-battlefield={index}
              className="rounded-lg border border-accent/25 bg-accent/[0.04] p-2.5"
            >
              <h3 className="mb-2 flex flex-wrap items-baseline gap-x-2 text-sm font-semibold text-ink">
                {index === 0 ? '戰場一' : '戰場二'}
                <span className="text-xs font-normal text-ink-dim">
                  {card ? cardName(card, lang) : '尚未選擇'}
                </span>
                <span
                  className="rounded bg-surface-2 px-1 font-mono text-[0.65rem] font-normal text-ink-faint"
                  title="位置包含基地與各個戰場"
                >
                  198.1
                </span>
              </h3>

              <div className="space-y-1.5">
                <ZoneCell
                  zone={zone}
                  label="對手的"
                  player={board.opponent}
                  isOpponent
                  byId={byId}
                  lang={lang}
                  art={art}
                  onChange={setSide('opponent')}
                />
                <ZoneCell
                  zone={zone}
                  label="你的"
                  player={board.you}
                  isOpponent={false}
                  byId={byId}
                  lang={lang}
                  art={art}
                  onChange={setSide('you')}
                />
              </div>
            </section>
          );
        })}
      </div>

      {/* ── 你（下） ── */}
      <div className={`rounded-lg border ${active('you')}`}>
        <PlayerStrip
          player={board.you}
          label={`你${board.activePlayer === 'you' ? '（回合方）' : ''}`}
          isOpponent={false}
          byId={byId}
          lang={lang}
          art={art}
          onChange={setSide('you')}
        />
      </div>
    </div>
  );
}
