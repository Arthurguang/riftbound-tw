'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { readTextLang } from '@/lib/i18n';
import { SCORE_STRINGS } from '@/lib/scoreboard-content';
import {
  INITIAL_STATE,
  MAX_SCORE,
  TARGETS,
  addScore,
  clearState,
  loadState,
  reachedTarget,
  resetScores,
  saveState,
  setRound,
  setTarget,
  toggleFacing,
  type ScoreState,
  type Side,
} from '@/lib/scoreboard';

/**
 * 手機計分板。
 *
 * ── 這一頁是為了「手機放在桌上」設計的 ──────────────────────────
 * 不是為了坐在電腦前看。所以版面規則跟站上其他工具頁不同：
 *
 *   · 兩個大面板上下各半，整個面板本身就是加分按鈕（手指不用瞄準）
 *   · 數字大到隔著桌子看得見
 *   · 減分與其他操作放小一點、分開放 —— 誤觸加分只要再按一下復原，
 *     但誤觸「開新的一局」會毀掉整局紀錄，所以那顆要再確認
 *   · 對坐模式把上面那一側轉 180 度
 *
 * ── 不做什麼 ────────────────────────────────────────────────────
 * 不判定勝負、不自動加分。達到勝利分數只標一行字並附官方出處。
 */
export function Scoreboard() {
  const params = useSearchParams();
  const lang = readTextLang(params);
  const s = SCORE_STRINGS;

  /*
   * `null` 同時代表兩件事：還沒讀過存檔、畫面還是伺服器產生的那一份。
   *
   * 伺服器端沒有 localStorage，所以第一次渲染一定是初始分數，
   * 讀回存檔之後才會對。合成一個狀態而不是另外開一個 ready 旗標，
   * 是為了讓「瀏覽器接手」這件事只觸發一次重繪。
   * 端對端測試靠 data-scoreboard-ready 判斷可以操作了。
   */
  const [loaded, setLoaded] = useState<ScoreState | null>(null);
  const state = loaded ?? INITIAL_STATE;
  const ready = loaded !== null;

  /** 上一步的狀態，只留一步 —— 計分板需要的是「我剛才按錯了」，不是版本史。 */
  const [previous, setPrevious] = useState<ScoreState | null>(null);

  // 讀回上一局（12 小時內）。失敗、過期、內容不合法都會回 null，照初始狀態走。
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoaded(loadState() ?? INITIAL_STATE);
  }, []);

  const update = useCallback(
    (next: ScoreState, remember = true) => {
      if (remember) setPrevious(state);
      saveState(next);
      setLoaded(next);
    },
    [state],
  );

  const undo = () => {
    if (previous === null) return;
    saveState(previous);
    setLoaded(previous);
    setPrevious(null);
  };

  const newGame = () => {
    if (!window.confirm(s.newGameConfirm[lang])) return;
    setPrevious(state);
    clearState();
    setLoaded(resetScores(state));
  };

  return (
    <div
      className="mx-auto flex w-full max-w-[900px] flex-col gap-3 px-3 py-3 sm:px-6"
      data-scoreboard-ready={ready ? 'true' : 'false'}
    >
      <h1 className="sr-only">{s.title[lang]}</h1>

      <SidePanel side="a" state={state} lang={lang} onChange={update} flipped={state.facing} />
      <SidePanel side="b" state={state} lang={lang} onChange={update} flipped={false} />

      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-line bg-surface-1 px-3 py-2">
        <RoundControl state={state} lang={lang} onChange={update} />

        <div className="flex items-center gap-1.5">
          <span className="text-xs text-ink-faint">{s.targetLabel[lang]}</span>
          {TARGETS.map((target) => (
            <button
              key={target}
              type="button"
              onClick={() => update(setTarget(state, target), false)}
              aria-pressed={state.target === target}
              className={`min-h-[32px] rounded-lg border px-2.5 text-sm ${
                state.target === target
                  ? 'border-accent text-accent-soft'
                  : 'border-line text-ink-dim'
              }`}
            >
              {target}
            </button>
          ))}
        </div>

        {/*
          刻意不加 title：瀏覽器會拿 title 當這顆按鈕的無障礙名稱，
          螢幕閱讀器與測試看到的就變成那一長串說明，而不是「對坐模式」。
          說明改放在下面的說明文字裡 —— 手機本來也沒有滑鼠停留。
        */}
        <button
          type="button"
          onClick={() => update(toggleFacing(state), false)}
          aria-pressed={state.facing}
          data-testid="facing-toggle"
          className={`min-h-[32px] rounded-lg border px-2.5 text-sm ${
            state.facing ? 'border-accent text-accent-soft' : 'border-line text-ink-dim'
          }`}
        >
          {s.facingLabel[lang]}
        </button>

        <KeepAwake lang={lang} />

        <button
          type="button"
          onClick={undo}
          disabled={previous === null}
          data-testid="undo"
          className="min-h-[32px] rounded-lg border border-line px-2.5 text-sm text-ink-dim disabled:opacity-30"
        >
          {s.undo[lang]}
        </button>

        <button
          type="button"
          onClick={newGame}
          data-testid="new-game"
          className="min-h-[32px] rounded-lg border border-line px-2.5 text-sm text-ink-dim hover:border-accent hover:text-accent-soft"
        >
          {s.newGame[lang]}
        </button>
      </div>

      <p className="text-xs leading-relaxed text-ink-faint">
        {s.facingLabel[lang]}：{s.facingHint[lang]}
        <br />
        {s.reachedNote[lang]}
        <br />
        {s.storageNote[lang]}
      </p>
    </div>
  );
}

