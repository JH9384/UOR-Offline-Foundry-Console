import {
  DURABLE_EXPORT_ALLOWLIST_SCHEMA,
  DurableWorkspaceSnapshot,
  durableLocalStore,
  pickAllowlistedArtifactForExport,
  pickAllowlistedOperationForExport,
  pickAllowlistedProjectForExport,
  scrubSensitiveExportText,
} from './durableLocalStore';
import {
  AirGappedExportPreview,
  AirGappedTransferBundle,
  ArtifactProvenanceRecord,
  ConnectivityProfile,
  DurableOperation,
  IntegrationMode,
  ProjectRecord,
  SanitizedAirGappedArtifactRef,
  SanitizedAirGappedOperationRef,
  SanitizedAirGappedProject,
  SyncConflictRecord,
} from '../types/foundry';

export interface ConnectivityPolicySummary {
  profile: ConnectivityProfile;
  integrationMode: IntegrationMode;
  browserNavigatorOnline: boolean;
  localWindmillAvailable: boolean;
  onlineSyncAvailable: boolean;
  autoPublishPermitted: false;
  autoReplayPermitted: false;
  explanation: string;
}

export const AIR_GAPPED_EXPORT_ALLOWLIST_SCHEMA = Object.freeze({
  schemaId: 'uor.foundry.air-gapped-bundle.v2' as const,
  mode: 'STRICT_ALLOWLIST_DENY_BY_DEFAULT' as const,
  allowedTopLevelFields: Object.freeze([
    'schema',
    'bundleId',
    'exportedAt',
    'workspace',
    'integrationMode',
    'transferClassification',
    'importDisabled',
    'autoReplayPermitted',
    'operatorConfirmed',
    'manifest',
    'projects',
    'artifactDigests',
    'operationRefs',
    'securityDisclaimer',
  ] as const),
  allowedManifestFields: Object.freeze([
    'includedCategories',
    'excludedCategories',
    'counts',
  ] as const),
  allowedProjectFields: DURABLE_EXPORT_ALLOWLIST_SCHEMA.projectFields,
  allowedArtifactFields: DURABLE_EXPORT_ALLOWLIST_SCHEMA.artifactFields,
  allowedOperationFields: DURABLE_EXPORT_ALLOWLIST_SCHEMA.operationFields,
  strippedCategories: Object.freeze([
    'API tokens, passwords & authorization secrets',
    'Private Windmill resource values & internal endpoint credentials',
    'Chat message bodies & conversational prompts',
    'Unreviewed research & simulated AI advisory notes',
    'Restricted engineering evidence & execution logs',
    'Raw artifact binary contents & local filesystem paths',
    'Internal store metadata, queues & unknown nested object properties',
  ]),
});

const EXCLUDED_AIRGAP_CATEGORIES: string[] = [
  ...AIR_GAPPED_EXPORT_ALLOWLIST_SCHEMA.strippedCategories,
];

const ALLOWED_INTEGRATION_MODES = new Set<IntegrationMode>(['DEMO', 'LOCAL', 'ONLINE']);

const SECURITY_DISCLAIMER =
  'Plaintext JSON metadata export only. Not encrypted, not cryptographically signed, and not independently authenticated. Imports are disabled and queued operations are never auto-replayed.';

/**
 * Projects any arbitrary object strictly to its allowlisted scalar/string keys.
 * Never spreads input objects and ignores prototype or unallowlisted nested properties.
 */
function pickStrictKeys<T extends Record<string, unknown>>(
  source: unknown,
  allowedKeys: readonly (keyof T)[]
): Partial<T> {
  const result: Partial<T> = {};
  if (!source || typeof source !== 'object') return result;
  const record = source as Record<string, unknown>;
  for (const key of allowedKeys) {
    const k = key as string;
    if (Object.prototype.hasOwnProperty.call(record, k)) {
      result[key] = record[k] as T[keyof T];
    }
  }
  return result;
}

/**
 * Top-level strict allowlist sanitizer for air-gapped export bundles.
 * Projects outgoing data exclusively to allowlisted top-level, manifest, project,
 * artifact, and operation keys while stripping sensitive fields, API credentials,
 * local paths, and internal chat message bodies.
 */
