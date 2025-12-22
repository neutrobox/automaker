import { Page } from '@playwright/test';

/**
 * Simulate drag and drop of a file onto an element
 */
export async function simulateFileDrop(
  page: Page,
  targetSelector: string,
  fileName: string,
  fileContent: string,
  mimeType: string = 'text/plain'
): Promise<void> {
  await page.evaluate(
    ({ selector, content, name, mime }) => {
      const target = document.querySelector(selector);
      if (!target) throw new Error(`Element not found: ${selector}`);

      const file = new File([content], name, { type: mime });
      const dataTransfer = new DataTransfer();
      dataTransfer.items.add(file);

      // Create events and explicitly define the dataTransfer property
      // to ensure it's accessible (some browsers don't properly set it from constructor)
      const dragOverEvent = new DragEvent('dragover', {
        bubbles: true,
        cancelable: true,
      });
      Object.defineProperty(dragOverEvent, 'dataTransfer', {
        value: dataTransfer,
        writable: false,
      });

      const dropEvent = new DragEvent('drop', {
        bubbles: true,
        cancelable: true,
      });
      Object.defineProperty(dropEvent, 'dataTransfer', {
        value: dataTransfer,
        writable: false,
      });

      // Dispatch drag events
      target.dispatchEvent(dragOverEvent);
      target.dispatchEvent(dropEvent);
    },
    { selector: targetSelector, content: fileContent, name: fileName, mime: mimeType }
  );
}

/**
 * Simulate pasting an image from clipboard onto an element
 * Works across all OS (Windows, Linux, macOS)
 */
export async function simulateImagePaste(
  page: Page,
  targetSelector: string,
  imageBase64: string,
  mimeType: string = 'image/png'
): Promise<void> {
  await page.evaluate(
    ({ selector, base64, mime }) => {
      const target = document.querySelector(selector);
      if (!target) throw new Error(`Element not found: ${selector}`);

      // Convert base64 to Blob
      const byteCharacters = atob(base64);
      const byteNumbers = new Array(byteCharacters.length);
      for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
      }
      const byteArray = new Uint8Array(byteNumbers);
      const blob = new Blob([byteArray], { type: mime });

      // Create a File from Blob
      const file = new File([blob], 'pasted-image.png', { type: mime });

      // Create a DataTransfer with clipboard items
      const dataTransfer = new DataTransfer();
      dataTransfer.items.add(file);

      // Create ClipboardEvent with the image data
      const clipboardEvent = new ClipboardEvent('paste', {
        bubbles: true,
        cancelable: true,
        clipboardData: dataTransfer,
      });

      target.dispatchEvent(clipboardEvent);
    },
    { selector: targetSelector, base64: imageBase64, mime: mimeType }
  );
}
