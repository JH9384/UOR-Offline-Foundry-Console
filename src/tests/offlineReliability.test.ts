import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DEMO_WINDMILL_JOB_FIXTURES,
  INITIAL_ACTIVITY,
  INITIAL_AI_ADVISORIES,
  INITIAL_APPROVALS,
  INITIAL_ARTIFACTS,
  INITIAL_CONVERSATIONS,
  INITIAL_OFFLINE_QUEUE,
  INITIAL_PREVIEW_STATES,
  INITIAL_PROJECTS,
  INITIAL_VERIFICATION_SUITES,
  INITIAL_WORKFLOW_RUNS,
} from '../shared/data/seedFoundryData.ts';
import {
  durableLocalStore,
  DurableWorkspaceSnapshot,
  LEGACY_STORAGE_KEY,
  migrateWorkspaceSnapshot,
  recoverWorkspaceSnapshot,
} from '../shared/services/durableLocalStore.ts';
import { foundrySyncService } from '../shared/services/syncService.ts';

function createBaselineSnapshot(): DurableWorkspaceSnapshot {
  return {
    schemaVersion: 2,
    revision: 1,
    updatedAt: '2026-11-15T00:00:00Z',
    authoritativeDatabase: false,
    persistenceNotice: 'Test snapshot',
    integrationMode: 'DEMO',
    connectivityProfile: 'OFFLINE_ONLY',
    selectedProjectId: INITIAL_PROJECTS[0].id,
    activeThreadId: INITIAL_CONVERSATIONS[0].id,
    projects: INITIAL_PROJECTS,
    runs: INITIAL_WORKFLOW_RUNS,
    verifications: INITIAL_VERIFICATION_SUITES,
    artifacts: INITIAL_ARTIFACTS,
    approvals: INITIAL_APPROVALS,
    advisories: INITIAL_AI_ADVISORIES,
    activity: INITIAL_ACTIVITY,
    conversations: INITIAL_CONVERSATIONS,
    previews: INITIAL_PREVIEW_STATES,
    draftHistory: [],
    checkpoints: [],
    workflowRequests: [],
    jobReferences: DEMO_WINDMILL_JOB_FIXTURES,
    operations: [],
    syncConflicts: [],
    offlineQueue: INITIAL_OFFLINE_QUEUE,
  };
}

test('migrates legacy v1/unversioned workspace snapshots to schema v2 while preserving data', () => {
  const v1Payload = {
    // Missing schemaVersion (legacy v1)
    revision: 7,
    integrationMode: 'ONLINE', // Should fail-closed back to DEMO
    connectivityProfile: 'AIR_GAPPED_TRANSFER',
    projects: [INITIAL_PROJECTS[0]],
    conversations: [INITIAL_CONVERSATIONS[0]],
    offlineQueue: [
      {
        id: 'oq-legacy',
        projectId: INITIAL_PROJECTS[0].id,
        kind: 'WORKFLOW_DISPATCH',
        label: 'Legacy queued item',
        targetEndpoint: 'http://127.0.0.1:8080/api/test',
        createdAt: '2026-11-15T00:00:00Z',
        status: 'QUEUED_LOCAL',
      },
    ],
  };

  const migrated = migrateWorkspaceSnapshot(v1Payload);
  assert.ok(migrated.snapshot);
  assert.equal(migrated.migratedFromVersion, 1);
  assert.equal(migrated.snapshot.schemaVersion, 2);
  assert.equal(migrated.snapshot.revision, 7);
  assert.equal(migrated.snapshot.integrationMode, 'DEMO');
  assert.equal(migrated.snapshot.connectivityProfile, 'AIR_GAPPED_TRANSFER');
  assert.equal(migrated.snapshot.projects?.length, 1);
  assert.equal(migrated.snapshot.conversations?.length, 1);
  assert.equal(migrated.snapshot.offlineQueue?.[0].autoReplayPermitted, false);
  assert.equal(migrated.snapshot.offlineQueue?.[0].retryRequiresConfirmation, true);
});

