import {
  ActivityEvent,
  AiAdvisoryEntry,
  ApprovalDecisionRecord,
  ArtifactProvenanceRecord,
  ConnectivityProfile,
  ConversationThread,
  DraftHistoryEntry,
  DurableOperation,
  IntegrationMode,
  OfflineQueueItem,
  PreviewConfigState,
  ProductFamily,
  ProjectCheckpoint,
  ProjectLifecycleStatus,
  ProjectRecord,
  SanitizedAirGappedArtifactRef,
  SanitizedAirGappedOperationRef,
  SanitizedAirGappedProject,
  SyncConflictRecord,
  VerificationSuiteRecord,
  WindmillExecutionRequest,
  WindmillJobRecord,
  WorkflowRun,
  WorkspaceBackupBundle,
} from '../types/foundry';

export const LEGACY_V1_STORAGE_KEY = 'uor_foundry_console_state_v1';
export const LEGACY_STORAGE_KEY = 'uor_foundry_console_state_v2';
export const DURABLE_IDB_NAME = 'uor_foundry_durable_v1';
export const DURABLE_IDB_STORE = 'workspace_snapshots';
export const DURABLE_SNAPSHOT_KEY = 'active_snapshot';

export interface DurableWorkspaceSnapshot {
  schemaVersion: 2;
  revision: number;
  updatedAt: string;
  authoritativeDatabase: false;
  persistenceNotice: string;
  integrationMode: IntegrationMode;
  connectivityProfile: ConnectivityProfile;
  selectedProjectId?: string;
  activeThreadId?: string;
  projects: ProjectRecord[];
  runs: WorkflowRun[];
  verifications: VerificationSuiteRecord[];
  artifacts: ArtifactProvenanceRecord[];
  approvals: ApprovalDecisionRecord[];
  advisories: AiAdvisoryEntry[];
  activity: ActivityEvent[];
  conversations: ConversationThread[];
  previews: Record<string, PreviewConfigState>;
  draftHistory?: DraftHistoryEntry[];
  checkpoints?: ProjectCheckpoint[];
  workflowRequests: WindmillExecutionRequest[];
  jobReferences: WindmillJobRecord[];
  operations: DurableOperation[];
  syncConflicts: SyncConflictRecord[];
  offlineQueue: OfflineQueueItem[];
}

export interface DurableStorageDiagnostics {
  backend: 'indexeddb+localstorage' | 'localstorage-fallback' | 'memory-only';
  indexedDbSupported: boolean;
  lastSavedAt?: string;
  operationCount: number;
  quotaExceeded?: boolean;
  storageWarning?: string;
  estimatedBytes?: number;
  autoReplayPermitted: false;
  isAuthoritativeDatabase: false;
}

export interface SanitizedDurableExportInput {
  allowlistSchemaVersion: 'uor.foundry.air-gapped-bundle.v2';
  projects: SanitizedAirGappedProject[];
  artifacts: SanitizedAirGappedArtifactRef[];
  operations: SanitizedAirGappedOperationRef[];
  strippedSummary: {
    chatThreadsStripped: number;
    advisoriesStripped: number;
    activityEventsStripped: number;
    internalRecordsStripped: number;
    nonReferenceArtifactsStripped: number;
    internalSnapshotFieldsStripped: readonly string[];
  };
}

