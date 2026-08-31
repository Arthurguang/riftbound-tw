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
 * 執行一個會改變網址的動作，等網址**真的變了**之後回傳新網址。
 *
 * ── 為什麼不能直接 page.url() ──────────────────────────────────
 * 本站把牌組與盤面編在網址裡，用 router.replace 寫回去 —— 那是非同步的。
 * 動作做完不代表網址已經寫好，太早複製會拿到舊的一版，
 * 第二個分頁開起來就少了剛剛那步操作。
 *
 * ── 為什麼不能只用 toHaveURL 判斷 ──────────────────────────────
 * 如果網址在動作**之前**就已經符合要比對的樣式（例如先前的匯入已經
 * 寫入 `?b=b3`），那個斷言會立刻通過，一樣複製到舊值。
 * 這個坑實際發生過三次，其中一次是 CI 的 WebKit 才抓到。
 *
 * 所以正確的判斷是「網址跟動作前不一樣了」，而不是「網址長得像什麼」。
 */
export async function urlAfter(page: Page, action: () => Promise<void>): Promise<string> {
  const before = page.url();
  await action();
  await expect.poll(() => page.url()).not.toBe(before);
  return page.url();
}
