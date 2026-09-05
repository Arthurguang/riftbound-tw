import { expect, test, type Page } from '@playwright/test';
import { expectOfficialUrl } from './url-assert';

/**
 * 在搜尋框輸入文字。
 *
 * 刻意用「逐字輸入」而不是 fill()：Playwright 的 fill() 在 WebKit（Safari 引擎）
 * 上不會觸發 React 受控輸入的 onChange，測試會假性失敗。
 * 逐字輸入也更貼近使用者實際的操作方式。
 */
async function typeSearch(page: Page, text: string) {
  const input = page.getByLabel('搜尋卡牌');
  await input.clear();
  await input.pressSequentially(text, { delay: 20 });
}

/** 圖鑑的功能驗證：搜尋、篩選、排序、單卡頁、網址分享。 */

test.describe('卡牌圖鑑', () => {
  test('列出全部 376 張卡', async ({ page }) => {
    await page.goto('/cards');
    await expect(page.getByRole('heading', { name: '卡牌圖鑑', level: 1 })).toBeVisible();
    await expect(page.locator('main ul > li')).toHaveCount(376);
  });

  test('搜尋卡名', async ({ page }) => {
    await page.goto('/cards');
    await typeSearch(page, 'Ahri');
    await expect(page.locator('main ul > li')).not.toHaveCount(376);
    // 預設介面是繁中，所以顯示的是繁中卡名（但用英文也搜得到）。
    const names = await page.locator('main ul > li a span').first().textContent();
    expect(names).toContain('阿璃');
  });

  test('搜尋能力文字裡的關鍵字', async ({ page }) => {
    await page.goto('/cards');
    await typeSearch(page, 'Assault');
    await expect(page.locator('main ul > li').first()).toBeVisible();
    const count = await page.locator('main ul > li').count();
    expect(count).toBeGreaterThan(0);
    expect(count).toBeLessThan(376);
  });

  test('搜尋標籤', async ({ page }) => {
    await page.goto('/cards');
    await typeSearch(page, 'Piltover');
    await expect(page.locator('main ul > li').first()).toBeVisible();
  });

  test('多條件篩選：卡種 + 領域', async ({ page }) => {
    await page.goto('/cards');
    await page.getByRole('button', { name: '展開篩選' }).click();

    await page.getByRole('button', { name: '單位', exact: true }).click();
    const unitsOnly = await page.locator('main ul > li').count();
    expect(unitsOnly).toBeGreaterThan(0);
    expect(unitsOnly).toBeLessThan(376);

    // 篩選鈕顯示官方特性名稱加顏色（核心規則 134.2），例如「翠意（綠）」。
    await page.getByRole('button', { name: '翠意（綠）', exact: true }).click();
    const unitsAndCalm = await page.locator('main ul > li').count();
    expect(unitsAndCalm).toBeGreaterThan(0);
    expect(unitsAndCalm).toBeLessThan(unitsOnly);
  });

  test('篩選條件會同步到網址，可直接分享', async ({ page }) => {
    await page.goto('/cards');
    await page.getByRole('button', { name: '展開篩選' }).click();
    await page.getByRole('button', { name: '傳奇', exact: true }).click();
    await expect(page).toHaveURL(/type=legend/);

    const expected = await page.locator('main ul > li').count();

    // 直接用網址重新開啟，結果必須一致。
    await page.goto('/cards?type=legend');
    await expect(page.locator('main ul > li')).toHaveCount(expected);
  });

  test('網址帶入無效參數時安全地忽略，不會壞掉', async ({ page }) => {
    await page.goto('/cards?type=<script>alert(1)</script>&rarity=nope&energy=999&sort=bogus');
    await expect(page.locator('main ul > li')).toHaveCount(376);
    // 惡意字串不會出現在畫面上。
    await expect(page.locator('body')).not.toContainText('alert(1)');
  });

  test('排序：依卡名 A→Z', async ({ page }) => {
    await page.goto('/cards?sort=name-asc');
    const first = await page.locator('main ul > li a span').first().textContent();
    await page.goto('/cards?sort=name-desc');
    const last = await page.locator('main ul > li a span').first().textContent();
    expect(first).not.toBe(last);
  });

  test('清除條件會回到全部卡牌', async ({ page }) => {
    await page.goto('/cards?type=legend');
    await page.getByRole('button', { name: '清除所有條件' }).click();
    await expect(page.locator('main ul > li')).toHaveCount(376);
  });

  test('找不到結果時顯示提示', async ({ page }) => {
    await page.goto('/cards');
    await typeSearch(page, 'zzzzzzzz');
    await expect(page.getByText('找不到符合條件的卡牌')).toBeVisible();
  });
});

