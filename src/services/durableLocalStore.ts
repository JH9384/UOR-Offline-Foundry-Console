import {
  ActivityEvent,
  AiAdvisoryEntry,
  ApprovalDecisionRecord,
  ArtifactProvenanceRecord,
  ConnectivityProfile,
  ConversationThread,
  DurableOperation,
  IntegrationMode,
  OfflineQueueItem,
  PreviewConfigState,
  ProductFamily,
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
} from '../types/foundry';

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
  projects: ProjectRecord[];
  runs: WorkflowRun[];
  verifications: VerificationSuiteRecord[];
  artifacts: ArtifactProvenanceRecord[];
  approvals: ApprovalDecisionRecord[];
  advisories: AiAdvisoryEntry[];
  activity: ActivityEvent[];
  conversations: ConversationThread[];
  previews: Record<string, PreviewConfigState>;
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
      const raw = window.localStorage.getItem(LEGACY_STORAGE_KEY);
      if (!raw) return null;
      return JSON.parse(raw) as Partial<DurableWorkspaceSnapshot>;
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
          resolve((req.result as Partial<DurableWorkspaceSnapshot> | undefined) ?? null);
        };
        req.onerror = () => resolve(null);
      } catch {
        resolve(null);
      }
    });
  }

  async saveSnapshot(snapshot: DurableWorkspaceSnapshot): Promise<DurableStorageDiagnostics> {
    if (typeof window !== 'undefined') {
      try {
        window.localStorage.setItem(LEGACY_STORAGE_KEY, JSON.stringify(snapshot));
      } catch {
        // Ignore storage quota restrictions in constrained sandboxes
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
          tx.onerror = () => resolve(false);
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
      autoReplayPermitted: false,
      isAuthoritativeDatabase: false,
    };
  }
}

export const durableLocalStore = new DurableLocalStore();
