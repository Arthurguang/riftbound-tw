/**
 * 首頁傳奇展示台（3D 轉盤）的計算 —— 純函式，方便測試。
 *
 * 轉盤用一個「目前轉到幾度」的數字表示，會一直累加（可以超過 360、也可以是負數）：
 * 持續轉動時只要把角度往上加，畫面就一直往同一個方向轉，不會在一圈結束時倒轉回去。
 * 第 i 張卡放在 i × (360 ÷ 張數) 度的位置；角度等於那個值時，它就在正前方。
 */

/** 轉盤轉到 angle 度時，正前方是第幾張（最接近正面的那張）。 */
export function frontFromAngle(angle: number, count: number): number {
  if (count <= 0) return 0;
  const index = Math.round(angle / (360 / count));
  return ((index % count) + count) % count;
}

/** 放開拖曳時，對齊到最近的一張卡。 */
export function snapAngle(angle: number, count: number): number {
  if (count <= 0) return angle;
  const step = 360 / count;
  return Math.round(angle / step) * step;
}

/**
 * 從目前的角度轉到第 index 張：回傳目標角度，走最近的方向。
 * （例如目前 350 度、要轉到第 0 張，目標是 360 而不是 0，才不會倒轉一整圈。）
 */
export function angleForIndex(current: number, index: number, count: number): number {
  if (count <= 0) return current;
  const base = index * (360 / count);
  return base + 360 * Math.round((current - base) / 360);
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