test.describe('單卡詳細頁', () => {
  test('顯示完整卡牌資訊', async ({ page }) => {
    await page.goto('/cards/ogn-056-298');
    await expect(page.getByRole('heading', { name: '適應器', level: 1 })).toBeVisible();
    // 非英文介面時，英文原名仍會併陳，方便跟英文卡對照。
    await expect(page.getByText('Adaptatron')).toBeVisible();
    await expect(page.getByText('OGN-056/298')).toBeVisible();
    await expect(page.getByRole('heading', { name: '能力文字', level: 2 })).toBeVisible();
    // 數值標示（能量／力量）以符號圖示呈現。
    await expect(page.locator('img[src="/glyphs/might.svg"]').first()).toBeVisible();
  });

  test('能力文字裡的符號以圖示呈現，而不是原始的 :rb_xxx: 字串', async ({ page }) => {
    await page.goto('/cards/ogn-056-298');
    await expect(page.locator('body')).not.toContainText(':rb_might:');
    await expect(page.locator('img[src="/glyphs/might.svg"]').first()).toBeVisible();
  });

  test('點標籤可回到圖鑑並套用該標籤篩選', async ({ page }) => {
    await page.goto('/cards/ogn-056-298');
    // 繁中介面下標籤顯示台服正式譯名。
    await page.getByRole('link', { name: '皮爾托福', exact: true }).click();
    await expect(page).toHaveURL(/tag=Piltover/);
    await expect(page.locator('main ul > li').first()).toBeVisible();
  });

  test('不存在的卡片回傳 404', async ({ page }) => {
    const response = await page.goto('/cards/does-not-exist');
    expect(response?.status()).toBe(404);
  });

  test('橫向的戰場卡也能正常顯示', async ({ page }) => {
    await page.goto('/cards?type=battlefield');
    await expect(page.locator('main ul > li').first()).toBeVisible();
    await page.locator('main ul > li a').first().click();
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  });
});

test.describe('無障礙與行動版', () => {
  test('手機寬度下版面不會橫向溢出', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto('/cards');
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
    );
    expect(overflow).toBe(false);
  });

  test('每張卡圖都有替代文字', async ({ page }) => {
    await page.goto('/cards');
    const missing = await page.evaluate(
      () => [...document.querySelectorAll('main ul img')].filter((i) => !i.getAttribute('alt')).length,
    );
    expect(missing).toBe(0);
  });

  test('可以用鍵盤操作到搜尋框', async ({ page }) => {
    await page.goto('/cards');
    // 等頁面完成用戶端渲染，否則按下的 Tab 會在 hydration 時被重設。
    await expect(page.locator('main ul > li').first()).toBeVisible();

    let focused = '';
    for (let i = 0; i < 10 && focused !== 'card-search'; i += 1) {
      await page.keyboard.press('Tab');
      focused = await page.evaluate(() => document.activeElement?.id ?? '');
    }
    expect(focused).toBe('card-search');
  });
});

