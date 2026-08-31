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
 * 執行一個動作，等網址裡**出現指定的內容**之後回傳網址。
 *
 * ── 為什麼是比對內容，不是偵測「變了沒」──────────────────────
 * 本站把牌組與盤面編在網址裡，用 router.replace 寫回去 —— 那是非同步的。
 *
 * 第一版是「記下動作前的網址，等它變得不一樣」。那個做法有個致命缺陷：
 * **上一個動作還沒落地的寫入也算一次改變**。例如先匯入牌組再選戰場，
 * 匯入那次的寫入可能在選完戰場之後才落地，於是函式以為「我這次的改變到了」，
 * 回傳一個只有牌組、沒有戰場的網址。
 *
 * 我還為此加過一個「等網址穩定」的前置步驟，但那只是把窗口變窄 ——
 * 在 CI 的負載下照樣會在兩次寫入之間的空檔誤判為穩定。
 *
 * 正確的做法是**斷言網址裡確實有我剛設定的那個東西**。
 * 那是明確的內容判斷，跟時序無關，也不會被別的寫入騙過去。
 *
 * @param expected 網址裡應該要出現的內容，通常是卡片的短代碼（例如 ogn275）
 */
export async function urlContaining(
  page: Page,
  expected: RegExp,
  action: () => Promise<void>,
): Promise<string> {
  await action();
  await expect(page).toHaveURL(expected);
  return page.url();
}
