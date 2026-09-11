/**
 * 首頁傳奇展示台（3D 轉盤）的計算 —— 純函式，方便測試。
 *
 * 轉盤用「累計轉了幾步」（turn）表示，而不是「目前是第幾張」：
 * 從最後一張轉回第一張時，累計步數只是再加一，畫面就會繼續往同一個方向轉；
 * 若直接把角度設回 0，轉盤會倒轉一整圈。
 */

/** 累計步數 → 目前正面是第幾張（往回轉成負數也對）。 */
export function frontIndex(turn: number, count: number): number {
  if (count <= 0) return 0;
  return ((turn % count) + count) % count;
}

/**
 * 從目前正面的 current 張轉到 target 張，走最近的方向要轉幾步。
 * 正數往下一位、負數往上一位；剛好轉半圈時往下一位。
 */
export function shortestStep(current: number, target: number, count: number): number {
  if (count <= 0) return 0;
  const forward = (((target - current) % count) + count) % count;
  return forward > count / 2 ? forward - count : forward;
}

/**
 * 轉盤半徑：讓相鄰兩張卡剛好不重疊，再多留一點間隔。
 *
 * 每張卡平平的貼在一個正 count 邊形的一邊上（卡面朝外），
 * 半徑是多邊形中心到邊的距離 r，邊長是 2r·tan(π/count)。
 * 讓邊長等於卡寬 → r = (卡寬 / 2) / tan(π/count)，再加一點間隔。
 */
export function ringRadius(cardWidth: number, count: number, gap = 12): number {
  if (count < 3) return cardWidth;
  return Math.round(cardWidth / 2 / Math.tan(Math.PI / count) + gap);
}
