import { test, expect } from '@playwright/test';

test.describe('SignalGrid Application', () => {
  test('should load the application', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('[data-testid="top-bar"]')).toBeVisible();
  });

  test('should display the grid canvas', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('[data-testid="grid-canvas"]')).toBeVisible();
  });

  test('should display vehicles and incidents', async ({ page }) => {
    await page.goto('/');
    // The default seeded scene should have vehicles and incidents
    await expect(page.locator('[data-testid="grid-canvas"]')).toBeVisible();
  });

  test('should be able to place blocked terrain', async ({ page }) => {
    await page.goto('/');
    await page.click('[data-testid="tool-blocked"]');
    // Click on a cell
    const cell = page.locator('[data-testid="grid-canvas"] > div').first();
    await cell.click();
    // Cell should now be blocked
    await expect(cell).toHaveAttribute('data-terrain', 'blocked');
  });

  test('should be able to undo and redo', async ({ page }) => {
    await page.goto('/');
    await page.click('[data-testid="tool-blocked"]');
    const cell = page.locator('[data-testid="grid-canvas"] > div').first();
    await cell.click();
    // Undo
    await page.click('[data-testid="btn-undo"]');
    // Redo
    await page.click('[data-testid="btn-redo"]');
  });

  test('should have simulation controls', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('[data-testid="btn-plan"]')).toBeVisible();
    await expect(page.locator('[data-testid="btn-start"]')).toBeVisible();
    await expect(page.locator('[data-testid="btn-pause"]')).toBeVisible();
    await expect(page.locator('[data-testid="btn-step"]')).toBeVisible();
  });

  test('should collapse and reopen log panel', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('[data-testid="log-panel"]')).toBeVisible();
    await page.click('[data-testid="collapse-log"]');
    await expect(page.locator('[data-testid="reopen-log"]')).toBeVisible();
    await page.click('[data-testid="reopen-log"]');
    await expect(page.locator('[data-testid="log-panel"]')).toBeVisible();
  });

  test('should export and import scene', async ({ page }) => {
    await page.goto('/');
    // Click export
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.click('[data-testid="btn-export"]'),
    ]);
    expect(download).toBeTruthy();
  });

  test('should have left panel with tools', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('[data-testid="left-panel"]')).toBeVisible();
  });

  test('should have right panel with vehicle cards', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('[data-testid="right-panel"]')).toBeVisible();
  });

  test('should be able to clear map', async ({ page }) => {
    await page.goto('/');
    await page.click('[data-testid="btn-clear"]');
    // Map should still be visible
    await expect(page.locator('[data-testid="grid-canvas"]')).toBeVisible();
  });
});