export const DURABLE_EXPORT_ALLOWLIST_SCHEMA = Object.freeze({
  schemaVersion: 'uor.foundry.air-gapped-bundle.v2' as const,
  mode: 'STRICT_ALLOWLIST_DENY_BY_DEFAULT' as const,
  projectFields: Object.freeze([
    'projectId',
    'approvedTitle',
    'productFamily',
    'workflowId',
    'sourceRevision',
    'lifecycleStatus',
    'acceptancePolicySchema',
  ] as const),
  artifactFields: Object.freeze([
    'artifactId',
    'projectId',
    'artifactName',
    'artifactFormat',
    'sha256Digest',
    'digestMode',
    'sourceRevision',
  ] as const),
  operationFields: Object.freeze([
    'operationId',
    'projectId',
    'kind',
    'revision',
    'timestamp',
    'syncState',
  ] as const),
  strippedSnapshotKeys: Object.freeze([
    'conversations',
    'advisories',
    'activity',
    'previews',
    'runs',
    'verifications',
    'approvals',
    'workflowRequests',
    'jobReferences',
    'syncConflicts',
    'offlineQueue',
    'schemaVersion',
    'revision',
    'updatedAt',
    'authoritativeDatabase',
    'persistenceNotice',
    'connectivityProfile',
    'selectedProjectId',
    'activeThreadId',
    'draftHistory',
    'checkpoints',
    'apiCredentials',
    'credentials',
    'secrets',
    'internalMetadata',
  ] as const),
});

const ALLOWED_PRODUCT_FAMILIES = new Set<ProductFamily>([
  'application',
  'formal-verification',
  'scientific-computation',
  'other',
]);

const ALLOWED_LIFECYCLE_STATUSES = new Set<ProjectLifecycleStatus>([
  'INTAKE',
  'IN WORKFLOW',
  'VERIFICATION PENDING',
  'REVIEW REQUIRED',
  'RELEASE BLOCKED',
  'SIMULATION COMPLETE',
]);

const ALLOWED_OPERATION_KINDS = new Set<DurableOperation['kind']>([
  'PROJECT_DRAFT_SAVE',
  'CONVERSATION_TURN',
  'DRAFT_APPROVAL',
  'WORKFLOW_INTENT_STAGED',
  'AIR_GAPPED_BUNDLE_EXPORT',
]);

const ALLOWED_SYNC_STATES = new Set<DurableOperation['syncState']>([
  'LOCAL_ONLY',
  'PENDING_SYNC',
  'CONFLICT',
  'SYNCED',
  'AIR_GAPPED_EXPORTED',
]);

const SENSITIVE_VALUE_PATTERNS: readonly RegExp[] = [
  /-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z0-9 ]*PRIVATE KEY-----/g,
  /\b(?:Bearer|Basic)\s+[A-Za-z0-9._\-+/=]{8,}/gi,
  /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{8,}\b/g,
  /https?:\/\/[^:\s/]+:[^@\s/]+@/gi,
  /\b(sk-[A-Za-z0-9_\-]{12,}|ghp_[A-Za-z0-9]{12,}|gho_[A-Za-z0-9]{12,}|wm_[A-Za-z0-9_\-]{8,}|AIza[0-9A-Za-z_\-]{16,})\b/g,
  /\b(api[_-]?key|x-api-key|bearer[_-]?token|authorization[_-]?secret|client[_-]?secret|password|passwd|secret|token)\s*[:=]\s*[^\s,;]+/gi,
];

const LOCAL_PATH_PATTERNS: readonly RegExp[] = [
  /(?:\/Users\/|\/home\/|\/Volumes\/|\/private\/|\/etc\/|\/var\/)[A-Za-z0-9._\-\/]+/g,
  /[A-Za-z]:\\(?:Users|Windows|ProgramData|Projects|Temp)\\[^\s,;]+/gi,
];

export function scrubSensitiveExportText(value: unknown, maxLen: number): string {
  if (typeof value !== 'string') return '';
  let cleaned = value.replace(/[\u0000-\u001F\u007F]/g, ' ').trim();
  for (const pattern of SENSITIVE_VALUE_PATTERNS) {
    cleaned = cleaned.replace(pattern, '[STRIPPED_CREDENTIAL]');
  }
  for (const pattern of LOCAL_PATH_PATTERNS) {
    cleaned = cleaned.replace(pattern, '[STRIPPED_PATH]');
  }
  return cleaned.slice(0, maxLen);
}

