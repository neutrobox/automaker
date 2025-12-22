import { test, expect } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';
import {
  resetContextDirectory,
  createContextFileOnDisk,
  contextFileExistsOnDisk,
  setupProjectWithFixture,
  getFixturePath,
  navigateToContext,
  waitForFileContentToLoad,
  switchToEditMode,
  waitForContextFile,
  selectContextFile,
  simulateFileDrop,
  setContextEditorContent,
  getContextEditorContent,
  clickElement,
  fillInput,
  getByTestId,
  waitForNetworkIdle,
} from './utils';

const WORKSPACE_ROOT = path.resolve(process.cwd(), '../..');
const TEST_IMAGE_SRC = path.join(WORKSPACE_ROOT, 'apps/ui/public/logo.png');

// Configure all tests to run serially to prevent interference with shared context directory
test.describe.configure({ mode: 'serial' });

// ============================================================================
// Test Suite 1: Context View - File Management
// ============================================================================
test.describe('Context View - File Management', () => {
  test.beforeEach(async () => {
    resetContextDirectory();
  });

  test.afterEach(async () => {
    resetContextDirectory();
  });

  test('should create a new MD context file', async ({ page }) => {
    await setupProjectWithFixture(page, getFixturePath());
    await page.goto('/');
    await waitForNetworkIdle(page);

    await navigateToContext(page);

    // Click Create Markdown button
    await clickElement(page, 'create-markdown-button');
    await page.waitForSelector('[data-testid="create-markdown-dialog"]', {
      timeout: 5000,
    });

    // Enter filename
    await fillInput(page, 'new-markdown-name', 'test-context.md');

    // Enter content
    const testContent = '# Test Context\n\nThis is test content';
    await fillInput(page, 'new-markdown-content', testContent);

    // Click confirm
    await clickElement(page, 'confirm-create-markdown');

    // Wait for dialog to close
    await page.waitForFunction(
      () => !document.querySelector('[data-testid="create-markdown-dialog"]'),
      { timeout: 5000 }
    );

    // Wait for file list to refresh (file should appear)
    await waitForContextFile(page, 'test-context.md', 10000);

    // Verify file appears in list
    const fileButton = await getByTestId(page, 'context-file-test-context.md');
    await expect(fileButton).toBeVisible();

    // Click on the file and wait for it to be selected
    await selectContextFile(page, 'test-context.md');

    // Wait for content to load
    await waitForFileContentToLoad(page);

    // Switch to edit mode if in preview mode (markdown files default to preview)
    await switchToEditMode(page);

    // Wait for editor to be visible
    await page.waitForSelector('[data-testid="context-editor"]', {
      timeout: 5000,
    });

    // Verify content in editor
    const editorContent = await getContextEditorContent(page);
    expect(editorContent).toBe(testContent);
  });

  test('should edit an existing MD context file', async ({ page }) => {
    // Create a test file on disk first
    const originalContent = '# Original Content\n\nThis will be edited.';
    createContextFileOnDisk('edit-test.md', originalContent);

    await setupProjectWithFixture(page, getFixturePath());
    await page.goto('/');
    await waitForNetworkIdle(page);

    await navigateToContext(page);

    // Click on the existing file and wait for it to be selected
    await selectContextFile(page, 'edit-test.md');

    // Wait for file content to load
    await waitForFileContentToLoad(page);

    // Switch to edit mode (markdown files open in preview mode by default)
    await switchToEditMode(page);

    // Wait for editor
    await page.waitForSelector('[data-testid="context-editor"]', {
      timeout: 5000,
    });

    // Modify content
    const newContent = '# Modified Content\n\nThis has been edited.';
    await setContextEditorContent(page, newContent);

    // Click save
    await clickElement(page, 'save-context-file');

    // Wait for save to complete
    await page.waitForFunction(
      () =>
        document.querySelector('[data-testid="save-context-file"]')?.textContent?.includes('Saved'),
      { timeout: 5000 }
    );

    // Reload page
    await page.reload();
    await waitForNetworkIdle(page);

    // Navigate back to context view
    await navigateToContext(page);

    // Wait for file to appear after reload and select it
    await selectContextFile(page, 'edit-test.md');

    // Wait for content to load
    await waitForFileContentToLoad(page);

    // Switch to edit mode (markdown files open in preview mode)
    await switchToEditMode(page);

    await page.waitForSelector('[data-testid="context-editor"]', {
      timeout: 5000,
    });

    // Verify content persisted
    const persistedContent = await getContextEditorContent(page);
    expect(persistedContent).toBe(newContent);
  });

  test('should remove an MD context file', async ({ page }) => {
    // Create a test file on disk first
    createContextFileOnDisk('delete-test.md', '# Delete Me');

    await setupProjectWithFixture(page, getFixturePath());
    await page.goto('/');
    await waitForNetworkIdle(page);

    await navigateToContext(page);

    // Click on the file to select it
    const fileButton = await getByTestId(page, 'context-file-delete-test.md');
    await fileButton.waitFor({ state: 'visible', timeout: 5000 });
    await fileButton.click();

    // Click delete button
    await clickElement(page, 'delete-context-file');

    // Wait for delete dialog
    await page.waitForSelector('[data-testid="delete-context-dialog"]', {
      timeout: 5000,
    });

    // Confirm deletion
    await clickElement(page, 'confirm-delete-file');

    // Wait for dialog to close
    await page.waitForFunction(
      () => !document.querySelector('[data-testid="delete-context-dialog"]'),
      { timeout: 5000 }
    );

    // Verify file is removed from list
    const deletedFile = await getByTestId(page, 'context-file-delete-test.md');
    await expect(deletedFile).not.toBeVisible();

    // Verify file is removed from disk
    expect(contextFileExistsOnDisk('delete-test.md')).toBe(false);
  });

  test('should upload an image context file', async ({ page }) => {
    await setupProjectWithFixture(page, getFixturePath());
    await page.goto('/');
    await waitForNetworkIdle(page);

    await navigateToContext(page);

    // Use the hidden file input to upload an image directly
    // The "Import File" button triggers this input
    const fileInput = page.locator('[data-testid="file-import-input"]');
    await fileInput.setInputFiles(TEST_IMAGE_SRC);

    // Wait for file to appear in the list (filename is extracted from path)
    await waitForContextFile(page, 'logo.png', 10000);

    // Verify file appears in list
    const fileButton = await getByTestId(page, 'context-file-logo.png');
    await expect(fileButton).toBeVisible();

    // Click on the image to view it
    await fileButton.click();

    // Verify image preview is displayed
    await page.waitForSelector('[data-testid="image-preview"]', {
      timeout: 5000,
    });
    const imagePreview = await getByTestId(page, 'image-preview');
    await expect(imagePreview).toBeVisible();
  });

  test('should remove an image context file', async ({ page }) => {
    // Create a test image file on disk as base64 data URL (matching app's storage format)
    const imageContent = fs.readFileSync(TEST_IMAGE_SRC);
    const base64DataUrl = `data:image/png;base64,${imageContent.toString('base64')}`;
    const contextPath = path.join(getFixturePath(), '.automaker/context');
    fs.writeFileSync(path.join(contextPath, 'delete-image.png'), base64DataUrl);

    await setupProjectWithFixture(page, getFixturePath());
    await page.goto('/');
    await waitForNetworkIdle(page);

    await navigateToContext(page);

    // Wait for the image file and select it
    await selectContextFile(page, 'delete-image.png');

    // Wait for file content (image preview) to load
    await waitForFileContentToLoad(page);

    // Click delete button
    await clickElement(page, 'delete-context-file');

    // Wait for delete dialog
    await page.waitForSelector('[data-testid="delete-context-dialog"]', {
      timeout: 5000,
    });

    // Confirm deletion
    await clickElement(page, 'confirm-delete-file');

    // Wait for dialog to close
    await page.waitForFunction(
      () => !document.querySelector('[data-testid="delete-context-dialog"]'),
      { timeout: 5000 }
    );

    // Verify file is removed from list
    const deletedImageFile = await getByTestId(page, 'context-file-delete-image.png');
    await expect(deletedImageFile).not.toBeVisible();
  });

  test('should toggle markdown preview mode', async ({ page }) => {
    // Create a markdown file with content
    const mdContent =
      '# Heading\n\n**Bold text** and *italic text*\n\n- List item 1\n- List item 2';
    createContextFileOnDisk('preview-test.md', mdContent);

    await setupProjectWithFixture(page, getFixturePath());
    await page.goto('/');
    await waitForNetworkIdle(page);

    await navigateToContext(page);

    // Click on the markdown file
    const fileButton = await getByTestId(page, 'context-file-preview-test.md');
    await fileButton.waitFor({ state: 'visible', timeout: 5000 });
    await fileButton.click();

    // Wait for content to load (markdown files open in preview mode by default)
    await waitForFileContentToLoad(page);

    // Check if preview button is visible (indicates it's a markdown file)
    const previewToggle = await getByTestId(page, 'toggle-preview-mode');
    await expect(previewToggle).toBeVisible();

    // Markdown files always open in preview mode by default (see context-view.tsx:163)
    // Verify we're in preview mode
    const markdownPreview = await getByTestId(page, 'markdown-preview');
    await expect(markdownPreview).toBeVisible();

    // Click to switch to edit mode
    await previewToggle.click();
    await page.waitForSelector('[data-testid="context-editor"]', {
      timeout: 5000,
    });

    // Verify editor is shown
    const editor = await getByTestId(page, 'context-editor');
    await expect(editor).toBeVisible();
    await expect(markdownPreview).not.toBeVisible();

    // Click to switch back to preview mode
    await previewToggle.click();
    await page.waitForSelector('[data-testid="markdown-preview"]', {
      timeout: 5000,
    });

    // Verify preview is shown
    await expect(markdownPreview).toBeVisible();
  });
});

