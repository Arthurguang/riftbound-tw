import { expect, test, type Page } from '@playwright/test';

/**
 * 首頁：傳奇展示台、「領域徽章＋傳奇列」。
 *
 * 除了「點得動」，也驗證跟內容正確性有關的事：
 *   · 畫面上寫的傳奇數量，跟實際列出來的張數一致（數量不寫死）
 *   · 篩選的結果真的符合選的領域
 *   · 點展示台的卡，打開的就是那一位（WebKit 曾經點到背對使用者的卡）
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
    // 標題不放數量（新系列加入傳奇時不必改），數量只看「全部 N 位」
    await expect(roster(page).getByRole('heading', { level: 2 })).toHaveText('傳奇與六大領域');
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
  const stage = (page: Page) => page.getByTestId('showcase-stage');
  const frontOf = async (page: Page) => Number(await showcase(page).getAttribute('data-front'));
  const OFFICIAL_CDN = /^https:\/\/(cmsassets\.rgpub\.io|cdn\.playloltcg\.com)\//;

  /** 用頁首的「暫停背景動畫」讓展示台停住（需要精確比對位置的測試用）。 */
  const pauseAll = async (page: Page) => {
    await page.getByTestId('ambience-controls').getByRole('button', { name: '暫停背景動畫' }).click();
    await expect(showcase(page)).toHaveAttribute('data-auto', 'paused');
  };

  /** 在展示台上從右往左拖 distance 像素。 */
  const dragLeft = async (page: Page, distance: number) => {
    const box = await stage(page).boundingBox();
    if (!box) throw new Error('找不到展示台');
    const y = box.y + box.height / 2;
    const x = box.x + box.width / 2;
    await page.mouse.move(x + distance / 2, y);
    await page.mouse.down();
    await page.mouse.move(x - distance / 2, y, { steps: 12 });
    await expect(showcase(page)).toHaveAttribute('data-auto', 'dragging');
    await page.mouse.up();
  };

  /*
   * 點卡之前先停住轉盤：Playwright 要等元素「不再移動」才會點，持續轉動的卡永遠等不到。
   * 真人點慢慢移動的卡沒問題，這是測試工具的限制。
   */
  const clickFrontCard = async (page: Page) => {
    await pauseAll(page);
    const front = showcase(page).locator('[data-showcase-card][data-front="true"]');
    const label = (await front.getAttribute('aria-label')) ?? '';
    await front.click();
    // 回傳點的是哪一位（aria-label 是「卡名：看傳奇說明」）
    return label.replace(/：看傳奇說明$/, '');
  };

  test('展示全部傳奇（跟下方傳奇列一樣多），卡圖都來自官方 CDN', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    const cards = showcase(page).locator('[data-showcase-card]');
    await expect(cards).toHaveCount(await legends(page).count());
    const sources = await cards
      .locator('img')
      .evaluateAll((els) => els.map((e) => e.getAttribute('src') ?? ''));
    for (const src of sources) expect(src).toMatch(OFFICIAL_CDN);
  });

  test('持續慢慢轉動，滑鼠移上去也不會停', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await showcase(page).hover();
    await expect(showcase(page)).toHaveAttribute('data-auto', 'running');
    const start = await showcase(page).getAttribute('data-front');
    await expect(showcase(page)).not.toHaveAttribute('data-front', start ?? '', { timeout: 8000 });
  });

  test('按頁首的「暫停背景動畫」，展示台也一起停', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await pauseAll(page);
    const start = await frontOf(page);
    await page.waitForTimeout(4500);
    expect(await frontOf(page)).toBe(start);
  });

  test('系統設定「減少動態效果」時不會自動轉', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await expect(showcase(page)).toHaveAttribute('data-auto', 'paused');
  });

  test('可以拖曳轉到想看的傳奇，放開後對齊到一張卡', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await pauseAll(page);
    const count = await showcase(page).locator('[data-showcase-card]').count();
    const start = await frontOf(page);

    // 拖 300 像素 ≈ 轉 90 度；16 位傳奇時剛好是 4 位
    await dragLeft(page, 300);
    const expected = (start + Math.round(90 / (360 / count))) % count;
    await expect(showcase(page)).toHaveAttribute('data-front', String(expected));
    // 拖曳不會誤開說明視窗
    await expect(page.getByTestId('legend-dialog')).toBeHidden();
  });

  test('拖曳放開後，繼續慢慢轉', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await dragLeft(page, 200);
    await expect(showcase(page)).toHaveAttribute('data-auto', 'running');
    const after = await showcase(page).getAttribute('data-front');
    await expect(showcase(page)).not.toHaveAttribute('data-front', after ?? '', { timeout: 8000 });
  });

  test('上一位／下一位可以手動轉', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await pauseAll(page);
    const count = await showcase(page).locator('[data-showcase-card]').count();
    const start = await frontOf(page);

    await showcase(page).getByRole('button', { name: '下一位' }).click();
    await expect(showcase(page)).toHaveAttribute('data-front', String((start + 1) % count));
    await showcase(page).getByRole('button', { name: '上一位' }).click();
    await expect(showcase(page)).toHaveAttribute('data-front', String(start));
  });

  test('點正面的卡，跳出的正是那一位的說明；按 Esc 關閉', async ({ page }) => {
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
