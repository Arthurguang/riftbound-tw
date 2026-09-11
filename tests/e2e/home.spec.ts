import { expect, test, type Page } from '@playwright/test';

/**
 * 首頁的「領域徽章＋傳奇列」與區域地圖。
 *
 * 除了「點得動」，也驗證跟內容正確性有關的事：
 *   · 畫面上寫的傳奇數量，跟實際列出來的張數一致（數量不寫死）
 *   · 篩選的結果真的符合選的領域
 *   · 傳奇與區域的連結都連到真的頁面、帶正確的篩選
 */

const roster = (page: Page) => page.getByTestId('legend-roster');
const badge = (page: Page, name: string) =>
  roster(page).getByRole('button', { name, exact: true });
const legends = (page: Page) => roster(page).locator('[data-legend-link]');

test.describe('首頁的傳奇與領域', () => {
  test('預設列出全部傳奇，而且寫的數量跟實際張數一致', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    const count = await legends(page).count();
    expect(count).toBeGreaterThanOrEqual(16);
    await expect(page.getByTestId('legend-count')).toHaveText(`全部 ${count} 位`);
    await expect(roster(page).getByRole('heading', { level: 2 })).toContainText(`${count} 位傳奇`);
  });

  test('選一個領域，只剩含有它的傳奇，並說明這個領域的風格', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await badge(page, '熾烈').click();
    await expect(badge(page, '熾烈')).toHaveAttribute('aria-pressed', 'true');

    const domains = await legends(page).evaluateAll((els) =>
      els.map((e) => e.getAttribute('data-domains') ?? ''),
    );
    expect(domains.length).toBeGreaterThan(0);
    for (const d of domains) expect(d.split(' ')).toContain('fury');
    // 風格描述是本站整理的，要標明
    await expect(roster(page)).toContainText('本站整理');
  });

  test('選兩個領域，看到這個組合的所有傳奇（同一組可能不只一位）', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await badge(page, '熾烈').click();
    await badge(page, '混沌').click();

    await expect(legends(page)).toHaveCount(2);
    for (const d of await legends(page).evaluateAll((els) =>
      els.map((e) => e.getAttribute('data-domains') ?? ''),
    )) {
      expect(d.split(' ').sort()).toEqual(['chaos', 'fury']);
    }
  });

  test('選兩個對立的領域，說明目前沒有這樣的傳奇', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await badge(page, '熾烈').click();
    await badge(page, '翠意').click();

    await expect(legends(page)).toHaveCount(0);
    await expect(page.getByTestId('legend-empty')).toContainText('目前卡池沒有');
  });

  test('再點一次取消選取；清除篩選回到全部', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    const total = await legends(page).count();

    await badge(page, '靈光').click();
    await badge(page, '靈光').click();
    await expect(badge(page, '靈光')).toHaveAttribute('aria-pressed', 'false');
    await expect(legends(page)).toHaveCount(total);

    await badge(page, '序理').click();
    await roster(page).getByRole('button', { name: '清除篩選' }).click();
    await expect(legends(page)).toHaveCount(total);
  });

  test('點傳奇會打開那張卡', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await legends(page).first().click();
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