test.describe('多語系', () => {
  test('預設為繁體中文', async ({ page }) => {
    await page.goto('/cards');
    await expect(page.locator('html')).toHaveAttribute('lang', 'zh-Hant-TW');
    await expect(page.getByRole('heading', { name: '卡牌圖鑑', level: 1 })).toBeVisible();
  });

  test('可切換到简体中文與英文', async ({ page }) => {
    await page.goto('/cards?lang=zh-CN');
    await expect(page.locator('html')).toHaveAttribute('lang', 'zh-Hans-CN');
    await expect(page.getByRole('heading', { name: '卡牌图鉴', level: 1 })).toBeVisible();

    await page.goto('/cards?lang=en');
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await expect(page.getByRole('heading', { name: 'Card Gallery', level: 1 })).toBeVisible();
  });

  test('同一張卡在三種語言顯示各自的卡名', async ({ page }) => {
    await page.goto('/cards/ogn-056-298?lang=en');
    await expect(page.getByRole('heading', { name: 'Adaptatron', level: 1 })).toBeVisible();

    await page.goto('/cards/ogn-056-298?lang=zh-CN');
    await expect(page.getByRole('heading', { name: '自适应机器人', level: 1 })).toBeVisible();

    await page.goto('/cards/ogn-056-298?lang=zh-TW');
    await expect(page.getByRole('heading', { name: '適應器', level: 1 })).toBeVisible();
  });

  test('搜尋可以跨語言命中同一張卡', async ({ page }) => {
    // 只導航一次，之後重複輸入 —— 避免網址同步與下一次導航互相打斷。
    await page.goto('/cards');
    await expect(page.locator('main ul > li').first()).toBeVisible();

    for (const term of ['Ahri', '阿狸', '阿璃']) {
      await typeSearch(page, term);
      await expect(page.locator('main ul > li').first()).toBeVisible();
      const count = await page.locator('main ul > li').count();
      expect(count, `搜尋「${term}」應該有結果`).toBeGreaterThan(0);
      expect(count, `搜尋「${term}」應該縮小範圍`).toBeLessThan(376);
    }
  });

  /*
   * 這裡只等 HTML 解析完成，不等圖片載完（domcontentloaded 而非預設的 load）。
   *
   * 简中卡圖來自中國的 CDN，從其他地區連過去有時會很慢。預設的 goto 會等
   * 所有圖片載完，網路一慢測試就逾時 —— 但這條要驗的是「卡圖網址有沒有
   * 換成简中 CDN」，圖片載不載得完無關。
   * 會隨機變紅的測試比沒有測試更糟，因為久了就沒有人相信 CI。
   */
  test('切換卡面語言會換成简中卡圖', async ({ page }) => {
    await page.goto('/cards/ogn-056-298?art=en', { waitUntil: 'domcontentloaded' });
    await expectOfficialUrl(page.locator('article img').first(), 'src', 'cmsassets.rgpub.io');

    await page.goto('/cards/ogn-056-298?art=zh-CN', { waitUntil: 'domcontentloaded' });
    await expectOfficialUrl(page.locator('article img').first(), 'src', 'cdn.playloltcg.com');
  });

  test('繁中能力文字會誠實標示為簡轉繁', async ({ page }) => {
    await page.goto('/cards/ogn-056-298?lang=zh-TW');
    await expect(page.getByText('逐字轉為繁體')).toBeVisible();

    // 英文與简中是官方原文，不該出現這個標示
    await page.goto('/cards/ogn-056-298?lang=zh-CN');
    await expect(page.getByText('逐字轉為繁體')).toHaveCount(0);
  });

  test('語言設定在頁面之間不會遺失', async ({ page }) => {
    await page.goto('/cards?lang=en');
    await expect(page.locator('main ul > li').first()).toBeVisible();
    await page.locator('main ul > li a').first().click();
    await expect(page).toHaveURL(/lang=en/);
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  });

  test('無效的語言參數安全地回到預設值', async ({ page }) => {
    await page.goto('/cards?lang=<script>alert(1)</script>&art=bogus');
    await expect(page.locator('html')).toHaveAttribute('lang', 'zh-Hant-TW');
    await expect(page.locator('body')).not.toContainText('alert(1)');
  });
});

/**
 * 篩選狀態要撐過「點進卡片再返回」。
 *
 * 使用者反映：篩好條件後點一張卡看詳細，返回時篩選整個沒了。
 * 原因是詳細頁的返回連結只帶了語言設定，把篩選丟掉。
 */
test.describe('返回圖鑑時保留篩選', () => {
  test('點進卡片再按返回，篩選還在', async ({ page }) => {
    await page.goto('/cards?type=battlefield&mark=banned', { waitUntil: 'domcontentloaded' });

    // 先確認篩選確實生效了（5 張禁用戰場）
    await expect(page.getByTestId('tile-ban')).toHaveCount(5);

    await page.getByRole('link', { name: /OGN-292/ }).click();
    await expect(page.getByTestId('errata-notice')).toBeVisible();

    await page.getByRole('link', { name: /回到卡牌圖鑑/ }).click();

    await expect(page).toHaveURL(/type=battlefield/);
    await expect(page).toHaveURL(/mark=banned/);
    await expect(page.getByTestId('tile-ban')).toHaveCount(5);
  });

  test('語言設定也一起留著 —— 兩者是獨立的兩件事', async ({ page }) => {
    await page.goto('/cards?type=rune&lang=en', { waitUntil: 'domcontentloaded' });
    await page.getByRole('link').filter({ hasText: /OGN-/ }).first().click();
    await page.getByRole('link', { name: /Back to/i }).click();

    await expect(page).toHaveURL(/type=rune/);
    await expect(page).toHaveURL(/lang=en/);
  });

  /*
   * 網址是使用者可以任意編造的輸入，所以返回連結**不是**把參數原封不動貼回去，
   * 而是先解析成篩選狀態（只認允許清單內的值）再重新組出來。
   */
  test('網址裡亂填的東西不會被貼進返回連結', async ({ page }) => {
    await page.goto('/cards/ogn-292-298?type=battlefield&mark=nope&evil=%3Cscript%3E', {
      waitUntil: 'domcontentloaded',
    });

    const back = page.getByRole('link', { name: /回到卡牌圖鑑/ });
    const href = await back.getAttribute('href');
    expect(href).toContain('type=battlefield');
    expect(href).not.toContain('evil');
    expect(href).not.toContain('nope');
  });
});
