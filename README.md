# 符文戰場資料庫 (Riftbound TW)

符文戰場（Riftbound）繁體中文玩家資源站。
第一階段：**起源系列（Origins）卡牌圖鑑**，共 376 張卡。

> 這是非商業同人專案，與 Riot Games 無隸屬關係。詳見頁尾聲明。

---

## 快速開始

需要 Node.js 20 以上。

```bash
npm install
```

```bash
npm run fetch:cards
```

```bash
npm run dev
```

開啟 http://localhost:3000

> ⚠️ 開發模式（`npm run dev`）的 CSP 是**放寬過的**，因為 Next.js 的熱重載需要 `eval`。
> 要驗證真正的安全設定，請用 `npm run build && npm start`。

---

## 常用指令

| 指令 | 用途 |
|---|---|
| `npm run fetch:cards` | 從 Riot 官方 API 重新抓取卡牌資料 |
| `npm run dev` | 開發伺服器（CSP 放寬） |
| `npm run build` | 正式版建置 |
| `npm start` | 啟動正式版伺服器（CSP 為嚴格版本） |
| `npm run verify` | 一次跑完：危險 API 檢查 → 型別 → Lint → 單元測試 → 建置 |
| `npx playwright test` | 端對端測試（安全標頭、CSP 攔截、功能、無障礙） |

---

## 資料從哪裡來

卡牌資料來自 **Riot 官方的公開內容 API**（就是官網卡牌圖鑑自己在用的那一支，
不需要金鑰，也不是爬蟲）：

```
https://content.publishing.riotgames.com/publishing-content/v2.0/public/channel/riftbound_website/list/riftbound_gallery_cards?locale=en_US&from=0&limit=200
```

`npm run fetch:cards` 會抓取、驗證、正規化之後寫成 `src/data/cards.origins.json`。
**網站執行期完全不會呼叫這支 API** —— 資料在建置時就打包進去了。
所以就算 Riot 那邊掛掉或改格式，已上線的網站照常運作。

卡圖不自行代管（避免 250MB 的圖片進版控），直接引用官方 CDN，
並利用它支援的即時轉檔參數取縮圖：`?w=420&fm=webp&q=78`。

### 三種語言，三個來源

| 語言 | 卡名／能力文字 | 卡面 | 來源 |
|---|---|---|---|
| English | ✅ 官方 | ✅ 官方 | Riot Games 全球官方 API |
| 简体中文 | ✅ 官方 | ✅ 官方 | 中國大陸官方發行商 API（Riot × 闪魂） |
| 繁體中文 | 卡名為官方譯名；能力文字為簡轉繁 | 使用英文或简中卡面 | 見下方說明 |

**繁中的情況要說清楚。** Riot 全球官網在所有語系（含 `zh_TW`）都只有英文卡名 ——
這點實測過。繁中版 2026-08-07 才在台灣上市，目前**沒有官方的線上繁中卡牌資料庫**。

因此繁中分成兩部分處理：