export function sanitizeExportBundle(
  bundle: AirGappedTransferBundle | Record<string, unknown>
): AirGappedTransferBundle {
  const pickedTop = pickStrictKeys<Record<string, unknown>>(
    bundle,
    AIR_GAPPED_EXPORT_ALLOWLIST_SCHEMA.allowedTopLevelFields
  );

  const safeMode: IntegrationMode = ALLOWED_INTEGRATION_MODES.has(
    pickedTop.integrationMode as IntegrationMode
  )
    ? (pickedTop.integrationMode as IntegrationMode)
    : 'DEMO';

  const rawProjects = Array.isArray(pickedTop.projects) ? pickedTop.projects : [];
  const rawArtifacts = Array.isArray(pickedTop.artifactDigests)
    ? pickedTop.artifactDigests
    : [];
  const rawOperations = Array.isArray(pickedTop.operationRefs) ? pickedTop.operationRefs : [];

  const allowlistedProjects = rawProjects
    .map((item) =>
      pickAllowlistedProjectForExport(item as ProjectRecord | SanitizedAirGappedProject)
    )
    .filter((p): p is SanitizedAirGappedProject => p !== null)
    .map(
      (p) =>
        pickStrictKeys<Record<string, unknown>>(
          p,
          AIR_GAPPED_EXPORT_ALLOWLIST_SCHEMA.allowedProjectFields
        ) as unknown as SanitizedAirGappedProject
    );

  const allowlistedArtifacts = rawArtifacts
    .map((item) =>
      pickAllowlistedArtifactForExport(
        item as ArtifactProvenanceRecord | SanitizedAirGappedArtifactRef
      )
    )
    .filter((a): a is SanitizedAirGappedArtifactRef => a !== null)
    .map(
      (a) =>
        pickStrictKeys<Record<string, unknown>>(
          a,
          AIR_GAPPED_EXPORT_ALLOWLIST_SCHEMA.allowedArtifactFields
        ) as unknown as SanitizedAirGappedArtifactRef
    );

  const allowlistedOperations = rawOperations
    .map((item) =>
      pickAllowlistedOperationForExport(item as DurableOperation | SanitizedAirGappedOperationRef)
    )
    .filter((o): o is SanitizedAirGappedOperationRef => o !== null)
    .map(
      (o) =>
        pickStrictKeys<Record<string, unknown>>(
          o,
          AIR_GAPPED_EXPORT_ALLOWLIST_SCHEMA.allowedOperationFields
        ) as unknown as SanitizedAirGappedOperationRef
    );

  const rawExportedAt = scrubSensitiveExportText(pickedTop.exportedAt, 40);
  const exportedAt = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/.test(rawExportedAt)
    ? rawExportedAt
    : new Date().toISOString();
  const rawBundleId = scrubSensitiveExportText(pickedTop.bundleId, 64);
  const bundleId = /^[A-Za-z0-9._-]+$/.test(rawBundleId)
    ? rawBundleId
    : `bundle-${exportedAt.slice(0, 10)}-${Math.random().toString(36).slice(2, 6)}`;

  const manifest = pickStrictKeys<Record<string, unknown>>(
    {
      includedCategories: ['projects', 'workflowMetadata', 'artifactDigests', 'operationRefs'],
      excludedCategories: EXCLUDED_AIRGAP_CATEGORIES,
      counts: {
        projects: allowlistedProjects.length,
        artifactDigests: allowlistedArtifacts.length,
        operationRefs: allowlistedOperations.length,
      },
    },
    AIR_GAPPED_EXPORT_ALLOWLIST_SCHEMA.allowedManifestFields
  ) as unknown as AirGappedTransferBundle['manifest'];

  return pickStrictKeys<Record<string, unknown>>(
    {
      schema: AIR_GAPPED_EXPORT_ALLOWLIST_SCHEMA.schemaId,
      bundleId,
      exportedAt,
      workspace: 'uor-offline-foundry',
      integrationMode: safeMode,
      transferClassification: 'UNENCRYPTED_UNSIGNED_METADATA_ONLY',
      importDisabled: true,
      autoReplayPermitted: false,
      operatorConfirmed: true,
      manifest,
      projects: allowlistedProjects,
      artifactDigests: allowlistedArtifacts,
      operationRefs: allowlistedOperations,
      securityDisclaimer: SECURITY_DISCLAIMER,
    },
    AIR_GAPPED_EXPORT_ALLOWLIST_SCHEMA.allowedTopLevelFields
  ) as unknown as AirGappedTransferBundle;
}

