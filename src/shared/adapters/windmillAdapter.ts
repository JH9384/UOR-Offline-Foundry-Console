import {
  EngineeringIntakePayload,
  WorkflowDefinition,
  WorkflowRun,
  WorkflowStageId,
} from '../types/foundry';

/**
 * Target self-hosted Windmill runtime configuration (Mac Studio).
 * Never dialed directly from Google AI Studio browser sandbox.
 */
export interface WindmillRuntimeTarget {
  baseUrl: 'http://127.0.0.1:8080';
  workspace: 'uor-offline-foundry';
  status: 'NOT CONNECTED';
  apiContractSources: string[];
}

export const WINDMILL_TARGET_CONFIG: WindmillRuntimeTarget = {
  baseUrl: 'http://127.0.0.1:8080',
  workspace: 'uor-offline-foundry',
  status: 'NOT CONNECTED',
  apiContractSources: [
    'windmill-labs/windmill: backend/windmill-api/src/jobs.rs',
    'windmill-labs/windmill: backend/windmill-api/src/flows.rs',
    'windmill-labs/windmill: backend/windmill-api/src/resources.rs',
    'windmill-labs/windmill: backend/windmill-api/src/approvals.rs',
  ],
};

/**
 * Documented Windmill REST endpoints mapped from windmill-labs/windmill backend/windmill-api/src.
 */
export interface WindmillApiEndpoints {
  runFlowByPath: (workspace: string, flowPath: string) => string;
  runScriptByPath: (workspace: string, scriptPath: string) => string;
  getJobProgress: (workspace: string, jobId: string) => string;
  callMcpToolOnResource: (workspace: string, resourcePath: string) => string;
  listMcpToolsOnResource: (workspace: string, resourcePath: string) => string;
}

export const WINDMILL_ENDPOINTS: WindmillApiEndpoints = {
  runFlowByPath: (ws, flowPath) => `/api/w/${ws}/jobs/run/f/${flowPath}`,
  runScriptByPath: (ws, scriptPath) => `/api/w/${ws}/jobs/run/p/${scriptPath}`,
  getJobProgress: (ws, jobId) => `/api/w/${ws}/jobs/run_progress/${jobId}`,
  callMcpToolOnResource: (ws, resourcePath) => `/api/w/${ws}/resources/mcp_call_tool/${resourcePath}`,
  listMcpToolsOnResource: (ws, resourcePath) => `/api/w/${ws}/resources/mcp_tools/${resourcePath}`,
};

export interface WindmillDeploymentOptionSpec {
  id: 'VITE_AUTHENTICATED_LOCAL_PROXY' | 'WINDMILL_NATIVE_WMILL_TS';
  label: string;
  documentationRefs: string[];
  authBoundary: string;
  frontendTransport: string;
}

export const WINDMILL_DEPLOYMENT_OPTIONS: WindmillDeploymentOptionSpec[] = [
  {
    id: 'VITE_AUTHENTICATED_LOCAL_PROXY',
    label: 'Option A · Vite/React + Authenticated Local Backend Proxy',
    documentationRefs: [
      'https://www.windmill.dev/docs/full_code_apps',
      'https://www.windmill.dev/docs/full_code_apps/frontend',
    ],
    authBoundary: 'Windmill bearer token kept strictly in local backend process; never stored in frontend source or browser storage.',
    frontendTransport: 'Same-origin authenticated API routes forwarding validated requests to http://127.0.0.1:8080/api/w/uor-offline-foundry/*.',
  },
  {
    id: 'WINDMILL_NATIVE_WMILL_TS',
    label: 'Option B · Windmill-Native Full-Code React App (wmill.ts)',
    documentationRefs: [
      'https://www.windmill.dev/docs/full_code_apps/frontend',
      'https://www.windmill.dev/docs/full_code_apps/deployment',
    ],
    authBoundary: 'Windmill session cookie / workspace RBAC managed by Windmill server; generated wmill.ts invokes registered backend runnables only.',
    frontendTransport: 'Generated wmill.ts RPC bindings compiled into Windmill workspace uor-offline-foundry.',
  },
];

/**
 * Documented Host Effects from UOR-Foundation/lexlean-mcp (EFFECTS.md, E1..E10).
 */
export interface LexLeanMcpEffectContract {
  effectId: string;
  wireName: string;
  tag: number;
  purpose: string;
  condition: 'DOCUMENTED';
}