/** 一方的面板。整塊是加分按鈕，減分另外放一顆小的。 */
function SidePanel({
  side,
  state,
  lang,
  flipped,
  onChange,
}: {
  side: Side;
  state: ScoreState;
  lang: ReturnType<typeof readTextLang>;
  flipped: boolean;
  onChange: (next: ScoreState) => void;
}) {
  const s = SCORE_STRINGS;
  const name = (side === 'a' ? s.playerA : s.playerB)[lang];
  const score = state.scores[side];
  const reached = reachedTarget(state, side);

  return (
    <section
      data-testid={`side-${side}`}
      data-score={score}
      data-reached={reached ? 'true' : 'false'}
      className={`relative rounded-2xl border bg-surface-1 ${
        reached ? 'border-accent' : 'border-line'
      } ${flipped ? 'rotate-180' : ''}`}
    >
      {/*
        整塊面板就是「加 1 分」。手機上最常做的動作要最好按 ——
        不必瞄準小按鈕，桌邊隨手一拍就加分。
      */}
      <button
        type="button"
        onClick={() => onChange(addScore(state, side, 1))}
        disabled={score >= MAX_SCORE}
        aria-label={`${name}：${s.addPoint[lang]}`}
        className="flex min-h-[32vh] w-full flex-col items-center justify-center gap-1 rounded-2xl px-4 py-6"
      >
        <span className="text-sm text-ink-dim">{name}</span>
        <span
          data-testid={`score-${side}`}
          aria-live="polite"
          className="font-serif text-[22vw] leading-none text-ink sm:text-[7rem]"
        >
          {score}
        </span>
        <span className="text-xs text-ink-faint">／ {state.target}</span>
        {reached && (
          <span className="rounded-full border border-accent px-2 py-0.5 text-[0.7rem] text-accent-soft">
            {s.reached(state.target)[lang]}
          </span>
        )}
      </button>

      {/*
        減分刻意小、刻意放角落：按錯加分再按一下就好，
        但把「減分」做得跟加分一樣大，誤觸的機會就一樣大。
      */}
      <button
        type="button"
        onClick={() => onChange(addScore(state, side, -1))}
        disabled={score <= 0}
        aria-label={`${name}：${s.subPoint[lang]}`}
        data-testid={`minus-${side}`}
        className="absolute bottom-2 right-2 h-11 w-11 rounded-full border border-line text-lg text-ink-dim disabled:opacity-30"
      >
        −
      </button>
    </section>
  );
}

function RoundControl({
  state,
  lang,
  onChange,
}: {
  state: ScoreState;
  lang: ReturnType<typeof readTextLang>;
  onChange: (next: ScoreState, remember?: boolean) => void;
}) {
  const s = SCORE_STRINGS;
  return (
    <div className="flex items-center gap-1.5" data-testid="round" data-round={state.round}>
      <span className="text-xs text-ink-faint">{s.roundLabel[lang]}</span>
      <button
        type="button"
        onClick={() => onChange(setRound(state, state.round - 1), false)}
        disabled={state.round <= 1}
        aria-label={s.prevRound[lang]}
        className="h-8 w-8 rounded-lg border border-line text-ink-dim disabled:opacity-30"
      >
        −
      </button>
      <strong className="min-w-[1.5rem] text-center text-sm text-ink">{state.round}</strong>
      <button
        type="button"
        onClick={() => onChange(setRound(state, state.round + 1), false)}
        aria-label={s.nextRound[lang]}
        className="h-8 w-8 rounded-lg border border-line text-ink-dim"
      >
        ＋
      </button>
    </div>
  );
}

/**
 * 螢幕不休眠。
 *
 * 一局打半小時，手機每分鐘暗一次、要一直解鎖 —— 這是實體桌遊計分工具
 * 最常被抱怨的事。瀏覽器的 Wake Lock 需要使用者主動按下才能要求，
 * 所以做成開關而不是自動開啟。
 *
 * 不支援的瀏覽器（較舊的 iOS Safari、Firefox）就顯示「不支援」而不是裝作有用 ——
 * 答應了做不到比一開始就說做不到更糟。
 */
function KeepAwake({ lang }: { lang: ReturnType<typeof readTextLang> }) {
  const s = SCORE_STRINGS;
  const [supported, setSupported] = useState(false);
  const [on, setOn] = useState(false);
  const lockRef = useRef<WakeLockSentinel | null>(null);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setSupported('wakeLock' in navigator), []);

  const release = useCallback(() => {
    void lockRef.current?.release();
    lockRef.current = null;
    setOn(false);
  }, []);

  const request = useCallback(async () => {
    try {
      lockRef.current = await navigator.wakeLock.request('screen');
      // 分頁切走時系統會自動放掉，狀態要跟著回到「關」
      lockRef.current.addEventListener('release', () => {
        lockRef.current = null;
        setOn(false);
      });
      setOn(true);
    } catch {
      // 使用者拒絕、系統省電模式 —— 不吵他，維持關閉
      setOn(false);
    }
  }, []);

  // 離開頁面時一定要放掉，否則螢幕會在使用者看別的頁時還亮著
  useEffect(() => () => void lockRef.current?.release(), []);

  if (!supported) {
    return (
      <span className="text-xs text-ink-faint" title={s.awakeUnsupported[lang]}>
        {s.awakeLabel[lang]}：{s.awakeUnsupported[lang]}
      </span>
    );
  }

  return (
    <button
      type="button"
      onClick={() => (on ? release() : void request())}
      aria-pressed={on}
      data-testid="keep-awake"
      className={`min-h-[32px] rounded-lg border px-2.5 text-sm ${
        on ? 'border-accent text-accent-soft' : 'border-line text-ink-dim'
      }`}
    >
      {s.awakeLabel[lang]}
    </button>
  );
}
