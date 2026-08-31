import { expect, type Locator, type Page } from '@playwright/test';

/**
 * 斷言某個屬性是「主機名稱剛好等於指定值」的 https 網址。
 *
 * ── 為什麼要有這個 helper ──────────────────────────────────────
 *
 * 原本這些測試是用正則式比對網址，例如：
 *
 *     await expect(link).toHaveAttribute('href', /cmsassets\.rgpub\.io.*\.pdf/)
 *
 * CodeQL 在 PR 上把它標為高風險並擋下合併，理由是「正則式沒有錨定位置」。
 * 那個判斷是對的：上面那條比對會讓
 *
 *     https://evil.example.com/?x=cmsassets.rgpub.io/a.pdf
 *
 * 也通過檢查 —— 惡意主機可以出現在它前面。
 *
 * 這幾條測試的用意正是「確認連結指向官方來源」。一條驗不出問題的資安測試
 * 比沒有測試更危險，因為它會讓人以為已經檢查過了。
 *
 * 所以改成把網址真正解析出來，逐項比對協定與主機名稱 ——
 * 這也更貼近我們真正想表達的意思。
 */
export async function expectOfficialUrl(
  locator: Locator,
  attribute: 'href' | 'src',
  expectedHost: string,
): Promise<URL> {
  const value = await locator.getAttribute(attribute);
  expect(value, `${attribute} 屬性應該存在`).toBeTruthy();

  let url: URL;
  try {
    url = new URL(value!);
  } catch {
    throw new Error(`${attribute} 不是合法的絕對網址："${value}"`);
  }

  expect(url.protocol, `${value} 應為 https`).toBe('https:');
  // 比對「完整主機名稱」而不是「包含某段字串」
  expect(url.hostname, `${value} 的主機名稱不符`).toBe(expectedHost);
  return url;
}

/**
 * 執行一個動作，等網址寫完之後回傳可分享的網址。
 *
 * ── 這個問題我解錯過三次，把過程寫下來 ────────────────────────
 * 本站把牌組與盤面編在網址裡，用 router.replace 寫回去 —— 那是非同步的，
 * 動作做完不代表網址已經寫好。太早複製會拿到少一步的舊網址。
 *
 * 第一次：「等網址跟動作前不一樣」。
 *   錯在**上一個動作還沒落地的寫入也算一次改變** —— 先匯入牌組再選戰場時，
 *   匯入那次的寫入可能較晚落地，被誤認成本次的改變。
 *
 * 第二次：在前面加「等網址穩定」。
 *   錯在我把「當下的網址」當成比較基準，第一次比較必然成立 ——
 *   那個等待其實一次都沒等過，只是看起來有。
 *
 * 第三次：「等網址出現某張卡的短代碼」。
 *   錯在同一個代碼會在編碼的**多個段落**出現（牌組、場上、休眠…），
 *   所以樣式在動作之前就已經成立。
 *
 * 現在的做法：
 *   1. 先跑動作，動作內部要斷言**畫面狀態已經定案**
 *   2. 再等網址連續數次讀到相同值（真的穩定）
 *
 * 狀態定案代表寫入已經排隊，接著等它落地即可 —— 不需要猜網址長什麼樣。
 */
export async function shareUrl(page: Page, action: () => Promise<void>): Promise<string> {
  await action();
  return settledUrl(page);
}

/**
 * 等網址連續三次讀到相同值。
 *
 * previous 一開始必須是 null：用「當下的網址」當初始值的話，
 * 第一次比較必然成立，等於沒等。
 */
async function settledUrl(page: Page): Promise<string> {
  let previous: string | null = null;
  let stableReads = 0;

  await expect
    .poll(
      () => {
        const now = page.url();
        stableReads = previous === now ? stableReads + 1 : 0;
        previous = now;
        return stableReads;
      },
      { intervals: [100, 100, 150, 150, 200, 200, 300, 300] },
    )
    .toBeGreaterThanOrEqual(3);

  return previous ?? page.url();
}
