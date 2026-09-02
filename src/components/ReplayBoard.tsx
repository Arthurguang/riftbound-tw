'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { BoardSide } from './BoardSide';
import { BoardTable } from './BoardTable';
import { BattlefieldPicker } from './BattlefieldPicker';
import { TurnStateControl } from './TurnStateControl';
import { GameControls } from './GameControls';
import { adjustRunesOnBase } from '@/lib/board-actions';
import { EMPTY_BOARD, type BoardState, type PlayerBoard } from '@/lib/board-state';
import { decodeBoard, emptyBoardCode, encodeBoard } from '@/lib/board-url';
import { buildCodeIndex } from '@/lib/deck-url';
import { runesSummonedByTurn, TURN_RULES } from '@/lib/draw-model';
import { readArtLang, readTextLang, DEFAULT_ART_LANG, DEFAULT_TEXT_LANG } from '@/lib/i18n';
import type { Card } from '@/lib/types';

/**
 * 一方的控制項區塊。
 *
 * 只是加一條色帶與標記，讓「這一整段都是同一方的」在畫面上有邊界 ——
 * 中間隔著牌桌，沒有邊界的話很容易按到另一方的按鈕。
 */
function SideBlock({
  side,
  children,
}: {
  side: 'you' | 'opponent';
  children: React.ReactNode;
}) {
  const label = side === 'you' ? '你' : '對手';

  return (
    <details
      open
      data-block-side={side}
      className={`group mb-2 rounded-lg border-l-2 pl-2 ${
        side === 'you' ? 'border-l-accent/50' : 'border-l-rose-500/40'
      }`}
    >
      {/*
       * 摺疊起來是為了讓牌桌不要被推得太遠 —— 兩側的控制項各約 800px 高，
       * 都展開的話要捲很久才看得到盤面。預設展開，設定好之後可以收起來。
       */}
      <summary className="mb-1 cursor-pointer list-none text-[0.7rem] font-semibold text-ink-faint hover:text-ink-dim">
        <span className="group-open:hidden">▸ 展開「{label}」的控制項</span>
        <span className="hidden group-open:inline">▾ 以下都是「{label}」的（點這裡收起來）</span>
      </summary>
      {children}
    </details>
  );
}