test('recovers safely from corrupted JSON and malformed partial snapshots without crashing', () => {
  const corrupted = recoverWorkspaceSnapshot('{not-valid-json', createBaselineSnapshot);
  assert.equal(corrupted.recovered, true);
  assert.equal(corrupted.snapshot.schemaVersion, 2);
  assert.equal(corrupted.snapshot.projects.length, INITIAL_PROJECTS.length);

  const partiallyMalformed = recoverWorkspaceSnapshot(
    {
      schemaVersion: 2,
      revision: 12,
      projects: [INITIAL_PROJECTS[0], { broken: true }],
      conversations: 'invalid-not-array',
      checkpoints: [
        {
          id: 'cp-1',
          projectId: INITIAL_PROJECTS[0].id,
          name: 'Verified Pre-Edit State',
          createdAt: '2026-11-15T01:00:00Z',
          preview: INITIAL_PREVIEW_STATES[INITIAL_PROJECTS[0].id],
        },
      ],
    },
    createBaselineSnapshot
  );

  assert.equal(partiallyMalformed.recovered, true);
  assert.equal(partiallyMalformed.snapshot.revision, 12);
  assert.equal(partiallyMalformed.snapshot.projects.length, 1);
  assert.equal(partiallyMalformed.snapshot.conversations.length, INITIAL_CONVERSATIONS.length);
  assert.equal(partiallyMalformed.snapshot.checkpoints?.length, 1);
});

test('handles browser storage QuotaExceededError cleanly and surfaces diagnostic warning', async () => {
  const originalWindow = (globalThis as { window?: unknown }).window;
  try {
    (globalThis as { window?: unknown }).window = {
      localStorage: {
        getItem: () => null,
        setItem: (key: string) => {
          assert.equal(key, LEGACY_STORAGE_KEY);
          const err = new Error('Storage quota exceeded');
          err.name = 'QuotaExceededError';
          throw err;
        },
      },
    };

    const diag = await durableLocalStore.saveSnapshot(createBaselineSnapshot());
    assert.equal(diag.quotaExceeded, true);
    assert.ok(diag.storageWarning?.includes('quota exceeded'));
    assert.equal(diag.autoReplayPermitted, false);
  } finally {
    (globalThis as { window?: unknown }).window = originalWindow;
  }
});

test('keeps local workspace backup restore strictly separated from sanitized air-gapped exports', () => {
  const baseline = createBaselineSnapshot();
  const backup = durableLocalStore.buildWorkspaceBackup(baseline);
  assert.equal(backup.schema, 'uor.foundry.workspace-backup.v1');
  assert.equal(backup.backupClassification, 'LOCAL_BROWSER_BACKUP_NON_AUTHORITATIVE');

  const restored = durableLocalStore.parseWorkspaceBackup(
    JSON.stringify(backup),
    createBaselineSnapshot
  );
  assert.equal(restored.ok, true);
  if (restored.ok) {
    assert.equal(restored.snapshot.projects.length, baseline.projects.length);
    assert.equal(restored.snapshot.conversations.length, baseline.conversations.length);
  }

  // Air-gapped export bundle must be rejected if supplied to workspace backup restore
  const airGap = foundrySyncService.buildAirGappedBundleFromSnapshot({
    integrationMode: 'DEMO',
    operatorConfirmed: true,
    snapshot: baseline,
  });
  const rejectedRestore = durableLocalStore.parseWorkspaceBackup(
    JSON.stringify(airGap),
    createBaselineSnapshot
  );
  assert.equal(rejectedRestore.ok, false);
  if (!rejectedRestore.ok) {
    assert.ok(rejectedRestore.error.includes('Air-gapped metadata export bundles'));
  }
});

test('distinguishes browser navigator.onLine from local Windmill availability and keeps auto-replay disabled', () => {
  const originalNavigator = globalThis.navigator;
  try {
    Object.defineProperty(globalThis, 'navigator', {
      configurable: true,
      value: { onLine: true },
    });

    const summary = foundrySyncService.evaluateConnectivityPolicy({
      profile: 'LOCAL_CONNECTED',
      integrationMode: 'LOCAL',
      localWindmillValidated: false,
      onlineAuthValidated: false,
    });

    assert.equal(summary.browserNavigatorOnline, true);
    assert.equal(summary.localWindmillAvailable, false);
    assert.equal(summary.integrationMode, 'DEMO');
    assert.equal(summary.autoReplayPermitted, false);
    assert.equal(summary.autoPublishPermitted, false);
  } finally {
    Object.defineProperty(globalThis, 'navigator', {
      configurable: true,
      value: originalNavigator,
    });
  }
});
