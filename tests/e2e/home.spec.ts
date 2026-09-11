import { expect, test } from '@playwright/test';

/**
 * 首頁的符文陣與區域地圖。
 *
 * 除了「點得動」，也驗證兩件跟內容正確性有關的事：
 *   · 傳奇連結真的連到存在的卡片頁（不是示意用的假連結）
 *   · 領域與區域的連結會帶上正確的篩選條件
 */

test.describe('首頁的符文陣', () => {
  test('六個領域、十二條連線', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    const wheel = page.locator('[data-rune-wheel]').first();
    await expect(wheel.locator('[data-domain]')).toHaveCount(6);
    await expect(wheel.locator('[data-pair]')).toHaveCount(12);
  });

  test('點一個領域，會列出它的四位傳奇，而且都連到真的卡片頁', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await page.getByRole('button', { name: '熾烈', exact: true }).click();

    const panel = page.getByTestId('domain-panel');
    await expect(panel).toContainText('對立領域：翠意');

    const links = page.getByTestId('domain-legends').getByRole('link');
    await expect(links).toHaveCount(4);
    for (const href of await links.evaluateAll((els) => els.map((e) => e.getAttribute('href')))) {
      expect(href).toMatch(/^\/cards\/ogn-/);
    }

    // 陣圖上亮起四條連線
    await expect(page.locator('[data-rune-wheel] [data-pair][data-active="true"]')).toHaveCount(4);
  });

  test('領域的「看卡」連結會帶上領域篩選', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await page.getByRole('button', { name: '序理', exact: true }).click();
    const link = page.getByRole('link', { name: /看序理的卡/ });
    await expect(link).toHaveAttribute('href', '/cards?domain=order');
  });

  test('鍵盤也能選領域', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    const node = page.getByRole('button', { name: '靈光', exact: true });
    await node.focus();
    await page.keyboard.press('Enter');
    await expect(node).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByTestId('domain-panel')).toContainText('對立領域：摧破');
  });

  test('點傳奇連結會真的打開那張卡', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await page.getByRole('button', { name: '熾烈', exact: true }).click();
    await page.getByTestId('domain-legends').getByRole('link').first().click();
    await expect(page).toHaveURL(/\/cards\/ogn-/);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  });
});

test.describe('首頁的區域地圖', () => {
  test('點區域會換成它的簡介，並能連到該區域的卡', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await page.locator('[data-region="Demacia"]').click();

    const lore = page.getByTestId('region-lore');
    await expect(lore).toContainText('德瑪西亞');
    await expect(lore.getByRole('link')).toHaveAttribute('href', '/cards?tag=Demacia');
    await expect(page.locator('[data-region="Demacia"]')).toHaveAttribute('aria-pressed', 'true');
  });

  test('區域連結真的會篩出那個區域', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await page.locator('[data-region="Freljord"]').click();
    await page.getByTestId('region-lore').getByRole('link').click();
    await expect(page).toHaveURL(/tag=Freljord/);
  });
});

test.describe('全站', () => {
  test('導覽列標出目前所在的頁面', async ({ page }) => {
    await page.goto('/cards', { waitUntil: 'domcontentloaded' });
    const nav = page.locator('header nav');
    await expect(nav.getByRole('link', { name: '卡牌圖鑑' })).toHaveAttribute('aria-current', 'page');
    await expect(nav.getByRole('link', { name: '規則說明' })).not.toHaveAttribute('aria-current', 'page');
  });

  /*
   * Riot 的同人專案政策要求明顯標示聲明 —— 改版不能把它弄丟。
   */
  test('首頁仍然保留 Riot 的同人聲明', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('footer')).toContainText('Legal Jibber Jabber');
  });
});
