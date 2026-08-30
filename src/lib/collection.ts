/**
 * 收藏管理：記錄你實際擁有哪些卡、各幾張。
 *
 * ── 資料存在哪裡 ────────────────────────────────────────────────
 * 存在**你自己瀏覽器的 localStorage**，不會上傳到任何地方。
 * 這維持了本站「零使用者資料」的架構 —— 我們沒有資料庫，也就沒有東西可外洩。
 *
 * 代價要說清楚（介面上也會標示）：
 *   · 只存在這台裝置的這個瀏覽器，換手機看就沒有了
 *   · 清除瀏覽資料會一併消失
 *   · 無痕模式關掉就沒了
 *
 * 所以「匯出／匯入收藏」不是加分功能而是**必要**功能 —— 沒有它，
 * 使用者辛苦標記的資料哪天不見會很嘔。
 *
 * ── 資安考量 ────────────────────────────────────────────────────
 * 收藏資料不含任何個人資訊（只有卡號與張數），因此存在瀏覽器是安全的。
 * 讀取時仍然逐項驗證：卡號必須存在、張數必須是合理的整數 ——
 * localStorage 的內容使用者可以自行編輯，等同於不可信輸入。
 */

const STORAGE_KEY = 'riftbound-tw.collection.v1';

/**
 * 「是否開啟收藏記錄」本身也要存起來。
 *
 * 一開始這個開關是從「收藏是否為空」推導的，結果只要元件重新掛載
 * （例如加卡會更新網址）開關就自己關掉了 —— WebKit 的測試抓到這個缺陷。
 * 使用者的偏好設定是獨立的狀態，就該獨立儲存。
 */
const TRACKING_KEY = 'riftbound-tw.collection.tracking.v1';

/** 單一卡片的張數上限。防止異常資料造成介面錯亂。 */
const MAX_QTY = 999;

/** 卡片 id → 擁有張數。 */
export type Collection = Record<string, number>;

/**
 * 從瀏覽器讀取收藏。
 *
 * 任何讀取失敗（沒有資料、格式錯誤、瀏覽器禁用儲存）都回傳空收藏，
 * 而不是讓頁面壞掉 —— 隱私瀏覽模式或關閉儲存的瀏覽器都會走到這裡。
 */
export function loadCollection(validIds: ReadonlySet<string>): Collection {
  if (typeof window === 'undefined') return {};

  let raw: string | null = null;
  try {
    raw = window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return {}; // 瀏覽器禁用了儲存
  }
  if (!raw) return {};

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return {}; // 資料損毀
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return {};

  // localStorage 的內容使用者可以自行編輯，逐項驗證後才採用
  const clean: Collection = {};
  for (const [id, qty] of Object.entries(parsed as Record<string, unknown>)) {
    if (!validIds.has(id)) continue;
    if (typeof qty !== 'number' || !Number.isInteger(qty) || qty < 0 || qty > MAX_QTY) continue;
    if (qty > 0) clean[id] = qty;
  }
  return clean;
}

/** 寫回瀏覽器。儲存失敗時回傳 false，讓介面能提示使用者。 */
export function saveCollection(collection: Collection): boolean {
  if (typeof window === 'undefined') return false;
  try {
    // 只存張數大於 0 的，避免資料無限膨脹
    const trimmed = Object.fromEntries(Object.entries(collection).filter(([, qty]) => qty > 0));
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
    return true;
  } catch {
    return false; // 空間不足或瀏覽器禁用
  }
}

// ─── 開關偏好 ────────────────────────────────────────────────────

/** 讀取「是否開啟收藏記錄」。沒有存過就依收藏是否為空來判斷。 */
export function loadTracking(hasEntries: boolean): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const raw = window.localStorage.getItem(TRACKING_KEY);
    if (raw === '1') return true;
    if (raw === '0') return false;
  } catch {
    return hasEntries; // 瀏覽器禁用了儲存
  }
  return hasEntries;
}

/** 記住「是否開啟收藏記錄」。存不進去也不影響本次使用，因此不回報失敗。 */
export function saveTracking(on: boolean): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(TRACKING_KEY, on ? '1' : '0');
  } catch {
    // 無痕模式或空間不足；這只是偏好設定，失敗不影響功能
  }
}