export const LEXLEAN_MCP_HOST_EFFECTS: LexLeanMcpEffectContract[] = [
  { effectId: 'E1', wireName: 'store.get', tag: 0, purpose: 'Read an entry from the content-addressed store', condition: 'DOCUMENTED' },
  { effectId: 'E2', wireName: 'store.put', tag: 1, purpose: 'Write an entry into the content-addressed store', condition: 'DOCUMENTED' },
  { effectId: 'E3', wireName: 'engine.check', tag: 2, purpose: 'Invoke LexLean Engine::check', condition: 'DOCUMENTED' },
  { effectId: 'E4', wireName: 'engine.snapshot', tag: 3, purpose: 'Invoke LexLean Engine::snapshot', condition: 'DOCUMENTED' },
  { effectId: 'E5', wireName: 'engine.format', tag: 4, purpose: 'Invoke LexLean Engine::format', condition: 'DOCUMENTED' },
  { effectId: 'E6', wireName: 'engine.build', tag: 5, purpose: 'Invoke LexLean Engine::build', condition: 'DOCUMENTED' },
  { effectId: 'E7', wireName: 'verify.start', tag: 6, purpose: 'Start an independent verification job', condition: 'DOCUMENTED' },
  { effectId: 'E8', wireName: 'verify.control', tag: 7, purpose: 'Control or inspect a running verification job', condition: 'DOCUMENTED' },
  { effectId: 'E9', wireName: 'lexicon.read', tag: 8, purpose: 'Read a versioned lexicon package entry', condition: 'DOCUMENTED' },
  { effectId: 'E10', wireName: 'attestation.lookup', tag: 9, purpose: 'Read-only attestation lookup by ID or SHA-256 digest', condition: 'DOCUMENTED' },
];

export interface AdapterExecutionResult<T> {
  ok: boolean;
  mode: 'BROWSER_SIMULATION' | 'LIVE_UNAVAILABLE';
  data?: T;
  error?: string;
}

/**
 * Integration adapter contract separating Presentation/Application Services from Windmill orchestration.
 */
export interface WindmillClientAdapter {
  readonly adapterId: string;
  readonly isLiveConnected: boolean;
  readonly targetWorkspace: string;
  readonly targetEndpoint: string;

  dispatchWorkflowSimulation(
    projectId: string,
    payload: EngineeringIntakePayload,
    workflow: WorkflowDefinition
  ): AdapterExecutionResult<WorkflowRun>;

  advanceSimulatedStage(
    run: WorkflowRun,
    nextStageId: WorkflowStageId,
    outcome: 'COMPLETED' | 'BLOCKED' | 'FAILED',
    summary: string
  ): AdapterExecutionResult<WorkflowRun>;

  probeLiveConnection(): AdapterExecutionResult<{ reachable: false; reason: string }>;
}

/**
 * Fail-closed live Windmill adapter stub.
 * Returns explicit NOT CONNECTED diagnostics instead of attempting unreachable localhost calls.
 */
export class UnconnectedWindmillAdapter implements WindmillClientAdapter {
  readonly adapterId = 'windmill-live-http-adapter';
  readonly isLiveConnected = false;
  readonly targetWorkspace = WINDMILL_TARGET_CONFIG.workspace;
  readonly targetEndpoint = WINDMILL_TARGET_CONFIG.baseUrl;

  dispatchWorkflowSimulation(): AdapterExecutionResult<WorkflowRun> {
    return {
      ok: false,
      mode: 'LIVE_UNAVAILABLE',
      error: `Live Windmill runtime (${this.targetEndpoint}, workspace "${this.targetWorkspace}") is NOT CONNECTED in Google AI Studio.`,
    };
  }

  advanceSimulatedStage(): AdapterExecutionResult<WorkflowRun> {
    return {
      ok: false,
      mode: 'LIVE_UNAVAILABLE',
      error: `Cannot mutate live Windmill job state: ${this.targetEndpoint} is NOT CONNECTED.`,
    };
  }

  probeLiveConnection(): AdapterExecutionResult<{ reachable: false; reason: string }> {
    return {
      ok: false,
      mode: 'LIVE_UNAVAILABLE',
      data: {
        reachable: false,
        reason: `Self-hosted Mac Studio Windmill API (${this.targetEndpoint}) is isolated from this browser preview. Live execution is disabled.`,
      },
      error: 'NOT CONNECTED',
    };
  }
}

/**
 * Browser-local simulation adapter used strictly for synthetic Engineering Intake demonstrations.
 */
export class SimulatedLocalAdapter implements WindmillClientAdapter {
  readonly adapterId = 'browser-local-simulation-adapter';
  readonly isLiveConnected = false;
  readonly targetWorkspace = WINDMILL_TARGET_CONFIG.workspace;
  readonly targetEndpoint = WINDMILL_TARGET_CONFIG.baseUrl;