// ============================================================================
// Test Suite 2: Context View - Drag and Drop
// ============================================================================
test.describe('Context View - Drag and Drop', () => {
  test.beforeEach(async () => {
    resetContextDirectory();
  });

  test.afterEach(async () => {
    resetContextDirectory();
  });

  test('should handle drag and drop of MD file onto textarea in add dialog', async ({ page }) => {
    await setupProjectWithFixture(page, getFixturePath());
    await page.goto('/');
    await waitForNetworkIdle(page);

    await navigateToContext(page);

    // Open create markdown dialog
    await clickElement(page, 'create-markdown-button');
    await page.waitForSelector('[data-testid="create-markdown-dialog"]', {
      timeout: 5000,
    });

    // Simulate drag and drop of a .md file onto the textarea
    const droppedContent = '# Dropped Content\n\nThis was dragged and dropped.';
    await simulateFileDrop(
      page,
      '[data-testid="new-markdown-content"]',
      'dropped-file.md',
      droppedContent
    );

    // Wait for content to be populated in textarea
    const textarea = await getByTestId(page, 'new-markdown-content');
    await textarea.waitFor({ state: 'visible' });
    await expect(textarea).toHaveValue(droppedContent);

    // Verify content is populated in textarea
    const textareaContent = await textarea.inputValue();
    expect(textareaContent).toBe(droppedContent);

    // Verify filename is auto-filled
    const filenameValue = await page.locator('[data-testid="new-markdown-name"]').inputValue();
    expect(filenameValue).toBe('dropped-file.md');

    // Confirm and create the file
    await clickElement(page, 'confirm-create-markdown');

    // Wait for dialog to close
    await page.waitForFunction(
      () => !document.querySelector('[data-testid="create-markdown-dialog"]'),
      { timeout: 5000 }
    );

    // Verify file was created
    const droppedFile = await getByTestId(page, 'context-file-dropped-file.md');
    await expect(droppedFile).toBeVisible();
  });

  test('should handle drag and drop of file onto main view', async ({ page }) => {
    await setupProjectWithFixture(page, getFixturePath());
    await page.goto('/');
    await waitForNetworkIdle(page);

    await navigateToContext(page);

    // Wait for the context view to be fully loaded
    await page.waitForSelector('[data-testid="context-file-list"]', {
      timeout: 5000,
    });

    // Simulate drag and drop onto the drop zone
    const droppedContent = 'This is a text file dropped onto the main view.';
    await simulateFileDrop(
      page,
      '[data-testid="context-drop-zone"]',
      'main-drop.txt',
      droppedContent
    );

    // Wait for file to appear in the list (drag-drop triggers file creation)
    await waitForContextFile(page, 'main-drop.txt', 15000);

    // Verify file appears in the file list
    const fileButton = await getByTestId(page, 'context-file-main-drop.txt');
    await expect(fileButton).toBeVisible();

    // Select file and verify content
    await fileButton.click();
    await page.waitForSelector('[data-testid="context-editor"]', {
      timeout: 5000,
    });

    const editorContent = await getContextEditorContent(page);
    expect(editorContent).toBe(droppedContent);
  });
});