/**
 * 對局復盤板。
 *
 * 擺出當下的盤面，然後從盤面算出精確的數字。
 * **不會告訴你最佳解** —— 理由寫在頁面底部，也寫在 board-state.ts 的註解裡。
 *
 * 盤面編在網址裡，分享復盤不需要伺服器 —— 與牌組相同的架構。
 *
 * ── 版面：一切按「誰的」上下分開 ────────────────────────────────
 * 對手的東西一律在牌桌上方、你的一律在下方。中間是雙方共用的戰場。
 * 只有真正屬於整個盤面的東西（回合數、先後手、回合狀態）留在最上面。
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

  /**
   * 改回合數時，雙方基地的符文跟著加減。
   *
   * 每前進一回合各召出兩張（315.3.b），到符文牌組張數就不再增加。
   * 加減的是**差額**而不是覆蓋成公式值 —— 理由寫在 adjustRunesOnBase 裡：
   * 回收符文取得符能後那張會永久離場（164.2.b），所以實際張數幾乎一定
   * 比公式少，直接覆蓋會把使用者重建好的盤面洗掉。
   */
  const setTurn = useCallback((next: number) => {
    setBoard((prev) => {
      const delta = next - prev.turn;
      if (delta === 0) return prev;
      const runes = delta * TURN_RULES.runesPerTurn;
      return {
        ...prev,
        turn: next,
        you: adjustRunesOnBase(prev.you, runes, TURN_RULES.runeDeckSize),
        opponent: adjustRunesOnBase(prev.opponent, runes, TURN_RULES.runeDeckSize),
      };
    });
  }, []);

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

      {/*
       * 先後手：開局決定一次就不會再動，所以跟每次都在調的回合數分開放。
       * 混在同一列會讓人以為它也是常常要改的東西。
       */}
      <div
        className="mb-2 flex flex-wrap items-center gap-3 rounded-lg border border-line bg-surface/40 px-3 py-2"
        data-testid="match-setup"
      >
        <span className="text-xs text-ink-faint">開局設定（決定後就不會再變）</span>
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
        <span className="text-[0.7rem] text-ink-faint">
          後手在自己第一個召出階段多召一張（485.7）
        </span>

        <button
          type="button"
          onClick={() => setBoard(EMPTY_BOARD)}
          className="ml-auto rounded-lg border border-line px-3 py-1.5 text-xs text-ink-dim hover:border-surface-3 hover:text-ink"
        >
          清空盤面
        </button>
      </div>

      {/* 回合數 —— 復盤時真正會一直調的東西 */}
      <div
        className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg border border-line bg-surface-1 p-3"
        data-testid="turn-control"
      >
        <label htmlFor="replay-turn" className="flex items-center gap-2 text-sm text-ink-dim">
          第
          <input
            id="replay-turn"
            type="number"
            min={1}
            max={99}
            value={board.turn}
            onChange={(e) => {
              const raw = Number(e.target.value);
              if (!Number.isFinite(raw)) return;
              setTurn(Math.max(1, Math.min(99, Math.round(raw))));
            }}
            className="w-16 rounded border border-line bg-surface px-2 py-1 text-sm text-ink focus:border-accent focus:outline-none"
          />
          回合
        </label>

        <div className="flex gap-1">
          <button
            type="button"
            onClick={() => setTurn(Math.max(1, board.turn - 1))}
            disabled={board.turn <= 1}
            className="rounded border border-line px-2 py-1 text-xs text-ink-dim disabled:opacity-30 hover:border-accent hover:text-accent-soft"
          >
            上一回合
          </button>
          <button
            type="button"
            onClick={() => setTurn(Math.min(99, board.turn + 1))}
            className="rounded border border-line px-2 py-1 text-xs text-ink-dim hover:border-accent hover:text-accent-soft"
          >
            下一回合
          </button>
        </div>

        <p className="text-xs text-ink-faint">
          改回合數會<strong className="text-ink-dim">同時把雙方基地的符文加減 {TURN_RULES.runesPerTurn} 張</strong>
          （315.3.b），到 {TURN_RULES.runeDeckSize} 張就不再增加。
          <br />
          加減的是<strong className="text-ink-dim">差額</strong>，不是覆蓋成公式算出來的張數 ——
          回收符文取得符能後那張會永久離場（164.2.b），所以你手動調過的張數會被保留。
          目前你照公式應召出過 <strong className="text-ink-dim">{expectedRunes}</strong> 張。
        </p>
      </div>

      {/*
       * 回合狀態是**整個盤面**的狀態（307–310 的四種開閉環），
       * 不屬於任何一方，所以留在中央的共用區。
       */}
      <TurnStateControl
        board={board}
        onChange={(next) => setBoard((prev) => ({ ...prev, ...next }))}
      />

      {/*
       * ── 全部按「誰的」上下分開 ──
       *
       * 對手的東西一律在牌桌上方、你的一律在下方 ——
       * 控制項、戰場選擇、牌組匯入、加卡，通通跟著自己那一側。
       *
       * 上半部的順序是刻意倒過來的（先控制項、再盤面），
       * 這樣「對手的控制項」與「你的控制項」各自貼著桌子的外緣，
       * 中間留給雙方共用的戰場 —— 跟實體對局坐下來的樣子一致。
       */}
      <SideBlock side="opponent">
        <GameControls board={board} side="opponent" byId={byId} lang={lang} onChange={setBoard} />
        <BattlefieldPicker
          battlefields={board.battlefields}
          side="opponent"
          options={battlefieldOptions('opponent')}
          byId={byId}
          lang={lang}
          art={art}
          onChange={(next) => setBoard((prev) => ({ ...prev, battlefields: next }))}
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
      </SideBlock>

      {/* ── 盤面本身：對手在上、你在下、戰場在中間 ── */}
      <BoardTable board={board} byId={byId} lang={lang} art={art} onChange={setBoard} />

      <SideBlock side="you">
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
        <BattlefieldPicker
          battlefields={board.battlefields}
          side="you"
          options={battlefieldOptions('you')}
          byId={byId}
          lang={lang}
          art={art}
          onChange={(next) => setBoard((prev) => ({ ...prev, battlefields: next }))}
        />
        <GameControls board={board} side="you" byId={byId} lang={lang} onChange={setBoard} />
      </SideBlock>

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