  dispatchWorkflowSimulation(
    projectId: string,
    payload: EngineeringIntakePayload,
    workflow: WorkflowDefinition
  ): AdapterExecutionResult<WorkflowRun> {
    const now = new Date().toISOString();
    const runId = `sim-run-${Math.random().toString(36).slice(2, 8)}`;

    const stages = workflow.stages.map((stage, index) => {
      if (index === 0) {
        return {
          stageId: stage.id,
          label: stage.label,
          uorGate: stage.uorGate,
          status: 'COMPLETED' as const,
          executedBy: 'Simulated Local Intake Controller',
          startedAt: now,
          completedAt: now,
          summary: `Synthetic intake registered for family "${payload.productFamily}" at revision ${payload.sourceRevision}.`,
          commandOrContract: 'uor.acceptance-policy.example.v1 (REGISTER)',
          isSimulated: true,
        };
      }
      if (index === 1) {
        return {
          stageId: stage.id,
          label: stage.label,
          uorGate: stage.uorGate,
          status: 'RUNNING' as const,
          executedBy: 'Simulated Planner (Mock Windmill Step)',
          startedAt: now,
          summary: `Preparing synthetic execution plan targeting ${workflow.windmillFlowPath}.`,
          commandOrContract: WINDMILL_ENDPOINTS.runFlowByPath(this.targetWorkspace, workflow.windmillFlowPath),
          isSimulated: true,
        };
      }
      return {
        stageId: stage.id,
        label: stage.label,
        uorGate: stage.uorGate,
        status: 'PENDING' as const,
        executedBy: stage.ownerBoundary,
        summary: `Awaiting previous stage completion (${stage.failClosedRule}).`,
        isSimulated: true,
      };
    });

    return {
      ok: true,
      mode: 'BROWSER_SIMULATION',
      data: {
        id: runId,
        projectId,
        workflowId: workflow.id,
        workflowName: workflow.name,
        currentStageId: 'plan',
        overallStatus: 'RUNNING',
        executionMode: 'BROWSER_SIMULATION',
        windmillTargetPath: WINDMILL_ENDPOINTS.runFlowByPath(this.targetWorkspace, workflow.windmillFlowPath),
        startedAt: now,
        updatedAt: now,
        stages,
      },
    };
  }

  advanceSimulatedStage(
    run: WorkflowRun,
    nextStageId: WorkflowStageId,
    outcome: 'COMPLETED' | 'BLOCKED' | 'FAILED',
    summary: string
  ): AdapterExecutionResult<WorkflowRun> {
    const now = new Date().toISOString();
    const targetIdx = run.stages.findIndex((s) => s.stageId === nextStageId);
    if (targetIdx === -1) {
      return { ok: false, mode: 'BROWSER_SIMULATION', error: `Unknown stage: ${nextStageId}` };
    }

    const updatedStages = run.stages.map((stage, idx) => {
      if (idx === targetIdx) {
        return {
          ...stage,
          status: outcome,
          startedAt: stage.startedAt ?? now,
          completedAt: outcome === 'COMPLETED' || outcome === 'FAILED' ? now : undefined,
          summary,
        };
      }
      if (outcome === 'COMPLETED' && idx === targetIdx + 1 && stage.status === 'PENDING') {
        const isReleaseGate = stage.stageId === 'release';
        return {
          ...stage,
          status: isReleaseGate ? ('BLOCKED' as const) : ('RUNNING' as const),
          startedAt: now,
          summary: isReleaseGate
            ? 'Fail-closed: Release Authorization requires independent evidence and human governance sign-off.'
            : `Simulated execution started for ${stage.label}.`,
        };
      }
      return stage;
    });

    const nextActiveStage =
      outcome === 'COMPLETED' && targetIdx + 1 < updatedStages.length
        ? updatedStages[targetIdx + 1].stageId
        : nextStageId;

    const overallStatus =
      outcome === 'FAILED'
        ? 'FAILED'
        : outcome === 'BLOCKED' || nextActiveStage === 'release'
          ? 'BLOCKED'
          : 'RUNNING';

    return {
      ok: true,
      mode: 'BROWSER_SIMULATION',
      data: {
        ...run,
        currentStageId: nextActiveStage,
        overallStatus,
        updatedAt: now,
        stages: updatedStages,
      },
    };
  }

  probeLiveConnection(): AdapterExecutionResult<{ reachable: false; reason: string }> {
    return new UnconnectedWindmillAdapter().probeLiveConnection();
  }
}
