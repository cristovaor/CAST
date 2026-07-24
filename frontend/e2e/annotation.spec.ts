import { expect, test } from '@playwright/test';

const videoId = process.env.E2E_VIDEO_ID;

test.describe('editor manual + landmarks + revisão', () => {
  test.skip(!videoId, 'E2E_VIDEO_ID must point to a seeded video');

  test('processa, anota, revisa e persiste após reload', async ({ page }) => {
    await page.goto(`/app/videos/${videoId}/annotations`);

    const processButton = page.getByRole('button', {
      name: 'Processar landmarks',
    });
    if (await processButton.isVisible()) {
      await processButton.click();
      await expect(
        page.getByRole('button', { name: 'ROI' }),
      ).toBeEnabled({ timeout: 9 * 60 * 1000 });
    }

    await page.getByRole('button', { name: 'ROI' }).click();
    await page.getByRole('button', { name: 'Malha' }).click();
    await page.getByRole('button', { name: 'ROI' }).click();

    const before = await page.getByTestId('annotation-event').count();
    await page.getByRole('button', { name: 'Ponto' }).click();
    await page.keyboard.press('1');
    await expect(page.getByTestId('annotation-event')).toHaveCount(before + 1);

    await page.getByRole('button', { name: 'Intervalo' }).click();
    await page.keyboard.press('2');
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('annotation-event')).toHaveCount(before + 2);

    const suggestionCards = page.locator('[data-testid^="suggestion-"]');
    await expect
      .poll(() => suggestionCards.count(), { timeout: 30_000 })
      .toBeGreaterThanOrEqual(3);
    const suggestionCount = await suggestionCards.count();
    await suggestionCards.nth(0).getByRole('button', { name: 'Aceitar' }).click();
    await suggestionCards.nth(1).getByRole('button', { name: 'Corrigir' }).click();
    await suggestionCards.nth(1).getByRole('button', { name: 'Salvar' }).click();
    await suggestionCards.nth(2).getByRole('button', { name: 'Rejeitar' }).click();

    await page.reload();
    await expect(page.getByTestId('annotation-event')).toHaveCount(before + 4);
    await expect(page.locator('[data-testid^="suggestion-"]')).toHaveCount(
      suggestionCount - 3,
    );
  });
});
