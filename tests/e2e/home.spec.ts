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

test.describe('首頁傳奇展示台', () => {
  const showcase = (page: Page) => page.getByTestId('hero-showcase');
  const frontOf = async (page: Page) => Number(await showcase(page).getAttribute('data-front'));
  const OFFICIAL_CDN = /^https:\/\/(cmsassets\.rgpub\.io|cdn\.playloltcg\.com)\//;

  test('展示全部傳奇（跟下方傳奇列一樣多），卡圖都來自官方 CDN', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    const cards = showcase(page).locator('[data-showcase-card]');
    await expect(cards).toHaveCount(await legends(page).count());
    const sources = await cards
      .locator('img')
      .evaluateAll((els) => els.map((e) => e.getAttribute('src') ?? ''));
    for (const src of sources) expect(src).toMatch(OFFICIAL_CDN);
  });

  test('會自動慢慢轉到下一位', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await expect(showcase(page)).toHaveAttribute('data-auto', 'running');
    const start = await showcase(page).getAttribute('data-front');
    await expect(showcase(page)).not.toHaveAttribute('data-front', start ?? '', { timeout: 8000 });
  });

  test('滑鼠移上去就停下來，方便點選', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await showcase(page).hover();
    await expect(showcase(page)).toHaveAttribute('data-auto', 'paused');
    const start = await frontOf(page);
    await page.waitForTimeout(4500);
    expect(await frontOf(page)).toBe(start);
  });

  test('按頁首的「暫停背景動畫」，展示台也一起停', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await page.getByTestId('ambience-controls').getByRole('button', { name: '暫停背景動畫' }).click();
    await expect(showcase(page)).toHaveAttribute('data-auto', 'paused');
  });

  test('系統設定「減少動態效果」時不會自動轉', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await expect(showcase(page)).toHaveAttribute('data-auto', 'paused');
  });

  test('上一位／下一位可以手動轉', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await showcase(page).hover();
    const count = await showcase(page).locator('[data-showcase-card]').count();
    const start = await frontOf(page);

    await showcase(page).getByRole('button', { name: '下一位' }).click();
    await expect(showcase(page)).toHaveAttribute('data-front', String((start + 1) % count));
    await showcase(page).getByRole('button', { name: '上一位' }).click();
    await expect(showcase(page)).toHaveAttribute('data-front', String(start));
  });

  /*
   * 點卡之前先把滑鼠移上去、等轉盤停下 —— 真人也是這樣操作的。
   * 不這樣做的話，轉盤可能在「找到正面那張卡」和「真的點下去」之間轉了一格，
   * 點到的是隔壁那張（WebKit 在全套同時跑時遇過）。
   */
  const clickFrontCard = async (page: Page) => {
    await showcase(page).hover();
    await expect(showcase(page)).toHaveAttribute('data-auto', 'paused');
    const front = showcase(page).locator('[data-showcase-card][data-front="true"]');
    const label = (await front.getAttribute('aria-label')) ?? '';
    await front.click();
    // 回傳點的是哪一位（aria-label 是「卡名：看傳奇說明」）
    return label.replace(/：看傳奇說明$/, '');
  };

  test('點展示中的卡，跳出傳奇說明；按 Esc 關閉', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    const clicked = await clickFrontCard(page);

    const dialog = page.getByTestId('legend-dialog');
    await expect(dialog).toBeVisible();
    /*
     * 打開的必須是剛剛點的那一位。2026-09-11 在 WebKit 抓到：背對使用者的卡會接住點擊，
     * 點正面的凱莎卻打開轉盤另一邊的提摩。
     */
    await expect(dialog.getByRole('heading', { level: 2 })).toHaveText(clicked);
    await expect(dialog.getByRole('link', { name: /看完整卡片頁/ })).toBeVisible();
    // 說明視窗開著時轉盤停住，關掉之前不會自己換人
    await expect(showcase(page)).toHaveAttribute('data-auto', 'paused');

    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
  });

  test('說明視窗裡的連結會打開那張卡的完整頁面', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await clickFrontCard(page);
    await page.getByTestId('legend-dialog').getByRole('link', { name: /看完整卡片頁/ }).click();
    await expect(page).toHaveURL(/\/cards\/og[ns]-/);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  });

  /*
   * 2026-09-11：主視覺的卡牌與光暈超出欄位，曾在 1280 寬的筆電上撐出橫向捲軸。
   * 常見的幾種螢幕寬度都要檢查，整頁不能左右捲動。
   */
  for (const width of [1280, 1440, 1024, 390]) {
    test(`${width} 寬時整頁不會出現橫向捲動`, async ({ page }) => {
      await page.setViewportSize({ width, height: 800 });
      await page.goto('/', { waitUntil: 'domcontentloaded' });
      await expect(page.getByTestId('legend-roster')).toBeVisible();
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow).toBeLessThanOrEqual(0);
    });
  }
});
