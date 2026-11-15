import React, { useEffect, useState } from 'react';
import {
  AlertTriangle,
  BookmarkPlus,
  Check,
  Copy,
  Crosshair,
  History,
  Loader2,
  Lock,
  Maximize2,
  Minimize2,
  Monitor,
  Play,
  Redo2,
  RefreshCw,
  RotateCcw,
  Smartphone,
  Tablet,
  Undo2,
} from 'lucide-react';
import { artifactPreviewAdapter } from '../../adapters/artifactPreviewAdapter';
import { ENGINEERING_COMPONENTS } from '../../data/seedFoundryData';
import {
  ArtifactPreviewKind,
  ArtifactProvenanceRecord,
  IntegrationMode,
  PreviewConfigState,
  PreviewElementRef,
  ProjectCheckpoint,
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
  canUndo: boolean;
  canRedo: boolean;
  checkpoints: ProjectCheckpoint[];
  onUndoDraft: () => void;
  onRedoDraft: () => void;
  onCreateCheckpoint: (name: string) => void;
  onRestoreCheckpoint: (checkpointId: string) => void;
  onResetPreview: () => void;
  onSelectElement: (element: PreviewElementRef | null) => void;
  onSwitchMode: (mode: WorkspaceMode) => void;
  onOpenSourceCompliance?: () => void;
  onOpenSourceAuthoring?: () => void;
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
  canUndo,
  canRedo,
  checkpoints,
  onUndoDraft,
  onRedoDraft,
  onCreateCheckpoint,
  onRestoreCheckpoint,
  onResetPreview,
  onSelectElement,
  onSwitchMode,
  onOpenSourceCompliance,
  onOpenSourceAuthoring,
}) => {
  const [previewKind, setPreviewKind] = useState<ArtifactPreviewKind>('ui-build');
  const [inspectMode, setInspectMode] = useState(false);
  const [viewport, setViewport] = useState<'desktop' | 'tablet' | 'mobile'>('desktop');
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [checkpointOpen, setCheckpointOpen] = useState(false);
  const [checkpointName, setCheckpointName] = useState('');
  const [copiedOutput, setCopiedOutput] = useState(false);

  // Interactive simulated states for UI Build sandbox
  const [calcInputA, setCalcInputA] = useState('14');
  const [calcInputB, setCalcInputB] = useState('28');
  const [calcOp, setCalcOp] = useState<'+' | '-' | '*'>('+');
  const [mcpDigestInput, setMcpDigestInput] = useState(
    '31795eac06fbf1d64c77ffe66b5492964c069e1f2fea41efbf6a17054cf369d7'
  );
  const [simResult, setSimResult] = useState<string | null>(null);

  const projectArtifacts = artifacts.filter((a) => a.projectId === project.id);
  const defaultArtifactId =
    projectArtifacts.find((a) => a.outputClass === 'physical_holo_archive')?.id ??
    projectArtifacts[0]?.id ??
    '';
  const [selectedArtifactId, setSelectedArtifactId] = useState<string>(defaultArtifactId);

  useEffect(() => {
    setSelectedArtifactId(defaultArtifactId);
  }, [project.id, defaultArtifactId]);

  const selectedArtifact =
    projectArtifacts.find((a) => a.id === selectedArtifactId) ?? projectArtifacts[0];

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
    selectedArtifactId: selectedArtifact?.id,
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

  const triggerSimulatedRefresh = () => {
    setPreviewError(null);
    setPreviewLoading(true);
    setTimeout(() => {
      setPreviewLoading(false);
    }, 220);
  };

  const copyCurrentOutput = async () => {
    const payload =
      previewKind === 'ui-build'
        ? simResult ?? `Ready. Click "${preview.primaryActionLabel}" to test in sandbox.`
        : previewKind === 'json-artifact' && artifactPreview.jsonPayload
          ? JSON.stringify(artifactPreview.jsonPayload, null, 2)
          : previewKind === 'validation-report' && artifactPreview.reportItems
            ? JSON.stringify(artifactPreview.reportItems, null, 2)
            : artifactPreview.contentText ?? artifactPreview.title;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(payload);
      }
    } catch {
      // Fallback confirmation state for restricted sandboxes
    }
    setCopiedOutput(true);
    setTimeout(() => setCopiedOutput(false), 1600);
  };

  const handleSaveCheckpoint = (e: React.FormEvent) => {
    e.preventDefault();
    const label = checkpointName.trim() || `Checkpoint ${checkpoints.length + 1}`;
    onCreateCheckpoint(label);
    setCheckpointName('');
  };

  const viewportWidthClass =
    viewport === 'mobile'
      ? 'max-w-[360px]'
      : viewport === 'tablet'
        ? 'max-w-[680px]'
        : 'max-w-3xl';

  const spacingClass =
    preview.layoutDensity === 'compact' ? 'p-3.5 space-y-3' : 'p-5 space-y-4';

  const containerClass = isFullscreen
    ? 'fixed inset-0 z-50 flex flex-col bg-[#0F1520] border border-slate-800 overflow-hidden'
    : 'flex flex-col h-full min-h-[540px] bg-[#0F1520] border border-slate-800/80 rounded-lg overflow-hidden';

  return (
    <section className={containerClass} aria-label="Live preview panel">
      {/* Preview Toolbar */}
      <div className="px-4 py-2.5 border-b border-slate-800/80 space-y-2 shrink-0">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-xs font-medium text-slate-200">Preview</span>
            <StatusTag value={previewError ? 'UNAVAILABLE' : artifactPreview.status} />
            <span className="text-[11px] font-mono text-slate-500 truncate hidden sm:inline">
              {artifactPreview.originLabel}
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
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

            {/* Undo / Redo / Checkpoints */}
            <div className="flex items-center p-0.5 bg-[#090D14] border border-slate-800 rounded">
              <button
                type="button"
                disabled={!canUndo}
                onClick={onUndoDraft}
                className="p-1 text-slate-300 hover:text-white disabled:text-slate-600 disabled:cursor-not-allowed rounded"
                aria-label="Undo preview draft change"
                title="Undo draft change"
              >
                <Undo2 className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                disabled={!canRedo}
                onClick={onRedoDraft}
                className="p-1 text-slate-300 hover:text-white disabled:text-slate-600 disabled:cursor-not-allowed rounded"
                aria-label="Redo preview draft change"
                title="Redo draft change"
              >
                <Redo2 className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => setCheckpointOpen((prev) => !prev)}
                aria-expanded={checkpointOpen}
                className={`px-1.5 py-1 text-[11px] rounded inline-flex items-center gap-1 ${
                  checkpointOpen ? 'bg-slate-800 text-white' : 'text-slate-300 hover:text-white'
                }`}
                aria-label="Manage project checkpoints"
                title="Checkpoints"
              >
                <History className="w-3 h-3" aria-hidden="true" />
                <span className="hidden md:inline tabular-nums">
                  Checkpoints ({checkpoints.length})
                </span>
              </button>
            </div>

            {/* Responsive Viewports */}
            <div className="hidden sm:flex items-center p-0.5 bg-[#090D14] border border-slate-800 rounded">
              <button
                type="button"
                onClick={() => setViewport('desktop')}
                className={`p-1 rounded ${
                  viewport === 'desktop' ? 'bg-slate-800 text-white' : 'text-slate-500 hover:text-slate-300'
                }`}
                aria-label="Desktop preview width"
              >
                <Monitor className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => setViewport('tablet')}
                className={`p-1 rounded ${
                  viewport === 'tablet' ? 'bg-slate-800 text-white' : 'text-slate-500 hover:text-slate-300'
                }`}
                aria-label="Tablet preview width"
              >
                <Tablet className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => setViewport('mobile')}
                className={`p-1 rounded ${
                  viewport === 'mobile' ? 'bg-slate-800 text-white' : 'text-slate-500 hover:text-slate-300'
                }`}
                aria-label="Mobile preview width"
              >
                <Smartphone className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Refresh / Copy / Reset / Fullscreen */}
            <button
              type="button"
              onClick={triggerSimulatedRefresh}
              className="p-1.5 text-slate-400 hover:text-white bg-[#141C2B] border border-slate-800 rounded"
              aria-label="Refresh simulated preview"
              title="Refresh preview"
            >
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={copyCurrentOutput}
              className="p-1.5 text-slate-400 hover:text-white bg-[#141C2B] border border-slate-800 rounded"
              aria-label="Copy preview output"
              title="Copy output details"
            >
              {copiedOutput ? (
                <Check className="w-3.5 h-3.5 text-emerald-400" />
              ) : (
                <Copy className="w-3.5 h-3.5" />
              )}
            </button>
            <button
              type="button"
              onClick={() => {
                setSimResult(null);
                setPreviewError(null);
                onResetPreview();
              }}
              className="p-1.5 text-slate-400 hover:text-white bg-[#141C2B] border border-slate-800 rounded"
              aria-label="Reset simulated preview"
              title="Reset simulated preview safely"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => setIsFullscreen((prev) => !prev)}
              className="p-1.5 text-slate-400 hover:text-white bg-[#141C2B] border border-slate-800 rounded"
              aria-label={isFullscreen ? 'Exit fullscreen preview' : 'Enter fullscreen preview'}
              title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen preview'}
            >
              {isFullscreen ? (
                <Minimize2 className="w-3.5 h-3.5" />
              ) : (
                <Maximize2 className="w-3.5 h-3.5" />
              )}
            </button>
          </div>
        </div>

        {/* Artifact Preview Adapter Selector */}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-1 overflow-x-auto pb-0.5">
            {PREVIEW_KINDS.map((k) => {
              const active = previewKind === k.id;
              return (
                <button
                  key={k.id}
                  type="button"
                  onClick={() => {
                    setPreviewKind(k.id);
                    setPreviewError(null);
                    if (k.id !== 'ui-build') setInspectMode(false);
                  }}
                  className={`px-2.5 py-1 text-[11px] font-medium rounded transition-colors whitespace-nowrap shrink-0 ${
                    active ? 'bg-slate-800 text-white' : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {k.label}
                </button>
              );
            })}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {projectArtifacts.length > 0 && (
              <div className="flex items-center gap-1.5">
                <label
                  htmlFor="preview-artifact-selector"
                  className="text-[10px] font-mono text-slate-500"
                >
                  Artifact
                </label>
                <select
                  id="preview-artifact-selector"
                  data-testid="preview-artifact-selector"
                  value={selectedArtifact?.id ?? ''}
                  onChange={(e) => {
                    setSelectedArtifactId(e.target.value);
                    if (previewKind === 'ui-build') {
                      setPreviewKind('document');
                    }
                  }}
                  aria-label="Inspect typed project artifact"
                  className="px-2 py-1 text-[11px] font-mono bg-[#090D14] border border-slate-700 rounded text-slate-200 max-w-[260px]"
                >
                  {projectArtifacts.map((art) => (
                    <option key={art.id} value={art.id}>
                      [{art.outputClass}] {art.artifactName} · {art.artifactState}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <button
              type="button"
              onClick={() =>
                setPreviewError((prev) =>
                  prev
                    ? null
                    : 'Simulated preview error: artifact bundle stream unavailable in local sandbox.'
                )
              }
              className="text-[10px] font-mono text-slate-500 hover:text-slate-300 whitespace-nowrap shrink-0"
            >
              {previewError ? 'Clear Error State' : 'Test Error State'}
            </button>
          </div>
        </div>

        {/* Named Checkpoints Drawer */}
        {checkpointOpen && (
          <div className="p-3 bg-[#090D14] border border-slate-800 rounded-md space-y-2.5 text-xs">
            <form onSubmit={handleSaveCheckpoint} className="flex items-center gap-2">
              <input
                type="text"
                value={checkpointName}
                onChange={(e) => setCheckpointName(e.target.value)}
                placeholder="Checkpoint name (e.g. Before compact layout)"
                aria-label="New checkpoint name"
                className="flex-1 px-2.5 py-1.5 text-xs bg-[#111827] border border-slate-700 rounded text-slate-100 placeholder-slate-500 focus:outline-none focus:border-blue-500"
              />
              <button
                type="submit"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-blue-600 hover:bg-blue-500 text-white rounded whitespace-nowrap"
              >
                <BookmarkPlus className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Save Checkpoint</span>
              </button>
            </form>

            {checkpoints.length === 0 ? (
              <p className="text-[11px] text-slate-500">
                No named checkpoints saved for this project yet.
              </p>
            ) : (
              <ul className="space-y-1 max-h-28 overflow-y-auto">
                {checkpoints.map((cp) => (
                  <li
                    key={cp.id}
                    className="flex items-center justify-between gap-2 px-2.5 py-1.5 bg-[#111827] border border-slate-800 rounded"
                  >
                    <div className="min-w-0">
                      <div className="text-slate-200 font-medium truncate">{cp.name}</div>
                      <div className="text-[10px] font-mono text-slate-500">
                        {new Date(cp.createdAt).toLocaleTimeString([], {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}{' '}
                        · {cp.preview.primaryActionLabel}
                        {cp.stateSha256 ? ` · sha:${cp.stateSha256.slice(0, 12)}` : ''}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => onRestoreCheckpoint(cp.id)}
                      className="px-2 py-1 text-[11px] font-medium text-blue-300 hover:text-white border border-blue-500/35 hover:bg-blue-950/40 rounded shrink-0"
                    >
                      Restore
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>

      {/* Preview Canvas */}
      <div className="flex-1 overflow-y-auto p-4 lg:p-5 bg-[#090D14] flex flex-col items-center">
        <div className={`w-full transition-all ${viewportWidthClass}`}>
          {previewLoading ? (
            <div className="p-10 bg-[#111827] border border-slate-800 rounded-lg flex flex-col items-center justify-center gap-2 text-xs text-slate-300">
              <Loader2 className="w-5 h-5 text-blue-400 animate-spin" aria-hidden="true" />
              <span>Refreshing sandboxed preview ({artifactPreview.originLabel})...</span>
            </div>
          ) : previewError ? (
            <div className="p-6 bg-[#111827] border border-rose-500/40 rounded-lg space-y-3 text-xs">
              <div className="flex items-start gap-2 text-rose-200">
                <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" aria-hidden="true" />
                <div>
                  <div className="font-medium text-rose-100">Preview Render Unavailable</div>
                  <p className="text-rose-300/90 mt-1">{previewError}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={triggerSimulatedRefresh}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-slate-800 hover:bg-slate-700 text-white rounded"
              >
                <RefreshCw className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Reload Sandboxed Preview</span>
              </button>
            </div>
          ) : previewKind === 'ui-build' ? (
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
                  <p className="mt-2 text-[11px] text-slate-500">{preview.draftBannerNote}</p>
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
                  <div className="p-3 bg-[#090D14] border border-slate-800 rounded text-xs space-y-1.5">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-mono text-[11px] text-sky-300">
                        Input Mode: {project.inputMode ?? 'NATIVE_PRISM'}
                      </span>
                      {project.guidedProductDraft && (
                        <span className="font-mono text-[11px] text-amber-300">
                          Human Spec Review: {project.guidedProductDraft.humanReviewStatus}
                        </span>
                      )}
                    </div>
                    <div className="text-slate-400">Purpose: {project.purpose}</div>
                    <div className="font-mono text-[11px] text-slate-500">
                      Inputs: {project.declaredInputs}
                    </div>
                    {project.uorustRefusals && project.uorustRefusals.length > 0 && (
                      <div className="p-2 bg-rose-950/25 border border-rose-500/35 rounded text-[11px] text-rose-200 font-mono">
                        {project.uorustRefusals[0].code}: {project.uorustRefusals[0].message}
                      </div>
                    )}
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
                        <div className="font-mono text-slate-200 mt-0.5 truncate">{cw.value}</div>
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
                <div className="flex items-center justify-between gap-2 mb-1">
                  <span className="text-[11px] text-slate-500">Sandboxed Output</span>
                  {copiedOutput && (
                    <span className="text-[10px] font-mono text-emerald-300">Copied</span>
                  )}
                </div>
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
                  <div className="flex items-center gap-3">
                    {onOpenSourceAuthoring && (
                      <button
                        type="button"
                        onClick={(e) => {
                          if (inspectMode) return;
                          e.stopPropagation();
                          onOpenSourceAuthoring();
                        }}
                        className="text-sky-300 hover:underline"
                      >
                        Edit Source &rarr;
                      </button>
                    )}
                    {onOpenSourceCompliance && (
                      <button
                        type="button"
                        onClick={(e) => {
                          if (inspectMode) return;
                          e.stopPropagation();
                          onOpenSourceCompliance();
                        }}
                        className="text-sky-300 hover:underline"
                      >
                        Source Compliance &rarr;
                      </button>
                    )}
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
                    viewBox={`0 0 ${Math.max(680, 24 + artifactPreview.diagramNodes.length * 84)} 120`}
                    className="w-full min-w-[680px] h-28"
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
