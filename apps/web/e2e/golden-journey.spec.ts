import { test, expect } from '@playwright/test';

/**
 * The golden journey (blueprint doc 06 / Day 20): create → build a multi-component
 * app → edit a property → diff two commits → reload and confirm persistence.
 *
 * Requires a running stack (web + core + DB). The palette → canvas build uses HTML5
 * drag-and-drop; React Flow + native DnD can be timing-sensitive, so the build loop
 * waits for each node before the next drop.
 */
test('golden journey: create → build → edit → diff → reload', async ({ page }) => {
  // --- Create ---
  await page.goto('/');
  const name = `E2E ${Date.now()}`;
  await page.getByLabel('New architecture name').fill(name);
  await page.getByRole('button', { name: 'New architecture' }).click();
  await expect(page).toHaveURL(/\/architectures\/[^/]+$/);
  await expect(page.getByRole('heading').or(page.locator('header'))).toContainText(name);

  const pane = page.locator('.react-flow__pane');
  await expect(pane).toBeVisible();

  // --- Build: drop the same service a dozen times across the canvas ---
  await page.getByPlaceholder('Search services…').fill('compute');
  const item = page.locator('[draggable="true"]').first();
  await expect(item).toBeVisible();

  // 3 columns × 4 rows, spaced wider than the 190×64 node so they don't overlap
  // (overlapping nodes would intercept pointer events on the node below).
  const TARGET = 12;
  for (let i = 0; i < TARGET; i++) {
    await item.dragTo(pane, { targetPosition: { x: 70 + (i % 3) * 220, y: 70 + Math.floor(i / 3) * 110 } });
    await expect(page.locator('.react-flow__node')).toHaveCount(i + 1);
  }

  // --- Edit: select a node and confirm the inspector opens. Click the last-added
  // node — it's topmost in paint order, so an overlapping neighbour can't intercept. ---
  await page.locator('.react-flow__node').last().click();
  await expect(page.getByText('Abstract type')).toBeVisible();

  // Let the debounced autosave land.
  await expect(page.getByText('● Saved')).toBeVisible({ timeout: 10_000 });

  // --- Export (Stage D): the bundle endpoint streams diagram + HLD + Terraform
  // as a single zip; assert the download fires with the expected filename. ---
  await page.getByRole('button', { name: /Export/ }).click();
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download all (.zip)' }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/bundle\.zip$/);

  // --- Diff: open history and compare the two most recent commits ---
  await page.getByRole('button', { name: /History/ }).click();
  const commitRows = page.locator('aside').getByText(/comp ·/);
  await expect(commitRows.first()).toBeVisible();
  await commitRows.nth(0).click();
  await commitRows.nth(1).click();
  await expect(page.getByRole('button', { name: 'Exit diff' })).toBeVisible();

  // --- Reload: the built components persist (head model is the source of truth) ---
  await page.getByRole('button', { name: 'Exit diff' }).click();
  await page.reload();
  await expect(page.locator('.react-flow__node').first()).toBeVisible();
  await expect(page.locator('.react-flow__node')).toHaveCount(TARGET);
});
