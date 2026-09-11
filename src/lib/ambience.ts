/**
 * 背景動畫與音樂的共用設定（純函式，方便測試）。
 *
 * ── 設計依據（2026-09-11 查的研究）───────────────────────────────
 * · 外觀影響第一印象與「好不好用」的感受（Lindgaard 2006；Kurosu & Kashimura 1995）
 *   → 值得做氛圍
 * · 會動的東西會搶走主要任務的注意力（NN/g；網頁動態廣告的眼動研究）
 *   → 動畫只在背景、慢而淡；工具頁更淡
 * · 自動播放聲音讓人反感，瀏覽器也會擋；WCAG 1.4.2 要求能停止聲音
 *   → 音樂預設關閉，使用者按下才播放
 * · WCAG 2.2.2 要求超過 5 秒的動態內容能暫停；有人對畫面晃動會頭暈
 *   → 有暫停按鈕，並尊重系統的「減少動態效果」設定
 */

export const BACKDROP_VARIANTS = ['embers', 'runes', 'mixed'] as const;
export type BackdropVariant = (typeof BACKDROP_VARIANTS)[number];

export function isBackdropVariant(value: unknown): value is BackdropVariant {
  return typeof value === 'string' && (BACKDROP_VARIANTS as readonly string[]).includes(value);
}

/**
 * 動畫濃淡：首頁完整呈現；其他頁面是要專心操作的工具，只留淡淡的氛圍。
 */
export function backdropIntensity(pathname: string): number {
  return pathname === '/' ? 1 : 0.4;
}

/**
 * localStorage 的鍵。只存介面偏好（動畫要不要動、哪種風格），不存任何個人資料。
 * 音樂開關刻意**不存** —— 每次來都從靜音開始，不做任何形式的自動播放。
 */
export const STORAGE_KEYS = {
  paused: 'rb-backdrop-paused',
  variant: 'rb-backdrop-variant',
} as const;
