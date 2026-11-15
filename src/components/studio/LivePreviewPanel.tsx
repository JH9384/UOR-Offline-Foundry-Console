import React, { useState } from 'react';
import {
  Crosshair,
  Lock,
  Monitor,
  Play,
  Smartphone,
} from 'lucide-react';
import { artifactPreviewAdapter } from '../../adapters/artifactPreviewAdapter';
import { ENGINEERING_COMPONENTS } from '../../data/seedFoundryData';
import {
  ArtifactPreviewKind,
  ArtifactProvenanceRecord,
  IntegrationMode,
  PreviewConfigState,
  PreviewElementRef,
  ProjectRecord,
  VerificationSuiteRecord,
  WorkflowRun,
  WorkspaceMode,
} from '../../types/foundry';
import { StatusTag } from '../StatusTag';

interface LivePreviewPanelProps {
  project: ProjectRecord;
  preview: PreviewConfigState;
  integrationMode: IntegrationMode;
  run?: WorkflowRun;
  artifacts: ArtifactProvenanceRecord[];
  verifications: VerificationSuiteRecord[];
  selectedElement: PreviewElementRef | null;
  onSelectElement: (element: PreviewElementRef | null) => void;
  onSwitchMode: (mode: WorkspaceMode) => void;
}

const PREVIEW_KINDS: Array<{ id: ArtifactPreviewKind; label: string }> = [
  { id: 'ui-build', label: 'UI Build' },
  { id: 'document', label: 'Document' },
  { id: 'json-artifact', label: 'JSON' },
  { id: 'workflow-output', label: 'Workflow Log' },
  { id: 'image-diagram', label: 'Diagram' },
  { id: 'validation-report', label: 'Validation' },
];

