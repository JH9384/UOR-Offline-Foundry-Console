import React, { useState } from 'react';
import { AlertCircle, X } from 'lucide-react';
import { ENGINEERING_COMPONENTS, WORKFLOW_CATALOG } from '../data/seedFoundryData';
import {
  foundryService,
  IntakeValidationErrors,
  PROJECT_TEMPLATES,
} from '../services/foundryService';
import {
  EngineeringComponentId,
  EngineeringIntakePayload,
  ProductFamily,
  ProjectTemplateSpec,
} from '../types/foundry';
import { StatusTag } from './StatusTag';

interface IntakeModalProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (payload: EngineeringIntakePayload) => Promise<void>;
}

const DEFAULT_PAYLOAD: EngineeringIntakePayload = {
  projectName: '',
  productFamily: 'application',
  componentId: 'prismpm-calculator',
  workflowId: 'wf-prismpm-delivery',
  purpose: '',
  declaredInputs: 'src/Main.lex.tex, lexlean.lock',
  environmentDeclaration: 'Sanitized offline workspace (no local secrets or raw logs)',
  sourceRevision: 'demo/intake@0.4.0',
  acknowledgeBoundary: false,
};

export const IntakeModal: React.FC<IntakeModalProps> = ({ open, onClose, onSubmit }) => {
  const [form, setForm] = useState<EngineeringIntakePayload>(DEFAULT_PAYLOAD);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);
  const [errors, setErrors] = useState<IntakeValidationErrors>({});
  const [submitting, setSubmitting] = useState(false);

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

  const applyTemplate = (tpl: ProjectTemplateSpec) => {
    setSelectedTemplateId(tpl.id);
    setForm({
      projectName: `${tpl.defaultNamePrefix} ${Math.floor(10 + Math.random() * 89)}`,
      productFamily: tpl.productFamily,
      componentId: tpl.componentId,
      workflowId: tpl.workflowId,
      purpose: tpl.purpose,
      declaredInputs: tpl.declaredInputs,
      environmentDeclaration: tpl.environmentDeclaration,
      sourceRevision: tpl.sourceRevision,
      acknowledgeBoundary: true,
    });
    setErrors({});
  };

  const handleFillExample = () => {
    setSelectedTemplateId('application');
    setForm({
      projectName: 'PrismPM Calculator Qualification Demo',
      productFamily: 'application',
      componentId: 'prismpm-calculator',
      workflowId: 'wf-prismpm-delivery',
      purpose: 'Simulate closed .lex.tex build and fail-closed verification gates for Calculator reference model.',
      declaredInputs: 'examples/Calculator/src/Calculator.lex.tex, examples/Calculator/lexlean.lock',
      environmentDeclaration: 'Sanitized browser demonstration; target Windmill workspace uor-offline-foundry',
      sourceRevision: 'prismpm/demo@ee207ff1',
      acknowledgeBoundary: true,
    });
    setErrors({});
  };

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
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
            <h2 id="intake-modal-title" className="font-display font-semibold text-base text-slate-100">
              Synthetic Engineering Intake
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Grounded in JH9384/UOR-Workflow product-intake template · Launches simulated workflow only
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
          {/* Synthetic UOR-grounded Templates */}
          <div className="space-y-2">
            <div className="text-xs font-medium text-slate-300">
              Start from a UOR Synthetic Template (Optional)
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              {PROJECT_TEMPLATES.map((tpl) => {
                const active = selectedTemplateId === tpl.id;
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
                <p className="mt-1 text-xs text-rose-400 flex items-center gap-1">
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
                <p className="mt-1 text-xs text-rose-400">{errors.sourceRevision}</p>
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
            {errors.purpose && <p className="mt-1 text-xs text-rose-400">{errors.purpose}</p>}
          </div>

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
                <p className="mt-1 text-xs text-rose-400">{errors.declaredInputs}</p>
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
                <p className="mt-1 text-xs text-rose-400">{errors.environmentDeclaration}</p>
              )}
            </div>
          </div>

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
              <p className="mt-1.5 text-xs text-rose-400">{errors.acknowledgeBoundary}</p>
            )}
          </div>

          <div className="pt-2 flex items-center justify-end gap-3 border-t border-slate-800">
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
              className="px-4 py-2 text-xs font-medium text-white bg-blue-600 hover:bg-blue-500 disabled:opacity-50 rounded-md transition-colors"
            >
              {submitting ? 'Submitting...' : 'Submit & Launch Simulated Workflow'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
