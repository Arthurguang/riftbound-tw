/**
 * 首頁主視覺：幾張傳奇卡扇形展開，後面有餘燼的光暈。
 *
 * ── 為什麼加 ────────────────────────────────────────────────────
 * Tuch 等（2012）：最被覺得好看的網站是「視覺簡潔＋符合同類網站的典型樣子」，
 * 而且這個判斷在 50 毫秒內就形成。卡牌遊戲網站的典型樣子是一眼就看到卡 ——
 * 原本首頁右半邊只有一片空白。遊戲網站的設計實務也建議第一層要有主視覺當焦點。
 *
 * 挑哪幾張由資料決定（showcaseLegends：盡量涵蓋六個領域的顏色），不寫死。
 *
 * ── 純裝飾 ──────────────────────────────────────────────────────
 * 同樣的傳奇在下方的傳奇列都可以點，這裡不重複連結，也對螢幕報讀器隱藏。
 * 位置與角度全部用 class，不用 style 屬性（本站 CSP 不允許）。
 */

export type FanCard = { id: string; image: string };

/**
 * 由左到右五個位置：外側較低、角度較大，中間那張最高、疊在最上面。
 *
 * 以中間那張（寬 30%、left 35%）為軸左右對稱。卡片以底部為軸旋轉，
 * 上緣會往外甩出約「寬度 × 高寬比 × sin(角度)」—— 外側 11° 約多出 7%，
 * 所以最外兩張放在 8% 與 62%，轉完剛好還在欄位裡，不會被視窗切掉。
 */
const SLOTS = [
  'left-[8%] top-10 -rotate-[11deg] z-0',
  'left-[21%] top-4 -rotate-[5deg] z-10',
  'left-[35%] top-0 rotate-0 z-30',
  'left-[49%] top-4 rotate-[5deg] z-20',
  'left-[62%] top-10 rotate-[11deg] z-0',
];

export function HeroCardFan({ cards }: { cards: FanCard[] }) {
  return (
    <div
      aria-hidden="true"
      className="relative hidden h-[360px] md:block lg:h-[430px]"
      data-testid="hero-card-fan"
    >
      <div className="hero-ember-glow absolute -inset-[8%]" />
      {cards.slice(0, SLOTS.length).map((card, index) => (
        <img
          key={card.id}
          src={card.image}
          alt=""
          loading="eager"
          referrerPolicy="no-referrer"
          className={`card-frame--portrait absolute w-[30%] origin-bottom rounded-xl object-cover shadow-[0_24px_48px_-16px_rgba(0,0,0,0.9)] ring-1 ring-white/10 ${SLOTS[index] ?? ''}`}
        />
      ))}
    </div>
  );
}
