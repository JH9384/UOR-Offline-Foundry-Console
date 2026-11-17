import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { IntakeModal } from '../shared/components/IntakeModal';
import { Sidebar } from '../shared/components/Sidebar';
import { TopBar } from '../shared/components/TopBar';
import { JobRegistryPanel } from '../shared/components/studio/JobRegistryPanel';
import { SourceCompliancePanel } from '../shared/components/studio/SourceCompliancePanel';
import { WorkspaceTopBar } from '../shared/components/studio/WorkspaceTopBar';
import { ConnectionsView } from '../shared/components/views/ConnectionsView';
import { OverviewView } from '../shared/components/views/OverviewView';
import {
  classifyWindmillJobEvidenceStage,
  evaluateWindmillReadOnlyConnectivity,
  FailClosedLocalWindmillService,
} from '../shared/adapters/windmillExecutionService';
import {
  INITIAL_ACTIVITY,
  INITIAL_APPROVALS,
  INITIAL_ARTIFACTS,
  INITIAL_CONNECTIONS,
  INITIAL_PROJECTS,
  INITIAL_VERIFICATION_SUITES,
  INITIAL_WORKFLOW_RUNS,
} from '../shared/data/seedFoundryData';
import {
  computeDeterministicPureStateHash,
  foundryService,
  PROJECT_TEMPLATES,
} from '../shared/services/foundryService';

afterEach(() => {
  cleanup();
});