// ============================================================================
// Test Suite 3: Context View - Edge Cases
// ============================================================================
test.describe('Context View - Edge Cases', () => {
  test.beforeEach(async () => {
    resetContextDirectory();
  });

  test.afterEach(async () => {
    resetContextDirectory();
  });

  test('should handle duplicate filename (overwrite behavior)', async ({ page }) => {
    // Create an existing file
    createContextFileOnDisk('test.md', '# Original Content');

    await setupProjectWithFixture(page, getFixturePath());
    await page.goto('/');
    await waitForNetworkIdle(page);

    await navigateToContext(page);

    // Verify the original file exists
    const originalFile = await getByTestId(page, 'context-file-test.md');
    await expect(originalFile).toBeVisible();

    // Try to create another file with the same name
    await clickElement(page, 'create-markdown-button');
    await page.waitForSelector('[data-testid="create-markdown-dialog"]', {
      timeout: 5000,
    });

    await fillInput(page, 'new-markdown-name', 'test.md');
    await fillInput(page, 'new-markdown-content', '# New Content - Overwritten');

    await clickElement(page, 'confirm-create-markdown');

    // Wait for dialog to close
    await page.waitForFunction(
      () => !document.querySelector('[data-testid="create-markdown-dialog"]'),
      { timeout: 5000 }
    );

    // File should still exist (was overwritten)
    await expect(originalFile).toBeVisible();

    // Select the file and verify the new content
    await originalFile.click();

    // Wait for content to load
    await waitForFileContentToLoad(page);

    // Switch to edit mode (markdown files open in preview mode)
    await switchToEditMode(page);

    await page.waitForSelector('[data-testid="context-editor"]', {
      timeout: 5000,
    });

    const editorContent = await getContextEditorContent(page);
    expect(editorContent).toBe('# New Content - Overwritten');
  });

  test('should handle special characters in filename', async ({ page }) => {
    await setupProjectWithFixture(page, getFixturePath());
    await page.goto('/');
    await waitForNetworkIdle(page);

    await navigateToContext(page);

    // Test file with parentheses
    await clickElement(page, 'create-markdown-button');
    await page.waitForSelector('[data-testid="create-markdown-dialog"]', {
      timeout: 5000,
    });

    await fillInput(page, 'new-markdown-name', 'context (1).md');
    await fillInput(page, 'new-markdown-content', 'Content with parentheses in filename');

    await clickElement(page, 'confirm-create-markdown');
    await page.waitForFunction(
      () => !document.querySelector('[data-testid="create-markdown-dialog"]'),
      { timeout: 5000 }
    );

    // Verify file is created - use CSS escape for special characters
    const fileWithParens = await getByTestId(page, 'context-file-context (1).md');
    await expect(fileWithParens).toBeVisible();

    // Test file with hyphens and underscores
    await clickElement(page, 'create-markdown-button');
    await page.waitForSelector('[data-testid="create-markdown-dialog"]', {
      timeout: 5000,
    });

    await fillInput(page, 'new-markdown-name', 'test-file_v2.md');
    await fillInput(page, 'new-markdown-content', 'Content with hyphens and underscores');

    await clickElement(page, 'confirm-create-markdown');
    await page.waitForFunction(
      () => !document.querySelector('[data-testid="create-markdown-dialog"]'),
      { timeout: 5000 }
    );

    // Verify file is created
    const fileWithHyphens = await getByTestId(page, 'context-file-test-file_v2.md');
    await expect(fileWithHyphens).toBeVisible();

    // Verify both files are accessible
    await fileWithHyphens.click();

    // Wait for content to load
    await waitForFileContentToLoad(page);

    // Switch to edit mode (markdown files open in preview mode)
    await switchToEditMode(page);

    await page.waitForSelector('[data-testid="context-editor"]', {
      timeout: 5000,
    });

    const content = await getContextEditorContent(page);
    expect(content).toBe('Content with hyphens and underscores');
  });

  test('should handle empty content', async ({ page }) => {
    await setupProjectWithFixture(page, getFixturePath());
    await page.goto('/');
    await waitForNetworkIdle(page);

    await navigateToContext(page);

    // Create file with empty content
    await clickElement(page, 'create-markdown-button');
    await page.waitForSelector('[data-testid="create-markdown-dialog"]', {
      timeout: 5000,
    });

    await fillInput(page, 'new-markdown-name', 'empty-file.md');
    // Don't fill any content - leave it empty

    await clickElement(page, 'confirm-create-markdown');
    await page.waitForFunction(
      () => !document.querySelector('[data-testid="create-markdown-dialog"]'),
      { timeout: 5000 }
    );

    // Verify file is created
    const emptyFile = await getByTestId(page, 'context-file-empty-file.md');
    await expect(emptyFile).toBeVisible();

    // Select file and verify editor shows empty content
    await emptyFile.click();

    // Wait for content to load
    await waitForFileContentToLoad(page);

    // Switch to edit mode (markdown files open in preview mode)
    await switchToEditMode(page);

    await page.waitForSelector('[data-testid="context-editor"]', {
      timeout: 5000,
    });

    const editorContent = await getContextEditorContent(page);
    expect(editorContent).toBe('');

    // Verify save works with empty content
    // The save button should be disabled when there are no changes
    // Let's add some content first, then clear it and save
    await setContextEditorContent(page, 'temporary');
    await setContextEditorContent(page, '');

    // Save should work
    await clickElement(page, 'save-context-file');
    await page.waitForFunction(
      () =>
        document.querySelector('[data-testid="save-context-file"]')?.textContent?.includes('Saved'),
      { timeout: 5000 }
    );
  });

  test('should verify persistence across page refresh', async ({ page }) => {
    // Create a file directly on disk to ensure it persists across refreshes
    const testContent = '# Persistence Test\n\nThis content should persist.';
    createContextFileOnDisk('persist-test.md', testContent);

    await setupProjectWithFixture(page, getFixturePath());
    await page.goto('/');
    await waitForNetworkIdle(page);

    await navigateToContext(page);

    // Verify file exists before refresh
    await waitForContextFile(page, 'persist-test.md', 10000);

    // Refresh the page
    await page.reload();
    await waitForNetworkIdle(page);

    // Navigate back to context view
    await navigateToContext(page);

    // Select the file after refresh (uses robust clicking mechanism)
    await selectContextFile(page, 'persist-test.md');

    // Wait for file content to load
    await waitForFileContentToLoad(page);

    // Switch to edit mode (markdown files open in preview mode)
    await switchToEditMode(page);

    await page.waitForSelector('[data-testid="context-editor"]', {
      timeout: 5000,
    });

    const persistedContent = await getContextEditorContent(page);
    expect(persistedContent).toBe(testContent);
  });
});
