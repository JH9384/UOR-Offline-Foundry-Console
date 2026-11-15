import React, { useState } from 'react';
import {
  Crosshair,
  Lock,
  Monitor,
  Play,
  Smartphone,
} from 'lucide-react';
import { ENGINEERING_COMPONENTS } from '../../data/seedFoundryData';
import {
  PreviewConfigState,
  PreviewElementRef,
  ProjectRecord,
  WorkspaceMode,
} from '../../types/foundry';

interface LivePreviewPanelProps {
  project: ProjectRecord;
  preview: PreviewConfigState;
  selectedElement: PreviewElementRef | null;
  onSelectElement: (element: PreviewElementRef | null) => void;
  onSwitchMode: (mode: WorkspaceMode) => void;
}

export const LivePreviewPanel: React.FC<LivePreviewPanelProps> = ({
  project,
  preview,
  selectedElement,
  onSelectElement,
  onSwitchMode,
}) => {
  const [inspectMode, setInspectMode] = useState(false);
  const [viewport, setViewport] = useState<'desktop' | 'compact'>('desktop');

  // Interactive simulated states for preview surfaces
  const [calcInputA, setCalcInputA] = useState('14');
  const [calcInputB, setCalcInputB] = useState('28');
  const [calcOp, setCalcOp] = useState<'+' | '-' | '*'>('+');
  const [mcpDigestInput, setMcpDigestInput] = useState(
    '31795eac06fbf1d64c77ffe66b5492964c069e1f2fea41efbf6a17054cf369d7'
  );
  const [simResult, setSimResult] = useState<string | null>(null);

  const component = ENGINEERING_COMPONENTS.find((c) => c.id === project.componentId);
  const isUnverified = component?.epistemicCondition === 'UNVERIFIED';

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
        `Simulated HOLOVIEW output: ${a} ${calcOp} ${b} = ${val} (browser preview only, not Core-Wasm)`
      );
    } else if (project.componentId === 'lexlean-mcp-gateway') {
      const validHex = /^[0-9a-f]{64}$/.test(mcpDigestInput.trim());
      if (!validHex) {
        setSimResult(
          'Simulated ATTESTATION.md AT-03 refusal: {"failure":"value-refused"} (requires 64 lowercase hex chars)'
        );
      } else {
        setSimResult(
          `Simulated lookup (AT-03): {"found": false, "note": "Live store NOT CONNECTED in browser preview"}`
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
      <div className="px-4 py-3 border-b border-slate-800/80 flex flex-wrap items-center justify-between gap-2 shrink-0">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-slate-200">Live Preview</span>
          <span className="text-[11px] font-mono text-slate-500">
            · {preview.layoutDensity}
          </span>
        </div>

        <div className="flex items-center gap-2">
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
            <span>{inspectMode ? 'Click Any Element...' : 'Select Element'}</span>
          </button>

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

      {/* Preview Canvas */}
      <div className="flex-1 overflow-y-auto p-4 lg:p-5 bg-[#090D14] flex justify-center">
        <div
          className={`w-full transition-all ${
            viewport === 'compact' ? 'max-w-sm' : 'max-w-2xl'
          }`}
        >
          <div
            className={`bg-[#111827] border border-slate-800 rounded-lg ${spacingClass}`}
          >
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
                <span className="text-[11px] font-mono text-indigo-300 shrink-0">
                  SIMULATED UI
                </span>
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
                    Authoritative Forge Kernel / App Core runtime is unverified and restricted outside Google AI Studio.
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

              {/* Custom Draft Widgets */}
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
              <div className="text-[11px] text-slate-500 mb-1">Simulated Output</div>
              <div className="text-slate-200">
                {simResult ?? `Ready. Click "${preview.primaryActionLabel}" to test in browser sandbox.`}
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
        </div>
      </div>
    </section>
  );
};