/**
 * Layer 2/3: Explicit Synchronization & Deny-by-Default Air-Gapped Export Service.
 */
export class FoundrySyncService {
  evaluateConnectivityPolicy(params: {
    profile: ConnectivityProfile;
    integrationMode: IntegrationMode;
    localWindmillValidated: boolean;
    onlineAuthValidated: boolean;
  }): ConnectivityPolicySummary {
    const browserOnline = typeof navigator !== 'undefined' ? navigator.onLine : false;

    const effectiveMode: IntegrationMode =
      params.integrationMode === 'ONLINE' && params.onlineAuthValidated
        ? 'ONLINE'
        : params.integrationMode === 'LOCAL' && params.localWindmillValidated
          ? 'LOCAL'
          : 'DEMO';

    let explanation =
      'Offline-only local cache active. Browser internet status does not enable Windmill execution or external publishing.';
    if (params.profile === 'AIR_GAPPED_TRANSFER') {
      explanation =
        'Air-gapped transfer mode: allowlisted plaintext metadata exports require preview & confirmation; imports remain disabled.';
    } else if (params.profile === 'LOCAL_CONNECTED' && !params.localWindmillValidated) {
      explanation =
        'Local Windmill connection requested, but endpoint auth & workspace permissions are NOT VALIDATED (fail-closed to DEMO).';
    } else if (params.profile === 'ONLINE_AUTHORIZED' && !params.onlineAuthValidated) {
      explanation =
        'Online external sync is NOT AUTHORIZED in AI Studio preview. No GitHub pushes or cloud writes are permitted.';
    }

    return {
      profile: params.profile,
      integrationMode: effectiveMode,
      browserNavigatorOnline: browserOnline,
      localWindmillAvailable: params.localWindmillValidated,
      onlineSyncAvailable: params.onlineAuthValidated,
      autoPublishPermitted: false,
      autoReplayPermitted: false,
      explanation,
    };
  }

  previewAirGappedExport(params: {
    projects?: Array<ProjectRecord | SanitizedAirGappedProject>;
    artifacts?: Array<ArtifactProvenanceRecord | SanitizedAirGappedArtifactRef>;
    operations?: Array<DurableOperation | SanitizedAirGappedOperationRef>;
    snapshot?: Partial<DurableWorkspaceSnapshot>;
  }): AirGappedExportPreview {
    const extracted = params.snapshot
      ? durableLocalStore.extractAllowlistedExportInput(params.snapshot)
      : null;

    const rawProjects = extracted ? extracted.projects : (params.projects ?? []);
    const rawArtifacts = extracted ? extracted.artifacts : (params.artifacts ?? []);
    const rawOperations = extracted ? extracted.operations : (params.operations ?? []);

    const allowlistedProjects = rawProjects
      .map(pickAllowlistedProjectForExport)
      .filter((p): p is SanitizedAirGappedProject => p !== null);
    const allowlistedArtifacts = rawArtifacts
      .map(pickAllowlistedArtifactForExport)
      .filter((a): a is SanitizedAirGappedArtifactRef => a !== null);
    const allowlistedOperations = rawOperations
      .map(pickAllowlistedOperationForExport)
      .filter((o): o is SanitizedAirGappedOperationRef => o !== null);

    return {
      schema: AIR_GAPPED_EXPORT_ALLOWLIST_SCHEMA.schemaId,
      transferClassification: 'UNENCRYPTED_UNSIGNED_METADATA_ONLY',
      includedCategories: [
        {
          category: 'projects',
          count: allowlistedProjects.length,
          description: 'Sanitized project IDs, approved titles, families & revisions',
        },
        {
          category: 'workflowMetadata',
          count: allowlistedProjects.length,
          description: 'Bound workflow identifiers & acceptance policy schema IDs',
        },
        {
          category: 'artifactDigests',
          count: allowlistedArtifacts.length,
          description: 'Authorized DOCUMENTED_REFERENCE_DIGEST SHA-256 entries only',
        },
        {
          category: 'operationRefs',
          count: allowlistedOperations.length,
          description: 'Operation IDs, revisions & sync states (freeform notes stripped)',
        },
      ],
      excludedCategories: EXCLUDED_AIRGAP_CATEGORIES,
      importPolicyStatus: 'DISABLED_NO_VALIDATED_POLICY',
      securityDisclaimer:
        'Plaintext JSON metadata export only. This bundle is NOT encrypted, NOT cryptographically signed, and NOT independently authenticated. Imports remain disabled.',
    };
  }

