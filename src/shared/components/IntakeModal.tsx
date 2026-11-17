import React, { useMemo, useState } from 'react';
import { AlertCircle, CheckCircle2, ShieldCheck, Unplug, X } from 'lucide-react';
import {
  FailClosedLocalWindmillService,
  WindmillExecutionService,
  WindmillIntakeValidationOutcome,
  WindmillIntakeValidationResult,
  WindmillSourcePackageSummaryInput,
} from '../adapters/windmillExecutionService';
import {
  createBrowserProxyWindmillTransport,
  mapEngineeringIntakeFormToValidationInput,
} from '../adapters/windmillLocalReadOnlyAdapter';
import { ENGINEERING_COMPONENTS, WORKFLOW_CATALOG } from '../data/seedFoundryData';
import {
  foundryService,
  IntakeValidationErrors,
  PROJECT_TEMPLATES,
} from '../services/foundryService';
import { buildStructuredInputManifestPreview } from '../services/sourceAuthoringService';
import {
  EngineeringComponentId,
  EngineeringIntakePayload,
  PrismInputMode,
  ProductFamily,
  ProjectTemplateSpec,
} from '../types/foundry';
import { StatusTag } from './StatusTag';

interface IntakeModalProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (payload: EngineeringIntakePayload) => Promise<void>;
  windmillService?: WindmillExecutionService;
  sourcePackage?: WindmillSourcePackageSummaryInput;
}

const DEFAULT_PAYLOAD: EngineeringIntakePayload = {
  projectName: '',
  inputMode: 'NATIVE_PRISM',
  productFamily: 'application',
  componentId: 'prismpm-calculator',
  workflowId: 'wf-prismpm-delivery',
  purpose: '',
  declaredInputs: 'src/Main.lex.tex, prismpm.lock, lexlean.lock, standards.lock',
  environmentDeclaration: 'Sanitized offline workspace (no local secrets or raw logs)',
  sourceRevision: 'prismpm/demo@6c876017',
  acknowledgeBoundary: false,
  lockfilesDeclared: ['prismpm.lock', 'lexlean.lock', 'standards.lock'],
};

