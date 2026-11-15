import fs from 'node:fs';
import { expect, Page, test } from '@playwright/test';

function attachSafetyMonitors(page: Page) {
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  const externalRequests: string[] = [];

  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      const text = msg.text();
      // Ignore offline/font warnings when simulating browser offline mode
      if (!text.includes('ERR_INTERNET_DISCONNECTED') && !text.includes('fonts.googleapis.com')) {
        consoleErrors.push(text);
      }
    }
  });

  page.on('pageerror', (err) => {
    pageErrors.push(String(err));
  });

  page.on('request', (req) => {
    const url = req.url();
    if (
      url.startsWith('http://127.0.0.1') ||
      url.startsWith('http://localhost') ||
      url.startsWith('data:') ||
      url.startsWith('blob:')
    ) {
      return;
    }
    // Google Fonts link in index.html may fire online; fail if app code calls any API/cloud/Windmill endpoint
    if (!url.startsWith('https://fonts.googleapis.com') && !url.startsWith('https://fonts.gstatic.com')) {
      externalRequests.push(url);
    }
  });

  return { consoleErrors, pageErrors, externalRequests };
}

test.describe('UOR Offline Foundry Studio Workspace E2E', () => {
  test('1-8: studio workspace, template project, conversations, streaming, cancel/retry, inspect element, diff approval, undo/redo & checkpoints', async ({
    page,
  }) => {
    const monitors = attachSafetyMonitors(page);
    await page.goto('/');

    // 1. Initial studio workspace load
    await expect(page.getByText('UOR Offline Foundry').first()).toBeVisible();
    const modesNav = page.getByRole('navigation', { name: 'Workspace modes' });
    await expect(modesNav.getByRole('button', { name: 'Chat' })).toBeVisible();
    await expect(modesNav.getByRole('button', { name: 'Preview' })).toBeVisible();
    await expect(modesNav.getByRole('button', { name: 'Build' })).toBeVisible();
    await expect(modesNav.getByRole('button', { name: 'Verify & Release' })).toBeVisible();

    // Dismiss first-run guide and verify clean workspace
    const dismissGuide = page.getByRole('button', { name: 'Dismiss workflow guide' });
    if (await dismissGuide.isVisible()) {
      await dismissGuide.click();
    }

    // 9 (early part): Engineering intake validation rejects empty required fields
    await page.getByRole('button', { name: 'New Project' }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.getByRole('button', { name: /Submit & Launch Simulated Workflow/i }).click();
    await expect(page.getByText(/Project name must be at least 4 characters/i)).toBeVisible();

    // 2. Verify 3 UOR-grounded synthetic templates and create Formal Research Project
    await expect(page.getByTestId('template-formal-research')).toBeVisible();
    await expect(page.getByTestId('template-prism-product')).toBeVisible();
    await expect(page.getByTestId('template-rust-workspace-model')).toBeVisible();
    await page.getByTestId('template-formal-research').click();
    await page.locator('#intake-name').fill('LexLean Proof Template Run');
    await page.getByRole('button', { name: /Submit & Launch Simulated Workflow/i }).click();
    await expect(page.getByRole('dialog')).toBeHidden();
    await expect(page.getByRole('heading', { level: 1, name: 'LexLean Proof Template Run' })).toBeVisible();

    // 3. Conversation creation, switching, rename, and search
    await page.getByRole('button', { name: 'New', exact: true }).click();
    await expect(page.getByText(/Started a fresh local conversation thread/i)).toBeVisible();

    const firstRenameBtn = page.getByRole('button', { name: /Rename conversation Session/i }).first();
    await firstRenameBtn.click();
    const renameInput = page.getByRole('textbox', { name: 'Rename conversation input' });
    await renameInput.fill('Kernel Audit Thread');
    await renameInput.press('Enter');
    await expect(page.getByText('Kernel Audit Thread').first()).toBeVisible();

    const threadSearch = page.getByRole('searchbox', { name: 'Search conversations' });
    await threadSearch.fill('Kernel Audit');
    await expect(page.getByText('Kernel Audit Thread').first()).toBeVisible();
    await threadSearch.fill('');

    // 4. Simulated AI response streaming
    const composer = page.getByRole('textbox', { name: 'Conversation prompt' });
    await composer.fill('Explain what blocks release for this project');
    await page.getByRole('button', { name: 'Send', exact: true }).click();
    await expect(page.getByText(/Generating response/i)).toBeVisible();
    await expect(page.getByText(/MOCK_PREVIEW_PROVIDER|DEMO · Mock Chat Provider/i).first()).toBeVisible({
      timeout: 10_000,
    });
    await expect(page.getByText(/verification suites non-passing\/unverified/i).first()).toBeVisible({
      timeout: 10_000,
    });

    // 5a. Stop / cancel mid-generation + Retry
    await composer.fill('Check Windmill workflow status for this project');
    await page.getByRole('button', { name: 'Send', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Stop' }).first()).toBeVisible();
    await page.getByRole('button', { name: 'Stop' }).first().click();
    await expect(page.getByText(/Generation cancelled by operator before completion/i)).toBeVisible();
    await page.getByRole('button', { name: 'Retry' }).click();
    await expect(page.getByText(/uor-offline-foundry.*NOT CONNECTED/i).first()).toBeVisible({
      timeout: 10_000,
    });

    // 5b. Simulated error state + Retry recovery
    await composer.fill('simulate error');
    await page.getByRole('button', { name: 'Send', exact: true }).click();
    await expect(page.getByText(/Windmill LM Studio runnable bridge is not reachable/i).first()).toBeVisible({
      timeout: 10_000,
    });
    await page.getByRole('button', { name: 'Dismiss error' }).click();

    // 6. Preview element selection -> referenced change request
    await page.getByRole('button', { name: 'Select Element' }).click();
    await page
      .getByRole('region', { name: 'Live preview panel' })
      .getByRole('heading', { level: 2 })
      .click();
    await expect(page.getByText(/Selected element:.*Preview Header/i)).toBeVisible();

    // 7. Draft change proposal before/after diff review + Approve & Apply Draft
    await composer.fill('Rename title to "Hologram Verified UI"');
    await page.getByRole('button', { name: 'Send', exact: true }).click();
    await expect(page.getByRole('button', { name: /Approve & Apply Draft/i })).toBeVisible({
      timeout: 10_000,
    });
    await expect(page.getByText('+ Hologram Verified UI')).toBeVisible();
    await page.getByRole('button', { name: /Approve & Apply Draft/i }).click();
    await expect(page.getByRole('heading', { name: 'Hologram Verified UI' })).toBeVisible();

    // 8. Named Checkpoint + Undo / Redo + Safe Preview Reset
    await page.getByRole('button', { name: 'Manage project checkpoints' }).click();
    await page.getByRole('textbox', { name: 'New checkpoint name' }).fill('Renamed Header CP');
    await page.getByRole('button', { name: 'Save Checkpoint' }).click();
    await expect(page.getByText('Renamed Header CP', { exact: true })).toBeVisible();

    await page.getByRole('button', { name: 'Undo preview draft change' }).click();
    await expect(page.getByRole('heading', { name: 'Hologram Verified UI' })).toBeHidden();

    await page.getByRole('button', { name: 'Redo preview draft change' }).click();
    await expect(page.getByRole('heading', { name: 'Hologram Verified UI' })).toBeVisible();

    await page.getByRole('button', { name: 'Reset simulated preview' }).click();
    await expect(page.getByRole('heading', { name: 'Hologram Verified UI' })).toBeHidden();

    // Restore named checkpoint
    await page.getByRole('button', { name: 'Restore', exact: true }).first().click();
    await expect(page.getByRole('heading', { name: 'Hologram Verified UI' })).toBeVisible();

    expect(monitors.consoleErrors).toEqual([]);
    expect(monitors.pageErrors).toEqual([]);
    expect(monitors.externalRequests).toEqual([]);
  });

  test('10-14: Build stages, Verify & Release blockers, sanitized air-gapped export vs local backup restore, reload persistence, and offline mode', async ({
    page,
    context,
  }) => {
    const monitors = attachSafetyMonitors(page);
    await page.goto('/');

    // Create a clean demo project via quick sample & rename it so reload persistence is verifiable
    await page.getByRole('button', { name: 'New Project' }).click();
    await page.getByRole('button', { name: 'Load Sample Request' }).click();
    await page.locator('#intake-name').fill('Persistence E2E Project');
    await page.getByRole('button', { name: /Submit & Launch Simulated Workflow/i }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Persistence E2E Project' })).toBeVisible();

    // Save a checkpoint before switching modes
    await page.getByRole('button', { name: 'Manage project checkpoints' }).click();
    await page.getByRole('textbox', { name: 'New checkpoint name' }).fill('Reload Check CP');
    await page.getByRole('button', { name: 'Save Checkpoint' }).click();

    // 10. Build mode workflow stage progression & idempotent local staging
    const modesNav = page.getByRole('navigation', { name: 'Workspace modes' });
    await modesNav.getByRole('button', { name: 'Build' }).click();
    await expect(page.getByRole('button', { name: 'Step Simulated Stage' })).toBeVisible();
    await page.getByRole('button', { name: 'Step Simulated Stage' }).click();

    await page.getByRole('button', { name: 'Stage Local Intent' }).click();
    await expect(page.getByRole('main').getByText(/Staged local workflow intent/i)).toBeVisible();
    await page.getByRole('button', { name: 'Stage Local Intent' }).click();
    await expect(page.getByRole('main').getByText(/Duplicate dispatch prevented/i)).toBeVisible();

    // Check Build -> Artifacts tab direct download gating + Hologram v4 header/manifest parser
    await page.getByRole('button', { name: /Artifacts & Provenance/i }).click();
    await expect(page.getByTestId('direct-download-gate')).toBeVisible();
    await expect(page.getByRole('button', { name: /\.holo Archive Binary/i })).toBeDisabled();
    await page.getByRole('button', { name: /Test `PP3001` JSON Rejection/i }).click();
    await expect(page.getByTestId('holo-inspection-result')).toContainText('REJECTED_JSON_AS_HOLO_PP3001');
    await page.getByRole('button', { name: /Test Valid `HOLO\\x04\\0` Bytes/i }).click();
    await expect(page.getByTestId('holo-inspection-result')).toContainText('VALID_HOLO_V4');
    await expect(page.getByTestId('holo-manifest-summary')).toContainText('prismpm/holo-v4-manifest/1');
    await page.getByRole('button', { name: /Test Corrupt Manifest Rejection/i }).click();
    await expect(page.getByTestId('holo-inspection-result')).toContainText('INVALID_MANIFEST');

    // 11. Verify & Release blockers + contextual Source Review & Compliance
    await modesNav.getByRole('button', { name: 'Verify & Release' }).click();
    await expect(page.getByText('RELEASE BLOCKED').first()).toBeVisible();
    await expect(page.getByText('NOT VERIFIED').first()).toBeVisible();
    await page.getByRole('button', { name: /Source Review & Compliance/i }).click();
    await expect(page.getByTestId('source-compliance-panel')).toBeVisible();
    await expect(page.getByText('UOR Source Review & Compliance Register')).toBeVisible();
    await expect(page.getByRole('button', { name: 'All Sources (8)' })).toBeVisible();
    await expect(page.getByText(/e3be477fded263029479127363f7fb6a3597e7d4/).first()).toBeVisible();
    await page.getByRole('button', { name: /Release Governance/i }).click();
    await expect(page.getByRole('button', { name: /Authorize Production Release \(Blocked\)/i })).toBeDisabled();
    await expect(page.getByText('NO (Prohibited)').first()).toBeVisible();

    // 12a. Sanitized Air-Gapped Export (preview + confirm + verify JSON payload)
    await page.getByRole('button', { name: /Runtime Offline|Air-Gapped/i }).click();
    await page.getByRole('button', { name: 'Preview Sanitized Export' }).click();
    await expect(page.getByText(/uor.foundry.air-gapped-bundle.v2/i)).toBeVisible();
    await page.getByLabel(/I confirm exporting allowlisted plaintext metadata only/i).check();

    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: /Confirm & Download Export/i }).click();
    const exportDownload = await downloadPromise;
    const exportPath = await exportDownload.path();
    expect(exportPath).toBeTruthy();
    const exportedJson = JSON.parse(fs.readFileSync(exportPath!, 'utf8'));
    expect(exportedJson.schema).toBe('uor.foundry.air-gapped-bundle.v2');
    expect(JSON.stringify(exportedJson)).not.toContain('conversations');
    expect(JSON.stringify(exportedJson)).not.toContain('Bearer ');

    // 12b. Manual Local Workspace Backup export + reject air-gapped v2 bundle on restore
    const backupDownloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Export Local Backup' }).click();
    const backupDownload = await backupDownloadPromise;
    const backupPath = await backupDownload.path();
    expect(backupPath).toBeTruthy();
    const backupJson = JSON.parse(fs.readFileSync(backupPath!, 'utf8'));
    expect(backupJson.schema).toBe('uor.foundry.workspace-backup.v1');

    // Attempt importing air-gapped export into backup restore -> must be rejected
    await page.getByLabel('Upload local workspace backup JSON').setInputFiles(exportPath!);
    await expect(page.getByText(/Air-gapped metadata export bundles.*have imports disabled/i).first()).toBeVisible();

    // 13. Persistence across full page.reload()
    await page.reload();
    await expect(page.getByRole('heading', { level: 1, name: 'Persistence E2E Project' })).toBeVisible();
    await page.getByRole('button', { name: 'Manage project checkpoints' }).click();
    await expect(page.getByText('Reload Check CP')).toBeVisible();

    // 14. Offline browser simulation -> clean offline behavior and zero remote traffic
    await context.setOffline(true);
    await page.evaluate(() => window.dispatchEvent(new Event('offline')));
    await expect(page.getByRole('button', { name: /Browser Offline/i })).toBeVisible();

    const composer = page.getByRole('textbox', { name: 'Conversation prompt' });
    await composer.fill('Check offline Windmill status');
    await page.getByRole('button', { name: 'Send', exact: true }).click();
    await expect(page.getByText(/NOT CONNECTED/i).first()).toBeVisible({ timeout: 10_000 });
    await context.setOffline(false);

    expect(monitors.consoleErrors).toEqual([]);
    expect(monitors.pageErrors).toEqual([]);
    expect(monitors.externalRequests).toEqual([]);
  });

  test('15: Keyboard shortcuts, ARIA landmarks, and desktop (1440px) / mobile (390px) responsive layout', async ({
    page,
  }) => {
    const monitors = attachSafetyMonitors(page);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');

    // Desktop no horizontal overflow
    const desktopOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth
    );
    expect(desktopOverflow).toBe(false);

    // Keyboard shortcuts: Alt+3 -> Build, Alt+4 -> Verify & Release, Ctrl+K -> Quick Switcher
    await page.keyboard.press('Alt+3');
    await expect(page.getByText('Simulated Pipeline')).toBeVisible();
    await page.keyboard.press('Alt+4');
    await expect(page.getByText('Independent Verification & Release Authority')).toBeVisible();
    await page.keyboard.press('Alt+1');

    await page.keyboard.press('Control+k');
    await expect(page.getByRole('dialog', { name: 'Quick project switcher' })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog', { name: 'Quick project switcher' })).toBeHidden();

    // Mobile 390px viewport + drawer accessibility
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(150);
    const mobileOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth
    );
    expect(mobileOverflow).toBe(false);

    await page.getByRole('button', { name: 'Open workspace sidebar' }).click();
    await expect(page.getByRole('button', { name: 'New Project' })).toBeVisible();
    await page.getByRole('button', { name: 'Close sidebar' }).click();

    expect(monitors.consoleErrors).toEqual([]);
    expect(monitors.pageErrors).toEqual([]);
    expect(monitors.externalRequests).toEqual([]);
  });
});