- **卡名**：整理自[符文戰場編年史 ChronicleCore](https://riftbound.chroniclecore.com/)
  公開頁面的 schema.org 結構化資料。那是台灣社群從官方實體卡整理出來的官方譯名。
  取用時只讀他們 robots.txt 允許、且列在自家 sitemap 的公開頁面
  （他們的 robots.txt 寫 `Disallow: /api/`，我們完全不碰），每次請求間隔 800ms，
  結果寫入 `src/data/zh-tw-names.json` 快取，之後的建置不會再次請求。
  **不引用他們的任何圖片**，卡圖全部來自官方 CDN。站上頁尾標明出處。
- **能力文字**：由官方简体中文逐字轉為繁體（用 `opencc-js`，僅建置期執行）。
  用詞未在地化，介面上會明確標示，不會假裝它是官方譯文。

**標籤、卡種、稀有度、領域、關鍵字**的繁中則是自己處理的：
英雄名取自 **Riot 官方 Data Dragon 的 `zh_TW` 語系**（例如 Heimerdinger = 漢默丁格），
地區名用《英雄聯盟》台服正式譯名（Piltover = 皮爾托福）。
每個譯名都在 `taxonomy.json` 標記 `official` 或 `converted`。

介面與卡面語言是**兩個獨立的設定**（`?lang=` 與 `?art=`）——
很多台灣玩家看繁中介面，但手上的實體卡是英文版。

搜尋會跨三種語言比對：打「阿璃」「阿狸」或「Ahri」都找得到同一張卡。

---

## 規則說明與關鍵字辭典（`/rules`）

關鍵字的說明**不是本站撰寫的**，而是由建置腳本從官方印在卡面上的提醒文字自動抽取
（例如 `[Reaction] (Play any time, even before spells and abilities resolve.)`）。
英文與简中都取自官方原文，繁中為官方简中的逐字轉繁。

這個設計是為了解決一個實際發生過的問題：開發時我手寫過一版關鍵字說明，
事後拿官方原文比對，**十五個裡有五個是錯的**（例如把 Shield 寫成「吸收傷害」，
官方其實是「防守方時 +1 力量」）。憑印象寫遊戲規則不可靠，所以改成機制上不可能寫錯。

抽取規則刻意嚴格：英文與简中的說明**必須來自同一張卡的同一個位置**。
先前版本讓兩種語言各自挑選，結果英文取到 `[Assault]`（+1）、简中取到 `{强攻2}`（+2），
兩邊在講不同的東西 —— 這種「看起來都對」的錯最難發現。

抓不到官方說明的關鍵字（目前只有 `Add`）會誠實標示為「官方卡面未提供」並指向官方規則書，
不會用手寫內容頂替。若**其他**關鍵字哪天也抓不到，建置會直接失敗。

規則頁本身只放「能標明出處的事實」與官方文件連結，不轉載官方規則書全文 ——
那既是版權問題，也是同人站最容易被要求下架的行為。

---

## 專案結構

```
scripts/
  fetch-cards.mjs            從官方 API 抓取 + 驗證 + 正規化
  lib/card-text-parser.mjs   ⭐ HTML → 安全 token 的解析器（最重要的資安元件）
  check-forbidden-apis.mjs   全域禁用 innerHTML / eval 等寫法
src/
  app/                       頁面（首頁、圖鑑、單卡頁）
  components/                UI 元件
  lib/
    security-headers.ts      ⭐ 所有安全標頭與 CSP 的單一事實來源
    types.ts                 卡牌型別與允許清單
    cards.ts                 資料存取
    search.ts                搜尋 / 篩選 / 排序
    filters-url.ts           篩選狀態 ⇄ 網址（含輸入驗證）
    labels.ts                中文標籤與暫譯
  middleware.ts              ⭐ 每次請求產生 CSP nonce
  data/                      建置產物（進版控，方便 diff 看官方改了什麼）
tests/
  unit/                      Vitest：解析器紅隊測試、資料完整性
  e2e/                       Playwright：安全標頭、CSP 攔截、功能、無障礙
```

---

## 文件

| 文件 | 內容 |
|---|---|
| **[PROGRESS.md](PROGRESS.md)** | 開發進度、踩過的坑、每個決策的理由（時間軸） |
| **[SECURITY.md](SECURITY.md)** | 資安威脅模型與每個防護的理由 |

---

## 資安

這個專案把資安當作第一優先。完整的威脅模型、每個決策的理由、
以及開發過程中遇到的真實取捨，都寫在 **[SECURITY.md](SECURITY.md)**；
開發過程的時間軸與踩坑紀錄在 **[PROGRESS.md](PROGRESS.md)**。

三個重點：

1. **官方回傳的 HTML 完全不進入專案。**
   建置階段就被拆成結構化 token，因此不需要 `dangerouslySetInnerHTML`，
   也不需要 HTML 消毒套件。15 種 XSS payload 的紅隊測試會驗證這道防線。

2. **CSP 沒有 `'unsafe-inline'`、`'unsafe-eval'`、`'unsafe-hashes'`。**
   採用每次請求隨機的 nonce + `strict-dynamic`。

3. **零第三方執行期腳本、零 cookie、零追蹤。**
   唯一的外部請求是兩個官方卡圖 CDN，且帶 `no-referrer`。
   端對端測試會斷言「除了這兩個官方來源之外，不對任何第三方發出請求」。

4. **CSP 在三種瀏覽器引擎上都實測過**（Chromium／WebKit 本機，Firefox 在 CI），
   而且測試本身也被驗證過會在該失敗的時候失敗。

---

## 後續規劃

| 階段 | 內容 |
|---|---|
| 2 | ~~規則說明、關鍵字辭典~~（已完成） |
| 3 | 牌組編輯器（含合法性檢查、匯出匯入） |
| 4 | 抽牌機率計算器、起手練習、開包模擬器 |
| 5 | ~~中英卡名對照表~~（已完成：三語切換） |
| 6 | 實體對戰輔助：計分板、戰績記錄、PWA 離線圖鑑 |
| 7 | 規則判例庫、errata 整理、Meta 資訊 |
| 8 | 帳號系統（OAuth）、牌組雲端儲存與社群推薦 |
| 9 | 規則引擎 → 復盤模擬 / 勝率分析 / 組牌建議 |
| 10 | 線上對戰（依當時法律情況再評估） |

---

## 授權與聲明

符文戰場資料庫 was created under Riot Games' "Legal Jibber Jabber" policy using
assets owned by Riot Games. Riot Games does not endorse or sponsor this project.

本專案為非商業同人作品。卡牌圖片與資料版權屬 Riot Games 所有。
