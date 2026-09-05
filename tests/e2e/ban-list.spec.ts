import { expect, test, type Page } from '@playwright/test';

/**
 * 禁卡標示的端對端驗證。
 *
 * 這個功能的價值在於「使用者真的看得到」，所以重點放在畫面上有沒有出現，
 * 而不是函式回傳什麼（那已經有單元測試涵蓋）。
 *
 * 另外特別驗兩件容易做錯、而且做錯會誤導使用者的事：
 *   · 只在 2v2 被禁的卡，不能標成「禁用」（1v1 可以用）
 *   · 官方寫法與實際卡名不同時，要把官方原文一起顯示出來
 */

const DREAMING_TREE = '/cards/ogn-292-298'; // 官方寫「Dreaming Tree」，實際叫 The Dreaming Tree
const WUJU = '/cards/ogs-019-024'; // 只在 2v2 被禁
const CLEAN = '/cards/ogn-278-298'; // Bandle Tree，沒被禁的戰場

async function gotoDeck(page: Page) {
  await page.goto('/deck', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('[data-deck-ready="true"]')).toBeAttached();
}

test.describe('圖鑑的禁卡標示', () => {
  test('被禁的卡會標示，並附上官方原文與版本日期', async ({ page }) => {
    await page.goto(DREAMING_TREE, { waitUntil: 'domcontentloaded' });

    const notice = page.getByTestId('ban-notice');
    await expect(notice).toBeVisible();
    await expect(notice).toContainText('正式賽事構築禁用');
    // 官方禁卡表少了開頭的 The —— 要讓使用者對得到官方公告
    await expect(notice).toContainText('Dreaming Tree');
    await expect(notice).toContainText('2026-07-16');

    const link = notice.getByRole('link', { name: '官方公告' });
    await expect(link).toHaveAttribute('href', 'https://playriftbound.com/en-us/rules-hub/');
    await expect(link).toHaveAttribute('rel', /noopener/);
  });

  /*
   * 網格瀏覽時就要看得到 —— 使用者挑戰場的時候是在列表上挑的，
   * 等他點進詳細頁才知道不能用就太晚了。
   *
   * 數量寫死 5 是刻意的：官方 2026-07-16 版禁了剛好 5 張戰場。
   * 哪天禁卡表更新而這裡沒跟著改，這條會紅燈提醒。
   */
  test('網格上標出全部 5 張禁用戰場', async ({ page }) => {
    await page.goto('/cards?type=battlefield', { waitUntil: 'domcontentloaded' });
    const badges = page.getByTestId('tile-ban');
    await expect(badges).toHaveCount(5);
    await expect(badges.first()).toHaveAttribute('title', /正式賽事構築禁用/);
  });

  test('沒被禁的卡不會出現標示', async ({ page }) => {
    await page.goto(CLEAN, { waitUntil: 'domcontentloaded' });
    await expect(page.getByTestId('ban-notice')).toHaveCount(0);
  });

  /*
   * 官方公告特別說明過，這張傳奇在 1v1 的表現是合理的，只在 2v2 被禁。
   * 標成「禁用」會害使用者刪掉一張其實能用的卡 —— 那比漏標還糟。
   */
  test('只在 2v2 被禁的卡，要講清楚 1v1 可用', async ({ page }) => {
    await page.goto(WUJU, { waitUntil: 'domcontentloaded' });

    const notice = page.getByTestId('ban-notice');
    await expect(notice).toBeVisible();
    await expect(notice).toContainText('2v2');
    await expect(notice).toContainText('1v1 可用');
    await expect(notice).not.toContainText('正式賽事構築禁用');
  });
});

test.describe('牌組編輯器的禁卡提醒', () => {
  test('組進禁用戰場會跳提醒，但不算違規', async ({ page }) => {
    await gotoDeck(page);
    await page.getByRole('button', { name: /^匯入牌組/ }).click();
    await page.getByLabel('牌表內容').fill(['Battlefields:', '1 The Dreaming Tree'].join('\n'));
    await page.getByRole('button', { name: '檢查' }).click();
    await page.getByRole('button', { name: /^匯入 1 種卡$/ }).click();

    const legality = page.getByTestId('legality-issues');
    await expect(legality).toContainText('The Dreaming Tree');
    await expect(legality).toContainText('禁用');
    // 提醒會標上禁卡表版本，使用者才知道依據哪一版
    await expect(legality).toContainText('禁卡表 2026-07-16');
  });

  test('沒放禁卡就不會冒出禁卡提醒', async ({ page }) => {
    await gotoDeck(page);
    await page.getByRole('button', { name: /^匯入牌組/ }).click();
    await page.getByLabel('牌表內容').fill(['Battlefields:', '1 Bandle Tree'].join('\n'));
    await page.getByRole('button', { name: '檢查' }).click();
    await page.getByRole('button', { name: /^匯入 1 種卡$/ }).click();

    /*
     * 只看問題清單，不看整個區塊 —— 「禁卡表」三個字本來就出現在下方
     * 永遠存在的說明文字裡（那段是刻意要讓使用者知道檢查涵蓋範圍的）。
     * 對整個區塊斷言會抓到那段，變成一條永遠失敗的測試。
     */
    await expect(page.getByTestId('legality-issues')).not.toContainText('禁卡表');
  });

  test('說明文字有跟著更新 —— 不能還寫著「不包含禁卡表」', async ({ page }) => {
    await gotoDeck(page);
    const details = page.getByText('這個檢查涵蓋什麼、不涵蓋什麼');
    await details.click();

    const panel = page.getByTestId('deck-legality');
    await expect(panel).toContainText('禁卡表');
    await expect(panel).toContainText('人工維護');
    await expect(panel).not.toContainText('不包含賽制規定');
  });
});