export function pickAllowlistedProjectForExport(
  project: ProjectRecord | SanitizedAirGappedProject
): SanitizedAirGappedProject | null {
  if (!project || typeof project !== 'object') return null;
  const rawRecord = project as Partial<ProjectRecord & SanitizedAirGappedProject>;
  const projectId = scrubSensitiveExportText(rawRecord.id ?? rawRecord.projectId, 64);
  if (!projectId) return null;

  const productFamily: ProductFamily =
    rawRecord.productFamily && ALLOWED_PRODUCT_FAMILIES.has(rawRecord.productFamily)
      ? rawRecord.productFamily
      : 'other';
  const lifecycleStatus: ProjectLifecycleStatus =
    rawRecord.lifecycleStatus && ALLOWED_LIFECYCLE_STATUSES.has(rawRecord.lifecycleStatus)
      ? rawRecord.lifecycleStatus
      : 'INTAKE';

  return {
    projectId,
    approvedTitle: scrubSensitiveExportText(rawRecord.name ?? rawRecord.approvedTitle, 96),
    productFamily,
    workflowId: scrubSensitiveExportText(rawRecord.workflowId, 64),
    sourceRevision: scrubSensitiveExportText(rawRecord.sourceRevision, 96),
    lifecycleStatus,
    acceptancePolicySchema: scrubSensitiveExportText(rawRecord.acceptancePolicySchema, 96),
  };
}

export function pickAllowlistedArtifactForExport(
  artifact: ArtifactProvenanceRecord | SanitizedAirGappedArtifactRef
): SanitizedAirGappedArtifactRef | null {
  if (!artifact || typeof artifact !== 'object') return null;
  const rawArtifact = artifact as Partial<ArtifactProvenanceRecord & SanitizedAirGappedArtifactRef>;
  if (rawArtifact.digestMode !== 'DOCUMENTED_REFERENCE_DIGEST') {
    return null;
  }
  if (
    typeof rawArtifact.sha256Digest !== 'string' ||
    !/^[0-9a-f]{64}$/.test(rawArtifact.sha256Digest)
  ) {
    return null;
  }
  const artifactId = scrubSensitiveExportText(rawArtifact.id ?? rawArtifact.artifactId, 64);
  const projectId = scrubSensitiveExportText(rawArtifact.projectId, 64);
  if (!artifactId || !projectId) return null;

  return {
    artifactId,
    projectId,
    artifactName: scrubSensitiveExportText(rawArtifact.artifactName, 96),
    artifactFormat: scrubSensitiveExportText(rawArtifact.artifactFormat, 96),
    sha256Digest: rawArtifact.sha256Digest,
    digestMode: 'DOCUMENTED_REFERENCE_DIGEST',
    sourceRevision: scrubSensitiveExportText(rawArtifact.sourceRevision, 96),
  };
}

export function pickAllowlistedOperationForExport(
  operation: DurableOperation | SanitizedAirGappedOperationRef
): SanitizedAirGappedOperationRef | null {
  if (!operation || typeof operation !== 'object') return null;
  const operationId = scrubSensitiveExportText(operation.operationId, 64);
  const projectId = scrubSensitiveExportText(operation.projectId, 64);
  if (!operationId || !projectId) return null;

  const kind: DurableOperation['kind'] = ALLOWED_OPERATION_KINDS.has(operation.kind)
    ? operation.kind
    : 'PROJECT_DRAFT_SAVE';
  const syncState: DurableOperation['syncState'] = ALLOWED_SYNC_STATES.has(operation.syncState)
    ? operation.syncState
    : 'LOCAL_ONLY';

  return {
    operationId,
    projectId,
    kind,
    revision:
      typeof operation.revision === 'number' && Number.isFinite(operation.revision)
        ? operation.revision
        : 0,
    timestamp: scrubSensitiveExportText(operation.timestamp, 40),
    syncState,
  };
}

