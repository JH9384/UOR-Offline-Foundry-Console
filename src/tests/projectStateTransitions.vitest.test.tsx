import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { IntakeModal } from '../shared/components/IntakeModal';
import { SourceCompliancePanel } from '../shared/components/studio/SourceCompliancePanel';
import {
  INITIAL_APPROVALS,
  INITIAL_ARTIFACTS,
  INITIAL_PROJECTS,
  INITIAL_VERIFICATION_SUITES,
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
});
