import { expect, test } from '@playwright/test';
import { expectOfficialUrl } from './url-assert';

/** 規則說明與關鍵字辭典。 */

test.describe('規則頁', () => {
  test('列出全部 15 個關鍵字', async ({ page }) => {
    await page.goto('/rules');
    await expect(page.getByRole('heading', { name: '規則說明', level: 1 })).toBeVisible();
    await expect(page.locator('[id^="keyword-"]')).toHaveCount(15);
  });

  /**
   * 這一組是這個功能最重要的測試。
   *
   * 開發時我手寫過一版關鍵字說明，事後拿官方卡面原文比對，十五個裡有五個是錯的
   * （例如把 Shield 寫成「吸收傷害」，官方其實是「防守方時 +1 力量」）。
   * 現在說明一律由建置腳本從官方卡面抽取，這些斷言就是在守住那件事 ——
   * 如果哪天有人又用「聽起來合理」的文字取代官方原文，測試會立刻變紅。
   */
  test('關鍵字說明與官方卡面原文一致', async ({ page }) => {
    await page.goto('/rules?lang=en');

    const expected: [string, string][] = [
      ['shield', "+1 {might} while they're defenders."],
      ['tank', 'I must be assigned combat damage first.'],
      ['ganking', 'I can move from battlefield to battlefield.'],
      ['deathknell', 'When I die, get the effect.'],
      ['legion', "Get the effect if you've played another card this turn."],
      ['mighty', 'A unit is Mighty while it has 5+ {might}.'],
      ['action', 'Play on your turn or in showdowns.'],
      ['reaction', 'Play any time, even before spells and abilities resolve.'],
    ];

    for (const [id, text] of expected) {
      const card = page.locator(`#keyword-${id}`);
      // {might} 之類的符號在畫面上是圖示，比對時把它拿掉
      const plain = text.replace(/\{[a-z0-9_]+\}/g, '').replace(/\s+/g, ' ').trim();
      await expect(card, `${id} 的說明應與官方卡面一致`).toContainText(plain);
    }
  });

  test('沒有官方說明的關鍵字會誠實標示，而不是編一段', async ({ page }) => {
    await page.goto('/rules?lang=en');
    await expect(page.locator('#keyword-add')).toContainText('do not print reminder text');
  });

  test('三種語言都能顯示', async ({ page }) => {
    await page.goto('/rules?lang=zh-CN');
    await expect(page.getByRole('heading', { name: '规则说明', level: 1 })).toBeVisible();
    await expect(page.locator('#keyword-shield')).toContainText('防守方');

    await page.goto('/rules?lang=en');
    await expect(page.getByRole('heading', { name: 'Rules', level: 1 })).toBeVisible();
    await expect(page.locator('#keyword-shield')).toContainText('defenders');
  });

  /*
   * 這裡只用英文輸入。中文搜尋不是不支援，而是「沒辦法在端對端測試裡可靠地驗證」——
   * Playwright 的逐字輸入打不出中文（需要輸入法），fill() 又在 WebKit 上
   * 不會觸發 React 的 onChange。
   *
   * 所以三種語言的搜尋比對邏輯改由 tests/unit/glossary.test.ts 完整涵蓋，
   * 這一條只負責確認「畫面確實會依搜尋結果更新」。
   */
  test('搜尋會即時篩選畫面上的關鍵字', async ({ page }) => {
    await page.goto('/rules');
    await expect(page.locator('[id^="keyword-"]')).toHaveCount(15);

    // 等瀏覽器接手之後再輸入，否則打的字 React 收不到
    await expect(page.locator('[data-glossary-ready="true"]')).toBeVisible();

    await page.getByLabel('搜尋關鍵字').pressSequentially('defend', { delay: 20 });
    await expect(page.locator('#keyword-shield')).toBeVisible();
    await expect(page.locator('[id^="keyword-"]')).not.toHaveCount(15);
  });

  test('每條遊戲概要都標明出處', async ({ page }) => {
    await page.goto('/rules');
    const items = page.locator('section', { hasText: '遊戲概要' }).locator('li');
    const count = await items.count();
    expect(count).toBeGreaterThan(0);
    for (let i = 0; i < count; i += 1) {
      await expect(items.nth(i)).toContainText('—');
    }
  });

  test('提供官方規則文件連結，且確實指向官方網域', async ({ page }) => {
    await page.goto('/rules');
    const coreRules = page.getByRole('link', { name: /Core Rules/ }).first();
    await expect(coreRules).toBeVisible();

    // 比對完整主機名稱，而不是「網址裡含有某段字串」——
    // 後者會讓 https://evil.example.com/?x=cmsassets.rgpub.io/a.pdf 也通過。
    const url = await expectOfficialUrl(coreRules, 'href', 'cmsassets.rgpub.io');
    expect(url.pathname.endsWith('.pdf'), `${url} 應為 PDF`).toBe(true);

    await expect(coreRules).toHaveAttribute('rel', /noopener/);
  });

  test('所有官方文件連結都指向官方網域', async ({ page }) => {
    await page.goto('/rules');
    const links = page.locator('section', { hasText: '官方規則文件' }).locator('a[target="_blank"]');
    const count = await links.count();
    expect(count).toBeGreaterThan(0);

    const allowed = ['cmsassets.rgpub.io', 'playriftbound.com'];
    for (let i = 0; i < count; i += 1) {
      const href = await links.nth(i).getAttribute('href');
      const host = new URL(href!).hostname;
      expect(allowed, `第 ${i + 1} 個連結指向了非官方網域 ${host}`).toContain(host);
      await expect(links.nth(i)).toHaveAttribute('rel', /noopener/);
    }
  });
});

test.describe('卡牌頁與辭典的連結', () => {
  test('能力文字裡的關鍵字可以點到辭典對應位置', async ({ page }) => {
    // OGN-190 帶有 [Tank]
    await page.goto('/cards?q=Tank');
    await expect(page.locator('main ul > li').first()).toBeVisible();
    await page.locator('main ul > li a').first().click();

    const keywordLink = page.locator('a[href*="/rules#keyword-"]').first();
    await expect(keywordLink).toBeVisible();
    await keywordLink.click();
    await expect(page).toHaveURL(/\/rules#keyword-/);
  });

  test('關鍵字的滑鼠提示用的是官方原文', async ({ page }) => {
    await page.goto('/cards?q=Tank&lang=en');
    await expect(page.locator('main ul > li').first()).toBeVisible();
    await page.locator('main ul > li a').first().click();

    const tankLink = page.locator('a[href="/rules#keyword-tank"]').first();
    await expect(tankLink).toHaveAttribute('title', 'I must be assigned combat damage first.');
  });

  test('辭典可以連回使用該關鍵字的卡牌', async ({ page }) => {
    await page.goto('/rules');
    await page.locator('#keyword-tank a').first().click();
    await expect(page).toHaveURL(/\/cards\?q=Tank/);
    await expect(page.locator('main ul > li').first()).toBeVisible();
  });
});
