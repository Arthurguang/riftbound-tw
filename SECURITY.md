# 資安設計說明

這份文件記錄本專案「為什麼這樣做」，而不只是「做了什麼」。
半年後你回來看程式碼時，會需要這些理由。

---

## 一、威脅模型（第一階段）

第一階段是一個**唯讀的卡牌圖鑑**。先弄清楚有什麼、沒有什麼：

| 一般網站有的東西 | 本站 | 因此不存在的風險 |
|---|---|---|
| 資料庫 | ❌ 沒有 | SQL injection |
| 帳號 / 登入 | ❌ 沒有 | 帳號被盜、session 劫持、權限繞過 |
| Cookie / session | ❌ 沒有 | CSRF、session fixation |
| 使用者輸入送到伺服器 | ❌ 沒有 | 伺服器端注入、SSRF |
| 使用者產生的內容 | ❌ 沒有 | 儲存型 XSS |
| 檔案上傳 | ❌ 沒有 | 惡意檔案上傳 |
| 第三方執行期腳本 | ❌ 沒有 | 供應鏈注入、追蹤 |

**OWASP Top 10 裡有一大半在這個架構下根本不適用。**

剩下真正需要防的只有兩件事：

### 威脅 A：上游資料被污染

卡牌資料來自三個上游：Riot 全球官方 API、中國大陸官方發行商 API，
以及一個台灣社群站的公開頁面（僅取繁中卡名）。
任何一邊被入侵、或傳輸過程被竄改，惡意內容都會流進我們的建置流程。
社群站那一路特別值得注意 —— 它不是官方來源，防護等級未知。

**這是本階段最主要的威脅，因為它是唯一「不受我們控制的輸入」。**

### 威脅 B：前端被注入腳本

即使目前沒有明顯的注入點，仍要有第二道防線 ——
因為第八階段加入帳號與使用者內容後，這道防線會變得不可或缺。

---

## 二、對應的防護措施

### 針對威脅 A：建置階段的 fail-closed 資料管線

`scripts/fetch-cards.mjs` + `scripts/lib/card-text-parser.mjs`

1. **逐欄位白名單驗證**
   卡種、稀有度、領域、版式、系列 —— 每個列舉值都比對允許清單。
   出現清單外的值 → **建置失敗**。

2. **卡圖網址必須是官方 CDN 的 https 位址**
   寫死 `cmsassets.rgpub.io`。若上游把網址換成別的網域 → **建置失敗**。
   （這擋掉「把使用者導向惡意網站」這條路。）

3. **HTML 完全不進入專案**
   官方能力文字是 HTML 字串。解析器把它拆成結構化 token
   （`text` / `break` / `glyph` / `keyword`），前端只渲染 token。

   解析器只認四種標籤：`<p>` `<br>` `<ul>` `<li>`
   （已盤點全部 376 張卡，官方實際只用到這四種）。
   切開 `<br>` 之後，任何殘留的 `<` 或 `>` 一律視為攻擊 → **建置失敗**。

   **因此本專案完全不需要 `dangerouslySetInnerHTML`，也不需要任何 HTML 消毒套件。**
   最危險的東西根本沒有機會進到程式碼裡。

4. **符號與關鍵字也走白名單**
   15 個符號、15 個關鍵字。官方新增用法 → **建置失敗**（我們會立刻知道，而不是默默漏掉）。

5. **張數對帳**
   OGN 必須是 352 張、OGS 必須是 24 張。對不上 → **建置失敗**。

6. **下載的 SVG 圖示做內容檢查**
   拒絕含有 `<script>`、`on*=` 事件屬性、`javascript:` 的 SVG。

7. **中文資料一樣走同一套防線**
   官方简中的能力文字是純文字加 `{{token}}` 標記，解析器（`cn-text-parser.mjs`）
   同樣是 fail-closed：出現角括號、或出現允許清單外的 token，一律**建置失敗**。
   簡中的顏色／卡種／稀有度也會與英文版**交叉比對**，對不上就中斷 ——
   這讓對照表不可能悄悄失準。

8. **從社群站只取「卡名」這一個欄位**
   而且只從 schema.org 的 JSON-LD 讀取、只接受純文字、出現角括號就拒絕。
   不取他們的圖片，也不碰他們 robots.txt 標為 `Disallow` 的 `/api/`。
   取得的資料寫入版控快取，可以直接 diff 檢查內容。

> 這一整套的意義是：**就算 Riot 的 CMS 哪天被入侵，我們的建置會壞掉，網站不會帶毒上線。**
> `tests/unit/card-text-parser.test.ts` 用 15 種真實 XSS payload 驗證這件事。

### 針對威脅 B：嚴格的 Content-Security-Policy

`src/lib/security-headers.ts` + `src/middleware.ts`

```
default-src 'self';
script-src  'self' 'nonce-<每次請求隨機>' 'strict-dynamic';
style-src   'self' 'nonce-<每次請求隨機>';
img-src     'self' https://cmsassets.rgpub.io https://cdn.playloltcg.com data:;
connect-src 'self';
frame-ancestors 'none';  base-uri 'none';  form-action 'none';
object-src 'none';  frame-src 'none';  media-src 'none';
upgrade-insecure-requests
```

