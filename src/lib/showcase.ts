/**
 * 首頁傳奇展示台（3D 轉盤）的計算 —— 純函式，方便測試。
 *
 * 轉盤用一個「目前轉到幾度」的數字表示，會一直累加（可以超過 360、也可以是負數）：
 * 持續轉動時只要把角度往上加，畫面就一直往同一個方向轉，不會在一圈結束時倒轉回去。
 * 第 i 張卡放在 i × (360 ÷ 張數) 度的位置；角度等於那個值時，它就在正前方。
 */

/**
 * 展示台最多放幾張。
 *
 * 傳奇會隨著新系列一直變多（2026-10-13 收錄六個系列後是 57 位），全部擺上去
 * 會讓轉盤變成一條看不出內容的帶子，首頁也要多送 57 份能力文字給瀏覽器。
 * 固定張數、每次進站**隨機挑**：轉盤維持好看的密度，而且每次來看到的都不一樣。
 */
export const SHOWCASE_SIZE = 20;

/**
 * 每張卡停留在正前方的秒數。
 *
 * 速度**不能**用「每秒幾度」寫死：張數變多時每張卡佔的角度變小，
 * 同樣的度數就會讓卡片一張接一張閃過去 —— 使用者回饋「轉動太快」就是這個原因
 *（16 位時每 3.75 秒換一張，57 位時變成每 1 秒換一張）。
 * 改成以「每張幾秒」定速，再回推角速度，不論幾張卡感覺都一樣。
 *
 * 6 秒是這樣定出來的：改版前 16 位傳奇時是每 3.75 秒一張（當時沒有人反應太快），
 * 這裡再放慢一點。20 張 × 6 秒 = 轉一圈兩分鐘。要調整只改這一個數字。
 */
export const SECONDS_PER_CARD = 6;

/** 依張數算出角速度（度／秒）。張數越多轉越慢，每張卡露臉的時間固定。 */
export function speedDegPerSec(count: number): number {
  if (count <= 0) return 0;
  return 360 / (count * SECONDS_PER_CARD);
}

/**
 * 隨機挑出要放上展示台的傳奇。
 *
 * 用 Fisher–Yates 洗牌後取前 n 張：每一種組合的機率相同，而且不會挑到重複的卡。
 * `random` 可以注入，測試才驗得了「真的洗過」而不是靠運氣。
 *
 * ⚠️ 必須在**伺服器端**挑好再傳給元件：在瀏覽器端挑的話，
 * 伺服器產生的 HTML 與瀏覽器接手後算出來的會不一樣（hydration 不一致）。
 */
export function pickShowcase<T>(items: readonly T[], size = SHOWCASE_SIZE, random = Math.random): T[] {
  const pool = [...items];
  for (let i = pool.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [pool[i], pool[j]] = [pool[j]!, pool[i]!];
  }
  return pool.slice(0, Math.max(0, Math.min(size, pool.length)));
}

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
