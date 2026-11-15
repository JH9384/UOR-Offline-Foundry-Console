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
  ProjectRecord,
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
      backend: idbSaved ? 'indexeddb+localstorage' : typeof window !== 'undefined' ? 'localstorage-fallback' : 'memory-only',
      indexedDbSupported: typeof window !== 'undefined' && 'indexedDB' in window,
      lastSavedAt: snapshot.updatedAt,
      operationCount: snapshot.operations.length,
      autoReplayPermitted: false,
      isAuthoritativeDatabase: false,
    };
  }
}

export const durableLocalStore = new DurableLocalStore();