export const LivePreviewPanel: React.FC<LivePreviewPanelProps> = ({
  project,
  preview,
  integrationMode,
  run,
  artifacts,
  verifications,
  selectedElement,
  onSelectElement,
  onSwitchMode,
}) => {
  const [previewKind, setPreviewKind] = useState<ArtifactPreviewKind>('ui-build');
  const [inspectMode, setInspectMode] = useState(false);
  const [viewport, setViewport] = useState<'desktop' | 'compact'>('desktop');

  // Interactive simulated states for UI Build sandbox
  const [calcInputA, setCalcInputA] = useState('14');
  const [calcInputB, setCalcInputB] = useState('28');
  const [calcOp, setCalcOp] = useState<'+' | '-' | '*'>('+');
  const [mcpDigestInput, setMcpDigestInput] = useState(
    '31795eac06fbf1d64c77ffe66b5492964c069e1f2fea41efbf6a17054cf369d7'
  );
  const [simResult, setSimResult] = useState<string | null>(null);

  const component = ENGINEERING_COMPONENTS.find((c) => c.id === project.componentId);
  const isUnverified = component?.epistemicCondition === 'UNVERIFIED';

  const artifactPreview = artifactPreviewAdapter.buildPreview({
    kind: previewKind,
    mode: integrationMode,
    project,
    previewConfig: preview,
    run,
    artifacts,
    verifications,
  });

  const handleElementClick = (el: PreviewElementRef) => {
    if (!inspectMode) return;
    onSelectElement(el);
    setInspectMode(false);
  };

  const getInspectClass = (elementId: string) => {
    const isSelected = selectedElement?.elementId === elementId;
    if (isSelected) {
      return 'ring-2 ring-blue-500 ring-offset-2 ring-offset-[#090D14] rounded-md';
    }
    if (inspectMode) {
      return 'hover:ring-2 hover:ring-blue-400/70 hover:ring-offset-2 hover:ring-offset-[#090D14] rounded-md cursor-crosshair transition-shadow';
    }
    return '';
  };

  const runPreviewAction = () => {
    if (project.componentId === 'prismpm-calculator') {
      const a = Number(calcInputA) || 0;
      const b = Number(calcInputB) || 0;
      const val = calcOp === '+' ? a + b : calcOp === '-' ? a - b : a * b;
      setSimResult(
        `Simulated HOLOVIEW output: ${a} ${calcOp} ${b} = ${val} (sandbox preview only, not Core-Wasm)`
      );
    } else if (project.componentId === 'lexlean-mcp-gateway') {
      const validHex = /^[0-9a-f]{64}$/.test(mcpDigestInput.trim());
      if (!validHex) {
        setSimResult(
          'Simulated ATTESTATION.md AT-03 refusal: {"failure":"value-refused"} (requires 64 lowercase hex chars)'
        );
      } else {
        setSimResult(
          'Simulated lookup (AT-03): {"found": false, "note": "Live store NOT CONNECTED in browser preview"}'
        );
      }
    } else if (isUnverified) {
      setSimResult(
        'Refused: Unverified local boundary. Execution is disabled outside Mac Studio.'
      );
    } else {
      setSimResult(
        `Simulated capability check for "${project.name}" at ${project.sourceRevision}.`
      );
    }
  };

  const spacingClass =
    preview.layoutDensity === 'compact' ? 'p-3.5 space-y-3' : 'p-5 space-y-4';

  return (
    <section className="flex flex-col h-full min-h-[540px] bg-[#0F1520] border border-slate-800/80 rounded-lg overflow-hidden">
      {/* Preview Toolbar */}
      <div className="px-4 py-2.5 border-b border-slate-800/80 space-y-2 shrink-0">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-xs font-medium text-slate-200">Preview</span>
            <StatusTag value={artifactPreview.status} />
            <span className="text-[11px] font-mono text-slate-500 truncate hidden sm:inline">
              {artifactPreview.originLabel}
            </span>
          </div>

          <div className="flex items-center gap-2">
            {previewKind === 'ui-build' && (
              <button
                type="button"
                onClick={() => setInspectMode((prev) => !prev)}
                aria-pressed={inspectMode}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs rounded border transition-colors whitespace-nowrap ${
                  inspectMode
                    ? 'bg-blue-600 border-blue-500 text-white'
                    : 'bg-[#141C2B] border-slate-700 text-slate-300 hover:text-white'
                }`}
                title="Click an element in the preview to reference it in Chat"
              >
                <Crosshair className="w-3.5 h-3.5" aria-hidden="true" />
                <span>{inspectMode ? 'Click Element...' : 'Select Element'}</span>
              </button>
            )}

            <div className="hidden sm:flex items-center p-0.5 bg-[#090D14] border border-slate-800 rounded">
              <button
                type="button"
                onClick={() => setViewport('desktop')}
                className={`p-1 rounded ${
                  viewport === 'desktop' ? 'bg-slate-800 text-white' : 'text-slate-500'
                }`}
                aria-label="Desktop preview width"
              >
                <Monitor className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => setViewport('compact')}
                className={`p-1 rounded ${
                  viewport === 'compact' ? 'bg-slate-800 text-white' : 'text-slate-500'
                }`}
                aria-label="Narrow preview width"
              >
                <Smartphone className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>

        {/* Artifact Preview Adapter Selector */}
        <div className="flex items-center gap-1 overflow-x-auto pb-0.5">
          {PREVIEW_KINDS.map((k) => {
            const active = previewKind === k.id;
            return (
              <button
                key={k.id}
                type="button"
                onClick={() => {
                  setPreviewKind(k.id);
                  if (k.id !== 'ui-build') setInspectMode(false);
                }}
                className={`px-2.5 py-1 text-[11px] font-medium rounded transition-colors whitespace-nowrap shrink-0 ${
                  active
                    ? 'bg-slate-800 text-white'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {k.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Preview Canvas */}
      <div className="flex-1 overflow-y-auto p-4 lg:p-5 bg-[#090D14] flex flex-col items-center">
        <div
          className={`w-full transition-all ${
            viewport === 'compact' ? 'max-w-sm' : 'max-w-2xl'
          }`}
        >
          {previewKind === 'ui-build' ? (
            <div className={`bg-[#111827] border border-slate-800 rounded-lg ${spacingClass}`}>
              {/* Preview Region 1: Header */}
              <div
                onClick={() =>
                  handleElementClick({
                    elementId: 'preview-header',
                    label: 'Preview Header',
                    region: 'Header',
                    currentSummary: `${preview.appTitle} — ${preview.subtitle}`,
                  })
                }
                className={`pb-3 border-b border-slate-800 ${getInspectClass('preview-header')}`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h2 className="font-display font-semibold text-base text-slate-100">
                      {preview.appTitle}
                    </h2>
                    <p className="text-xs text-slate-400 mt-0.5">{preview.subtitle}</p>
                  </div>
                  <StatusTag value={artifactPreview.status} />
                </div>
                {preview.draftBannerNote && (
                  <p className="mt-2 text-[11px] text-slate-500">
                    {preview.draftBannerNote}
                  </p>
                )}
              </div>

              {/* Preview Region 2: Interactive Surface */}
              <div
                onClick={() =>
                  handleElementClick({
                    elementId: 'preview-workspace',
                    label: 'Interactive Inputs Panel',
                    region: 'Main Surface',
                    currentSummary: project.declaredInputs,
                  })
                }
                className={`space-y-3 ${getInspectClass('preview-workspace')}`}
              >
                {project.componentId === 'prismpm-calculator' ? (
                  <div className="grid grid-cols-3 gap-2">
                    <input
                      type="number"
                      value={calcInputA}
                      onChange={(e) => setCalcInputA(e.target.value)}
                      aria-label="Operand A"
                      className="px-3 py-2 text-xs font-mono bg-[#090D14] border border-slate-700 rounded text-slate-100"
                    />
                    <select
                      value={calcOp}
                      onChange={(e) => setCalcOp(e.target.value as '+' | '-' | '*')}
                      aria-label="Operator"
                      className="px-3 py-2 text-xs font-mono bg-[#090D14] border border-slate-700 rounded text-slate-100"
                    >
                      <option value="+">+ (add)</option>
                      <option value="-">- (sub)</option>
                      <option value="*">* (mul)</option>
                    </select>
                    <input
                      type="number"
                      value={calcInputB}
                      onChange={(e) => setCalcInputB(e.target.value)}
                      aria-label="Operand B"
                      className="px-3 py-2 text-xs font-mono bg-[#090D14] border border-slate-700 rounded text-slate-100"
                    />
                  </div>
                ) : project.componentId === 'lexlean-mcp-gateway' ? (
                  <div>
                    <label className="block text-[11px] text-slate-400 mb-1">
                      Attestation Digest Lookup Input (64-hex SHA-256)
                    </label>
                    <input
                      type="text"
                      value={mcpDigestInput}
                      onChange={(e) => setMcpDigestInput(e.target.value)}
                      className="w-full px-3 py-2 text-xs font-mono bg-[#090D14] border border-slate-700 rounded text-slate-100"
                    />
                  </div>
                ) : isUnverified ? (
                  <div className="p-3 bg-amber-950/20 border border-amber-500/30 rounded text-xs text-amber-200 flex items-start gap-2">
                    <Lock className="w-4 h-4 shrink-0 mt-0.5" aria-hidden="true" />
                    <span>
                      Authoritative Forge Kernel / App Core runtime is unverified and restricted outside Mac Studio.
                    </span>
                  </div>
                ) : (
                  <div className="p-3 bg-[#090D14] border border-slate-800 rounded text-xs space-y-1">
                    <div className="text-slate-400">Purpose: {project.purpose}</div>
                    <div className="font-mono text-[11px] text-slate-500">
                      Inputs: {project.declaredInputs}
                    </div>
                  </div>
                )}

                {preview.customWidgets.length > 0 && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {preview.customWidgets.map((cw) => (
                      <div
                        key={cw.id}
                        className="p-2.5 bg-[#090D14] border border-slate-800 rounded text-xs"
                      >
                        <div className="text-[11px] text-slate-500">{cw.label}</div>
                        <div className="font-mono text-slate-200 mt-0.5 truncate">
                          {cw.value}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Preview Region 3: Primary Action */}
              <div
                onClick={() =>
                  handleElementClick({
                    elementId: 'preview-primary-action',
                    label: `Action Button (${preview.primaryActionLabel})`,
                    region: 'Action Bar',
                    currentSummary: preview.primaryActionLabel,
                  })
                }
                className={`flex items-center justify-between gap-3 ${getInspectClass('preview-primary-action')}`}
              >
                <button
                  type="button"
                  onClick={(e) => {
                    if (inspectMode) {
                      e.stopPropagation();
                      handleElementClick({
                        elementId: 'preview-primary-action',
                        label: `Action Button (${preview.primaryActionLabel})`,
                        region: 'Action Bar',
                        currentSummary: preview.primaryActionLabel,
                      });
                      return;
                    }
                    runPreviewAction();
                  }}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-white bg-blue-600 hover:bg-blue-500 rounded-md transition-colors"
                >
                  <Play className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>{preview.primaryActionLabel}</span>
                </button>

                <button
                  type="button"
                  onClick={() => onSwitchMode('build')}
                  className="text-xs text-slate-400 hover:text-slate-200"
                >
                  Inspect Build &rarr;
                </button>
              </div>

              {/* Preview Region 4: Output Panel */}
              <div
                onClick={() =>
                  handleElementClick({
                    elementId: 'preview-output',
                    label: 'Output Result Panel',
                    region: 'Output',
                    currentSummary: simResult ?? 'Awaiting simulated action',
                  })
                }
                className={`p-3 bg-[#090D14] border border-slate-800 rounded text-xs ${
                  preview.showMonospaceOutputs ? 'font-mono' : 'font-sans'
                } ${getInspectClass('preview-output')}`}
              >
                <div className="text-[11px] text-slate-500 mb-1">Sandboxed Output</div>
                <div className="text-slate-200">
                  {simResult ?? `Ready. Click "${preview.primaryActionLabel}" to test in sandbox.`}
                </div>
              </div>

              {/* Preview Region 5: Provenance Footer */}
              {preview.showProvenanceFooter && (
                <div
                  onClick={() =>
                    handleElementClick({
                      elementId: 'preview-footer',
                      label: 'Provenance & Release Footer',
                      region: 'Footer',
                      currentSummary: `${project.sourceRevision} · ${project.lifecycleStatus}`,
                    })
                  }
                  className={`pt-3 border-t border-slate-800 flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-400 ${getInspectClass('preview-footer')}`}
                >
                  <span className="font-mono">{project.sourceRevision}</span>
                  <button
                    type="button"
                    onClick={(e) => {
                      if (inspectMode) return;
                      e.stopPropagation();
                      onSwitchMode('verify');
                    }}
                    className="font-mono text-amber-300 hover:underline"
                  >
                    {project.lifecycleStatus}
                  </button>
                </div>
              )}
            </div>
          ) : (
            /* Artifact Preview Adapter: Document / JSON / Workflow Output / Diagram / Validation Report */
            <div className="bg-[#111827] border border-slate-800 rounded-lg p-5 space-y-4">
              <div className="flex items-start justify-between gap-3 pb-3 border-b border-slate-800">
                <div>
                  <h2 className="font-display font-semibold text-sm text-slate-100">
                    {artifactPreview.title}
                  </h2>
                  <p className="text-xs text-slate-400 mt-0.5">{artifactPreview.subtitle}</p>
                </div>
                <StatusTag value={artifactPreview.status} />
              </div>

              {artifactPreview.unavailableReason ? (
                <div className="p-3 bg-rose-950/20 border border-rose-500/30 rounded text-xs text-rose-200">
                  {artifactPreview.unavailableReason}
                </div>
              ) : artifactPreview.kind === 'image-diagram' && artifactPreview.diagramNodes ? (
                <div className="bg-[#090D14] border border-slate-800 rounded p-4 overflow-x-auto">
                  <svg
                    viewBox="0 0 680 120"
                    className="w-full min-w-[540px] h-28"
                    role="img"
                    aria-label="Workflow stage schematic diagram"
                  >
                    {artifactPreview.diagramNodes.map((node, i) => {
                      const x = 12 + i * 84;
                      const stroke =
                        node.status === 'COMPLETED'
                          ? '#10b981'
                          : node.status === 'RUNNING'
                            ? '#3b82f6'
                            : node.status === 'BLOCKED'
                              ? '#f59e0b'
                              : '#334155';
                      return (
                        <g key={node.id}>
                          {i > 0 && (
                            <line
                              x1={x - 10}
                              y1={56}
                              x2={x}
                              y2={56}
                              stroke="#475569"
                              strokeWidth="1.5"
                            />
                          )}
                          <rect
                            x={x}
                            y={24}
                            width={74}
                            height={64}
                            rx={4}
                            fill="#111827"
                            stroke={stroke}
                            strokeWidth="1.5"
                          />
                          <text
                            x={x + 37}
                            y={46}
                            textAnchor="middle"
                            fill="#e2e8f0"
                            fontSize="10"
                            fontFamily="sans-serif"
                          >
                            {node.label}
                          </text>
                          <text
                            x={x + 37}
                            y={64}
                            textAnchor="middle"
                            fill="#94a3b8"
                            fontSize="7"
                            fontFamily="monospace"
                          >
                            {node.status}
                          </text>
                        </g>
                      );
                    })}
                  </svg>
                </div>
              ) : artifactPreview.kind === 'validation-report' && artifactPreview.reportItems ? (
                <div className="divide-y divide-slate-800 border border-slate-800 rounded bg-[#090D14]">
                  {artifactPreview.reportItems.map((item, idx) => (
                    <div key={idx} className="p-3 flex items-start justify-between gap-3 text-xs">
                      <div className="space-y-0.5 min-w-0">
                        <div className="font-medium text-slate-200">{item.label}</div>
                        <div className="text-[11px] font-mono text-slate-500">{item.authority}</div>
                        <p className="text-[11px] text-slate-400">{item.detail}</p>
                      </div>
                      <StatusTag value={item.status} />
                    </div>
                  ))}
                </div>
              ) : artifactPreview.kind === 'json-artifact' && artifactPreview.jsonPayload ? (
                <pre className="p-3.5 bg-[#090D14] border border-slate-800 rounded text-[11px] font-mono text-slate-200 overflow-x-auto leading-relaxed">
                  {JSON.stringify(artifactPreview.jsonPayload, null, 2)}
                </pre>
              ) : (
                <pre className="p-3.5 bg-[#090D14] border border-slate-800 rounded text-[11px] font-mono text-slate-200 whitespace-pre-wrap leading-relaxed">
                  {artifactPreview.contentText ?? 'No content available.'}
                </pre>
              )}

              <div className="text-[11px] text-slate-500 pt-1">
                Sandboxed preview ({artifactPreview.sourceRevision}). Visual rendering does not certify build success or verification.
              </div>
            </div>
          )}

          {/* Persistent Sandbox / Non-Evidence Notice */}
          <div className="mt-3 text-[11px] text-slate-500 text-center">
            Preview is sandboxed and separated from authoritative UOR verification evidence.
          </div>
        </div>
      </div>
    </section>
  );
};