describe('UOR Project Templates, State Transitions & Studio Components (Vitest + RTL)', () => {
  it('defines all three source-grounded synthetic project templates', () => {
    expect(PROJECT_TEMPLATES.map((t) => t.id)).toEqual([
      'formal-research',
      'prism-product',
      'rust-workspace-model',
    ]);
  });

  it('executes createSyntheticProjectIntake, draft preview diff/apply, duplication, and fail-closed simulation transitions', async () => {
    const rustTpl = PROJECT_TEMPLATES.find((t) => t.id === 'rust-workspace-model')!;
    const created = await foundryService.createSyntheticProjectIntake({
      projectName: 'UORust Target Alpha',
      productFamily: rustTpl.productFamily,
      componentId: rustTpl.componentId,
      workflowId: rustTpl.workflowId,
      purpose: rustTpl.purpose,
      declaredInputs: rustTpl.declaredInputs,
      environmentDeclaration: rustTpl.environmentDeclaration,
      sourceRevision: rustTpl.sourceRevision,
      acknowledgeBoundary: true,
      sourceRefs: rustTpl.sourceRefs,
      templateOriginId: rustTpl.id,
    });

    expect(created.project.componentId).toBe('uorust-translator');
    expect(created.project.templateOriginId).toBe('rust-workspace-model');
    expect(created.project.sourceRefs?.some((r) => r.sourceId === 'uorust')).toBe(true);
    expect(created.artifact.fragmentRecoverySpec).toBe('2-of-3-xor-sha256-planned');
    expect(created.artifact.byteLength).toBeGreaterThan(0);

    // Deterministic pure-state checkpoint hashing (Stitch semantic replay scope)
    const hashA = computeDeterministicPureStateHash({ a: 1, b: 'uor' });
    const hashB = computeDeterministicPureStateHash({ a: 1, b: 'uor' });
    expect(hashA).toBe(hashB);
    expect(hashA).toMatch(/^[0-9a-f]{64}$/);

    // Build preview + draft proposal diff/apply transition
    const preview0 = foundryService.buildPreviewStateForProject(created.project);
    expect(preview0.primaryActionLabel).toBe('Inspect Route Admission (Dry-Run)');

    const proposal = {
      id: 'prop-1',
      summary: 'Compact layout & update action',
      patch: { layoutDensity: 'compact' as const, primaryActionLabel: 'Dry-Run Routes' },
      applied: false,
      isSimulated: true as const,
      authorityNote: 'Draft only',
    };
    const diff = foundryService.computeDraftDiff(preview0, proposal);
    expect(diff.map((d) => d.field)).toEqual(['layoutDensity', 'primaryActionLabel']);

    const preview1 = foundryService.applyDraftProposalToPreview(preview0, proposal);
    expect(preview1.layoutDensity).toBe('compact');
    expect(preview1.primaryActionLabel).toBe('Dry-Run Routes');

    // Project duplication preserves fail-closed release blockers & resets lifecycle to INTAKE
    const copy = foundryService.duplicateProject(created.project);
    expect(copy.name).toBe('UORust Target Alpha (Copy)');
    expect(copy.lifecycleStatus).toBe('INTAKE');
    expect(copy.releaseBlockedReasons[0]).toContain('Duplicated local demo workspace');

    // Step workflow simulation forward until Export / Release gate holds BLOCKED fail-closed
    let run = created.run;
    let proj = created.project;
    let vers = created.verifications;
    expect(run.stages).toHaveLength(10);
    for (let i = 0; i < 10; i++) {
      const step = foundryService.advanceSimulationStep(run, proj, vers);
      run = step.updatedRun;
      proj = step.updatedProject;
      vers = step.updatedVerifications;
    }
    expect(run.currentStageId).toBe('export_release');
    expect(run.overallStatus).toBe('BLOCKED');
    expect(proj.lifecycleStatus).toBe('RELEASE BLOCKED');
    expect(vers.some((v) => v.status === 'NOT VERIFIED')).toBe(true);
  });

  it('renders IntakeModal templates and submits selected Existing Rust Project Modeling payload', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    const onClose = vi.fn();

    render(<IntakeModal open={true} onClose={onClose} onSubmit={onSubmit} />);

    expect(screen.getByTestId('template-formal-research')).toBeTruthy();
    expect(screen.getByTestId('template-prism-product')).toBeTruthy();
    expect(screen.getByTestId('template-rust-workspace-model')).toBeTruthy();

    fireEvent.click(screen.getByTestId('template-rust-workspace-model'));
    const nameInput = screen.getByLabelText(/Project Name \*/i) as HTMLInputElement;
    fireEvent.change(nameInput, { target: { value: 'Cargo Model Check' } });

    fireEvent.click(screen.getByRole('button', { name: /Submit & Launch Simulated Workflow/i }));

    // Wait microtask tick for async submit handler
    await new Promise((r) => setTimeout(r, 10));
    expect(onSubmit).toHaveBeenCalledTimes(1);
    const payload = onSubmit.mock.calls[0][0];
    expect(payload.templateOriginId).toBe('rust-workspace-model');
    expect(payload.componentId).toBe('uorust-translator');
    expect(payload.sourceRefs?.some((s: { sourceId: string }) => s.sourceId === 'uorust')).toBe(true);
  });

  it('renders SourceCompliancePanel with pinned SHAs, epistemic states, UORust contract, and zero fabricated qualification', async () => {
    const rustTpl = PROJECT_TEMPLATES.find((t) => t.id === 'rust-workspace-model')!;
    const created = await foundryService.createSyntheticProjectIntake({
      projectName: 'UORust Panel Audit',
      productFamily: rustTpl.productFamily,
      componentId: rustTpl.componentId,
      workflowId: rustTpl.workflowId,
      purpose: rustTpl.purpose,
      declaredInputs: rustTpl.declaredInputs,
      environmentDeclaration: rustTpl.environmentDeclaration,
      sourceRevision: rustTpl.sourceRevision,
      acknowledgeBoundary: true,
      sourceRefs: rustTpl.sourceRefs,
      templateOriginId: rustTpl.id,
    });

    render(
      <SourceCompliancePanel
        project={created.project}
        projects={[created.project, ...INITIAL_PROJECTS]}
        verifications={[...created.verifications, ...INITIAL_VERIFICATION_SUITES]}
        artifacts={[created.artifact, ...INITIAL_ARTIFACTS]}
        approvals={[...created.approvals, ...INITIAL_APPROVALS]}
      />
    );

    // Pinned 40-char SHAs rendered across all 8 authoritative repositories
    expect(screen.getAllByText(/5868afe38012d647be00ad948949b1e384b87211/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/8af99e96f6bd9f5865721171e582d8df6ad53166/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/1607d53dfc5a34324f8102123d166d727cc66634/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/e3be477fded263029479127363f7fb6a3597e7d4/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/6c876017bffa0e770cffc2225cb2d2422c35a69a/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/71defb4c663aaec5b9a3aab04cbc6a03e7106227/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/760eaac29687628c7c66e8d492e126afa194656e/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/cbbf97b5b8199f5701c621cd3ba0b26187417ffa/).length).toBeGreaterThan(0);

    // Fail-closed UORust Windmill contract card rendered
    expect(screen.getByTestId('uorust-windmill-contract')).toBeTruthy();
    expect(screen.getAllByText(/f\/uor_foundry\/uorust_model_workspace/).length).toBeGreaterThan(0);

    // Must not falsely mark sources QUALIFIED or CONNECTED
    expect(screen.queryByText('QUALIFIED')).toBeNull();
    expect(screen.queryByText('CONNECTED')).toBeNull();
  });

  it('renders JobRegistryPanel with Recharts distribution, Running/Built/Verified classification, and interactive table filtering', async () => {
    const calcProject = INITIAL_PROJECTS[0];
    const mockService = new FailClosedLocalWindmillService('VITE_AUTHENTICATED_LOCAL_PROXY', {
      async probeHealth() {
        return {
          reachable: true,
          workspace: 'uor-offline-foundry',
          authenticated: true,
          permissionsValidated: true,
          registeredRunnables: [
            'backend/runtime_health.ts',
            'backend/intake_validate.ts',
            'backend/job_status.ts',
          ],
          registeredFlows: ['u/foundry/calculator_verify_flow'],
          wmillContractStatus: 'LOCAL_PROXY_VALIDATED',
        };
      },
      async fetchJobById() {
        return { ok: false, code: 'NOT_CONNECTED', message: 'unused' };
      },
      async listJobs() {
        return {
          ok: true,
          workspace: 'uor-offline-foundry',
          records: [
            {
              jobId: 'wm-job-running-101',
              projectId: calcProject.id,
              workflowId: calcProject.workflowId,
              workflowName: 'Calculator Check',
              flowPath: 'f/uor_foundry/prismpm_check',
              flowVersion: '1.0.0',
              sourceRevision: calcProject.sourceRevision,
              idempotencyKey: 'idem-101',
              state: 'RUNNING',
              startedAt: '2026-03-29T10:00:00Z',
              logs: ['Running prismpm check'],
              artifactRefs: [],
              evidenceRefs: [],
              retryAvailable: false,
              isSyntheticFixture: false,
              flowRegisteredInWorkspace: true,
            },
            {
              jobId: 'wm-job-built-102',
              projectId: calcProject.id,
              workflowId: calcProject.workflowId,
              workflowName: 'Calculator Build',
              flowPath: 'f/uor_foundry/prismpm_build_locked',
              flowVersion: '1.0.0',
              sourceRevision: calcProject.sourceRevision,
              idempotencyKey: 'idem-102',
              state: 'COMPLETED',
              startedAt: '2026-03-29T10:05:00Z',
              completedAt: '2026-03-29T10:05:30Z',
              logs: ['Emitted Calculator.holo'],
              structuredResult: { stage: 'BUILD', exitCode: 0 },
              artifactRefs: ['art-prism-calc-holo'],
              evidenceRefs: [],
              retryAvailable: false,
              isSyntheticFixture: false,
              flowRegisteredInWorkspace: true,
            },
            {
              jobId: 'wm-job-verified-103',
              projectId: calcProject.id,
              workflowId: calcProject.workflowId,
              workflowName: 'Calculator Verify',
              flowPath: 'f/uor_foundry/prismpm_verify',
              flowVersion: '1.0.0',
              sourceRevision: calcProject.sourceRevision,
              idempotencyKey: 'idem-103',
              state: 'COMPLETED',
              startedAt: '2026-03-29T10:10:00Z',
              completedAt: '2026-03-29T10:10:45Z',
              logs: ['Verified 15-gate VV twice'],
              structuredResult: { stage: 'VERIFY', exitCode: 0 },
              artifactRefs: ['art-prism-calc-holo'],
              evidenceRefs: ['ev-vv-103'],
              retryAvailable: false,
              isSyntheticFixture: false,
              flowRegisteredInWorkspace: true,
            },
          ],
        };
      },
    });

    await mockService.checkRuntimeHealth();

    render(<JobRegistryPanel windmillService={mockService} />);

    expect(screen.getByTestId('job-registry-panel')).toBeTruthy();
    expect(screen.getByTestId('job-registry-chart-container')).toBeTruthy();
    expect(screen.getByTestId('job-registry-pie-chart')).toBeTruthy();
    // Before refresh in LOCAL mode, no synthetic DEMO fixtures are shown and indicator is UNAVAILABLE
    expect(screen.getByTestId('job-registry-mode-indicator').textContent).toBe(
      'UNAVAILABLE'
    );
    expect(screen.getByTestId('job-registry-empty-row').textContent).toContain(
      'UNAVAILABLE'
    );

    fireEvent.click(screen.getByTestId('job-registry-refresh-btn'));
    await new Promise((r) => setTimeout(r, 20));

    // After live fetch succeeds, indicator transitions to LIVE and displays real results
    expect(screen.getByTestId('job-registry-mode-indicator').textContent).toBe('LIVE');
    expect(
      screen.getByTestId('job-registry-result-wm-job-verified-103').textContent
    ).toContain('"stage":"VERIFY"');
    expect(
      screen.getByTestId('job-registry-origin-wm-job-verified-103').textContent
    ).toBe('LIVE');

    expect(screen.getByTestId('job-registry-summary-counts').textContent).toContain('Running: 1');
    expect(screen.getByTestId('job-registry-summary-counts').textContent).toContain('Built: 1');
    expect(screen.getByTestId('job-registry-summary-counts').textContent).toContain('Verified: 1');

    // Default sort is descending by timestamp (newest first: 103 -> 102 -> 101)
    const rowsDesc = screen.getAllByTestId(/^job-registry-row-wm-job-/);
    expect(rowsDesc.map((r) => r.getAttribute('data-testid'))).toEqual([
      'job-registry-row-wm-job-verified-103',
      'job-registry-row-wm-job-built-102',
      'job-registry-row-wm-job-running-101',
    ]);

    // Toggle sort to ascending by timestamp (oldest first: 101 -> 102 -> 103)
    fireEvent.click(screen.getByTestId('job-registry-sort-timestamp'));
    const rowsAsc = screen.getAllByTestId(/^job-registry-row-wm-job-/);
    expect(rowsAsc.map((r) => r.getAttribute('data-testid'))).toEqual([
      'job-registry-row-wm-job-running-101',
      'job-registry-row-wm-job-built-102',
      'job-registry-row-wm-job-verified-103',
    ]);

    // Filter to Running, Built, and Verified individually
    fireEvent.click(screen.getByTestId('job-registry-filter-running'));
    expect(screen.getByTestId('job-registry-row-wm-job-running-101')).toBeTruthy();
    expect(screen.queryByTestId('job-registry-row-wm-job-built-102')).toBeNull();
    expect(screen.queryByTestId('job-registry-row-wm-job-verified-103')).toBeNull();

    fireEvent.click(screen.getByTestId('job-registry-filter-built'));
    expect(screen.queryByTestId('job-registry-row-wm-job-running-101')).toBeNull();
    expect(screen.getByTestId('job-registry-row-wm-job-built-102')).toBeTruthy();
    expect(screen.queryByTestId('job-registry-row-wm-job-verified-103')).toBeNull();

    fireEvent.click(screen.getByTestId('job-registry-filter-verified'));
    expect(screen.queryByTestId('job-registry-row-wm-job-running-101')).toBeNull();
    expect(screen.queryByTestId('job-registry-row-wm-job-built-102')).toBeNull();
    expect(screen.getByTestId('job-registry-row-wm-job-verified-103')).toBeTruthy();

    cleanup();

    // Verify windowed pagination keeps DOM bounded when job history grows large (250 jobs)
    const largeHistory = Array.from({ length: 250 }, (_, idx) => {
      const padded = String(idx + 1).padStart(4, '0');
      const isRunning = idx % 3 === 0;
      const isBuilt = idx % 3 === 1;
      const isoTime = new Date(Date.UTC(2026, 2, 29, 0, 0, idx)).toISOString();
      return {
        jobId: `wm-bulk-${padded}`,
        projectId: calcProject.id,
        workflowId: calcProject.workflowId,
        workflowName: `Bulk Workflow ${padded}`,
        flowPath: isRunning
          ? 'f/uor_foundry/prismpm_check'
          : isBuilt
            ? 'f/uor_foundry/prismpm_build_locked'
            : 'f/uor_foundry/prismpm_verify',
        flowVersion: '1.0.0',
        sourceRevision: calcProject.sourceRevision,
        idempotencyKey: `idem-bulk-${padded}`,
        state: isRunning ? ('RUNNING' as const) : ('COMPLETED' as const),
        startedAt: isoTime,
        completedAt: isRunning ? undefined : isoTime,
        logs: [`Log ${padded}`],
        structuredResult: isRunning
          ? undefined
          : { stage: isBuilt ? 'BUILD' : 'VERIFY', exitCode: 0 },
        artifactRefs: isRunning ? [] : ['art-prism-calc-holo'],
        evidenceRefs: !isRunning && !isBuilt ? [`ev-${padded}`] : [],
        retryAvailable: false,
        isSyntheticFixture: false,
        flowRegisteredInWorkspace: true,
      };
    });

    render(<JobRegistryPanel initialJobs={largeHistory} initialPageSize={50} />);
    const renderedRowsPage1 = screen.getAllByTestId(/^job-registry-row-wm-bulk-/);
    expect(renderedRowsPage1).toHaveLength(50);
    expect(screen.getByTestId('job-registry-pagination')).toBeTruthy();
    expect(screen.getByTestId('job-registry-page-indicator').textContent).toBe('Page 1 / 5');
    // Newest job (wm-bulk-0250) is first on page 1
    expect(renderedRowsPage1[0].getAttribute('data-testid')).toBe(
      'job-registry-row-wm-bulk-0250'
    );

    fireEvent.click(screen.getByTestId('job-registry-next-page'));
    expect(screen.getByTestId('job-registry-page-indicator').textContent).toBe('Page 2 / 5');

    cleanup();

    // Verify JobRegistryPanel is integrated into the OverviewView dashboard
    render(
      <OverviewView
        projects={INITIAL_PROJECTS}
        runs={INITIAL_WORKFLOW_RUNS}
        verifications={INITIAL_VERIFICATION_SUITES}
        approvals={INITIAL_APPROVALS}
        connections={INITIAL_CONNECTIONS}
        activity={INITIAL_ACTIVITY}
        onNavigate={vi.fn()}
        onSelectProject={vi.fn()}
        onOpenIntake={vi.fn()}
        windmillService={mockService}
      />
    );
    expect(screen.getByTestId('job-registry-panel')).toBeTruthy();
    expect(screen.getByTestId('job-registry-pie-chart')).toBeTruthy();
    expect(screen.getByTestId('job-registry-table')).toBeTruthy();
  });

  it('reconciles Windmill connectivity across ConnectionsView, TopBar, Sidebar, and Runtime Boundary panel for connected, disconnected, and permission-denied states while keeping execution disabled and admin jobs unpromoted', async () => {
    const calcProject = INITIAL_PROJECTS[0];

    // 1. CONNECTED STATE: reachable, authenticated, permissionsValidated, and workspace === 'uor-offline-foundry'
    const connectedService = new FailClosedLocalWindmillService(
      'VITE_AUTHENTICATED_LOCAL_PROXY',
      {
        async probeHealth() {
          return {
            reachable: true,
            workspace: 'uor-offline-foundry',
            authenticated: true,
            permissionsValidated: true,
            registeredRunnables: [
              'backend/runtime_health.ts',
              'backend/intake_validate.ts',
              'backend/job_status.ts',
            ],
            registeredFlows: [],
            wmillContractStatus: 'LOCAL_PROXY_VALIDATED',
            diagnosticMessage:
              'Authenticated read-only connection to uor-offline-foundry verified.',
          };
        },
        async fetchJobById() {
          return { ok: false, code: 'NOT_CONNECTED', message: 'unused' };
        },
        async listJobs() {
          return {
            ok: true,
            workspace: 'uor-offline-foundry',
            records: [
              {
                jobId: 'wm-admin-smoke-001',
                projectId: calcProject.id,
                workflowId: 'wf-windmill-readonly',
                workflowName: 'u/admin/worker_smoke_test',
                flowPath: 'u/admin/worker_smoke_test',
                flowVersion: 'live',
                sourceRevision: 'uor-offline-foundry@live',
                idempotencyKey: 'wm-live-smoke-001',
                state: 'COMPLETED',
                startedAt: '2026-03-29T12:00:00Z',
                completedAt: '2026-03-29T12:00:01Z',
                logs: ['Result: {"status":"RUNTIME_SMOKE_TEST_PASS"}'],
                structuredResult: { status: 'RUNTIME_SMOKE_TEST_PASS' },
                artifactRefs: [],
                evidenceRefs: [],
                retryAvailable: false,
                isSyntheticFixture: false,
                flowRegisteredInWorkspace: true,
              },
              {
                jobId: 'wm-admin-health-002',
                projectId: calcProject.id,
                workflowId: 'wf-windmill-readonly',
                workflowName: 'u/admin/runtime_health',
                flowPath: 'u/admin/runtime_health',
                flowVersion: 'live',
                sourceRevision: 'uor-offline-foundry@live',
                idempotencyKey: 'wm-live-health-002',
                state: 'COMPLETED',
                startedAt: '2026-03-29T12:01:00Z',
                completedAt: '2026-03-29T12:01:01Z',
                logs: ['Result: {"workspace":"uor-offline-foundry"}'],
                structuredResult: {
                  workspace: 'uor-offline-foundry',
                  canonicalRegistryCommandCount: 16,
                },
                artifactRefs: [],
                evidenceRefs: [],
                retryAvailable: false,
                isSyntheticFixture: false,
                flowRegisteredInWorkspace: true,
              },
            ],
          };
        },
      }
    );

    const connectedHealth = await connectedService.checkRuntimeHealth();
    expect(evaluateWindmillReadOnlyConnectivity(connectedHealth).isReadOnlyConnected).toBe(true);

    render(
      <div>
        <TopBar
          activeSection="connections"
          onOpenMobileMenu={vi.fn()}
          onOpenIntake={vi.fn()}
          windmillHealth={connectedHealth}
        />
        <Sidebar
          activeSection="connections"
          onSelectSection={vi.fn()}
          mobileOpen={false}
          onCloseMobile={vi.fn()}
          blockedReleaseCount={2}
          windmillHealth={connectedHealth}
        />
        <WorkspaceTopBar
          activeProject={calcProject}
          mode="chat"
          onSelectMode={vi.fn()}
          integrationMode="DEMO"
          connectivityProfile="OFFLINE_ONLY"
          browserOnline={true}
          onSelectConnectivityProfile={vi.fn()}
          operations={[]}
          offlineQueue={[]}
          storageDiagnostics={{
            backend: 'localstorage-fallback',
            indexedDbSupported: false,
            operationCount: 0,
            autoReplayPermitted: false,
            isAuthoritativeDatabase: false,
          }}
          onPreviewAirGappedExport={vi.fn() as never}
          onExportAirGappedBundle={vi.fn() as never}
          onExportLocalBackup={vi.fn() as never}
          onRestoreLocalBackup={vi.fn() as never}
          onRetryQueuedItem={vi.fn()}
          onClearOperations={vi.fn()}
          onOpenQuickSwitcher={vi.fn()}
          onOpenMobileMenu={vi.fn()}
          onOpenAdvancedSection={vi.fn()}
          windmillHealth={connectedHealth}
        />
        <ConnectionsView
          connections={INITIAL_CONNECTIONS}
          windmillService={connectedService}
        />
      </div>
    );

    // Header and inspector badges show LOCAL READ-ONLY CONNECTED
    expect(screen.getByTestId('connections-header-status').textContent).toContain(
      'LOCAL READ-ONLY CONNECTED'
    );
    expect(screen.getByTestId('inspector-health-badges').textContent).toContain(
      'LOCAL READ-ONLY CONNECTED'
    );

    // Separate statuses for read-only connectivity, workflow dispatch, compiler execution, LM Studio, and release authority
    expect(screen.getByTestId('status-readonly-connectivity').textContent).toContain(
      'LOCAL READ-ONLY CONNECTED'
    );
    expect(screen.getByTestId('status-workflow-dispatch').textContent).toContain('DISABLED');
    expect(screen.getByTestId('status-compiler-execution').textContent).toContain('DISABLED');
    expect(screen.getByTestId('status-lm-studio').textContent).toContain('NOT CONNECTED');
    expect(screen.getByTestId('status-release-authority').textContent).toContain(
      'RELEASE BLOCKED'
    );

    // Probe button uses real authenticated local read-only health check, not simulation-only probe
    fireEvent.click(screen.getByTestId('check-adapter-status-btn'));
    await new Promise((r) => setTimeout(r, 20));
    expect(screen.getByTestId('connections-probe-banner').textContent).toContain(
      'LOCAL READ-ONLY CONNECTED'
    );
    expect(screen.getByTestId('connections-probe-banner').textContent).toContain(
      'Workflow dispatch: DISABLED'
    );

    // Completed administrative jobs are NOT promoted to BUILT or VERIFIED
    fireEvent.click(screen.getByTestId('fetch-recent-jobs-btn'));
    await new Promise((r) => setTimeout(r, 20));
    expect(screen.getByTestId('recent-jobs-running-count').textContent).toBe('0');
    expect(screen.getByTestId('recent-jobs-built-count').textContent).toBe('0');
    expect(screen.getByTestId('recent-jobs-verified-count').textContent).toBe('0');
    expect(screen.getByTestId('recent-job-row-wm-admin-smoke-001').textContent).toContain(
      'COMPLETED'
    );
    expect(screen.getByTestId('recent-job-row-wm-admin-smoke-001').textContent).toContain(
      'BLOCKED'
    );
    expect(
      classifyWindmillJobEvidenceStage({
        jobId: 'wm-admin-intake-003',
        projectId: calcProject.id,
        workflowId: 'wf-windmill-readonly',
        workflowName: 'u/admin/intake_validate',
        flowPath: 'u/admin/intake_validate',
        flowVersion: 'live',
        sourceRevision: 'uor-offline-foundry@live',
        idempotencyKey: 'wm-live-intake-003',
        state: 'COMPLETED',
        startedAt: '2026-03-29T12:02:00Z',
        completedAt: '2026-03-29T12:02:01Z',
        logs: [],
        structuredResult: { valid: true, sideEffectsExecuted: false },
        artifactRefs: [],
        evidenceRefs: [],
        retryAvailable: false,
        isSyntheticFixture: false,
        flowRegisteredInWorkspace: true,
      })
    ).toBe('BLOCKED');

    // Consistent status semantics in Operations header (TopBar + Sidebar) and Runtime, Persistence & Sync Boundary panel
    expect(
      screen.getByTestId('operator-console-header-windmill-status').textContent
    ).toContain('Windmill LOCAL READ-ONLY CONNECTED · Execution DISABLED');
    expect(screen.getAllByTestId('sidebar-windmill-status')[0].textContent).toBe(
      'LOCAL READ-ONLY CONNECTED'
    );
    fireEvent.click(screen.getByTestId('runtime-boundary-toggle-btn'));
    expect(screen.getByTestId('runtime-boundary-windmill-status').textContent).toBe(
      'LOCAL READ-ONLY CONNECTED'
    );
    expect(screen.getByTestId('runtime-boundary-dispatch-status').textContent).toBe(
      'DISABLED'
    );
    expect(screen.getByTestId('runtime-boundary-lmstudio-status').textContent).toBe(
      'NOT CONNECTED'
    );
    expect(screen.getByTestId('runtime-boundary-release-status').textContent).toBe(
      'RELEASE BLOCKED'
    );

    cleanup();

    // 2. DISCONNECTED STATE: reachable === false fails closed to NOT CONNECTED / UNAVAILABLE
    const disconnectedService = new FailClosedLocalWindmillService(
      'VITE_AUTHENTICATED_LOCAL_PROXY',
      {
        async probeHealth() {
          return {
            reachable: false,
            workspace: 'uor-offline-foundry',
            authenticated: false,
            permissionsValidated: false,
            diagnosticMessage: 'Local Windmill at http://127.0.0.1:8080 is unreachable.',
          };
        },
        async fetchJobById() {
          return { ok: false, code: 'NOT_CONNECTED', message: 'Unreachable' };
        },
      }
    );
    const disconnectedHealth = await disconnectedService.checkRuntimeHealth();

    render(
      <div>
        <TopBar
          activeSection="connections"
          onOpenMobileMenu={vi.fn()}
          onOpenIntake={vi.fn()}
          windmillHealth={disconnectedHealth}
        />
        <WorkspaceTopBar
          activeProject={calcProject}
          mode="chat"
          onSelectMode={vi.fn()}
          integrationMode="DEMO"
          connectivityProfile="OFFLINE_ONLY"
          browserOnline={true}
          onSelectConnectivityProfile={vi.fn()}
          operations={[]}
          offlineQueue={[]}
          storageDiagnostics={{
            backend: 'localstorage-fallback',
            indexedDbSupported: false,
            operationCount: 0,
            autoReplayPermitted: false,
            isAuthoritativeDatabase: false,
          }}
          onPreviewAirGappedExport={vi.fn() as never}
          onExportAirGappedBundle={vi.fn() as never}
          onExportLocalBackup={vi.fn() as never}
          onRestoreLocalBackup={vi.fn() as never}
          onRetryQueuedItem={vi.fn()}
          onClearOperations={vi.fn()}
          onOpenQuickSwitcher={vi.fn()}
          onOpenMobileMenu={vi.fn()}
          onOpenAdvancedSection={vi.fn()}
          windmillHealth={disconnectedHealth}
        />
        <ConnectionsView
          connections={INITIAL_CONNECTIONS}
          windmillService={disconnectedService}
        />
      </div>
    );

    expect(screen.getByTestId('connections-header-status').textContent).toContain(
      'NOT CONNECTED'
    );
    expect(screen.getByTestId('connections-header-status').textContent).toContain(
      'UNAVAILABLE'
    );
    expect(screen.getByTestId('connections-header-status').textContent).not.toContain(
      'LOCAL READ-ONLY CONNECTED'
    );
    expect(
      screen.getByTestId('operator-console-header-windmill-status').textContent
    ).toContain('Simulation Sandbox · Windmill NOT CONNECTED');
    fireEvent.click(screen.getByTestId('runtime-boundary-toggle-btn'));
    expect(screen.getByTestId('runtime-boundary-windmill-status').textContent).toBe(
      'NOT CONNECTED'
    );

    cleanup();

    // 3. PERMISSION-DENIED STATE: reachable === true, authenticated === true, permissionsValidated === false
    // Must fail closed to NOT CONNECTED / UNAVAILABLE and never display ONLINE or LOCAL READ-ONLY CONNECTED
    const permissionDeniedService = new FailClosedLocalWindmillService(
      'VITE_AUTHENTICATED_LOCAL_PROXY',
      {
        async probeHealth() {
          return {
            reachable: true,
            workspace: 'uor-offline-foundry',
            authenticated: true,
            permissionsValidated: false,
            diagnosticMessage:
              'HTTP 403 Forbidden: token lacks read permissions for workspace uor-offline-foundry.',
          };
        },
        async fetchJobById() {
          return { ok: false, code: 'AUTH_NOT_VALIDATED', message: 'Forbidden' };
        },
      }
    );
    const permissionDeniedHealth = await permissionDeniedService.checkRuntimeHealth();

    render(
      <ConnectionsView
        connections={INITIAL_CONNECTIONS}
        windmillService={permissionDeniedService}
      />
    );

    expect(permissionDeniedHealth.reachable).toBe(true);
    expect(permissionDeniedHealth.permissionsValidated).toBe(false);
    expect(screen.getByTestId('connections-header-status').textContent).toContain(
      'NOT CONNECTED'
    );
    expect(screen.getByTestId('connections-header-status').textContent).toContain(
      'UNAVAILABLE'
    );
    expect(screen.getByTestId('connections-header-status').textContent).not.toContain(
      'LOCAL READ-ONLY CONNECTED'
    );
    expect(screen.getByTestId('inspector-health-badges').textContent).toContain(
      'UNAVAILABLE'
    );
    expect(screen.getByTestId('inspector-health-badges').textContent).not.toContain(
      'ONLINE'
    );

    fireEvent.click(screen.getByTestId('check-adapter-status-btn'));
    await new Promise((r) => setTimeout(r, 20));
    expect(screen.getByTestId('connections-probe-banner').textContent).toContain(
      'PERMISSION_DENIED_OR_UNAUTHENTICATED'
    );
    expect(screen.getByTestId('connections-probe-banner').textContent).toContain(
      'HTTP 403 Forbidden'
    );
  });
});