export const IntakeModal: React.FC<IntakeModalProps> = ({
  open,
  onClose,
  onSubmit,
  windmillService,
  sourcePackage,
}) => {
  const [form, setForm] = useState<EngineeringIntakePayload>(DEFAULT_PAYLOAD);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);
  const [errors, setErrors] = useState<IntakeValidationErrors>({});
  const [submitting, setSubmitting] = useState(false);
  const [validatingLocally, setValidatingLocally] = useState(false);
  const [localValidationResult, setLocalValidationResult] =
    useState<WindmillIntakeValidationResult | null>(null);
  const [validationModeBadge, setValidationModeBadge] =
    useState<WindmillIntakeValidationOutcome>('DEMO');

  const defaultLocalService = useMemo(
    () =>
      new FailClosedLocalWindmillService(
        'VITE_AUTHENTICATED_LOCAL_PROXY',
        createBrowserProxyWindmillTransport()
      ),
    []
  );
  const localService = windmillService ?? defaultLocalService;

  if (!open) return null;

  const selectedComponent =
    ENGINEERING_COMPONENTS.find((c) => c.id === form.componentId) ?? ENGINEERING_COMPONENTS[0];

  const handleComponentChange = (componentId: EngineeringComponentId) => {
    const comp = ENGINEERING_COMPONENTS.find((c) => c.id === componentId);
    setForm((prev) => ({
      ...prev,
      componentId,
      workflowId: comp?.defaultWorkflowId ?? prev.workflowId,
    }));
  };

  const handleInputModeChange = (mode: PrismInputMode) => {
    setForm((prev) => ({
      ...prev,
      inputMode: mode,
      componentId:
        mode === 'EXISTING_RUST'
          ? 'uorust-translator'
          : mode === 'GUIDED_PRODUCT'
            ? 'prismpm-calculator'
            : prev.componentId === 'uorust-translator'
              ? 'prismpm-calculator'
              : prev.componentId,
      workflowId:
        mode === 'EXISTING_RUST'
          ? 'wf-uorust-modeling'
          : 'wf-prismpm-delivery',
      declaredInputs:
        mode === 'EXISTING_RUST'
          ? 'Cargo.toml, Cargo.lock, model/routes.toml, prismpm.lock, lexlean.lock'
          : mode === 'GUIDED_PRODUCT'
            ? 'devrel/subjects.json, app/src/Catalog.lex.tex, prismpm.lock, lexlean.lock, standards.lock'
            : 'examples/Calculator/prismpm.toml, examples/Calculator/src/Calculator.lex.tex, prismpm.lock, lexlean.lock, standards.lock',
      lockfilesDeclared:
        mode === 'EXISTING_RUST'
          ? ['Cargo.lock', 'prismpm.lock', 'lexlean.lock']
          : ['prismpm.lock', 'lexlean.lock', 'standards.lock'],
    }));
  };

  const applyTemplate = (tpl: ProjectTemplateSpec) => {
    setSelectedTemplateId(tpl.id);
    const mode: PrismInputMode =
      tpl.id === 'rust-workspace-model'
        ? 'EXISTING_RUST'
        : tpl.id === 'prism-product'
          ? 'GUIDED_PRODUCT'
          : 'NATIVE_PRISM';
    setForm({
      projectName: `${tpl.defaultNamePrefix} ${Math.floor(10 + Math.random() * 89)}`,
      inputMode: mode,
      productFamily: tpl.productFamily,
      componentId: tpl.componentId,
      workflowId: tpl.workflowId,
      purpose: tpl.purpose,
      declaredInputs: tpl.declaredInputs,
      environmentDeclaration: tpl.environmentDeclaration,
      sourceRevision: tpl.sourceRevision,
      acknowledgeBoundary: true,
      sourceRefs: tpl.sourceRefs,
      templateOriginId: tpl.id,
      lockfilesDeclared:
        mode === 'EXISTING_RUST'
          ? ['Cargo.lock', 'prismpm.lock', 'lexlean.lock']
          : ['prismpm.lock', 'lexlean.lock', 'standards.lock'],
      guidedPrompt: mode === 'GUIDED_PRODUCT' ? tpl.purpose : undefined,
    });
    setErrors({});
    setLocalValidationResult(null);
  };

  const handleFillExample = () => {
    const sampleTpl =
      PROJECT_TEMPLATES.find((t) => t.id === 'prism-product') ?? PROJECT_TEMPLATES[0];
    setSelectedTemplateId(sampleTpl.id);
    setForm({
      projectName: 'PrismPM Calculator Qualification Demo',
      inputMode: 'NATIVE_PRISM',
      productFamily: sampleTpl.productFamily,
      componentId: sampleTpl.componentId,
      workflowId: sampleTpl.workflowId,
      purpose:
        'Simulate closed .lex.tex build and fail-closed verification gates for Calculator reference model.',
      declaredInputs:
        'examples/Calculator/prismpm.toml, examples/Calculator/src/Calculator.lex.tex, examples/Calculator/lexlean.lock',
      environmentDeclaration:
        'Sanitized browser demonstration; target Windmill workspace uor-offline-foundry',
      sourceRevision: 'prismpm/demo@6c876017',
      acknowledgeBoundary: true,
      sourceRefs: sampleTpl.sourceRefs,
      templateOriginId: sampleTpl.id,
      lockfilesDeclared: ['prismpm.lock', 'lexlean.lock', 'standards.lock'],
    });
    setErrors({});
    setLocalValidationResult(null);
  };

  /**
   * Separate authenticated, non-executing local Windmill intake validation
   * (`u/admin/intake_validate` via `POST /api/windmill/intake/validate`).
   * Never silently substitutes simulated browser validation.
   */
  const handleValidateIntakeLocally = async () => {
    setValidatingLocally(true);
    try {
      const mappedInput = mapEngineeringIntakeFormToValidationInput(form, sourcePackage);
      if (typeof localService.validateIntakeLocally !== 'function') {
        const unavailableRes: WindmillIntakeValidationResult = {
          ok: false,
          outcome: 'UNAVAILABLE',
          valid: false,
          errors: {},
          validatedAt: null,
          sideEffectsExecuted: false,
          workspace: localService.workspace,
          diagnostic: localService.reportConnectionFailure(
            'NOT_CONNECTED',
            'Local Windmill intake validation method is not configured on this service.'
          ),
        };
        setLocalValidationResult(unavailableRes);
        setValidationModeBadge('UNAVAILABLE');
        return;
      }

      const result = await localService.validateIntakeLocally(mappedInput);
      setLocalValidationResult(result);
      setValidationModeBadge(result.outcome);

      if (result.outcome === 'REJECTED') {
        setErrors(result.errors);
      } else if (result.outcome === 'LIVE VALIDATION') {
        setErrors({});
      }
    } finally {
      setValidatingLocally(false);
    }
  };

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setValidationModeBadge('DEMO');
    const validationErrors = foundryService.validateIntake(form);
    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors);
      return;
    }
    setSubmitting(true);
    try {
      await onSubmit(form);
      setForm(DEFAULT_PAYLOAD);
      setSelectedTemplateId(null);
      setErrors({});
      setLocalValidationResult(null);
      onClose();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75"
      role="dialog"
      aria-modal="true"
      aria-labelledby="intake-modal-title"
    >
      <div className="w-full max-w-2xl bg-[#111827] border border-slate-700/80 rounded-lg overflow-hidden max-h-[92vh] flex flex-col">
        <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <h2 id="intake-modal-title" className="font-display font-semibold text-base text-slate-100">
                Synthetic Engineering Intake
              </h2>
              <span data-testid="intake-validation-mode-indicator">
                <StatusTag value={validationModeBadge} />
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              Grounded in JH9384/UOR-Workflow product-intake template · Supports non-executing local Windmill validation (<span className="font-mono">u/admin/intake_validate</span>) or simulated browser workflow
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleFillExample}
              className="px-2.5 py-1.5 text-xs text-slate-300 hover:text-white border border-slate-700 hover:border-slate-600 rounded-md transition-colors whitespace-nowrap"
            >
              Load Sample Request
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-white rounded-md"
              aria-label="Close intake form"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        <form onSubmit={handleFormSubmit} className="p-6 overflow-y-auto space-y-4">
          {/* Three Authoritative Prism Input Modes */}
          <div className="space-y-2">
            <div className="text-xs font-medium text-slate-300">
              Prism Input Mode *
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              {(
                [
                  {
                    id: 'NATIVE_PRISM',
                    title: 'Native Prism (.lex.tex)',
                    note: 'Closed PrismPM / LexLean specification & acceptance vectors',
                  },
                  {
                    id: 'EXISTING_RUST',
                    title: 'Existing Rust (UORust)',
                    note: 'Cargo workspace AST route projection + separate Cargo evidence',
                  },
                  {
                    id: 'GUIDED_PRODUCT',
                    title: 'Guided Product (DevRel)',
                    note: 'Facet template draft requiring explicit human spec review',
                  },
                ] as const
              ).map((mode) => {
                const active = (form.inputMode ?? 'NATIVE_PRISM') === mode.id;
                return (
                  <button
                    key={mode.id}
                    type="button"
                    onClick={() => handleInputModeChange(mode.id)}
                    data-testid={`input-mode-${mode.id}`}
                    className={`p-2.5 text-left rounded-md border transition-colors ${
                      active
                        ? 'bg-emerald-950/25 border-emerald-500/50 text-slate-100'
                        : 'bg-[#0B0F17] border-slate-800 hover:border-slate-700 text-slate-300'
                    }`}
                  >
                    <div className="text-xs font-medium text-slate-100">{mode.title}</div>
                    <div className="text-[11px] text-slate-400 mt-0.5 leading-snug">{mode.note}</div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Guided Product Creation Journeys */}
          <div className="space-y-2">
            <div className="text-xs font-medium text-slate-300">
              Guided Product Creation Journeys (Structured Input Manifest)
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              {PROJECT_TEMPLATES.map((tpl) => {
                const active = selectedTemplateId === tpl.id;
                const journeyBadge =
                  tpl.id === 'prism-product'
                    ? 'Journey A · Prism-DevRel'
                    : tpl.id === 'rust-workspace-model'
                      ? 'Journey B · UORust'
                      : 'Journey C · LexLean + Rule30';
                return (
                  <button
                    key={tpl.id}
                    type="button"
                    onClick={() => applyTemplate(tpl)}
                    data-testid={`template-${tpl.id}`}
                    className={`p-2.5 text-left rounded-md border transition-colors ${
                      active
                        ? 'bg-blue-950/35 border-blue-500/50 text-slate-100'
                        : 'bg-[#0B0F17] border-slate-800 hover:border-slate-700 text-slate-300'
                    }`}
                  >
                    <div className="text-[10px] font-mono text-sky-300 mb-0.5">{journeyBadge}</div>
                    <div className="text-xs font-medium text-slate-100">{tpl.title}</div>
                    <div className="text-[11px] text-slate-400 mt-0.5 leading-snug">
                      {tpl.description}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5" htmlFor="intake-name">
                Project Name *
              </label>
              <input
                id="intake-name"
                type="text"
                value={form.projectName}
                onChange={(e) => setForm({ ...form, projectName: e.target.value })}
                placeholder="e.g. LexLean Attestation Probe"
                className="w-full px-3 py-2 text-sm bg-[#0B0F17] border border-slate-700 rounded-md text-slate-100 placeholder-slate-500 focus:outline-none focus:border-blue-500"
              />
              {errors.projectName && (
                <p
                  data-testid="intake-error-projectName"
                  className="mt-1 text-xs text-rose-400 flex items-center gap-1"
                >
                  <AlertCircle className="w-3 h-3 shrink-0" />
                  <span>{errors.projectName}</span>
                </p>
              )}
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5" htmlFor="intake-family">
                Product Family (UOR-Workflow) *
              </label>
              <select
                id="intake-family"
                value={form.productFamily}
                onChange={(e) => setForm({ ...form, productFamily: e.target.value as ProductFamily })}
                className="w-full px-3 py-2 text-sm bg-[#0B0F17] border border-slate-700 rounded-md text-slate-100 focus:outline-none focus:border-blue-500"
              >
                <option value="application">Application</option>
                <option value="formal-verification">Formal Verification</option>
                <option value="scientific-computation">Scientific Computation</option>
                <option value="other">Other</option>
              </select>
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-medium text-slate-300" htmlFor="intake-component">
                Engineering Component Assignment *
              </label>
              <StatusTag value={selectedComponent.epistemicCondition} />
            </div>
            <select
              id="intake-component"
              value={form.componentId}
              onChange={(e) => handleComponentChange(e.target.value as EngineeringComponentId)}
              className="w-full px-3 py-2 text-sm bg-[#0B0F17] border border-slate-700 rounded-md text-slate-100 focus:outline-none focus:border-blue-500"
            >
              {ENGINEERING_COMPONENTS.map((comp) => (
                <option key={comp.id} value={comp.id}>
                  {comp.name} [{comp.epistemicCondition}]
                </option>
              ))}
            </select>
            <p className="mt-1.5 text-xs text-slate-400">
              Ownership: {selectedComponent.ownershipBoundary} · {selectedComponent.notes}
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5" htmlFor="intake-workflow">
                Workflow Definition *
              </label>
              <select
                id="intake-workflow"
                value={form.workflowId}
                onChange={(e) => setForm({ ...form, workflowId: e.target.value })}
                className="w-full px-3 py-2 text-sm bg-[#0B0F17] border border-slate-700 rounded-md text-slate-100 focus:outline-none focus:border-blue-500"
              >
                {WORKFLOW_CATALOG.map((wf) => (
                  <option key={wf.id} value={wf.id}>
                    {wf.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5" htmlFor="intake-rev">
                Source Revision *
              </label>
              <input
                id="intake-rev"
                type="text"
                value={form.sourceRevision}
                onChange={(e) => setForm({ ...form, sourceRevision: e.target.value })}
                className="w-full px-3 py-2 text-sm font-mono bg-[#0B0F17] border border-slate-700 rounded-md text-slate-100 focus:outline-none focus:border-blue-500"
              />
              {errors.sourceRevision && (
                <p data-testid="intake-error-sourceRevision" className="mt-1 text-xs text-rose-400">
                  {errors.sourceRevision}
                </p>
              )}
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1.5" htmlFor="intake-purpose">
              Observable Capability / Purpose *
            </label>
            <textarea
              id="intake-purpose"
              rows={2}
              value={form.purpose}
              onChange={(e) => setForm({ ...form, purpose: e.target.value })}
              placeholder="Describe the capability under evaluation without including restricted local logs."
              className="w-full px-3 py-2 text-sm bg-[#0B0F17] border border-slate-700 rounded-md text-slate-100 placeholder-slate-500 focus:outline-none focus:border-blue-500"
            />
            {errors.purpose && (
              <p data-testid="intake-error-purpose" className="mt-1 text-xs text-rose-400">
                {errors.purpose}
              </p>
            )}
          </div>

          {form.inputMode === 'GUIDED_PRODUCT' && (
            <div className="p-3 bg-[#0B0F17] border border-blue-500/30 rounded-md space-y-2">
              <label className="block text-xs font-medium text-blue-200" htmlFor="intake-guided-prompt">
                Guided Product Prompt (Prism-DevRel 7-Facet Draft Spec)
              </label>
              <textarea
                id="intake-guided-prompt"
                rows={2}
                value={form.guidedPrompt ?? ''}
                onChange={(e) => setForm({ ...form, guidedPrompt: e.target.value })}
                placeholder="Describe target facets and views; draft .lex.tex requires explicit human approval before PrismPM compilation."
                className="w-full px-3 py-2 text-xs bg-[#111827] border border-slate-700 rounded-md text-slate-100 placeholder-slate-500 focus:outline-none focus:border-blue-500"
              />
            </div>
          )}

          {form.inputMode === 'EXISTING_RUST' && (
            <div className="p-3 bg-[#0B0F17] border border-amber-500/30 rounded-md text-xs text-amber-200">
              Existing Rust mode uses <span className="font-mono">UORust</span> route projection (`Cargo.lock`, `model/routes.toml`). Browser Cargo execution is blocked and Cargo compilation never substitutes for Prism application verification.
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5" htmlFor="intake-inputs">
                Declared Inputs (Comma-separated) *
              </label>
              <input
                id="intake-inputs"
                type="text"
                value={form.declaredInputs}
                onChange={(e) => setForm({ ...form, declaredInputs: e.target.value })}
                className="w-full px-3 py-2 text-sm font-mono bg-[#0B0F17] border border-slate-700 rounded-md text-slate-100 focus:outline-none focus:border-blue-500"
              />
              {errors.declaredInputs && (
                <p data-testid="intake-error-declaredInputs" className="mt-1 text-xs text-rose-400">
                  {errors.declaredInputs}
                </p>
              )}
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5" htmlFor="intake-env">
                Sanitized Environment Declaration *
              </label>
              <input
                id="intake-env"
                type="text"
                value={form.environmentDeclaration}
                onChange={(e) => setForm({ ...form, environmentDeclaration: e.target.value })}
                className="w-full px-3 py-2 text-sm bg-[#0B0F17] border border-slate-700 rounded-md text-slate-100 focus:outline-none focus:border-blue-500"
              />
              {errors.environmentDeclaration && (
                <p
                  data-testid="intake-error-environmentDeclaration"
                  className="mt-1 text-xs text-rose-400"
                >
                  {errors.environmentDeclaration}
                </p>
              )}
            </div>
          </div>

          {/* Structured Project Input Manifest Preview */}
          {(() => {
            const manifestPreview = buildStructuredInputManifestPreview({
              projectName: form.projectName,
              inputMode: form.inputMode ?? 'NATIVE_PRISM',
              productFamily: form.productFamily,
              sourceRevision: form.sourceRevision,
              purpose: form.purpose,
              guidedPrompt: form.guidedPrompt,
            });
            return (
              <div
                className="p-3.5 bg-[#0B0F17] border border-sky-500/30 rounded-md space-y-2 text-xs"
                data-testid="intake-manifest-preview"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-medium text-sky-200">{manifestPreview.journeyLabel}</span>
                  <span className="text-[10px] font-mono text-slate-400">
                    {manifestPreview.contractSource}
                  </span>
                </div>
                <div className="text-[11px] font-mono text-slate-300">
                  Scaffolded Inputs ({manifestPreview.initialFiles.length}):{' '}
                  {manifestPreview.initialFiles.join(', ')}
                </div>
                <div className="text-[11px] font-mono text-slate-400">
                  Locks: {manifestPreview.lockfileRefs.join(', ')} · Expected Outputs:{' '}
                  {manifestPreview.expectedOutputClasses.join(', ')}
                </div>
                <p className="text-[11px] text-amber-300">{manifestPreview.fabricatedProofWarning}</p>
              </div>
            );
          })()}

          <div className="p-3.5 bg-[#0B0F17] border border-slate-800 rounded-md">
            <label className="flex items-start gap-2.5 cursor-pointer">
              <input
                type="checkbox"
                checked={form.acknowledgeBoundary}
                onChange={(e) => setForm({ ...form, acknowledgeBoundary: e.target.checked })}
                className="mt-0.5 rounded border-slate-600 bg-slate-900 text-blue-600 focus:ring-blue-500"
              />
              <span className="text-xs text-slate-300 leading-relaxed">
                I acknowledge per <span className="font-mono text-slate-200">UOR-Workflow/docs/PUBLICATION_BOUNDARY.md</span> that this is a synthetic browser intake. No restricted local credentials, raw controller logs, or production release authority are invoked here.
              </span>
            </label>
            {errors.acknowledgeBoundary && (
              <p
                data-testid="intake-error-acknowledgeBoundary"
                className="mt-1.5 text-xs text-rose-400"
              >
                {errors.acknowledgeBoundary}
              </p>
            )}
          </div>

          {/* Structured Local Windmill Validation Outcome Panel */}
          {localValidationResult && (
            <div
              data-testid="local-intake-validation-panel"
              className={`p-3.5 bg-[#0B0F17] border rounded-md space-y-2 text-xs ${
                localValidationResult.outcome === 'LIVE VALIDATION'
                  ? 'border-emerald-500/40'
                  : localValidationResult.outcome === 'REJECTED'
                    ? 'border-rose-500/40'
                    : 'border-amber-500/40'
              }`}
            >
              <div className="flex flex-wrap items-center justify-between gap-2 pb-1.5 border-b border-slate-800">
                <div className="flex items-center gap-2 font-medium text-slate-100">
                  {localValidationResult.outcome === 'LIVE VALIDATION' ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" aria-hidden="true" />
                  ) : localValidationResult.outcome === 'REJECTED' ? (
                    <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" aria-hidden="true" />
                  ) : (
                    <Unplug className="w-4 h-4 text-amber-400 shrink-0" aria-hidden="true" />
                  )}
                  <span>Local Windmill Intake Validation (`u/admin/intake_validate`)</span>
                </div>
                <span data-testid="local-intake-validation-badge">
                  <StatusTag value={localValidationResult.outcome} />
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 font-mono text-[11px] text-slate-300">
                <div data-testid="local-intake-validation-valid">
                  valid:{' '}
                  <span
                    className={
                      localValidationResult.valid ? 'text-emerald-300' : 'text-rose-300'
                    }
                  >
                    {String(localValidationResult.valid)}
                  </span>
                </div>
                <div data-testid="local-intake-side-effects">
                  sideEffectsExecuted:{' '}
                  <span className="text-sky-300">
                    {String(localValidationResult.sideEffectsExecuted)}
                  </span>
                </div>
                <div data-testid="local-intake-validation-timestamp" className="truncate">
                  validatedAt: {localValidationResult.validatedAt ?? 'UNAVAILABLE'}
                </div>
              </div>

              {(localValidationResult.sourcePackageValidated !== undefined ||
                localValidationResult.verifiedFileCount !== undefined) && (
                <div
                  data-testid="local-intake-source-package-summary"
                  className="font-mono text-[11px] text-slate-300"
                >
                  sourcePackageValidated: {String(localValidationResult.sourcePackageValidated)} ·
                  verifiedFileCount: {localValidationResult.verifiedFileCount ?? 0}
                </div>
              )}

              {localValidationResult.diagnostic && (
                <div
                  data-testid="local-intake-validation-diagnostic"
                  className="font-mono text-[11px] text-amber-200"
                >
                  [{localValidationResult.diagnostic.code}] {localValidationResult.diagnostic.message}
                </div>
              )}

              {Object.keys(localValidationResult.errors).length > 0 && (
                <ul
                  data-testid="local-intake-validation-errors"
                  className="space-y-1 font-mono text-[11px] text-rose-300 pt-1 border-t border-slate-800/80"
                >
                  {Object.entries(localValidationResult.errors).map(([field, msg]) => (
                    <li key={field}>
                      [{field}] {msg}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          <div className="pt-2 flex flex-wrap items-center justify-between gap-3 border-t border-slate-800">
            <button
              type="button"
              onClick={handleValidateIntakeLocally}
              disabled={validatingLocally || submitting}
              data-testid="validate-intake-locally-btn"
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-emerald-200 bg-emerald-950/35 hover:bg-emerald-950/55 border border-emerald-500/40 disabled:opacity-50 rounded-md transition-colors"
            >
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" aria-hidden="true" />
              <span>
                {validatingLocally ? 'Validating Locally...' : 'Validate Intake Locally'}
              </span>
            </button>

            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-xs font-medium text-slate-300 hover:text-white border border-slate-700 rounded-md transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting}
                data-testid="submit-simulated-workflow-btn"
                className="px-4 py-2 text-xs font-medium text-white bg-blue-600 hover:bg-blue-500 disabled:opacity-50 rounded-md transition-colors"
              >
                {submitting ? 'Submitting...' : 'Submit & Launch Simulated Workflow'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