  /**
   * Delegates to top-level `sanitizeExportBundle` for backward compatibility.
   */
  sanitizeBundleWithAllowlist(bundle: AirGappedTransferBundle): AirGappedTransferBundle {
    return sanitizeExportBundle(bundle);
  }

  buildAirGappedBundle(params: {
    integrationMode: IntegrationMode;
    operatorConfirmed: boolean;
    projects: Array<ProjectRecord | SanitizedAirGappedProject>;
    operations: Array<DurableOperation | SanitizedAirGappedOperationRef>;
    artifacts: Array<ArtifactProvenanceRecord | SanitizedAirGappedArtifactRef>;
    snapshot?: Partial<DurableWorkspaceSnapshot>;
  }): AirGappedTransferBundle {
    if (!params.operatorConfirmed) {
      throw new Error(
        'Explicit operator confirmation is required before creating an air-gapped export.'
      );
    }

    const extracted = params.snapshot
      ? durableLocalStore.extractAllowlistedExportInput(params.snapshot)
      : null;

    const sourceProjects = extracted ? extracted.projects : params.projects;
    const sourceArtifacts = extracted ? extracted.artifacts : params.artifacts;
    const sourceOperations = extracted ? extracted.operations : params.operations;

    const exportedAt = new Date().toISOString();
    const candidateBundle: Record<string, unknown> = {
      schema: AIR_GAPPED_EXPORT_ALLOWLIST_SCHEMA.schemaId,
      bundleId: `bundle-${exportedAt.slice(0, 10)}-${Math.random().toString(36).slice(2, 6)}`,
      exportedAt,
      workspace: 'uor-offline-foundry',
      integrationMode: params.integrationMode,
      transferClassification: 'UNENCRYPTED_UNSIGNED_METADATA_ONLY',
      importDisabled: true,
      autoReplayPermitted: false,
      operatorConfirmed: true,
      projects: sourceProjects,
      artifactDigests: sourceArtifacts,
      operationRefs: sourceOperations,
      securityDisclaimer: SECURITY_DISCLAIMER,
    };

    return sanitizeExportBundle(candidateBundle);
  }

  buildAirGappedBundleFromSnapshot(params: {
    integrationMode: IntegrationMode;
    operatorConfirmed: boolean;
    snapshot: Partial<DurableWorkspaceSnapshot>;
  }): AirGappedTransferBundle {
    if (!params.operatorConfirmed) {
      throw new Error(
        'Explicit operator confirmation is required before creating an air-gapped export.'
      );
    }
    const sanitizedInput = durableLocalStore.extractAllowlistedExportInput(params.snapshot);
    return this.buildAirGappedBundle({
      integrationMode: params.integrationMode,
      operatorConfirmed: params.operatorConfirmed,
      projects: sanitizedInput.projects,
      artifacts: sanitizedInput.artifacts,
      operations: sanitizedInput.operations,
    });
  }

  serializeAllowlistedBundle(bundle: AirGappedTransferBundle): string {
    const sanitized = sanitizeExportBundle(bundle);
    return JSON.stringify(sanitized, null, 2);
  }

  downloadAirGappedBundle(bundle: AirGappedTransferBundle): string {
    const sanitizedBundle = sanitizeExportBundle(bundle);
    const filename = `uor-foundry-airgap-${sanitizedBundle.bundleId}.json`;
    if (typeof window !== 'undefined' && typeof document !== 'undefined') {
      const blob = new Blob([this.serializeAllowlistedBundle(sanitizedBundle)], {
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

  resolveSyncConflict(
    conflicts: SyncConflictRecord[],
    conflictId: string,
    resolution: SyncConflictRecord['resolution']
  ): SyncConflictRecord[] {
    return conflicts.map((c) => (c.conflictId === conflictId ? { ...c, resolution } : c));
  }
}

export const foundrySyncService = new FoundrySyncService();
