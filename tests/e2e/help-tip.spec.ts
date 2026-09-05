import { expect, test, type Page } from '@playwright/test';

/**
 * 說明改成問號按鈕。
 *
 * 側欄每一塊功能底下原本都跟著一段規則說明。內容有價值，但**只有第一次需要讀**，
 * 之後每次都佔位置 —— 使用者反映「最上面四個按鈕的區塊太小了」。
 *
 * 這裡測三件事，第三件是這次真正踩到的坑。
 */

async function gotoReplay(page: Page) {
  await page.goto('/replay', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('[data-replay-ready="true"]')).toBeAttached();
}

test.describe('問號說明', () => {
  test('預設收起來 —— 這就是這次改動的目的', async ({ page }) => {
    await gotoReplay(page);
    await expect(page.getByTestId('help-tip-panel')).toHaveCount(0);
    await expect(page.getByRole('button', { name: '戰力加成的說明' })).toBeVisible();
  });

  test('點了才展開，再點收起', async ({ page }) => {
    await gotoReplay(page);
    const btn = page.getByRole('button', { name: '戰力加成的說明' });

    await btn.click();
    const panel = page.getByTestId('help-tip-panel');
    await expect(panel).toBeVisible();
    await expect(panel).toContainText('本站不會替你判斷');
    await expect(btn).toHaveAttribute('aria-expanded', 'true');

    await btn.click();
    await expect(page.getByTestId('help-tip-panel')).toHaveCount(0);
  });

  test('按 Esc 也收得起來', async ({ page }) => {
    await gotoReplay(page);
    await page.getByRole('button', { name: '戰力加成的說明' }).click();
    await expect(page.getByTestId('help-tip-panel')).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(page.getByTestId('help-tip-panel')).toHaveCount(0);
  });

  /*
   * 這條是這次真正的坑。
   *
   * 第一版用 absolute 相對按鈕定位，結果被側欄的 overflow-y-auto 裁掉了 ——
   * 依 CSS 規格，一個軸不是 visible 時另一個軸也會變成 auto，所以水平方向照樣裁。
   * 實測面板左緣 810px、容器左緣 889px，有 79px 直接看不到。
   *
   * 改用 position: fixed 之後才完整。這條斷言「整個面板都在視窗內」，
   * 哪天有人把它改回 absolute 就會紅燈。
   */
  test('面板不會被側欄的捲動容器裁掉', async ({ page }) => {
    await gotoReplay(page);
    // 這顆問號在側欄的捲動容器**裡面**，是最容易被裁的位置
    await page.getByRole('button', { name: '戰場的說明' }).first().click();

    const box = await page.getByTestId('help-tip-panel').boundingBox();
    expect(box).not.toBeNull();
    const view = page.viewportSize()!;
    expect(box!.x, '面板左緣跑到畫面外').toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width, '面板右緣超出畫面').toBeLessThanOrEqual(view.width);
    expect(box!.y + box!.height, '面板下緣超出畫面').toBeLessThanOrEqual(view.height);
  });

  /*
   * 「這是研究工具，不是對戰系統」**不可以**被收進問號裡。
   *
   * 那不是操作說明，是我們依 Riot 開發者政策講明的定位。
   * 這條擋的是「為了省空間順手把它也藏起來」這種未來的改動。
   */
  test('政策定位那句必須一直看得見', async ({ page }) => {
    await gotoReplay(page);
    const line = page.getByTestId('not-a-game');
    await expect(line).toBeVisible();
    await expect(line).toContainText('不是對戰系統');
    await expect(line).toContainText('沒有勝負判定');
  });
});
