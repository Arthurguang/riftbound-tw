'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { BoardSide } from './BoardSide';
import { BoardTable } from './BoardTable';
import { BoardRail, type RailTab } from './BoardRail';
import { BoardAnalysis } from './BoardAnalysis';
import { CardInspector, type Selection } from './CardInspector';
import { BattlefieldPicker } from './BattlefieldPicker';
import { TurnStateControl } from './TurnStateControl';
import { GameControls } from './GameControls';
import {
  adjustRunesOnBase,
  drawCards,
  startGame,
  summonRunes,
} from '@/lib/board-actions';
import {
  EMPTY_BOARD,
  moveCard,
  wakeAll,
  setDormant,
  setInPile,
  type BoardState,
  type BoardZone,
  type PlayerBoard,
} from '@/lib/board-state';
import { decodeBoard, emptyBoardCode, encodeBoard } from '@/lib/board-url';
import { buildCodeIndex } from '@/lib/deck-url';
import { recallState, rememberState } from '@/lib/session-state';
import { ownTurns, runesSummonedByTurn, TURN_RULES } from '@/lib/draw-model';
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
/** sessionStorage 的鍵。跟牌組編輯器分開存，兩邊互不影響。 */
const BOARD_KEY = 'replay-board';

export function ReplayBoard({ cards }: { cards: Card[] }) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const params = useMemo(() => new URLSearchParams(searchParams.toString()), [searchParams]);
  const lang = readTextLang(params);
  const art = readArtLang(params);

  const byId = useMemo(() => new Map(cards.map((c) => [c.id, c])), [cards]);
  const codeIndex = useMemo(() => buildCodeIndex(cards), [cards]);
  const emptyCode = useMemo(() => emptyBoardCode(cards), [cards]);

  /*
   * 起始盤面：**網址優先，其次是這個分頁上次的狀態**。
   *
   * 網址優先是因為別人分享給你的連結一定要照那個連結顯示。
   * 沒有網址參數時（例如從導覽列點回「對局復盤」），才還原上次擺的盤面 ——
   * 使用者反映切去圖鑑再回來，擺好的東西就不見了。
   *
   * 兩個來源都是**不可信輸入**（sessionStorage 使用者可以用開發者工具改），
   * 所以走同一個 decodeBoard，逐項比對真實卡片後才採用。
   */
  const initial = useMemo(
    () => decodeBoard(params.get('b') || recallState(BOARD_KEY), codeIndex),
    // 只在第一次掛載時讀取，之後由本元件掌握狀態
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const [board, setBoard] = useState<BoardState>(initial.board);

  /**
   * 目前選中的卡。
   *
   * 盤面上的卡點一下就選中，大圖與所有操作集中到下方的檢視面板 ——
   * 取代原本每張卡旁邊掛一排小按鈕的做法。卡圖排列時那些按鈕會把版面塞爆，
   * 而且很容易誤按到隔壁那張。
   */
  const [selection, setSelection] = useState<Selection | null>(null);

  /**
   * 右側欄目前開哪一個分頁。
   *
   * 由這裡掌握而不是 BoardRail 自己存，是為了讓「點卡片」能同時做兩件事：
   * 設定選取、並切到「卡片」分頁。
   *
   * 先前是在 BoardRail 裡用 useEffect 監看選取變化來切分頁 —— 但**點同一張
   * 卡兩次時選取沒有變**，effect 就不會再跑，分頁也就不會切回去。
   * 使用者的原話：「跳到其他區塊後再點同一張卡，就不會再跳出卡片敘述」。
   */
  const [railTab, setRailTab] = useState<RailTab>('you');

  /** 點盤面上的卡：選起來，並且**一定**切到「卡片」分頁。 */
  const selectCard = useCallback((next: Selection) => {
    setSelection(next);
    setRailTab('card');
  }, []);

  /**
   * 推進回合前的盤面，供「上一回合」還原。
   *
   * 用 ref 而不是 state：它不影響畫面，放進 state 只會多觸發重繪。
   */
  const historyRef = useRef<BoardState[]>([]);
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

  // 記住這個分頁的盤面，離開再回來時還原得回去
  useEffect(() => {
    if (!ready) return;
    rememberState(BOARD_KEY, boardCode === emptyCode ? '' : boardCode);
  }, [boardCode, emptyCode, ready]);

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

  /**
   * 全域第 N 回合時，輪到誰。
   *
   * 回合是雙方交替的：先手打奇數回合、後手打偶數回合。
   * activePlayer 由回合數推導，不另外存 —— 兩個地方存同一件事一定會不同步。
   */
  const turnOwner = (turn: number): 'you' | 'opponent' =>
    turn % 2 === 1 ? (board.onThePlay ? 'you' : 'opponent') : board.onThePlay ? 'opponent' : 'you';

  /** 你到目前為止打過幾個自己的回合（抽牌與召符文都是以此計算）。 */
  const yourOwnTurns = ownTurns(board.turn, board.onThePlay);

  /** 依你自己的回合數推算應該召出過幾張符文，方便對照有沒有擺漏。 */
  const expectedRunes = runesSummonedByTurn(yourOwnTurns, board.onThePlay);

  /**
   * 改回合數時，雙方基地的符文跟著加減。
   *
   * 每前進一回合各召出兩張（315.3.b），到符文牌組張數就不再增加。
   * 加減的是**差額**而不是覆蓋成公式值 —— 理由寫在 adjustRunesOnBase 裡：
   * 回收符文取得符能後那張會永久離場（164.2.b），所以實際張數幾乎一定
   * 比公式少，直接覆蓋會把使用者重建好的盤面洗掉。
   */
  /**
   * 推進或退回回合。
   *
   * ── 回合開始要做的事（315） ────────────────────────────────────
   *   315.1　　喚醒：控制的所有非法術遊戲物體變回活躍（415.3.a）
   *   315.3.b　召出階段：召出兩張符文
   *   315.4.b　抽牌階段：抽一張
   *
   * ── 為什麼符文從「自己的第二個回合」才加 ───────────────────────
   * 「重設成開局狀態」已經把**首次召出**算進去了（先手 2 張、後手 3 張，
   * 315.3.b＋485.7）。所以推進到某一方**自己的第一個回合**時不再加符文，
   * 否則會重複計算 —— 這正是使用者說的「第二回合輪到對手，他有 3 個符文，
   * 但那一回合不會增加」。
   *
   * 抽牌則每個回合都有（315.4.b），沒有這個例外。
   *
   * ── 退回上一回合 ──────────────────────────────────────────────
   * 用一個歷史堆疊還原，因為「抽了哪一張」是隨機的，沒有辦法反推。
   * 堆疊只活在這次瀏覽階段（盤面本身編在網址裡，重新整理後就沒有歷史了），
   * 那時退回只會改回合數與符文，不會把抽到的牌放回去 —— 按鈕提示有寫。
   */
  const setTurn = useCallback(
    (nextTurn: number) => {
      setBoard((prev) => {
        if (nextTurn === prev.turn) return prev;

        const ownerOf = (turn: number): 'you' | 'opponent' =>
          turn % 2 === 1
            ? prev.onThePlay
              ? 'you'
              : 'opponent'
            : prev.onThePlay
              ? 'opponent'
              : 'you';

        // 往回走：先試著用歷史還原
        if (nextTurn < prev.turn) {
          const restored = historyRef.current.pop();
          if (restored && restored.turn === nextTurn) return restored;

          // 沒有歷史可用：只退回合數與符文，抽到的牌留著
          let board = prev;
          for (let turn = prev.turn; turn > nextTurn; turn -= 1) {
            const side = ownerOf(turn);
            const sideOnThePlay = side === 'you' ? prev.onThePlay : !prev.onThePlay;
            if (ownTurns(turn, sideOnThePlay) < 2) continue;
            board = {
              ...board,
              [side]: adjustRunesOnBase(
                board[side],
                -TURN_RULES.runesPerTurn,
                TURN_RULES.runeDeckSize,
              ),
            };
          }
          return { ...board, turn: nextTurn, activePlayer: ownerOf(nextTurn) };
        }

        // 往前走：每個回合照 315 跑一次
        historyRef.current.push(prev);
        let board = prev;
        for (let turn = prev.turn + 1; turn <= nextTurn; turn += 1) {
          const side = ownerOf(turn);
          const sideOnThePlay = side === 'you' ? prev.onThePlay : !prev.onThePlay;

          let player = wakeAll(board[side]); // 315.1、415.3.a
          // 首次召出已含在開局狀態裡，所以第二個自己的回合起才加
          if (ownTurns(turn, sideOnThePlay) >= 2) {
            player = summonRunes(player, TURN_RULES.runesPerTurn); // 315.3.b
          }
          player = drawCards(player, TURN_RULES.cardsPerTurn); // 315.4.b

          board = { ...board, [side]: player };
        }

        return {
          ...board,
          turn: nextTurn,
          activePlayer: ownerOf(nextTurn),
          // 換人之後回到普通開環（結算鏈與對決都結束了）
          phase: { duel: false, chain: false },
        };
      });
    },
    [],
  );

  /**
   * 重設成開局狀態 —— **雙方一起**。
   *
   * 重設是整局的事，只重設一邊沒有意義。
   * 116　　每人抽四張開局手牌
   * 133.4　選定英雄置於英雄區域
   * 315.3.b＋485.7　先手 2 張符文、後手 3 張
   */
  const resetToOpening = useCallback(() => {
    historyRef.current = [];
    setBoard((prev) => ({
      ...prev,
      turn: 1,
      activePlayer: prev.onThePlay ? 'you' : 'opponent',
      phase: { duel: false, chain: false },
      you: startGame(prev.you, runesSummonedByTurn(1, prev.onThePlay)),
      opponent: startGame(prev.opponent, runesSummonedByTurn(1, !prev.onThePlay)),
    }));
    setSelection(null);
  }, []);

  /** 選中的那張卡目前的資料（可能已經被搬走，所以每次重算）。 */
  const selected = (() => {
    if (!selection) return { card: undefined, qty: 0, dormant: 0 };
    const card = byId.get(selection.cardId);

    // 傳奇與戰場不住在 PlayerBoard 的區域裡，永遠是一張、也沒有休眠狀態
    if (selection.zone === 'legend' || selection.zone === 'battlefield') {
      return { card, qty: 1, dormant: 0 };
    }

    const zone = selection.zone;
    return {
      card,
      qty: board[selection.side][zone][selection.cardId] ?? 0,
      dormant:
        zone === 'base' || zone === 'bf0' || zone === 'bf1'
          ? (board[selection.side].dormant[zone][selection.cardId] ?? 0)
          : 0,
    };
  })();

  /** 對選中的那張卡做事。搬完之後選取跟著移到新的區域。 */
  const actOnSelected = useCallback(
    (
      fn: (player: PlayerBoard, sel: Selection & { zone: BoardZone }) => PlayerBoard,
      nextZone?: BoardZone,
    ) => {
      // 傳奇與戰場不能搬，也就不會有動作要套在它們身上
      if (!selection || selection.zone === 'legend' || selection.zone === 'battlefield') return;
      const sel = selection as Selection & { zone: BoardZone };
      setBoard((prev) => ({ ...prev, [selection.side]: fn(prev[selection.side], sel) }));
      if (nextZone) setSelection({ ...selection, zone: nextZone });
    },
    [selection],
  );

  return (
    <div
      className="mx-auto w-full max-w-[1700px] px-3 py-4 sm:px-4"
      data-replay-ready={ready}
      data-board-code={boardCode}
    >
      <header className="mb-3">
        <h1 className="text-xl font-semibold tracking-tight text-ink">對局復盤</h1>
        <p className="mt-1 text-xs text-ink-faint" data-testid="not-a-game">
          這是<strong className="text-ink-dim">研究工具，不是對戰系統</strong>
          —— 沒有配對、沒有對手連線、沒有勝負判定。
        </p>
        <p className="mt-0.5 text-xs text-ink-dim">
          擺出盤面看精確數字，網址即可分享。
          <span className="text-ink-faint">操作都在右側欄，桌子固定不動。</span>
        </p>
      </header>

      {initial.dropped > 0 && (
        <p className="mb-4 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-300">
          網址中有 {initial.dropped} 段無法辨識的內容已被略過。
        </p>
      )}

      {/*
       * ── 桌子 ＋ 右側控制欄 ──
       *
       * 桌子固定佔滿一個畫面高度，不會把頁面撐長 —— 使用者反映
       * 「要一直用滾輪滾動來檢視，太麻煩」。實體對局時整張桌子是同時
       * 在眼前的，復盤要的就是這個。
       *
       * 所以所有編輯用的控制項（匯入牌組、加卡、備牌、符文、模擬流程、
       * 戰場選擇）全部移到右側欄，欄位自己捲，桌子永遠在原地。
       * 側欄裡對手的在上、你的在下，跟桌上的座位一致。
       */}
      <div className="grid gap-3 lg:h-[calc(100vh-10.5rem)] lg:min-h-[560px] lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="flex min-h-0 flex-col gap-2">
          <BoardTable
            board={board}
            byId={byId}
            lang={lang}
            art={art}
            onChange={setBoard}
            selection={selection}
            onSelect={selectCard}
          />
        </div>

        <BoardRail
          tab={railTab}
          onTabChange={setRailTab}
          turn={
            <div className="space-y-2">
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

        <button
          type="button"
          onClick={resetToOpening}
          title={`雙方一起回到開局：各抽四張（116）、選定英雄進英雄區域（133.4）、先手 ${runesSummonedByTurn(1, true)} 張符文、後手 ${runesSummonedByTurn(1, false)} 張（315.3.b、485.7）`}
          className="rounded border border-accent/50 px-2 py-1 text-xs text-accent-soft hover:bg-accent/10"
          data-testid="reset-opening"
        >
          重設成開局狀態（雙方）
        </button>

        <div className="flex gap-1">
          <button
            type="button"
            title="退回上一回合。抽到的牌會一起還原；重新整理過後沒有歷史，就只會退回合數與符文。"
            onClick={() => setTurn(Math.max(1, board.turn - 1))}
            disabled={board.turn <= 1}
            className="rounded border border-line px-2 py-1 text-xs text-ink-dim disabled:opacity-30 hover:border-accent hover:text-accent-soft"
          >
            上一回合
          </button>
          <button
            type="button"
            title="推進一回合：喚醒（415.3.a）→ 召符文（315.3.b，各自第一個回合已含在開局裡）→ 抽一張（315.4.b）"
            onClick={() => setTurn(Math.min(99, board.turn + 1))}
            className="rounded border border-line px-2 py-1 text-xs text-ink-dim hover:border-accent hover:text-accent-soft"
          >
            下一回合
          </button>
        </div>

        <p className="w-full text-xs text-ink-faint">
          回合<strong className="text-ink-dim">雙方交替</strong>：
          {board.onThePlay ? '你打奇數回合、對手打偶數回合' : '對手打奇數回合、你打偶數回合'}。
          目前是<strong className="text-ink-dim">{turnOwner(board.turn) === 'you' ? '你' : '對手'}</strong>
          的回合（你自己打過 {yourOwnTurns} 個回合）。
          <br />
          推進一回合會對<strong className="text-ink-dim">該回合的玩家</strong>跑一次回合開始流程：
          喚醒（415.3.a）→ 召 {TURN_RULES.runesPerTurn} 張符文（315.3.b）→ 抽一張（315.4.b）。
          <br />
          <strong className="text-ink-dim">各自第一個回合的符文已經算在開局狀態裡</strong>
          （先手 2 張、後手 3 張 —— 485.7），所以那一回合只抽牌不再加符文。
          之後是 先手 4 → 後手 5 → 先手 6⋯⋯，到 {TURN_RULES.runeDeckSize} 張就不再增加。
          <br />
          加減的是<strong className="text-ink-dim">差額</strong>，不是覆蓋成公式值 ——
          回收符文取得符能後那張會永久離場（164.2.b），你手動調過的張數會被保留。
          照公式你應召出過 <strong className="text-ink-dim">{expectedRunes}</strong> 張。
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

            </div>
          }
          /* 卡片檢視：固定位置，不會像浮動提示那樣跑掉 */
          card={
            <CardInspector
            selection={selection}
            card={selected.card}
            qty={selected.qty}
            dormant={selected.dormant}
            lang={lang}
            art={art}
            onMove={(to) => actOnSelected((p, sel) => moveCard(p, sel.zone, to, sel.cardId), to)}
            onRemove={() =>
              actOnSelected((p, sel) => ({
                ...p,
                [sel.zone]: setInPile(p[sel.zone], sel.cardId, (p[sel.zone][sel.cardId] ?? 0) - 1),
              }))
            }
            onDormant={(count) =>
              actOnSelected((p, sel) =>
                sel.zone === 'base' || sel.zone === 'bf0' || sel.zone === 'bf1'
                  ? setDormant(p, sel.zone, sel.cardId, count)
                  : p,
              )
            }
              onClose={() => setSelection(null)}
            />
          }
          opponent={
          <SideBlock side="opponent">
            <GameControls
              board={board}
              side="opponent"
              byId={byId}
              lang={lang}
              onChange={setBoard}
            />
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
              turn={ownTurns(board.turn, !board.onThePlay)}
              onThePlay={!board.onThePlay}
              onRestart={resetToOpening}
              onChange={setSide('opponent')}
            />
          </SideBlock>
          }
          analysis={<BoardAnalysis board={board} byId={byId} lang={lang} />}
          you={
          <SideBlock side="you">
            <GameControls board={board} side="you" byId={byId} lang={lang} onChange={setBoard} />
            <BattlefieldPicker
              battlefields={board.battlefields}
              side="you"
              options={battlefieldOptions('you')}
              byId={byId}
              lang={lang}
              art={art}
              onChange={(next) => setBoard((prev) => ({ ...prev, battlefields: next }))}
            />
            <BoardSide
              title="你"
              player={board.you}
              cards={cards}
              byId={byId}
              lang={lang}
              art={art}
              isOpponent={false}
              turn={yourOwnTurns}
              onThePlay={board.onThePlay}
              onRestart={resetToOpening}
              onChange={setSide('you')}
            />
          </SideBlock>
          }
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