function openDurableDb(): Promise<IDBDatabase | null> {
  if (typeof window === 'undefined' || !('indexedDB' in window)) {
    return Promise.resolve(null);
  }
  return new Promise((resolve) => {
    try {
      const req = window.indexedDB.open(DURABLE_IDB_NAME, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(DURABLE_IDB_STORE)) {
          db.createObjectStore(DURABLE_IDB_STORE);
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

/**
 * Layer 2: Durable Local Store Adapter.
 *
 * Persists browser-local workspace state to IndexedDB (`uor_foundry_durable_v1`)
 * while preserving backward compatibility with `localStorage` (`uor_foundry_console_state_v2`).
 *
 * Browser storage is strictly a local workspace cache and NEVER an authoritative
 * project database or proof store. Queued operations require explicit operator policy
 * and are never auto-replayed upon reconnect.
 */
export class DurableLocalStore {
  createOperation(params: {
    projectId: string;
    kind: DurableOperation['kind'];
    label: string;
    revision: number;
    note: string;
    syncState?: DurableOperation['syncState'];
  }): DurableOperation {
    return {
      operationId: `op-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      projectId: params.projectId,
      kind: params.kind,
      label: params.label,
      revision: params.revision,
      timestamp: new Date().toISOString(),
      syncState: params.syncState ?? 'LOCAL_ONLY',
      autoReplayPermitted: false,
      note: params.note,
    };
  }

  /**
   * Projects a local workspace snapshot through the strict allowlist export schema,
   * automatically stripping API credentials, chat history bodies, AI advisories,
   * activity logs, execution logs, filesystem paths, and internal store metadata.
   */
  extractAllowlistedExportInput(
    snapshot: Partial<DurableWorkspaceSnapshot> | null | undefined
  ): SanitizedDurableExportInput {
    const rawProjects = Array.isArray(snapshot?.projects) ? snapshot.projects : [];
    const rawArtifacts = Array.isArray(snapshot?.artifacts) ? snapshot.artifacts : [];
    const rawOperations = Array.isArray(snapshot?.operations) ? snapshot.operations : [];

    const projects = rawProjects
      .map(pickAllowlistedProjectForExport)
      .filter((p): p is SanitizedAirGappedProject => p !== null);

    const artifacts = rawArtifacts
      .map(pickAllowlistedArtifactForExport)
      .filter((a): a is SanitizedAirGappedArtifactRef => a !== null);

    const operations = rawOperations
      .map(pickAllowlistedOperationForExport)
      .filter((o): o is SanitizedAirGappedOperationRef => o !== null);

    const chatThreadsStripped = Array.isArray(snapshot?.conversations)
      ? snapshot.conversations.length
      : 0;
    const advisoriesStripped = Array.isArray(snapshot?.advisories)
      ? snapshot.advisories.length
      : 0;
    const activityEventsStripped = Array.isArray(snapshot?.activity)
      ? snapshot.activity.length
      : 0;
    const internalRecordsStripped =
      (Array.isArray(snapshot?.runs) ? snapshot.runs.length : 0) +
      (Array.isArray(snapshot?.verifications) ? snapshot.verifications.length : 0) +
      (Array.isArray(snapshot?.approvals) ? snapshot.approvals.length : 0) +
      (Array.isArray(snapshot?.workflowRequests) ? snapshot.workflowRequests.length : 0) +
      (Array.isArray(snapshot?.jobReferences) ? snapshot.jobReferences.length : 0) +
      (Array.isArray(snapshot?.syncConflicts) ? snapshot.syncConflicts.length : 0) +
      (Array.isArray(snapshot?.offlineQueue) ? snapshot.offlineQueue.length : 0);

    return {
      allowlistSchemaVersion: DURABLE_EXPORT_ALLOWLIST_SCHEMA.schemaVersion,
      projects,
      artifacts,
      operations,
      strippedSummary: {
        chatThreadsStripped,
        advisoriesStripped,
        activityEventsStripped,
        internalRecordsStripped,
        nonReferenceArtifactsStripped: Math.max(0, rawArtifacts.length - artifacts.length),
        internalSnapshotFieldsStripped: DURABLE_EXPORT_ALLOWLIST_SCHEMA.strippedSnapshotKeys,
      },
    };
  }

  exportSanitizedSnapshotFromStorage(): SanitizedDurableExportInput | null {
    const raw = this.loadSyncFallback();
    if (!raw) return null;
    return this.extractAllowlistedExportInput(raw);
  }

  async exportSanitizedSnapshotFromIndexedDb(): Promise<SanitizedDurableExportInput | null> {
    const raw = await this.loadFromIndexedDb();
    if (!raw) return null;
    return this.extractAllowlistedExportInput(raw);
  }

  loadSyncFallback(): Partial<DurableWorkspaceSnapshot> | null {
    if (typeof window === 'undefined') return null;
    try {
      const v2Raw = window.localStorage.getItem(LEGACY_STORAGE_KEY);
      if (v2Raw) {
        const migrated = migrateWorkspaceSnapshot(v2Raw);
        return migrated.snapshot;
      }
      const v1Raw = window.localStorage.getItem(LEGACY_V1_STORAGE_KEY);
      if (v1Raw) {
        const migrated = migrateWorkspaceSnapshot(v1Raw);
        return migrated.snapshot;
      }
      return null;
    } catch {
      return null;
    }
  }

  async loadFromIndexedDb(): Promise<Partial<DurableWorkspaceSnapshot> | null> {
    const db = await openDurableDb();
    if (!db) return null;
    return new Promise((resolve) => {
      try {
        const tx = db.transaction(DURABLE_IDB_STORE, 'readonly');
        const store = tx.objectStore(DURABLE_IDB_STORE);
        const req = store.get(DURABLE_SNAPSHOT_KEY);
        req.onsuccess = () => {
          const migrated = migrateWorkspaceSnapshot(req.result);
          resolve(migrated.snapshot);
        };
        req.onerror = () => resolve(null);
      } catch {
        resolve(null);
      }
    });
  }

  async saveSnapshot(snapshot: DurableWorkspaceSnapshot): Promise<DurableStorageDiagnostics> {
    let serialized = '';
    let quotaExceeded = false;
    let storageWarning: string | undefined;

    try {
      serialized = JSON.stringify(snapshot);
    } catch {
      storageWarning = 'Failed to serialize workspace snapshot.';
    }

    if (typeof window !== 'undefined' && serialized) {
      try {
        window.localStorage.setItem(LEGACY_STORAGE_KEY, serialized);
      } catch (err) {
        const isQuota =
          (err instanceof DOMException &&
            (err.name === 'QuotaExceededError' || err.code === 22 || err.code === 1014)) ||
          (err instanceof Error && /quota/i.test(err.message));
        if (isQuota) {
          quotaExceeded = true;
          storageWarning =
            'Browser localStorage quota exceeded. Export a manual local backup or trim old checkpoints/history.';
        } else {
          storageWarning = 'Unable to write localStorage fallback cache.';
        }
      }
    }

    const db = await openDurableDb();
    let idbSaved = false;
    if (db) {
      idbSaved = await new Promise<boolean>((resolve) => {
        try {
          const tx = db.transaction(DURABLE_IDB_STORE, 'readwrite');
          const store = tx.objectStore(DURABLE_IDB_STORE);
          store.put(snapshot, DURABLE_SNAPSHOT_KEY);
          tx.oncomplete = () => resolve(true);
          tx.onerror = () => {
            if (tx.error && /quota/i.test(tx.error.name)) {
              quotaExceeded = true;
              storageWarning =
                'Browser IndexedDB storage quota exceeded. Export a manual local backup before clearing space.';
            }
            resolve(false);
          };
        } catch {
          resolve(false);
        }
      });
    }

    return {
      backend: idbSaved
        ? 'indexeddb+localstorage'
        : typeof window !== 'undefined'
          ? 'localstorage-fallback'
          : 'memory-only',
      indexedDbSupported: typeof window !== 'undefined' && 'indexedDB' in window,
      lastSavedAt: snapshot.updatedAt,
      operationCount: snapshot.operations.length,
      quotaExceeded,
      storageWarning,
      estimatedBytes: serialized.length,
      autoReplayPermitted: false,
      isAuthoritativeDatabase: false,
    };
  }

  buildWorkspaceBackup(snapshot: DurableWorkspaceSnapshot): WorkspaceBackupBundle {
    const now = new Date().toISOString();
    return {
      schema: 'uor.foundry.workspace-backup.v1',
      backupId: `bkp-${now.slice(0, 10)}-${Math.random().toString(36).slice(2, 6)}`,
      exportedAt: now,
      backupClassification: 'LOCAL_BROWSER_BACKUP_NON_AUTHORITATIVE',
      warning:
        'Full local browser workspace backup (includes conversations, drafts, and checkpoints). Distinct from sanitized air-gapped transfer bundles (uor.foundry.air-gapped-bundle.v2).',
      snapshot: snapshot as unknown as Record<string, unknown>,
    };
  }

  downloadWorkspaceBackup(snapshot: DurableWorkspaceSnapshot): string {
    const bundle = this.buildWorkspaceBackup(snapshot);
    const filename = `uor-foundry-local-backup-${bundle.backupId}.json`;
    if (typeof window !== 'undefined' && typeof document !== 'undefined') {
      const blob = new Blob([JSON.stringify(bundle, null, 2)], {
        type: 'application/json;charset=utf-8',
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    }
    return filename;
  }

  parseWorkspaceBackup(
    rawJson: string,
    buildFallback: () => DurableWorkspaceSnapshot
  ):
    | { ok: true; snapshot: DurableWorkspaceSnapshot; warnings: string[] }
    | { ok: false; error: string } {
    let parsed: unknown;
    try {
      parsed = JSON.parse(rawJson);
    } catch {
      return { ok: false, error: 'Backup file is not valid JSON.' };
    }
    if (!parsed || typeof parsed !== 'object') {
      return { ok: false, error: 'Backup file payload must be a JSON object.' };
    }
    const obj = parsed as Record<string, unknown>;
    if (obj.schema === 'uor.foundry.air-gapped-bundle.v2') {
      return {
        ok: false,
        error:
          'Rejected: Air-gapped metadata export bundles (uor.foundry.air-gapped-bundle.v2) have imports disabled and cannot be restored as local workspace backups.',
      };
    }
    if (obj.schema !== 'uor.foundry.workspace-backup.v1' || !obj.snapshot || typeof obj.snapshot !== 'object') {
      return {
        ok: false,
        error: 'Unsupported backup schema. Expected "uor.foundry.workspace-backup.v1".',
      };
    }
    const recovered = recoverWorkspaceSnapshot(obj.snapshot, buildFallback);
    return { ok: true, snapshot: recovered.snapshot, warnings: recovered.warnings };
  }
}

export function migrateWorkspaceSnapshot(raw: unknown): {
  snapshot: Partial<DurableWorkspaceSnapshot> | null;
  migratedFromVersion: number | null;
  warnings: string[];
} {
  const warnings: string[] = [];
  if (raw == null) {
    return { snapshot: null, migratedFromVersion: null, warnings };
  }

  let candidate: unknown = raw;
  if (typeof raw === 'string') {
    try {
      candidate = JSON.parse(raw);
    } catch {
      warnings.push('Corrupted local JSON snapshot ignored; recovering with default seed.');
      return { snapshot: null, migratedFromVersion: null, warnings };
    }
  }

  if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) {
    warnings.push('Malformed snapshot structure; expected object.');
    return { snapshot: null, migratedFromVersion: null, warnings };
  }

  const record = candidate as Record<string, unknown>;
  const sourceVersion =
    typeof record.schemaVersion === 'number' ? record.schemaVersion : 1;

  if (sourceVersion < 2) {
    warnings.push(`Migrated legacy v${sourceVersion} browser workspace snapshot to schema v2.`);
  }

  const filterValidArray = <T>(
    value: unknown,
    predicate: (item: unknown) => item is T,
    label: string
  ): T[] | undefined => {
    if (value === undefined) return undefined;
    if (!Array.isArray(value)) {
      warnings.push(`Invalid "${label}" array in stored snapshot; reset to defaults.`);
      return undefined;
    }
    const valid = value.filter(predicate);
    if (valid.length !== value.length) {
      warnings.push(`Dropped ${value.length - valid.length} malformed entries from "${label}".`);
    }
    return valid;
  };

  const isObj = (v: unknown): v is Record<string, unknown> =>
    Boolean(v && typeof v === 'object' && !Array.isArray(v));

  const projects = filterValidArray(
    record.projects,
    (v): v is ProjectRecord => isObj(v) && typeof v.id === 'string' && typeof v.name === 'string',
    'projects'
  );
  const conversations = filterValidArray(
    record.conversations,
    (v): v is ConversationThread =>
      isObj(v) &&
      typeof v.id === 'string' &&
      typeof v.projectId === 'string' &&
      Array.isArray(v.messages),
    'conversations'
  );
  const runs = filterValidArray(
    record.runs,
    (v): v is WorkflowRun => isObj(v) && typeof v.id === 'string' && Array.isArray(v.stages),
    'runs'
  );
  const verifications = filterValidArray(
    record.verifications,
    (v): v is VerificationSuiteRecord => isObj(v) && typeof v.id === 'string',
    'verifications'
  );
  const artifacts = filterValidArray(
    record.artifacts,
    (v): v is ArtifactProvenanceRecord => isObj(v) && typeof v.id === 'string',
    'artifacts'
  );
  const approvals = filterValidArray(
    record.approvals,
    (v): v is ApprovalDecisionRecord => isObj(v) && typeof v.id === 'string',
    'approvals'
  );
  const advisories = filterValidArray(
    record.advisories,
    (v): v is AiAdvisoryEntry => isObj(v) && typeof v.id === 'string',
    'advisories'
  );
  const activity = filterValidArray(
    record.activity,
    (v): v is ActivityEvent => isObj(v) && typeof v.id === 'string',
    'activity'
  );
  const draftHistory = filterValidArray(
    record.draftHistory,
    (v): v is DraftHistoryEntry => isObj(v) && typeof v.id === 'string' && typeof v.projectId === 'string',
    'draftHistory'
  );
  const checkpoints = filterValidArray(
    record.checkpoints,
    (v): v is ProjectCheckpoint => isObj(v) && typeof v.id === 'string' && typeof v.projectId === 'string',
    'checkpoints'
  );
  const operations = filterValidArray(
    record.operations,
    (v): v is DurableOperation => isObj(v) && typeof v.operationId === 'string',
    'operations'
  );
  const offlineQueue = filterValidArray(
    record.offlineQueue,
    (v): v is OfflineQueueItem => isObj(v) && typeof v.id === 'string',
    'offlineQueue'
  )?.map((item) => ({
    ...item,
    autoReplayPermitted: false as const,
    retryRequiresConfirmation: true as const,
  }));

  const migrated: Partial<DurableWorkspaceSnapshot> = {
    schemaVersion: 2,
    revision:
      typeof record.revision === 'number' && Number.isFinite(record.revision) && record.revision >= 1
        ? record.revision
        : 1,
    updatedAt:
      typeof record.updatedAt === 'string' ? record.updatedAt : new Date().toISOString(),
    authoritativeDatabase: false,
    persistenceNotice:
      typeof record.persistenceNotice === 'string'
        ? record.persistenceNotice
        : 'Browser IndexedDB/localStorage cache only.',
    integrationMode: 'DEMO',
    connectivityProfile:
      record.connectivityProfile === 'AIR_GAPPED_TRANSFER' ||
      record.connectivityProfile === 'OFFLINE_ONLY' ||
      record.connectivityProfile === 'LOCAL_CONNECTED' ||
      record.connectivityProfile === 'ONLINE_AUTHORIZED'
        ? record.connectivityProfile
        : 'OFFLINE_ONLY',
    selectedProjectId:
      typeof record.selectedProjectId === 'string' ? record.selectedProjectId : undefined,
    activeThreadId:
      typeof record.activeThreadId === 'string' ? record.activeThreadId : undefined,
    ...(projects ? { projects } : {}),
    ...(runs ? { runs } : {}),
    ...(verifications ? { verifications } : {}),
    ...(artifacts ? { artifacts } : {}),
    ...(approvals ? { approvals } : {}),
    ...(advisories ? { advisories } : {}),
    ...(activity ? { activity } : {}),
    ...(conversations ? { conversations } : {}),
    ...(isObj(record.previews)
      ? { previews: record.previews as Record<string, PreviewConfigState> }
      : {}),
    ...(draftHistory ? { draftHistory } : {}),
    ...(checkpoints ? { checkpoints } : {}),
    ...(Array.isArray(record.workflowRequests)
      ? { workflowRequests: record.workflowRequests as WindmillExecutionRequest[] }
      : {}),
    ...(Array.isArray(record.jobReferences)
      ? { jobReferences: record.jobReferences as WindmillJobRecord[] }
      : {}),
    ...(operations ? { operations } : {}),
    ...(Array.isArray(record.syncConflicts)
      ? { syncConflicts: record.syncConflicts as SyncConflictRecord[] }
      : {}),
    ...(offlineQueue ? { offlineQueue } : {}),
  };

  return { snapshot: migrated, migratedFromVersion: sourceVersion, warnings };
}

export function recoverWorkspaceSnapshot(
  raw: unknown,
  buildFallback: () => DurableWorkspaceSnapshot
): {
  snapshot: DurableWorkspaceSnapshot;
  recovered: boolean;
  warnings: string[];
} {
  const fallback = buildFallback();
  const migrated = migrateWorkspaceSnapshot(raw);
  if (!migrated.snapshot) {
    return {
      snapshot: fallback,
      recovered: raw != null,
      warnings: migrated.warnings,
    };
  }

  const s = migrated.snapshot;
  return {
    snapshot: {
      schemaVersion: 2,
      revision: s.revision ?? fallback.revision,
      updatedAt: s.updatedAt ?? fallback.updatedAt,
      authoritativeDatabase: false,
      persistenceNotice: fallback.persistenceNotice,
      integrationMode: 'DEMO',
      connectivityProfile: s.connectivityProfile ?? fallback.connectivityProfile,
      selectedProjectId: s.selectedProjectId ?? fallback.selectedProjectId,
      activeThreadId: s.activeThreadId ?? fallback.activeThreadId,
      projects: s.projects && s.projects.length > 0 ? s.projects : fallback.projects,
      runs: s.runs ?? fallback.runs,
      verifications: s.verifications ?? fallback.verifications,
      artifacts: s.artifacts ?? fallback.artifacts,
      approvals: s.approvals ?? fallback.approvals,
      advisories: s.advisories ?? fallback.advisories,
      activity: s.activity ?? fallback.activity,
      conversations: s.conversations ?? fallback.conversations,
      previews: s.previews ?? fallback.previews,
      draftHistory: s.draftHistory ?? fallback.draftHistory ?? [],
      checkpoints: s.checkpoints ?? fallback.checkpoints ?? [],
      workflowRequests: s.workflowRequests ?? fallback.workflowRequests,
      jobReferences: s.jobReferences ?? fallback.jobReferences,
      operations: s.operations ?? fallback.operations,
      syncConflicts: s.syncConflicts ?? fallback.syncConflicts,
      offlineQueue: s.offlineQueue ?? fallback.offlineQueue,
    },
    recovered: migrated.warnings.length > 0,
    warnings: migrated.warnings,
  };
}

export const durableLocalStore = new DurableLocalStore();