**沒有 `'unsafe-inline'`，沒有 `'unsafe-eval'`，沒有 `'unsafe-hashes'`。**
這三個是 Google CSP Evaluator 會標為高風險的寫法。

其餘標頭見 `src/lib/security-headers.ts`（每一項都有註解說明用途）。

---

## 三、開發過程中遇到的真實取捨（重要）

### 靜態產生 vs. nonce-based CSP：兩者不能並存

原本的計畫是「全站靜態產生」——建置時就把 HTML 寫死，執行期沒有伺服器邏輯，
攻擊面最小。

**但實測發現：這與 nonce-based CSP 直接衝突。**

nonce 必須「每次請求都不同」才有意義（攻擊者猜不到，所以注入的腳本無法執行）。
可是靜態 HTML 是建置時就產生的，裡面不可能有當次請求的 nonce ——
結果就是所有腳本都被自己的 CSP 擋掉，整站失效。
（這在開發時實際發生過，瀏覽器 console 顯示 8 支腳本全被擋。）

只有兩條路：

| 方案 | 結果 |
|---|---|
| 保持靜態，把 `script-src` 放寬成 `'unsafe-inline'` | CSP 形同虛設，CSP Evaluator 判定高風險 |
| 改為動態渲染，讓 nonce 生效 | 保住嚴格 CSP，代價是每次請求都要渲染 |

**選了後者。** 理由：

- 本站沒有資料庫、沒有外部 API 呼叫，渲染只是把已經打包在程式裡的 JSON 轉成 HTML，
  沒有任何 I/O，成本極低。
- 伺服器唯一接收的使用者輸入是「網址路徑」，而它只會被拿去查一張建置時就固定好的表
  （`src/lib/cards.ts` 的 `getCardById`），查不到就 404。
  沒有任何字串會被當成查詢條件或程式碼使用。
- 第八階段加入使用者內容後，嚴格 CSP 會從「錦上添花」變成「必需品」。
  現在就把它做對，比之後再補容易得多。

實作位置：`src/app/layout.tsx` 的 `await headers()`。

### style 屬性也被 CSP 擋 —— 改程式碼，不放寬 CSP

CSP 規格中 **nonce 對 `style="..."` 屬性無效**，所以 `style-src 'self'` 會擋掉所有行內樣式。

原本元件裡用了 `style={{ backgroundColor: ... }}` 來畫領域顏色，全被擋下。

**處理方式是把樣式搬進 `globals.css` 變成 class，而不是加 `'unsafe-inline'`。**
（見 `globals.css` 的 `.domain-dot--*` 與 `.card-frame--*`。）

> 這是最容易自我破壞的時刻：看到 CSP 報錯就去放寬 CSP。
> 原則是反過來的 —— **CSP 報錯代表程式碼有問題，要修的是程式碼。**

---

## 四、隱私

- **零第三方執行期腳本**：沒有 Google Analytics、沒有廣告、沒有 CDN 載入的函式庫。
- **不使用 next/font 或 Google Fonts**：那會讓每位訪客被 Google 記錄一次 IP。改用系統字型。
- **不設定任何 cookie**，不使用 localStorage 存個資。
- **卡圖 `<img>` 加 `referrerPolicy="no-referrer"`**：CDN 拿不到使用者在看哪一頁。
- **Next.js 遙測已關閉**（`npx next telemetry disable`）。
- 唯一的外部請求是卡圖，來自兩個**官方** CDN：
  `cmsassets.rgpub.io`（Riot 全球）與 `cdn.playloltcg.com`（中國大陸官方發行商）。
  **不引用任何第三方社群站台的圖片** —— 繁中卡名雖然整理自社群站，
  但那只是建置階段抓一次的文字，執行期不會連到那裡。
  `tests/e2e/security.spec.ts` 會跑遍三種語言與兩種卡面，
  斷言「除了這兩個官方來源之外沒有任何第三方請求」。

---

## 五、如何驗證（不要只相信這份文件）

```bash
npm run verify
```

這一行會依序跑：危險 API 檢查 → 型別檢查 → Lint → 單元測試 → 建置。
端對端測試另外跑：

```bash
npx playwright test
```

### 各層測試在驗證什麼

| 檔案 | 驗證內容 |
|---|---|
| `tests/unit/card-text-parser.test.ts` | **紅隊測試**：15 種 XSS payload 必須讓解析器爆炸 |
| `tests/unit/card-data.test.ts` | 產出的 JSON 沒有任何 HTML 殘留，列舉值都在白名單內 |
| `tests/e2e/security.spec.ts` | 實際回應的每一個安全標頭、CSP 的真實攔截能力、隱私 |
| `tests/e2e/gallery.spec.ts` | 搜尋、篩選、排序、單卡頁、無障礙、行動版 |
| `scripts/check-forbidden-apis.mjs` | 全域禁用 `innerHTML` / `eval` / `dangerouslySetInnerHTML` 等寫法 |

### 怎麼「真的」驗證 CSP（測試方法本身的陷阱）

