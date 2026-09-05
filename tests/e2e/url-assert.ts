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
 * 執行一個動作，等網址真的反映出目前狀態之後，回傳可分享的網址。
 *
 * ── 這個問題我解錯過四次，把過程留在這裡 ──────────────────────
 * 本站把牌組與盤面編在網址裡，用 router.replace 寫回去 —— 那是非同步的，
 * 動作做完不代表網址已經寫好。太早複製會拿到少一步的舊網址。
 *
 * 1. 「等網址跟動作前不一樣」
 *    錯在**上一個動作還沒落地的寫入也算一次改變**。
 * 2. 「先等網址穩定，再等它變」
 *    錯在我用當下的網址當比較基準，第一次比較必然成立 —— 等於沒等。
 * 3. 「等網址出現某張卡的短代碼」
 *    錯在同一個代碼會在編碼的多個段落出現，樣式在動作前就成立。
 * 4. 「動作後等網址連續三次讀到相同值」
 *    錯在**寫入還沒發生時，舊網址本來就是穩定的** —— 一樣會提早回傳。
 *
 * 前四次的共同毛病：都在**猜**網址應該長什麼樣、或什麼時候算好了。
 *
 * 現在的做法是讓程式自己說：元件把「目前狀態對應的編碼」放在
 * data-board-code / data-deck-code 屬性上，測試就等網址的查詢參數
 * **剛好等於那個值**。沒有猜測、沒有時序假設。
 *
 * @param attribute 元件公布編碼的屬性名，例如 data-board-code
 * @param param 網址上對應的查詢參數名，例如 b
 */
export async function shareUrl(
  page: Page,
  attribute: string,
  param: string,
  action: () => Promise<void>,
): Promise<string> {
  await action();

  /*
   * 逾時放寬到 15 秒。
   *
   * 預設的 5 秒在單引擎下綽綽有餘，但三種引擎並跑時伺服器負載高，
   * router.replace 有時要等更久 —— 那不是壞掉，只是慢。
   * 條件本身沒有放寬：仍然要求網址**完全等於**元件公布的編碼。
   */
  await expect
    .poll(
      async () => {
        const expected = await page.locator(`[${attribute}]`).getAttribute(attribute);
        const actual = new URL(page.url()).searchParams.get(param);
        return expected !== null && actual === expected;
      },
      { timeout: 15_000 },
    )
    .toBe(true);

  return page.url();
}
