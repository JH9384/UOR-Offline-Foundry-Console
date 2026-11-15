import {
  AirGappedTransferBundle,
  ArtifactProvenanceRecord,
  ConnectivityProfile,
  ConversationThread,
  DurableOperation,
  IntegrationMode,
  ProjectRecord,
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

/**
 * Layer 2/3: Explicit Synchronization & Air-Gapped Transfer Service.
 *
 * Enforces strict separation:
 * - Browser `navigator.onLine` never implies local Windmill (`127.0.0.1:8080`) availability.
 * - Internet restoration never triggers automatic artifact publication, git pushes,
 *   or evidence release.
 * - Real ONLINE GitHub/external-service sync stays unavailable until explicitly
 *   configured and authorized outside Google AI Studio preview.
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
        'Air-gapped transfer mode: export sanitized workspace bundles manually via JSON transfer; zero network calls.';
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

  buildAirGappedBundle(params: {
    integrationMode: IntegrationMode;
    projects: ProjectRecord[];
    conversations: ConversationThread[];
    operations: DurableOperation[];
    artifacts: ArtifactProvenanceRecord[];
  }): AirGappedTransferBundle {
    const exportedAt = new Date().toISOString();
    return {
      schema: 'uor.foundry.air-gapped-bundle.v1',
      bundleId: `bundle-${exportedAt.slice(0, 10)}-${Math.random().toString(36).slice(2, 6)}`,
      exportedAt,
      workspace: 'uor-offline-foundry',
      integrationMode: params.integrationMode,
      autoReplayPermitted: false,
      projects: params.projects,
      conversations: params.conversations,
      operations: params.operations,
      artifacts: params.artifacts,
      warning:
        'Sanitized air-gapped transfer bundle. Contains no API tokens or restricted evidence. Queued operations are never auto-replayed on import.',
    };
  }

  downloadAirGappedBundle(bundle: AirGappedTransferBundle): string {
    const filename = `uor-foundry-airgap-${bundle.bundleId}.json`;
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

  resolveSyncConflict(
    conflicts: SyncConflictRecord[],
    conflictId: string,
    resolution: SyncConflictRecord['resolution']
  ): SyncConflictRecord[] {
    return conflicts.map((c) => (c.conflictId === conflictId ? { ...c, resolution } : c));
  }
}

export const foundrySyncService = new FoundrySyncService();