一開始我用 Playwright 的 `page.evaluate()` 去測 CSP，結果全部測不準 ——
測出來的是「CSP 擋不住任何東西」，但那是假的。

**原因**：`page.evaluate()` 是透過 Chrome 開發者工具的通道把程式碼送進頁面，
而開發者工具本來就被設計成可以無視 CSP（否則工程師在 Console 裡什麼都做不了）。
用那個管道測 CSP，測到的是「後門裡的世界」，不是真實訪客看到的世界。

**正確做法**（`injectIntoHtml`）：攔截伺服器回傳的 HTML，
把測試用的 `<script>` 塞進網頁原始碼裡，讓瀏覽器自己的 HTML 解析器去處理 ——
這跟真實 XSS 走的是完全同一條路徑。同時從 CSP 回應標頭讀出這次的 nonce，
就能同時放入「有 nonce 的對照組」與「沒有 nonce 的攻擊組」。

因此有兩個關鍵測試：

1. **模擬真實 XSS**：注入兩支腳本，帶 nonce 的必須執行、不帶的必須被擋。
   對照組不只是裝飾 —— 它證明「注入機制本身有效」，
   否則萬一 HTML 替換失敗，攻擊那條會因為根本沒被注入而**假性通過**。
2. **eval 封鎖**：用帶 nonce 的合法腳本呼叫 `eval` 與 `new Function`，
   兩者都必須拋出例外。這是頁面自身腳本的真實處境。

### 跨瀏覽器：不要只相信一個引擎

CSP 的保證有一部分來自「瀏覽器有正確實作規格」。與其相信，不如三個引擎都實測：

| 引擎 | 涵蓋 | 狀態 |
|---|---|---|
| Chromium | Chrome / Edge / Opera / 多數 Android 瀏覽器 | 本機 + CI |
| WebKit | Safari（macOS 與**所有** iOS 瀏覽器） | 本機 + CI |
| Firefox | Gecko —— 唯一與另外兩者血緣獨立的實作 | CI（Linux） |

> Firefox 預設不在本機跑：Playwright 內附的 Firefox 在部分 Windows 環境無法啟動
> （缺它自己的 mozglue 組件清單，與本專案無關）。讓本機測試永遠是紅的，
> 只會讓人開始忽略測試結果。本機要一起跑：`ALL_BROWSERS=1 npx playwright test`。

跨瀏覽器測試也確實抓到了一個真問題：**`upgrade-insecure-requests`**。
WebKit 會把 `http://localhost` 的子資源也升級成 `https://`（Chromium 對 localhost 有豁免），
導致本機的 CSS 與 JS 全部載入失敗。
處理方式是「只在連線本身就是 https 時才送這條」——
正式環境照常生效，本機測試則能得到正確結果。

### 測試本身也要被測試

上面兩個測試通過之後，我把 `script-src` 故意改成
`'unsafe-inline' 'unsafe-eval'`、重新建置、再跑一次 —— **7 個測試立刻變紅**
（包含這兩個新測試）。

這一步很重要：**「測試通過」本身沒有意義，除非你確認過它在該失敗的時候會失敗。**
以後若要改動 CSP，建議重做一次這個確認。

### 部署後的外部驗證

貼上網址就能跑，全部免費：

| 服務 | 目標 |
|---|---|
| securityheaders.com | A+ |
| developer.mozilla.org/en-US/observatory | A+ |
| **csp-evaluator.withgoogle.com** | 零 High severity（會抓出 CSP 有沒有可繞過的漏洞） |
| ssllabs.com/ssltest | A+ |

> 對照：官方網站 playriftbound.com 只有 HSTS、nosniff、Referrer-Policy 三項，
> **沒有 CSP**，因此拿不到 A+。

---

## 六、未來階段必須遵守的原則

當專案長出後端與使用者資料時，上面的架構優勢會消失。屆時：

1. **絕不自己存密碼。** 用 OAuth（Google 登入）把身分驗證委外。
   自建密碼儲存是新手最容易做錯、後果也最嚴重的一件事。

2. **使用者輸入一律以純文字儲存**，輸出交給 React 自動跳脫。
   永遠不要為了「支援粗體」而引入 HTML —— 要富文本就用 Markdown 並在伺服器端轉成結構化資料，
   沿用本專案卡牌文字的同一套思路。

3. **牌組分享用不可預測的 ID**（nanoid / UUIDv4），
   而且**伺服器端每次都要檢查授權**。
   「網址猜不到」不是授權（這是 IDOR，最常見也最容易被漏掉的漏洞）。

4. **所有 API 輸入用 schema 驗證 + rate limiting**；資料庫一律用參數化查詢或 ORM。

5. **對戰功能：伺服器權威狀態。**
   **絕對不要把對手的手牌傳到客戶端** —— 前端加密沒有用，因為金鑰也在前端。
   這要用自動化測試釘死：斷言送出的封包裡不含對手的手牌內容。

6. **每加一個功能，先更新這份文件的威脅模型。**
   功能會改變攻擊面，文件沒跟上就等於沒有威脅模型。

---

## 七、回報安全問題

如果你在這個專案發現安全問題，請直接開 issue 或私訊聯絡，
不要公開揭露細節。
