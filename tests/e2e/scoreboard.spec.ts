import { expect, test, type Page } from '@playwright/test';

/**
 * 手機計分板。
 *
 * 這一頁是給「手機放在桌上、兩個人面對面打牌」用的，所以測的是那個情境會踩到的事：
 *   · 整塊面板就是加分鈕，手指隨便拍都要加得到
 *   · 分數不會跑掉（不會變負數、重新整理不會不見）
 *   · 按錯有得救（復原），而「開新的一局」要再確認才會清掉
 *   · 達到勝利分數只標示，不宣告誰贏 —— 本站不判定勝負
 */

/** 開啟並等瀏覽器接手（伺服器端沒有 localStorage，接手後分數才是對的）。 */
const gotoScore = async (page: Page) => {
  await page.goto('/score', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('[data-scoreboard-ready="true"]')).toBeVisible();
};

const side = (page: Page, which: 'a' | 'b') => page.getByTestId(`side-${which}`);
const scoreOf = async (page: Page, which: 'a' | 'b') =>
  Number(await side(page, which).getAttribute('data-score'));

/** 乾淨的開始：每條測試都不受上一條留下的存檔影響。 */
test.beforeEach(async ({ page }) => {
  await page.goto('/score', { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => window.localStorage.clear());
});

test.describe('計分板', () => {
  test('整塊面板就是加分，另一方不受影響', async ({ page }) => {
    await gotoScore(page);
    await side(page, 'a').getByRole('button', { name: /加 1 分/ }).click();
    await side(page, 'a').getByRole('button', { name: /加 1 分/ }).click();

    expect(await scoreOf(page, 'a')).toBe(2);
    expect(await scoreOf(page, 'b')).toBe(0);
  });

  test('分數不會變負數 —— 0 分時減分鈕是停用的', async ({ page }) => {
    await gotoScore(page);
    await expect(page.getByTestId('minus-a')).toBeDisabled();

    await side(page, 'a').getByRole('button', { name: /加 1 分/ }).click();
    await expect(page.getByTestId('minus-a')).toBeEnabled();
    await page.getByTestId('minus-a').click();
    expect(await scoreOf(page, 'a')).toBe(0);
    await expect(page.getByTestId('minus-a')).toBeDisabled();
  });

  test('重新整理分數還在 —— 手機被鎖起來不會白記', async ({ page }) => {
    await gotoScore(page);
    for (let i = 0; i < 3; i += 1) {
      await side(page, 'a').getByRole('button', { name: /加 1 分/ }).click();
    }
    await expect(side(page, 'a')).toHaveAttribute('data-score', '3');

    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(page.locator('[data-scoreboard-ready="true"]')).toBeVisible();
    await expect(side(page, 'a')).toHaveAttribute('data-score', '3');
  });

  test('按錯有得救：復原回到上一步', async ({ page }) => {
    await gotoScore(page);
    await expect(page.getByTestId('undo')).toBeDisabled();

    await side(page, 'a').getByRole('button', { name: /加 1 分/ }).click();
    await side(page, 'a').getByRole('button', { name: /加 1 分/ }).click();
    await expect(side(page, 'a')).toHaveAttribute('data-score', '2');

    await page.getByTestId('undo').click();
    await expect(side(page, 'a')).toHaveAttribute('data-score', '1');
    // 只留一步 —— 復原之後就不能再復原
    await expect(page.getByTestId('undo')).toBeDisabled();
  });

  /*
   * 達到勝利分數只標示，不宣告誰贏，而且**還是能繼續加減** ——
   * 記錯了要改得回來。判定勝負需要規則引擎，本站不做。
   */
  test('達到勝利分數只標示，不宣告勝負，也不鎖住', async ({ page }) => {
    await gotoScore(page);
    const add = side(page, 'a').getByRole('button', { name: /加 1 分/ });
    for (let i = 0; i < 8; i += 1) await add.click();

    await expect(side(page, 'a')).toHaveAttribute('data-reached', 'true');
    await expect(side(page, 'a')).toContainText('已達 8 分');
    await expect(page.getByText('本站只負責記分，不判定勝負')).toBeVisible();
    // 沒有任何「獲勝」「你贏了」之類的字
    await expect(page.locator('main')).not.toContainText('獲勝了');

    await add.click();
    await expect(side(page, 'a')).toHaveAttribute('data-score', '9');
  });

  test('換成 11 分制，8 分就不算達標', async ({ page }) => {
    await gotoScore(page);
    await page.getByRole('button', { name: '11', exact: true }).click();
    const add = side(page, 'a').getByRole('button', { name: /加 1 分/ });
    for (let i = 0; i < 8; i += 1) await add.click();

    await expect(side(page, 'a')).toHaveAttribute('data-reached', 'false');
    for (let i = 0; i < 3; i += 1) await add.click();
    await expect(side(page, 'a')).toHaveAttribute('data-reached', 'true');
  });

  test('回合可以前進後退，但沒有第 0 回合', async ({ page }) => {
    await gotoScore(page);
    await expect(page.getByTestId('round')).toHaveAttribute('data-round', '1');
    await expect(page.getByRole('button', { name: '上一回合' })).toBeDisabled();

    await page.getByRole('button', { name: '下一回合' }).click();
    await expect(page.getByTestId('round')).toHaveAttribute('data-round', '2');
    await page.getByRole('button', { name: '上一回合' }).click();
    await expect(page.getByTestId('round')).toHaveAttribute('data-round', '1');
  });

  test('對坐模式把上面那一側轉 180 度', async ({ page }) => {
    await gotoScore(page);
    const toggle = page.getByTestId('facing-toggle');
    await expect(toggle).toHaveAttribute('aria-pressed', 'false');

    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-pressed', 'true');
    await expect(side(page, 'a')).toHaveClass(/rotate-180/);
    await expect(side(page, 'b')).not.toHaveClass(/rotate-180/);
  });

  /*
   * 「開新的一局」會毀掉整局紀錄，所以一定要再確認。
   * 這條同時確認：取消就真的什麼都不動。
   */
  test('開新的一局要再確認，取消就不動', async ({ page }) => {
    await gotoScore(page);
    await side(page, 'a').getByRole('button', { name: /加 1 分/ }).click();

    page.once('dialog', (dialog) => void dialog.dismiss());
    await page.getByTestId('new-game').click();
    await expect(side(page, 'a')).toHaveAttribute('data-score', '1');

    page.once('dialog', (dialog) => void dialog.accept());
    await page.getByTestId('new-game').click();
    await expect(side(page, 'a')).toHaveAttribute('data-score', '0');
  });

  test('三種語言都顯示得出來', async ({ page }) => {
    await page.goto('/score?lang=en', { waitUntil: 'domcontentloaded' });
    await expect(page.getByTestId('side-a')).toContainText('Player 1');
    await expect(page.getByRole('button', { name: 'New game' })).toBeVisible();

    await page.goto('/score?lang=zh-CN', { waitUntil: 'domcontentloaded' });
    await expect(page.getByTestId('side-a')).toContainText('玩家一');
    await expect(page.getByRole('button', { name: '开新的一局' })).toBeVisible();
  });

  test('手機尺寸下不會出現橫向捲軸', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await gotoScore(page);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
  });
});
