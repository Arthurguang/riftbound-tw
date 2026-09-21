import { expect, test } from '@playwright/test';
import { expectOfficialUrl } from './url-assert';

/**
 * 使用條款與隱私權政策。
 *
 * Riot 審核開發者申請時要看得到這兩頁（developer.riotgames.com/docs/faqs），
 * 所以要確認：每一頁都連得到、英文版讀得到、聯絡方式指向正確的地方。
 */

test.describe('使用條款與隱私權政策', () => {
  test('頁尾有兩頁與聯絡方式的連結，點得進去', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    const links = page.getByTestId('legal-links');

    await links.getByRole('link', { name: /Terms of Service/ }).click();
    await expect(page).toHaveURL(/\/terms$/);
    await expect(page.getByRole('heading', { level: 1, name: '使用條款' })).toBeVisible();

    await page.getByTestId('legal-links').getByRole('link', { name: /Privacy Policy/ }).click();
    await expect(page).toHaveURL(/\/privacy$/);
    await expect(page.getByRole('heading', { level: 1, name: '隱私權政策' })).toBeVisible();
  });

  test('聯絡方式連到本站 GitHub 的 Issues，並在新分頁開啟', async ({ page }) => {
    await page.goto('/privacy', { waitUntil: 'domcontentloaded' });
    for (const link of [
      page.getByTestId('contact-link'),
      page.getByTestId('legal-links').getByRole('link', { name: /Contact/ }),
    ]) {
      const url = await expectOfficialUrl(link, 'href', 'github.com');
      expect(url.pathname).toBe('/Arthurguang/riftbound-tw/issues');
      await expect(link).toHaveAttribute('rel', 'noopener noreferrer');
      await expect(link).toHaveAttribute('target', '_blank');
    }
  });

  test('英文版給審核人員讀（?lang=en）', async ({ page }) => {
    await page.goto('/terms?lang=en', { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { level: 1, name: 'Terms of Service' })).toBeVisible();
    await expect(page.locator('main')).toContainText('non-commercial fan project');
    await expect(page.locator('main')).toContainText('It is not a game');

    await page.goto('/privacy?lang=en', { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { level: 1, name: 'Privacy Policy' })).toBeVisible();
    await expect(page.locator('main')).toContainText('We do not use cookies');
  });

  test('標示最後更新日期', async ({ page }) => {
    await page.goto('/terms', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('time')).toHaveAttribute('datetime', /^\d{4}-\d{2}-\d{2}$/);
  });
});

/*
 * Riot 開發者申請的網域驗證檔。
 *
 * 2026-09-21 送出申請（App ID 883133）後，Riot 給了一串驗證碼，
 * 要放在網站根目錄的 riot.txt，內容**只能有那串碼**。
 * 這個檔在審核有結果之前不能消失 —— 有開發者因為審核當下網站讀不到而被拒，
 * 重新排隊又等了半年。所以用測試釘住：檔案在、內容乾淨、任何人都讀得到。
 */
test.describe('Riot 網域驗證檔', () => {
  const CODE = '87a09f29-f7ef-4ba0-b52c-12ad5142088f';

  test('/riot.txt 讀得到，而且裡面只有驗證碼', async ({ request }) => {
    const response = await request.get('/riot.txt');
    expect(response.status()).toBe(200);
    // 前後不能有空白或其他內容，Riot 的說明特別強調這一點
    expect(await response.text()).toBe(CODE);
  });

  test('不需要登入或任何條件就讀得到', async ({ page }) => {
    const response = await page.goto('/riot.txt');
    expect(response?.status()).toBe(200);
    expect(response?.headers()['content-type']).toMatch(/^text\/plain/);
  });
});
