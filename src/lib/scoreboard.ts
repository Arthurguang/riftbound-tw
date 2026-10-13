/**
 * 手機計分板的狀態與規則。
 *
 * ── 這個功能在做什麼、不做什麼 ──────────────────────────────────
 * 這是給**實體對戰**用的記分工具：兩個人面對面打牌，手機放在桌上記分。
 * 它只做加減與顯示，不模擬遊玩、不判斷「這時候該不該得分」，
 * 也不宣告勝負 —— 那需要規則引擎，本站不做（理由見 PROGRESS.md 的政策盤點）。
 *
 * 達到勝利分數時只標示「已達 N 分」並附上官方出處，讓玩家自己判斷，
 * 跟復盤板的做法一致。
 *
 * ── 為什麼邏輯全部寫成純函式 ────────────────────────────────────
 * 畫面只負責呈現與送出事件。所有「數字會不會跑掉」的規則都在這裡，
 * 可以用單元測試釘死，不必靠點畫面去驗。
 */

export type Side = 'a' | 'b';

export const SIDES: readonly Side[] = ['a', 'b'];

/**
 * 勝利分數。
 *
 * 8 分是標準對局、11 分是多人團隊賽 —— 兩個數字都出自官方新手指南
 *（規則頁的「遊戲概要」第一條就是這條，附出處）。
 * 只開放這兩個選項：讓人自由填數字只會多出一堆要驗證的狀況，
 * 而官方並沒有其他的勝利分數。
 */
export const TARGETS = [8, 11] as const;
export type Target = (typeof TARGETS)[number];

/** 分數上限。只是防呆 —— 實際對局不會到這麼多。 */
export const MAX_SCORE = 99;

/** 回合數上限。同樣只是防呆。 */
export const MAX_ROUND = 99;

export type ScoreState = {
  scores: Record<Side, number>;
  target: Target;
  /** 回合數。官方沒有「第幾回合」的勝負意義，純粹是玩家自己想記。 */
  round: number;
  /**
   * 對坐模式：把其中一側的面板轉 180 度。
   *
   * 兩個人隔著桌子坐，手機放中間 —— 對面的人看到的是顛倒的數字。
   * 這個開關就是為了那個情境，實體桌遊計分工具幾乎都有。
   */
  facing: boolean;
};

export const INITIAL_STATE: ScoreState = {
  scores: { a: 0, b: 0 },
  target: 8,
  round: 1,
  facing: false,
};

const clamp = (value: number, max: number) => Math.max(0, Math.min(max, Math.round(value)));

/**
 * 加減分數。
 *
 * 不會低於 0（官方規則：玩家的分數無法低於 0 分），也不會超過上限。
 * **刻意不在達到勝利分數時鎖住** —— 記錯了要能改回來，
 * 而且判定勝負不是這個工具的事。
 */
export function addScore(state: ScoreState, side: Side, delta: number): ScoreState {
  return { ...state, scores: { ...state.scores, [side]: clamp(state.scores[side] + delta, MAX_SCORE) } };
}

/** 換勝利分數（8 或 11）。不在清單裡的值一律忽略，不是「盡量接受」。 */
export function setTarget(state: ScoreState, target: number): ScoreState {
  const found = TARGETS.find((t) => t === target);
  return found === undefined ? state : { ...state, target: found };
}

/** 調整回合數。最小是 1 —— 沒有「第 0 回合」。 */
export function setRound(state: ScoreState, round: number): ScoreState {
  return { ...state, round: Math.max(1, Math.min(MAX_ROUND, Math.round(round))) };
}

export function toggleFacing(state: ScoreState): ScoreState {
  return { ...state, facing: !state.facing };
}

/**
 * 開新的一局。
 *
 * 分數與回合歸零，但**保留**勝利分數與對坐模式 ——
 * 那兩個是「這張桌子怎麼坐、今天打什麼賽制」，不會因為換一局就變。
 */
export function resetScores(state: ScoreState): ScoreState {
  return { ...state, scores: { a: 0, b: 0 }, round: 1 };
}

/** 這一方是否已達勝利分數。只用來顯示標記，不代表本站判定勝負。 */
export function reachedTarget(state: ScoreState, side: Side): boolean {
  return state.scores[side] >= state.target;
}

// ─── 存回瀏覽器 ──────────────────────────────────────────────────────────

/**
 * localStorage 的鍵，與存檔時間一起存。
 *
 * ── 為什麼用 localStorage 而不是 sessionStorage ─────────────────
 * 牌組與盤面用的是 sessionStorage（見 lib/session-state.ts：
 * 「三天後打開看到早就忘了的盤面會以為系統壞了」）。計分板相反：
 * 比賽打到一半手機沒電、瀏覽器被系統回收，分數不見是真的會出事。
 *
 * 所以這裡用 localStorage，但加上**保鮮期**：超過 12 小時就當作上一局，
 * 從頭開始。兩種壞情況都避開了，而且規則寫得出來、測得出來。
 */
const STORAGE_KEY = 'rb-scoreboard';

/** 保鮮期：12 小時。同一天的續局留著，隔天來就是新的一局。 */
export const FRESH_MS = 12 * 60 * 60 * 1000;

/**
 * 把讀回來的東西驗成合法狀態，驗不過一律回 null。
 *
 * 使用者可以用開發者工具改寫 localStorage，所以這是**不可信輸入**。
 * 這裡逐欄位檢查，不用 Number() 之類「盡量轉成數字」的寫法 ——
 * `Number("0x5")` 是 5、`Number("1e1")` 是 10，這種寬鬆解析先前已經
 * 讓復盤的分數欄位出過事（PROGRESS.md 問題 67）。
 */
export function parseState(raw: unknown, now = Date.now()): ScoreState | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const data = raw as Record<string, unknown>;

  const savedAt = data.savedAt;
  if (!isCount(savedAt) || now - savedAt > FRESH_MS || savedAt > now) return null;

  const scores = data.scores;
  if (typeof scores !== 'object' || scores === null) return null;
  const { a, b } = scores as Record<string, unknown>;
  if (!isCount(a) || !isCount(b) || a > MAX_SCORE || b > MAX_SCORE) return null;

  const target = TARGETS.find((t) => t === data.target);
  if (target === undefined) return null;

  const round = data.round;
  if (!isCount(round) || round < 1 || round > MAX_ROUND) return null;

  if (typeof data.facing !== 'boolean') return null;

  return { scores: { a, b }, target, round, facing: data.facing };
}

/** 真正的非負整數 —— 不接受字串、小數、NaN、Infinity。 */
function isCount(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0;
}

/** 存起來。不能存（無痕模式、關閉儲存）就算了，功能照常運作。 */
export function saveState(state: ScoreState, now = Date.now()): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...state, savedAt: now }));
  } catch {
    // 忽略：記分板不依賴儲存也能用
  }
}

/** 讀回來；沒有、過期或內容不合法都回 null，呼叫端會從初始狀態開始。 */
export function loadState(now = Date.now()): ScoreState | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw === null) return null;
    return parseState(JSON.parse(raw) as unknown, now);
  } catch {
    return null;
  }
}

/** 清掉存檔（按「開新的一局」時一併清，免得重新整理又回到舊分數）。 */
export function clearState(): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // 同上
  }
}
