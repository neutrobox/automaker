/**
 * Kanban Board Responsive Scaling Tests
 *
 * Tests that the Kanban board columns scale intelligently to fill
 * the available window space without dead space or content being cut off.
 */

import { test, expect } from '@playwright/test';
import * as fs from 'fs';

import {
  waitForNetworkIdle,
  createTestGitRepo,
  cleanupTempDir,
  createTempDirPath,
  setupProjectWithPathNoWorktrees,
  waitForBoardView,
} from './utils';

// Create unique temp dir for this test run
const TEST_TEMP_DIR = createTempDirPath('kanban-responsive-tests');

interface TestRepo {
  path: string;
  cleanup: () => Promise<void>;
}

test.describe('Kanban Responsive Scaling Tests', () => {
  let testRepo: TestRepo;

  test.beforeAll(async () => {
    // Create test temp directory
    if (!fs.existsSync(TEST_TEMP_DIR)) {
      fs.mkdirSync(TEST_TEMP_DIR, { recursive: true });
    }
  });

  test.beforeEach(async () => {
    // Create a fresh test repo for each test
    testRepo = await createTestGitRepo(TEST_TEMP_DIR);
  });

  test.afterEach(async () => {
    // Cleanup test repo after each test
    if (testRepo) {
      await testRepo.cleanup();
    }
  });

  test.afterAll(async () => {
    // Cleanup temp directory
    cleanupTempDir(TEST_TEMP_DIR);
  });

  test('kanban columns should scale to fill available width at different viewport sizes', async ({
    page,
  }) => {
    // Setup project and navigate to board view
    await setupProjectWithPathNoWorktrees(page, testRepo.path);
    await page.goto('/');
    await waitForNetworkIdle(page);
    await waitForBoardView(page);

    // Wait for the board to fully render
    await page.waitForTimeout(500);

    // Get all four kanban columns
    const backlogColumn = page.locator('[data-testid="kanban-column-backlog"]');
    const inProgressColumn = page.locator('[data-testid="kanban-column-in_progress"]');
    const waitingApprovalColumn = page.locator('[data-testid="kanban-column-waiting_approval"]');
    const verifiedColumn = page.locator('[data-testid="kanban-column-verified"]');

    // Verify all columns are visible
    await expect(backlogColumn).toBeVisible();
    await expect(inProgressColumn).toBeVisible();
    await expect(waitingApprovalColumn).toBeVisible();
    await expect(verifiedColumn).toBeVisible();

    // Test at different viewport widths
    const viewportWidths = [1024, 1280, 1440, 1920];

    for (const width of viewportWidths) {
      // Set viewport size
      await page.setViewportSize({ width, height: 900 });
      await page.waitForTimeout(300); // Wait for resize to take effect

      // Get column widths
      const backlogBox = await backlogColumn.boundingBox();
      const inProgressBox = await inProgressColumn.boundingBox();
      const waitingApprovalBox = await waitingApprovalColumn.boundingBox();
      const verifiedBox = await verifiedColumn.boundingBox();

      expect(backlogBox).not.toBeNull();
      expect(inProgressBox).not.toBeNull();
      expect(waitingApprovalBox).not.toBeNull();
      expect(verifiedBox).not.toBeNull();

      if (backlogBox && inProgressBox && waitingApprovalBox && verifiedBox) {
        // All columns should have the same width
        const columnWidths = [
          backlogBox.width,
          inProgressBox.width,
          waitingApprovalBox.width,
          verifiedBox.width,
        ];

        // All columns should be equal width (within 2px tolerance for rounding)
        const baseWidth = columnWidths[0];
        for (const columnWidth of columnWidths) {
          expect(Math.abs(columnWidth - baseWidth)).toBeLessThan(2);
        }

        // Column width should be at least minimum (280px)
        // No max-width - columns scale evenly to fill available viewport
        expect(baseWidth).toBeGreaterThanOrEqual(280);

        // Columns should not overlap (check x positions)
        expect(inProgressBox.x).toBeGreaterThan(backlogBox.x + backlogBox.width - 5);
        expect(waitingApprovalBox.x).toBeGreaterThan(inProgressBox.x + inProgressBox.width - 5);
        expect(verifiedBox.x).toBeGreaterThan(waitingApprovalBox.x + waitingApprovalBox.width - 5);
      }
    }
  });

  test('kanban columns should be centered in the viewport', async ({ page }) => {
    // Setup project and navigate to board view
    await setupProjectWithPathNoWorktrees(page, testRepo.path);
    await page.goto('/');
    await waitForNetworkIdle(page);
    await waitForBoardView(page);

    // Wait for the board to fully render
    await page.waitForTimeout(500);

    // Set a specific viewport size
    await page.setViewportSize({ width: 1600, height: 900 });
    await page.waitForTimeout(300);

    // Get the first and last columns
    const backlogColumn = page.locator('[data-testid="kanban-column-backlog"]');
    const verifiedColumn = page.locator('[data-testid="kanban-column-verified"]');

    const backlogBox = await backlogColumn.boundingBox();
    const verifiedBox = await verifiedColumn.boundingBox();

    expect(backlogBox).not.toBeNull();
    expect(verifiedBox).not.toBeNull();

    if (backlogBox && verifiedBox) {
      // Get the actual container width (accounting for sidebar)
      // The board-view container is inside a flex container that accounts for sidebar
      const containerWidth = await page.evaluate(() => {
        const boardView = document.querySelector('[data-testid="board-view"]');
        if (!boardView) return window.innerWidth;
        const parent = boardView.parentElement;
        return parent ? parent.clientWidth : window.innerWidth;
      });

      // Calculate the left and right margins relative to the container
      // The bounding box x is relative to the viewport, so we need to find where
      // the container starts relative to the viewport
      const containerLeft = await page.evaluate(() => {
        const boardView = document.querySelector('[data-testid="board-view"]');
        if (!boardView) return 0;
        const parent = boardView.parentElement;
        if (!parent) return 0;
        const rect = parent.getBoundingClientRect();
        return rect.left;
      });

      // Calculate margins relative to the container
      const leftMargin = backlogBox.x - containerLeft;
      const rightMargin = containerWidth - (verifiedBox.x + verifiedBox.width - containerLeft);

      // The margins should be roughly equal (columns are centered)
      // Allow for some tolerance due to padding and gaps
      const marginDifference = Math.abs(leftMargin - rightMargin);
      expect(marginDifference).toBeLessThan(50); // Should be reasonably centered
    }
  });

  test('kanban columns should have no horizontal scrollbar at standard viewport width', async ({
    page,
  }) => {
    // Setup project and navigate to board view
    await setupProjectWithPathNoWorktrees(page, testRepo.path);
    await page.goto('/');
    await waitForNetworkIdle(page);
    await waitForBoardView(page);

    // Set a standard viewport size (1400px which is the default window width)
    await page.setViewportSize({ width: 1400, height: 900 });
    await page.waitForTimeout(300);

    // Check if horizontal scrollbar is present by comparing scrollWidth and clientWidth
    const hasHorizontalScroll = await page.evaluate(() => {
      const boardContainer = document.querySelector('[data-testid="board-view"]');
      if (!boardContainer) return false;
      return boardContainer.scrollWidth > boardContainer.clientWidth;
    });

    // There should be no horizontal scroll at standard width since columns scale down
    expect(hasHorizontalScroll).toBe(false);
  });

  test('kanban columns should fit at minimum width (1500px - Electron minimum)', async ({
    page,
  }) => {
    // Setup project and navigate to board view
    await setupProjectWithPathNoWorktrees(page, testRepo.path);
    await page.goto('/');
    await waitForNetworkIdle(page);
    await waitForBoardView(page);

    // Set viewport to the new Electron minimum width (1500px)
    await page.setViewportSize({ width: 1500, height: 900 });
    await page.waitForTimeout(300);

    // Get all four kanban columns
    const backlogColumn = page.locator('[data-testid="kanban-column-backlog"]');
    const verifiedColumn = page.locator('[data-testid="kanban-column-verified"]');

    // Verify columns are visible
    await expect(backlogColumn).toBeVisible();
    await expect(verifiedColumn).toBeVisible();

    // Check if horizontal scrollbar is present
    const hasHorizontalScroll = await page.evaluate(() => {
      const boardContainer = document.querySelector('[data-testid="board-view"]');
      if (!boardContainer) return false;
      return boardContainer.scrollWidth > boardContainer.clientWidth;
    });

    // There should be no horizontal scroll at minimum width
    expect(hasHorizontalScroll).toBe(false);

    // Verify columns are at least minimum width (280px)
    const backlogBox = await backlogColumn.boundingBox();
    expect(backlogBox).not.toBeNull();
    if (backlogBox) {
      expect(backlogBox.width).toBeGreaterThanOrEqual(280);
    }
  });

  test('kanban columns should scale correctly when sidebar is collapsed', async ({ page }) => {
    // Setup project and navigate to board view
    await setupProjectWithPathNoWorktrees(page, testRepo.path);
    await page.goto('/');
    await waitForNetworkIdle(page);
    await waitForBoardView(page);

    // Set a viewport size
    await page.setViewportSize({ width: 1600, height: 900 });
    await page.waitForTimeout(300);

    // Get initial column width
    const backlogColumn = page.locator('[data-testid="kanban-column-backlog"]');
    const initialBox = await backlogColumn.boundingBox();
    expect(initialBox).not.toBeNull();

    // Find and click the sidebar collapse button
    const collapseButton = page.locator('[data-testid="sidebar-collapse-button"]');
    if (await collapseButton.isVisible()) {
      await collapseButton.click();

      // Wait for sidebar transition (300ms) + buffer
      await page.waitForTimeout(400);

      // Get column width after collapse
      const collapsedBox = await backlogColumn.boundingBox();
      expect(collapsedBox).not.toBeNull();

      if (initialBox && collapsedBox) {
        // Column should be wider or same after sidebar collapse (more space available)
        // Allow for small variations due to transitions
        expect(collapsedBox.width).toBeGreaterThanOrEqual(initialBox.width - 5);

        // Width should still be at least minimum
        expect(collapsedBox.width).toBeGreaterThanOrEqual(280);
      }

      // Verify no horizontal scrollbar after collapse
      const hasHorizontalScroll = await page.evaluate(() => {
        const boardContainer = document.querySelector('[data-testid="board-view"]');
        if (!boardContainer) return false;
        return boardContainer.scrollWidth > boardContainer.clientWidth;
      });
      expect(hasHorizontalScroll).toBe(false);
    }
  });
});
