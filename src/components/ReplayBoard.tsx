'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { BoardSide } from './BoardSide';
import { BoardTable } from './BoardTable';
import { BattlefieldPicker } from './BattlefieldPicker';
import { TurnStateControl } from './TurnStateControl';
import { GameControls } from './GameControls';
import { EMPTY_BOARD, type BoardState, type PlayerBoard } from '@/lib/board-state';
import { decodeBoard, emptyBoardCode, encodeBoard } from '@/lib/board-url';
import { buildCodeIndex } from '@/lib/deck-url';
import { runesSummonedByTurn, TURN_RULES } from '@/lib/draw-model';
import { readArtLang, readTextLang, DEFAULT_ART_LANG, DEFAULT_TEXT_LANG } from '@/lib/i18n';
import type { Card } from '@/lib/types';

/**
 * 對局復盤板。
 *
 * 擺出當下的盤面，然後從盤面算出精確的數字。
 * **不會告訴你最佳解** —— 理由寫在頁面底部，也寫在 board-state.ts 的註解裡。
 *
 * 盤面編在網址裡，分享復盤不需要伺服器 —— 與牌組相同的架構。
 */
export function ReplayBoard({ cards }: { cards: Card[] }) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const params = useMemo(() => new URLSearchParams(searchParams.toString()), [searchParams]);
  const lang = readTextLang(params);
  const art = readArtLang(params);

  const byId = useMemo(() => new Map(cards.map((c) => [c.id, c])), [cards]);
  const codeIndex = useMemo(() => buildCodeIndex(cards), [cards]);
  const emptyCode = useMemo(() => emptyBoardCode(cards), [cards]);

  // 網址是使用者可編造的輸入，decodeBoard 會逐項比對真實卡片
  const initial = useMemo(
    () => decodeBoard(params.get('b') ?? '', codeIndex),
    // 只在第一次掛載時讀取，之後由本元件掌握狀態
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const [board, setBoard] = useState<BoardState>(initial.board);
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);

  /**
   * 目前盤面對應的編碼。
   *
   * 除了寫進網址，也公布在 DOM 上（data-board-code）——
   * 這樣端對端測試可以等「網址真的帶到這個值」，
   * 而不是靠「網址變了沒」或「網址穩定了沒」之類的啟發式猜測。
   * 那些猜法前後錯過四次，每次都是在兩次非同步寫入之間誤判。
   */
  const boardCode = useMemo(() => encodeBoard(board, cards), [board, cards]);

  // 把盤面寫回網址，讓使用者可以複製連結分享復盤
  useEffect(() => {
    if (!ready) return;
    const next = new URLSearchParams();
    if (boardCode !== emptyCode) next.set('b', boardCode);
    if (lang !== DEFAULT_TEXT_LANG) next.set('lang', lang);
    if (art !== DEFAULT_ART_LANG) next.set('art', art);

    const qs = next.toString();
    const url = qs === '' ? '/replay' : `/replay?${qs}`;
    if (`${window.location.pathname}${window.location.search}` !== url) {
      router.replace(url, { scroll: false });
    }
  }, [boardCode, emptyCode, lang, art, ready, router]);

  const setSide = useCallback(
    (side: 'you' | 'opponent') => (next: PlayerBoard) =>
      setBoard((prev) => ({ ...prev, [side]: next })),
    [],
  );

  /** 各方牌組裡的戰場（1v1 每人帶 3 張，實際用 1 張 —— 485.4.a、485.5）。 */
  const battlefieldOptions = useCallback(
    (side: 'you' | 'opponent') =>
      Object.keys(board[side].deck.battlefields)
        .map((id) => byId.get(id))
        .filter((c): c is Card => Boolean(c))
        .sort((a, b) => a.number - b.number),
    [board, byId],
  );

  /** 依回合推算應該召出過幾張符文，方便使用者對照有沒有擺漏。 */
  const expectedRunes = runesSummonedByTurn(board.turn, board.onThePlay);

  return (
    <div
      className="mx-auto w-full max-w-[1500px] px-4 py-8 sm:px-6"
      data-replay-ready={ready}
      data-board-code={boardCode}
    >
      <header className="mb-5">
        <h1 className="text-2xl font-semibold tracking-tight text-ink sm:text-3xl">對局復盤</h1>
        <p className="mt-1 text-xs text-ink-faint" data-testid="not-a-game">
          這是<strong className="text-ink-dim">研究工具，不是對戰系統</strong>
          —— 沒有配對、沒有對手連線、沒有勝負判定。
        </p>
        <p className="mt-1 max-w-3xl text-sm leading-relaxed text-ink-dim">
          擺出當下的盤面 —— 手牌、場上、廢牌堆 —— 然後看從這個局面算出來的精確數字。
          規則寫死的固定流程（開局抽幾張、每回合召幾張符文）可以一鍵模擬，省得一張張擺。
          盤面編在網址裡，複製網址就能把這個局面分享給別人一起研究。
        </p>
      </header>

      {initial.dropped > 0 && (
        <p className="mb-4 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-300">
          網址中有 {initial.dropped} 段無法辨識的內容已被略過。
        </p>
      )}

      {/* 回合與先後手 */}
      <div className="mb-5 flex flex-wrap items-center gap-4 rounded-lg border border-line bg-surface-1 p-3">
        <label htmlFor="replay-turn" className="flex items-center gap-2 text-sm text-ink-dim">
          第
          <input
            id="replay-turn"
            type="number"
            min={1}
            max={99}
            value={board.turn}
            onChange={(e) => {
              const next = Number(e.target.value);
              if (!Number.isFinite(next)) return;
              setBoard((prev) => ({ ...prev, turn: Math.max(1, Math.min(99, Math.round(next))) }));
            }}
            className="w-16 rounded border border-line bg-surface px-2 py-1 text-sm text-ink focus:border-accent focus:outline-none"
          />
          回合
        </label>

        <div className="flex items-center gap-2">
          <span className="text-sm text-ink-dim">你是</span>
          <div className="flex rounded-lg border border-line p-0.5">
            {[
              { on: true, label: '先手' },
              { on: false, label: '後手' },
            ].map((option) => (
              <button
                key={option.label}
                type="button"
                aria-pressed={board.onThePlay === option.on}
                onClick={() => setBoard((prev) => ({ ...prev, onThePlay: option.on }))}
                className={`rounded px-3 py-1 text-xs transition-colors ${
                  board.onThePlay === option.on
                    ? 'bg-accent/15 text-accent-soft'
                    : 'text-ink-dim hover:text-ink'
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>

        <p className="text-xs text-ink-faint">
          照規則，你到第 {board.turn} 回合應該召出過{' '}
          <strong className="text-ink-dim">{expectedRunes}</strong> 張符文
          （315.3.b、485.7，上限 {TURN_RULES.runeDeckSize} 張）
        </p>

        <button
          type="button"
          onClick={() => setBoard(EMPTY_BOARD)}
          className="ml-auto rounded-lg border border-line px-3 py-1.5 text-xs text-ink-dim hover:border-surface-3 hover:text-ink"
        >
          清空盤面
        </button>
      </div>

      <GameControls board={board} byId={byId} lang={lang} onChange={setBoard} />

      <TurnStateControl
        board={board}
        onChange={(next) => setBoard((prev) => ({ ...prev, ...next }))}
      />

      <BattlefieldPicker
        battlefields={board.battlefields}
        yourOptions={battlefieldOptions('you')}
        opponentOptions={battlefieldOptions('opponent')}
        byId={byId}
        lang={lang}
        art={art}
        onChange={(next) => setBoard((prev) => ({ ...prev, battlefields: next }))}
      />

      {/* ── 盤面本身：像一張牌桌，對手在上、你在下、戰場在中間 ── */}
      <BoardTable board={board} byId={byId} lang={lang} art={art} onChange={setBoard} />

      {/*
       * ── 編輯面板 ──
       * 跟上面的牌桌分開：**看盤面**在上、**改盤面**在下。
       * 兩方各一欄，所以「這是在改誰的」不會弄錯。
       */}
      <div className="mt-4 grid gap-4 xl:grid-cols-2">
        <BoardSide
          title="你"
          player={board.you}
          cards={cards}
          byId={byId}
          lang={lang}
          art={art}
          isOpponent={false}
          turn={board.turn}
          onThePlay={board.onThePlay}
          phase={board.phase}
          isTurnPlayer={board.activePlayer === 'you'}
          onChange={setSide('you')}
        />
        <BoardSide
          title="對手"
          player={board.opponent}
          cards={cards}
          byId={byId}
          lang={lang}
          art={art}
          isOpponent
          turn={board.turn}
          onThePlay={board.onThePlay}
          phase={board.phase}
          isTurnPlayer={board.activePlayer === 'opponent'}
          onChange={setSide('opponent')}
        />
      </div>

      {/* 這個工具的界線 */}
      <section className="mt-6 rounded-lg border border-line bg-surface-1 p-4">
        <h2 className="mb-2 text-sm font-semibold text-ink">這個工具會做什麼、不會做什麼</h2>
        <div className="space-y-2 text-xs leading-relaxed text-ink-dim">
          <p>
            <strong className="text-ink">先講最重要的：這不是對戰系統。</strong>
            沒有配對、沒有對手連線、沒有勝負判定，也不會有。
            這裡的「對手」那一欄是給你自己擺對手盤面用的 ——
            為了算出「以你知道的資訊，接下來會怎樣」，不是連到另一個人。
          </p>
          <p>
            <strong className="text-ink">會做：從當下盤面算出精確的數字。</strong>
            牌堆裡還剩什麼、再抽幾張抽到某張卡的機率、手上哪些牌現在的符文付得起。
            這些全部是精確計算，你可以自己驗算。
          </p>
          <p>
            <strong className="text-ink">不會做：告訴你最佳解。</strong>
            要判斷「這個局面怎麼打最好」，程式必須看得懂 376 張卡各自的能力文字，
            還要能執行戰鬥、據守、對決那整套流程 —— 那是一個完整的規則引擎。
            沒有引擎卻跳出「建議」，那個建議是編的。
          </p>
          <p>
            <strong className="text-ink">會做：模擬規則明文寫死的固定流程。</strong>
            開局抽四張（116）、手牌調度（117）、每回合喚醒＋召符文＋抽牌
            （315.1、315.3.b、315.4.b、485.7）。抽牌是依剩餘張數加權隨機 ——
            這跟從洗好的牌堆抽在機率上等價（114、108.4.d）。
          </p>
          <p>
            <strong className="text-ink">會做：依回合狀態判斷打不打得出來。</strong>
            規則 307–310 把回合拆成四種狀態，每種能打出的卡不同 ——
            閉環只有 [反應]、法術對決只有 [迅捷] 或 [反應]。
            這條規則明確且可驗證，所以有做。但仍然
            <strong className="text-ink-dim">不檢查目標與卡牌自身的其他限制</strong>。
          </p>
          <p>
            <strong className="text-ink">不會做：判斷動作合不合法。</strong>
            「手牌裡付得起的」只比較符文張數與費用，不檢查時機、目標或能力限制。
          </p>
          <p>
            <strong className="text-ink">對手的手牌預設只記張數。</strong>
            核心規則 108.7.c 說手牌是私密資訊、108.7.e 說張數是公開資訊 ——
            所以預設只填張數。你確實知道對手手上有哪張牌時再填內容，
            這樣算出來的機率才是「以你實際知道的資訊」為基礎。
          </p>
          <p>
            想分析整副牌組而不是單一局面，請用{' '}
            <Link href="/odds" className="text-accent-soft hover:underline">
              機率計算
            </Link>
            。
          </p>
        </div>
      </section>
    </div>
  );
}
