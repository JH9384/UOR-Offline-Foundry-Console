import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  Download,
  FileCode2,
  FilePlus2,
  GitCompare,
  History,
  Lock,
  Save,
  Search,
  ShieldAlert,
  Sparkles,
  Upload,
  X,
} from 'lucide-react';
import {
  buildCalculatorRuntimeHandoffPreview,
  buildSourcePackageManifest,
  CalculatorRuntimeHandoffPreview,
  computeSideBySideDiff,
  detectRestrictedSecretsInText,
  ensureProjectAuthoringWorkspace,
  parseAndVerifySourcePackage,
  runPreliminaryBrowserDiagnostics,
  SOURCE_PACKAGE_SCHEMA,
  SourcePackageRuntimeHandoffValidationResult,
  tokenizeSourceLine,
  validateDraftFilePath,
  validateSourcePackageForRuntimeHandoff,
} from '../../services/sourceAuthoringService';
import {
  CalculatorIntakeHandoffResult,
  executeCalculatorIntakeHandoffFlow,
  FailClosedLocalWindmillService,
} from '../../adapters/windmillExecutionService';
import {
  INITIAL_APPROVALS,
  INITIAL_ARTIFACTS,
  INITIAL_VERIFICATION_SUITES,
} from '../../data/seedFoundryData';
import {
  AuthoringSourceFile,
  FoundrySourcePackageManifest,
  ProjectAuthoringWorkspace,
  ProjectRecord,
  SourcePackageDestination,
} from '../../types/foundry';
import { StatusTag } from '../StatusTag';

interface SourceAuthoringPanelProps {
  project: ProjectRecord;
  onSaveSourceFile: (params: {
    projectId: string;
    filePath: string;
    newContent: string;
    revisionNote?: string;
  }) => void;
  onAddSourceFile: (params: {
    projectId: string;
    filePath: string;
    content: string;
  }) => { ok: boolean; error?: string };
  onCreateSourceCheckpoint: (projectId: string, name: string) => Promise<void>;
  onRestoreSourceCheckpoint: (projectId: string, checkpointId: string) => void;
  onRequestAiSourceProposal: (params: {
    projectId: string;
    filePath: string;
    instruction: string;
  }) => void;
  onDecideAiSourceProposal: (params: {
    projectId: string;
    proposalId: string;
    decision: 'APPROVED' | 'REJECTED';
  }) => void;
  onExportSourcePackage: (params: {
    projectId: string;
    reviewConfirmed: boolean;
    reviewSummary: string;
    targetDestination: SourcePackageDestination;
  }) => Promise<{ ok: boolean; filename?: string; manifest?: FoundrySourcePackageManifest; error?: string }>;
  onImportVerifiedSourcePackage: (params: {
    projectId: string;
    manifest: FoundrySourcePackageManifest;
    workspace: ProjectAuthoringWorkspace;
  }) => void;
}

type EditorTab = 'edit' | 'diff' | 'history' | 'ai';

const TONE_CLASS: Record<string, string> = {
  plain: 'text-slate-200',
  keyword: 'text-sky-300 font-semibold',
  directive: 'text-indigo-300',
  section: 'text-amber-300',
  string: 'text-emerald-300',
  comment: 'text-slate-500 italic',
  number: 'text-cyan-300',
  key: 'text-blue-300',
};

export const SourceAuthoringPanel: React.FC<SourceAuthoringPanelProps> = ({
  project,
  onSaveSourceFile,
  onAddSourceFile,
  onCreateSourceCheckpoint,
  onRestoreSourceCheckpoint,
  onRequestAiSourceProposal,
  onDecideAiSourceProposal,
  onExportSourcePackage,
  onImportVerifiedSourcePackage,
}) => {
  const workspace = useMemo(() => ensureProjectAuthoringWorkspace(project), [project]);
  const [selectedPath, setSelectedPath] = useState<string>(workspace.files[0]?.path ?? '');
  const [searchQuery, setSearchQuery] = useState('');
  const [editorTab, setEditorTab] = useState<EditorTab>('edit');
  const [draftBuffer, setDraftBuffer] = useState<string>(workspace.files[0]?.content ?? '');
  const [revisionNote, setRevisionNote] = useState('');
  const [showNewFileForm, setShowNewFileForm] = useState(false);
  const [newFilePath, setNewFilePath] = useState('');
  const [fileError, setFileError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);

  // Checkpoints & Diff selection
  const [checkpointName, setCheckpointName] = useState('');
  const [diffBaselineId, setDiffBaselineId] = useState<string>('saved');

  // Simulated AI draft prompt
  const [aiInstruction, setAiInstruction] = useState('');

  // Handoff review & export state
  const [targetDestination, setTargetDestination] = useState<SourcePackageDestination>(
    'MAC_STUDIO_UOR_OFFLINE_FOUNDRY'
  );
  const [reviewConfirmed, setReviewConfirmed] = useState(false);
  const [reviewSummary, setReviewSummary] = useState('');
  const [exportStatus, setExportStatus] = useState<{
    ok: boolean;
    message: string;
    manifest?: FoundrySourcePackageManifest;
  } | null>(null);

  // Round-trip verification tester
  const [roundTripJson, setRoundTripJson] = useState('');
  const [roundTripResult, setRoundTripResult] = useState<{
    ok: boolean;
    message: string;
    manifest?: FoundrySourcePackageManifest;
    workspace?: ProjectAuthoringWorkspace;
  } | null>(null);

  // Phase B & C: Source-Package to Runtime Handoff Preview & Read-Only Intake Validation
  const [handoffPreview, setHandoffPreview] = useState<{
    manifest: FoundrySourcePackageManifest;
    preview: CalculatorRuntimeHandoffPreview;
    validation: SourcePackageRuntimeHandoffValidationResult;
  } | null>(null);
  const [handoffOperatorConfirmed, setHandoffOperatorConfirmed] = useState(false);
  const [handoffFlowResult, setHandoffFlowResult] =
    useState<CalculatorIntakeHandoffResult | null>(null);

  const selectedFile: AuthoringSourceFile | undefined =
    workspace.files.find((f) => f.path === selectedPath) ?? workspace.files[0];

  useEffect(() => {
    if (!workspace.files.some((f) => f.path === selectedPath)) {
      const fallback = workspace.files[0];
      setSelectedPath(fallback?.path ?? '');
      setDraftBuffer(fallback?.content ?? '');
    }
  }, [project.id, workspace.files, selectedPath]);

  const handleSelectFile = (file: AuthoringSourceFile) => {
    setSelectedPath(file.path);
    setDraftBuffer(file.content);
    setFileError(null);
  };

  // Sync draftBuffer when external save/restore updates selected file content
  useEffect(() => {
    if (selectedFile) {
      setDraftBuffer(selectedFile.content);
    }
  }, [selectedFile?.path, selectedFile?.content]);

  const isDirty = Boolean(selectedFile && draftBuffer !== selectedFile.content);

  const filteredFiles = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return workspace.files;
    return workspace.files.filter(
      (f) => f.path.toLowerCase().includes(q) || f.content.toLowerCase().includes(q)
    );
  }, [workspace.files, searchQuery]);

  // Preliminary browser-only diagnostics run against live draft state
  const diagnostics = useMemo(() => {
    const filesForCheck = workspace.files.map((f) =>
      selectedFile && f.path === selectedFile.path ? { ...f, content: draftBuffer } : f
    );
    return runPreliminaryBrowserDiagnostics(filesForCheck, project.inputMode ?? 'NATIVE_PRISM');
  }, [workspace.files, selectedFile, draftBuffer, project.inputMode]);

  const secretHitsInWorkspace = useMemo(
    () =>
      workspace.files.flatMap((f) => {
        const text = selectedFile?.path === f.path ? draftBuffer : f.content;
        return detectRestrictedSecretsInText(text).map((msg) => `${f.path}: ${msg}`);
      }),
    [workspace.files, selectedFile, draftBuffer]
  );

  const pendingProposals = workspace.pendingAiProposals.filter(
    (p) => p.status === 'PENDING_REVIEW'
  );

  const handleSaveActiveFile = () => {
    if (!selectedFile) return;
    onSaveSourceFile({
      projectId: project.id,
      filePath: selectedFile.path,
      newContent: draftBuffer,
      revisionNote: revisionNote.trim() || undefined,
    });
    setRevisionNote('');
    setReviewConfirmed(false);
  };

  const handleCreateNewFile = (e: React.FormEvent) => {
    e.preventDefault();
    const check = validateDraftFilePath(newFilePath);
    if (!check.ok) {
      setFileError(check.error);
      return;
    }
    if (workspace.files.some((f) => f.path === check.cleanPath)) {
      setFileError(`File "${check.cleanPath}" already exists in draft workspace.`);
      return;
    }
    const templateContent = check.cleanPath.endsWith('.lex.tex')
      ? `\\begin{lexlean}\n\\begin{semanticmodule}{"spec":"lexlean/semantic-module/1","name":"DraftModule"}\n\\purpose{Draft module}\n\\end{semanticmodule}\n\\end{lexlean}\n`
      : check.cleanPath.endsWith('.json')
        ? JSON.stringify({ draft: true }, null, 2)
        : `# Draft configuration file (${check.cleanPath})\n`;

    const res = onAddSourceFile({
      projectId: project.id,
      filePath: check.cleanPath,
      content: templateContent,
    });
    if (!res.ok) {
      setFileError(res.error ?? 'Failed to add file.');
      return;
    }
    setSelectedPath(check.cleanPath);
    setDraftBuffer(templateContent);
    setNewFilePath('');
    setShowNewFileForm(false);
    setFileError(null);
    setReviewConfirmed(false);
  };

  const handleIngestDroppedFile = async (file: File) => {
    const cleanName = file.name.trim();
    const targetPath =
      cleanName.includes('/') || cleanName.endsWith('.toml') || cleanName.endsWith('.lock')
        ? cleanName
        : `inputs/${cleanName}`;
    const pathCheck = validateDraftFilePath(targetPath);
    if (!pathCheck.ok) {
      setFileError(pathCheck.error);
      return;
    }
    const text =
      typeof file.text === 'function' ? await file.text() : await new Response(file).text();
    const res = onAddSourceFile({
      projectId: project.id,
      filePath: pathCheck.cleanPath,
      content: text,
    });
    if (!res.ok) {
      setFileError(res.error ?? 'Failed to attach dropped file.');
      return;
    }
    setSelectedPath(pathCheck.cleanPath);
    setDraftBuffer(text);
    setFileError(null);
    setReviewConfirmed(false);
  };

  const handleDropZone = async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      await handleIngestDroppedFile(file);
    }
  };

  const handleFileInputChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      await handleIngestDroppedFile(file);
    }
    e.target.value = '';
  };

  const diffTargetText = useMemo(() => {
    if (!selectedFile) return '';
    if (diffBaselineId === 'saved') return selectedFile.content;
    const cp = workspace.checkpoints.find((c) => c.id === diffBaselineId);
    if (cp) {
      return cp.filesSnapshot.find((f) => f.path === selectedFile.path)?.content ?? '';
    }
    return selectedFile.content;
  }, [diffBaselineId, selectedFile, workspace.checkpoints]);

  const diffRows = useMemo(
    () => computeSideBySideDiff(diffTargetText, draftBuffer),
    [diffTargetText, draftBuffer]
  );

  const handleRequestProposal = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFile || !aiInstruction.trim()) return;
    onRequestAiSourceProposal({
      projectId: project.id,
      filePath: selectedFile.path,
      instruction: aiInstruction.trim(),
    });
    setAiInstruction('');
    setEditorTab('ai');
  };

  const handleExportPackageClick = async () => {
    const result = await onExportSourcePackage({
      projectId: project.id,
      reviewConfirmed,
      reviewSummary: reviewSummary.trim(),
      targetDestination,
    });
    if (!result.ok) {
      setExportStatus({
        ok: false,
        message: result.error ?? 'Source package export refused.',
      });
      return;
    }
    setExportStatus({
      ok: true,
      message: `Exported reviewed source package "${result.filename}" (sha256:${result.manifest?.packageDigestSha256.slice(0, 14)}...).`,
      manifest: result.manifest,
    });
    if (result.manifest) {
      setRoundTripJson(JSON.stringify(result.manifest, null, 2));
    }
  };

  const handleVerifyRoundTrip = async (raw: string) => {
    const parsed = await parseAndVerifySourcePackage(raw);
    if (!parsed.ok) {
      setRoundTripResult({
        ok: false,
        message: `[${parsed.errorCode}] ${parsed.error}`,
      });
      return;
    }
    setRoundTripResult({
      ok: true,
      message: `Verified round-trip readback: ${parsed.verifiedFileCount} file(s), sha256:${parsed.manifest.packageDigestSha256.slice(0, 14)}..., target=${parsed.manifest.targetDestination}.`,
      manifest: parsed.manifest,
      workspace: parsed.authoringWorkspace,
    });
  };

  const handleGenerateHandoffPreview = async () => {
    try {
      const manifest = await buildSourcePackageManifest({
        project,
        workspace,
        reviewConfirmed: true,
        reviewSummary:
          reviewSummary.trim() ||
          `Reviewed ${workspace.files.length} source files for ${targetDestination}`,
        targetDestination,
      });
      const validation = await validateSourcePackageForRuntimeHandoff({
        rawOrManifest: manifest,
        expectedProject: project,
        expectedWorkspace: 'uor-offline-foundry',
      });
      const preview = buildCalculatorRuntimeHandoffPreview({
        project,
        manifest,
      });
      setHandoffPreview({
        manifest,
        preview,
        validation,
      });
      setHandoffOperatorConfirmed(false);
      setHandoffFlowResult(null);
    } catch (err) {
      setExportStatus({
        ok: false,
        message: err instanceof Error ? err.message : 'Unable to build source package for handoff preview.',
      });
    }
  };

  const handleExecuteReadOnlyIntakeFlow = async () => {
    if (!handoffPreview) return;
    const localService = new FailClosedLocalWindmillService('VITE_AUTHENTICATED_LOCAL_PROXY');
    const result = await executeCalculatorIntakeHandoffFlow({
      project,
      rawOrManifest: handoffPreview.manifest,
      operatorConfirmed: handoffOperatorConfirmed,
      windmillService: localService,
      artifacts: INITIAL_ARTIFACTS.filter((a) => a.projectId === project.id),
      verifications: INITIAL_VERIFICATION_SUITES.filter((v) => v.projectId === project.id),
      approvals: INITIAL_APPROVALS.filter((a) => a.projectId === project.id),
    });
    setHandoffFlowResult(result);
  };

  return (
    <div className="space-y-5" data-testid="source-authoring-panel">
      {/* Header Banner */}
      <section className="bg-[#111827] border border-slate-800/90 rounded-lg p-5 space-y-3">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <FileCode2 className="w-4 h-4 text-sky-400" aria-hidden="true" />
              <h2 className="font-display font-semibold text-sm text-slate-100">
                Prism Source Authoring &amp; Handoff Studio
              </h2>
              <span className="px-2 py-0.5 text-[10px] font-mono rounded border border-amber-500/40 bg-amber-950/30 text-amber-200">
                PRELIMINARY BROWSER-ONLY · NOT LexLean/PrismPM COMPILER
              </span>
              <StatusTag value={workspace.reviewStatus === 'OPERATOR_REVIEWED_FOR_HANDOFF' ? 'Validated' : 'Pending'} />
            </div>
            <p className="text-xs text-slate-400 mt-1 leading-relaxed">
              Edit draft <span className="font-mono">.lex.tex</span>, <span className="font-mono">prismpm.toml</span>, <span className="font-mono">lexlean.toml</span>, lockfiles, facets, views, and acceptance vectors. Modifying authoritative inputs invalidates prior verification per <span className="font-mono">INV-003</span>.
            </p>
          </div>
          <div className="text-[11px] font-mono text-slate-400">
            Journey: <span className="text-slate-200">{workspace.journeyType}</span> · Rev:{' '}
            <span className="text-sky-300">{project.sourceRevision}</span>
          </div>
        </div>
      </section>

      {/* Main Editor Split Layout */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-4">
        {/* Left Pane: File Navigator & Dropzone */}
        <aside className="xl:col-span-4 bg-[#111827] border border-slate-800/90 rounded-lg p-4 space-y-3 flex flex-col">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-xs font-semibold text-slate-100">
              Source Files ({workspace.files.length})
            </h3>
            <button
              type="button"
              onClick={() => {
                setShowNewFileForm((p) => !p);
                setFileError(null);
              }}
              className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-medium text-sky-300 border border-sky-500/35 hover:bg-sky-950/30 rounded"
            >
              <FilePlus2 className="w-3 h-3" aria-hidden="true" />
              <span>New File</span>
            </button>
          </div>

          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-1/2 -translate-y-1/2" aria-hidden="true" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search files & source text..."
              aria-label="Search source files"
              className="w-full pl-8 pr-2.5 py-1.5 text-xs bg-[#0B0F17] border border-slate-700 rounded text-slate-100 placeholder-slate-500 focus:outline-none focus:border-blue-500"
            />
          </div>

          {showNewFileForm && (
            <form onSubmit={handleCreateNewFile} className="p-2.5 bg-[#0B0F17] border border-slate-700 rounded space-y-2">
              <input
                type="text"
                value={newFilePath}
                onChange={(e) => setNewFilePath(e.target.value)}
                placeholder="e.g. src/Helper.lex.tex or routes.toml"
                aria-label="New draft file path"
                className="w-full px-2.5 py-1 text-xs font-mono bg-[#111827] border border-slate-700 rounded text-slate-100"
              />
              <div className="flex justify-end gap-1.5">
                <button
                  type="button"
                  onClick={() => setShowNewFileForm(false)}
                  className="px-2 py-1 text-[11px] text-slate-400 hover:text-slate-200"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-2.5 py-1 text-[11px] font-medium text-white bg-blue-600 hover:bg-blue-500 rounded"
                >
                  Create Draft
                </button>
              </div>
            </form>
          )}

          {fileError && (
            <div className="p-2.5 bg-rose-950/35 border border-rose-500/40 rounded text-[11px] text-rose-200">
              {fileError}
            </div>
          )}

          <div className="divide-y divide-slate-800/70 border border-slate-800 rounded bg-[#0B0F17] max-h-80 overflow-y-auto">
            {filteredFiles.length === 0 ? (
              <div className="p-4 text-xs text-slate-500 text-center">
                No source files match "{searchQuery}".
              </div>
            ) : (
              filteredFiles.map((file) => {
                const active = selectedFile?.path === file.path;
                const fileDiags = diagnostics.filter((d) => d.filePath === file.path);
                return (
                  <button
                    key={file.path}
                    type="button"
                    onClick={() => handleSelectFile(file)}
                    className={`w-full text-left px-3 py-2.5 transition-colors flex items-center justify-between gap-2 ${
                      active ? 'bg-slate-800/80 text-white' : 'hover:bg-slate-900/70 text-slate-300'
                    }`}
                  >
                    <div className="min-w-0">
                      <div className="font-mono text-xs truncate">
                        {file.path}
                        {active && isDirty ? ' *' : ''}
                      </div>
                      <div className="text-[10px] text-slate-500 flex items-center gap-2 mt-0.5">
                        <span>{file.isAuthoritativeInput ? 'Authoritative Input' : 'Draft / Meta'}</span>
                        {fileDiags.length > 0 && (
                          <span className="text-amber-300 font-mono">
                            {fileDiags.length} prelim note(s)
                          </span>
                        )}
                      </div>
                    </div>
                    <span className="text-[10px] font-mono text-slate-500 shrink-0 uppercase">
                      {file.language}
                    </span>
                  </button>
                );
              })
            )}
          </div>

          {/* Drag-and-Drop Draft Input Attachment */}
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDropZone}
            className={`p-3 border border-dashed rounded-md text-center space-y-1.5 transition-colors ${
              dragOver
                ? 'border-blue-400 bg-blue-950/25'
                : 'border-slate-700 bg-[#0B0F17]'
            }`}
          >
            <Upload className="w-4 h-4 text-slate-400 mx-auto" aria-hidden="true" />
            <div className="text-[11px] text-slate-300">
              Drag &amp; drop draft source/config/lock files here
            </div>
            <label className="inline-block text-[11px] text-sky-400 hover:text-sky-300 cursor-pointer underline">
              <span>or select local file (.lex.tex, .toml, .json, .lock, .rs)</span>
              <input
                type="file"
                accept=".tex,.toml,.json,.lock,.rs,.txt"
                onChange={handleFileInputChange}
                className="sr-only"
                aria-label="Attach draft source file"
              />
            </label>
          </div>
        </aside>

        {/* Right Pane: Editor / Diff / Checkpoints / AI Proposals */}
        <section className="xl:col-span-8 bg-[#111827] border border-slate-800/90 rounded-lg p-4 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-800">
            <div className="flex items-center gap-1 p-1 bg-[#090D14] border border-slate-800 rounded">
              <button
                type="button"
                onClick={() => setEditorTab('edit')}
                className={`px-2.5 py-1 text-xs font-medium rounded ${
                  editorTab === 'edit' ? 'bg-slate-800 text-white' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Edit &amp; Highlight
              </button>
              <button
                type="button"
                onClick={() => setEditorTab('diff')}
                className={`inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded ${
                  editorTab === 'diff' ? 'bg-slate-800 text-white' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <GitCompare className="w-3 h-3" aria-hidden="true" />
                <span>Side-by-Side Diff</span>
              </button>
              <button
                type="button"
                onClick={() => setEditorTab('history')}
                className={`inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded ${
                  editorTab === 'history' ? 'bg-slate-800 text-white' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <History className="w-3 h-3" aria-hidden="true" />
                <span>Checkpoints &amp; History ({workspace.checkpoints.length})</span>
              </button>
              <button
                type="button"
                onClick={() => setEditorTab('ai')}
                className={`inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded ${
                  editorTab === 'ai' ? 'bg-slate-800 text-white' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <Sparkles className="w-3 h-3" aria-hidden="true" />
                <span>AI Proposals ({pendingProposals.length})</span>
              </button>
            </div>

            {selectedFile && (
              <div className="flex items-center gap-2 text-xs font-mono">
                <span className="text-slate-300">{selectedFile.path}</span>
                {isDirty && (
                  <span className="px-1.5 py-0.5 text-[10px] rounded bg-amber-950/40 border border-amber-500/40 text-amber-200">
                    UNSAVED DRAFT
                  </span>
                )}
              </div>
            )}
          </div>

          {editorTab === 'edit' && selectedFile && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                {/* Editable Draft Input */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-[11px] text-slate-400">
                    <span>Authoring Draft Editor (Ctrl/Cmd+S to save)</span>
                    <span className="font-mono">{draftBuffer.split('\n').length} lines</span>
                  </div>
                  <textarea
                    value={draftBuffer}
                    onChange={(e) => setDraftBuffer(e.target.value)}
                    onKeyDown={(e) => {
                      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
                        e.preventDefault();
                        handleSaveActiveFile();
                      }
                    }}
                    rows={14}
                    aria-label={`Edit source file ${selectedFile.path}`}
                    data-testid="source-editor-textarea"
                    className="w-full p-3 text-xs font-mono bg-[#090D14] border border-slate-700 rounded text-slate-100 leading-relaxed focus:outline-none focus:border-blue-500"
                  />
                </div>

                {/* Tokenized Syntax-Highlighted Inspector */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-[11px] text-slate-400">
                    <span>Syntax-Highlighted View ({selectedFile.language})</span>
                    <span className="font-mono">
                      {selectedFile.isAuthoritativeInput ? 'Triggers INV-003 on save' : 'Non-authoritative'}
                    </span>
                  </div>
                  <div className="h-[296px] overflow-auto p-3 bg-[#090D14] border border-slate-800 rounded font-mono text-[11px] leading-relaxed">
                    {draftBuffer.split('\n').map((line, idx) => (
                      <div key={idx} className="flex gap-3">
                        <span className="w-7 text-right text-slate-600 select-none shrink-0 tabular-nums">
                          {idx + 1}
                        </span>
                        <span className="whitespace-pre-wrap break-all">
                          {tokenizeSourceLine(line, selectedFile.language).map((tok, tIdx) => (
                            <span key={tIdx} className={TONE_CLASS[tok.tone] ?? 'text-slate-200'}>
                              {tok.text}
                            </span>
                          ))}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Save + Simulated AI Proposal Request */}
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pt-2 border-t border-slate-800">
                <div className="flex flex-wrap items-center gap-2 flex-1">
                  <input
                    type="text"
                    value={revisionNote}
                    onChange={(e) => setRevisionNote(e.target.value)}
                    placeholder="Optional revision note..."
                    className="px-2.5 py-1.5 text-xs bg-[#0B0F17] border border-slate-700 rounded text-slate-100 placeholder-slate-500 min-w-[200px]"
                  />
                  <button
                    type="button"
                    onClick={handleSaveActiveFile}
                    disabled={!isDirty}
                    data-testid="save-source-file-btn"
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-blue-600 hover:bg-blue-500 disabled:bg-slate-800 disabled:text-slate-500 rounded transition-colors"
                  >
                    <Save className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>Save &amp; Bump Revision</span>
                  </button>
                </div>

                <form onSubmit={handleRequestProposal} className="flex items-center gap-2">
                  <input
                    type="text"
                    value={aiInstruction}
                    onChange={(e) => setAiInstruction(e.target.value)}
                    placeholder="Propose AI draft edit (requires review)..."
                    aria-label="Propose AI draft edit instruction"
                    className="px-2.5 py-1.5 text-xs bg-[#0B0F17] border border-slate-700 rounded text-slate-100 placeholder-slate-500 min-w-[220px]"
                  />
                  <button
                    type="submit"
                    disabled={!aiInstruction.trim()}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-indigo-200 border border-indigo-500/40 bg-indigo-950/30 hover:bg-indigo-950/50 disabled:opacity-40 rounded"
                  >
                    <Sparkles className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>Propose AI Draft</span>
                  </button>
                </form>
              </div>

              {/* Preliminary Browser-Only Diagnostics */}
              <div
                className="p-3.5 bg-[#0B0F17] border border-slate-800 rounded-md space-y-2"
                data-testid="preliminary-diagnostics-panel"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-xs font-medium text-slate-200">
                    Preliminary Browser-Only Diagnostics ({diagnostics.length})
                  </span>
                  <span className="text-[10px] font-mono text-amber-300">
                    Preliminary check only — NOT LexLean parser / NOT PrismPM compiler
                  </span>
                </div>
                {diagnostics.length === 0 ? (
                  <p className="text-[11px] text-emerald-300">
                    Zero preliminary structural issues found in browser draft. Real compilation &amp; proof replay require Mac Studio.
                  </p>
                ) : (
                  <ul className="space-y-1.5">
                    {diagnostics.map((d) => (
                      <li
                        key={d.id}
                        className={`p-2 rounded border text-[11px] flex items-start gap-2 ${
                          d.severity === 'error'
                            ? 'bg-rose-950/25 border-rose-500/35 text-rose-200'
                            : 'bg-amber-950/25 border-amber-500/35 text-amber-200'
                        }`}
                      >
                        <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" aria-hidden="true" />
                        <span>
                          <span className="font-mono font-semibold">[{d.code}]</span> {d.filePath}:{d.line} — {d.message}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          )}

          {editorTab === 'diff' && selectedFile && (
            <div className="space-y-3" data-testid="source-side-by-side-diff">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="text-xs text-slate-300">
                  Comparing baseline vs current editor buffer for <span className="font-mono">{selectedFile.path}</span>
                </div>
                <select
                  value={diffBaselineId}
                  onChange={(e) => setDiffBaselineId(e.target.value)}
                  aria-label="Select diff comparison baseline"
                  className="px-2.5 py-1 text-xs bg-[#0B0F17] border border-slate-700 rounded text-slate-200"
                >
                  <option value="saved">Last Saved Revision</option>
                  {workspace.checkpoints.map((cp) => (
                    <option key={cp.id} value={cp.id}>
                      Checkpoint: {cp.name} ({cp.sourceRevision})
                    </option>
                  ))}
                </select>
              </div>
              <div className="border border-slate-800 rounded bg-[#090D14] overflow-x-auto max-h-96 overflow-y-auto font-mono text-[11px]">
                {diffRows.map((row, idx) => (
                  <div
                    key={idx}
                    className={`grid grid-cols-2 border-b border-slate-800/60 ${
                      row.kind === 'equal'
                        ? ''
                        : row.kind === 'add'
                          ? 'bg-emerald-950/20'
                          : row.kind === 'remove'
                            ? 'bg-rose-950/20'
                            : 'bg-amber-950/20'
                    }`}
                  >
                    <div className="px-2.5 py-1 border-r border-slate-800/80 text-slate-400 whitespace-pre-wrap break-all">
                      <span className="inline-block w-7 text-slate-600 select-none">
                        {row.lineBefore ?? '-'}
                      </span>
                      {row.textBefore}
                    </div>
                    <div className="px-2.5 py-1 text-slate-200 whitespace-pre-wrap break-all">
                      <span className="inline-block w-7 text-slate-600 select-none">
                        {row.lineAfter ?? '+'}
                      </span>
                      {row.textAfter}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {editorTab === 'history' && (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-2">
                <input
                  type="text"
                  value={checkpointName}
                  onChange={(e) => setCheckpointName(e.target.value)}
                  placeholder="Checkpoint label (e.g. Before LexLean edit)"
                  className="flex-1 min-w-[200px] px-2.5 py-1.5 text-xs bg-[#0B0F17] border border-slate-700 rounded text-slate-100 placeholder-slate-500"
                />
                <button
                  type="button"
                  onClick={async () => {
                    await onCreateSourceCheckpoint(
                      project.id,
                      checkpointName.trim() || `Checkpoint ${workspace.checkpoints.length + 1}`
                    );
                    setCheckpointName('');
                  }}
                  className="px-3 py-1.5 text-xs font-medium text-white bg-blue-600 hover:bg-blue-500 rounded"
                >
                  Save Source Checkpoint
                </button>
              </div>

              <div className="space-y-2">
                <h4 className="text-xs font-semibold text-slate-200">Saved Checkpoints</h4>
                {workspace.checkpoints.length === 0 ? (
                  <p className="text-xs text-slate-500">No source checkpoints saved yet.</p>
                ) : (
                  <div className="space-y-2">
                    {workspace.checkpoints.map((cp) => (
                      <div
                        key={cp.id}
                        className="p-2.5 bg-[#0B0F17] border border-slate-800 rounded flex items-center justify-between gap-2 text-xs"
                      >
                        <div className="min-w-0">
                          <div className="font-medium text-slate-100">{cp.name}</div>
                          <div className="font-mono text-[10px] text-slate-400">
                            {cp.sourceRevision} · sha:{cp.stateSha256.slice(0, 12)} · {cp.filesSnapshot.length} files
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => onRestoreSourceCheckpoint(project.id, cp.id)}
                          className="px-2.5 py-1 text-[11px] font-medium text-sky-300 border border-sky-500/35 hover:bg-sky-950/30 rounded shrink-0"
                        >
                          Restore Checkpoint
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <h4 className="text-xs font-semibold text-slate-200">
                  Source Revision &amp; Authoring History
                </h4>
                <div className="space-y-1.5 max-h-52 overflow-y-auto">
                  {workspace.revisionHistory.map((rev) => (
                    <div
                      key={rev.revisionId}
                      className="p-2.5 bg-[#0B0F17] border border-slate-800 rounded text-[11px] space-y-1"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-mono text-slate-200">{rev.sourceRevision}</span>
                        {rev.invalidatedVerification && (
                          <span className="px-1.5 py-0.5 text-[10px] font-mono rounded bg-amber-950/40 border border-amber-500/40 text-amber-200">
                            INV-003 STALE TRIGGERED
                          </span>
                        )}
                      </div>
                      <div className="text-slate-300">{rev.summary}</div>
                      <div className="text-[10px] font-mono text-slate-500">
                        {rev.author} · {rev.changedFiles.join(', ')}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {editorTab === 'ai' && (
            <div className="space-y-3" data-testid="ai-source-proposals-panel">
              <div className="p-2.5 bg-amber-950/20 border border-amber-500/35 rounded text-[11px] text-amber-200">
                AI-generated source drafts never auto-apply. Review side-by-side diffs and explicitly approve or reject each change.
              </div>
              {workspace.pendingAiProposals.length === 0 ? (
                <p className="text-xs text-slate-500 py-4 text-center">
                  No AI source draft proposals queued. Use "Propose AI Draft" in the Edit tab to draft a reviewable source edit.
                </p>
              ) : (
                workspace.pendingAiProposals.map((prop) => {
                  const baseFile = workspace.files.find((f) => f.path === prop.targetFilePath);
                  const propDiff = computeSideBySideDiff(
                    baseFile?.content ?? '',
                    prop.proposedContent
                  );
                  return (
                    <div
                      key={prop.id}
                      className="p-3 bg-[#0B0F17] border border-slate-800 rounded space-y-2.5"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <div className="text-xs font-medium text-slate-100">{prop.summary}</div>
                          <div className="text-[11px] text-slate-400">{prop.rationale}</div>
                        </div>
                        <StatusTag
                          value={
                            prop.status === 'APPROVED'
                              ? 'Validated'
                              : prop.status === 'REJECTED'
                                ? 'BLOCKED'
                                : 'Pending'
                          }
                        />
                      </div>

                      <div className="border border-slate-800 rounded bg-[#090D14] max-h-48 overflow-y-auto font-mono text-[11px]">
                        {propDiff
                          .filter((r) => r.kind !== 'equal')
                          .map((r, idx) => (
                            <div key={idx} className="grid grid-cols-2 border-b border-slate-800/60">
                              <div className="px-2 py-1 text-rose-300 border-r border-slate-800 whitespace-pre-wrap">
                                {r.textBefore || '(empty)'}
                              </div>
                              <div className="px-2 py-1 text-emerald-300 whitespace-pre-wrap">
                                {r.textAfter}
                              </div>
                            </div>
                          ))}
                      </div>

                      {prop.status === 'PENDING_REVIEW' && (
                        <div className="flex items-center justify-end gap-2">
                          <button
                            type="button"
                            onClick={() =>
                              onDecideAiSourceProposal({
                                projectId: project.id,
                                proposalId: prop.id,
                                decision: 'REJECTED',
                              })
                            }
                            className="inline-flex items-center gap-1 px-2.5 py-1 text-xs text-rose-300 border border-rose-500/35 hover:bg-rose-950/30 rounded"
                          >
                            <X className="w-3 h-3" aria-hidden="true" />
                            <span>Reject</span>
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              onDecideAiSourceProposal({
                                projectId: project.id,
                                proposalId: prop.id,
                                decision: 'APPROVED',
                              })
                            }
                            data-testid={`approve-ai-source-${prop.id}`}
                            className="inline-flex items-center gap-1 px-3 py-1 text-xs font-medium text-white bg-emerald-600 hover:bg-emerald-500 rounded"
                          >
                            <Check className="w-3 h-3" aria-hidden="true" />
                            <span>Approve &amp; Apply Source Edit</span>
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          )}
        </section>
      </div>

      {/* Reviewed Source-Package Handoff Export + Round-Trip Verifier */}
      <section
        className="bg-[#111827] border border-slate-800/90 rounded-lg p-5 space-y-4"
        data-testid="source-package-handoff-section"
      >
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 pb-3 border-b border-slate-800">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <Lock className="w-4 h-4 text-amber-400" aria-hidden="true" />
              <h3 className="font-display font-semibold text-sm text-slate-100">
                Foundry Source-Package Export &amp; Round-Trip Verification ({SOURCE_PACKAGE_SCHEMA})
              </h3>
              <span className="px-2 py-0.5 text-[10px] font-mono rounded border border-rose-500/40 bg-rose-950/30 text-rose-200">
                UNVERIFIED_AUTHORED_SOURCE_PACKAGE · NOT .holo
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-1">
              Bundles real authored source files, lockfile pins, SHA-256 input hashes, capabilities, and acceptance criteria for local Mac Studio (<span className="font-mono">uor-offline-foundry</span>) execution. Strips credentials/host paths and refuses `.holo` mislabeling.
            </p>
          </div>
        </div>

        {secretHitsInWorkspace.length > 0 && (
          <div className="p-3 bg-rose-950/30 border border-rose-500/40 rounded text-xs text-rose-200 space-y-1">
            <div className="font-semibold flex items-center gap-1.5">
              <ShieldAlert className="w-4 h-4 shrink-0" aria-hidden="true" />
              <span>Restricted secret/host-path pattern detected in draft workspace (will be scrubbed on handoff):</span>
            </div>
            <ul className="list-disc pl-5 text-[11px] font-mono">
              {secretHitsInWorkspace.map((hit, i) => (
                <li key={i}>{hit}</li>
              ))}
            </ul>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 text-xs">
          <div className="p-4 bg-[#0B0F17] border border-slate-800 rounded space-y-3">
            <div className="font-medium text-slate-200">Operator Review &amp; Handoff Export</div>
            <div className="space-y-2">
              <label className="block text-[11px] text-slate-400" htmlFor="handoff-destination">
                Target Destination
              </label>
              <select
                id="handoff-destination"
                value={targetDestination}
                onChange={(e) => setTargetDestination(e.target.value as SourcePackageDestination)}
                className="w-full px-2.5 py-1.5 text-xs bg-[#111827] border border-slate-700 rounded text-slate-100"
              >
                <option value="MAC_STUDIO_UOR_OFFLINE_FOUNDRY">
                  Local Mac Studio (uor-offline-foundry)
                </option>
                <option value="AIR_GAPPED_PHYSICAL_MEDIA">
                  Air-Gapped Physical Transfer Media
                </option>
              </select>
            </div>

            <div>
              <label className="block text-[11px] text-slate-400 mb-1" htmlFor="handoff-review-summary">
                Operator Review Summary
              </label>
              <input
                id="handoff-review-summary"
                type="text"
                value={reviewSummary}
                onChange={(e) => setReviewSummary(e.target.value)}
                placeholder={`Reviewed ${workspace.files.length} source files for ${targetDestination}`}
                className="w-full px-2.5 py-1.5 text-xs bg-[#111827] border border-slate-700 rounded text-slate-100 placeholder-slate-500"
              />
            </div>

            <label className="flex items-start gap-2 cursor-pointer p-2.5 bg-[#111827] border border-slate-800 rounded">
              <input
                type="checkbox"
                checked={reviewConfirmed}
                onChange={(e) => setReviewConfirmed(e.target.checked)}
                data-testid="confirm-source-package-review"
                className="mt-0.5 rounded border-slate-600 bg-slate-900 text-blue-600"
              />
              <span className="text-[11px] text-slate-300 leading-relaxed">
                I have reviewed all {workspace.files.length} files, lockfile refs, expected outputs ({workspace.expectedOutputClasses.length} classes), and destination ({targetDestination}), and confirm this is an <strong>UNVERIFIED_AUTHORED_SOURCE_PACKAGE</strong> (NOT a verified `.holo` archive).
              </span>
            </label>

            <button
              type="button"
              disabled={!reviewConfirmed}
              onClick={handleExportPackageClick}
              data-testid="export-source-package-btn"
              className="w-full inline-flex items-center justify-center gap-2 px-4 py-2 text-xs font-medium text-white bg-blue-600 hover:bg-blue-500 disabled:bg-slate-800 disabled:text-slate-500 disabled:cursor-not-allowed rounded transition-colors"
            >
              <Download className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Export Reviewed Source Package (.uor-src.json)</span>
            </button>

            {exportStatus && (
              <div
                data-testid="source-package-export-status"
                className={`p-2.5 rounded border text-[11px] font-mono ${
                  exportStatus.ok
                    ? 'bg-emerald-950/25 border-emerald-500/35 text-emerald-200'
                    : 'bg-rose-950/25 border-rose-500/35 text-rose-200'
                }`}
              >
                {exportStatus.message}
              </div>
            )}
          </div>

          <div className="p-4 bg-[#0B0F17] border border-slate-800 rounded space-y-3">
            <div className="flex items-center justify-between gap-2">
              <span className="font-medium text-slate-200">
                Verify / Import Handoff Package (Round-Trip)
              </span>
              <label className="text-[11px] text-sky-400 hover:text-sky-300 cursor-pointer underline">
                <span>Load .uor-src.json file</span>
                <input
                  type="file"
                  accept=".json,.uor-src.json"
                  onChange={async (e) => {
                    const f = e.target.files?.[0];
                    if (!f) return;
                    const txt =
                      typeof f.text === 'function' ? await f.text() : await new Response(f).text();
                    setRoundTripJson(txt);
                    await handleVerifyRoundTrip(txt);
                    e.target.value = '';
                  }}
                  className="sr-only"
                />
              </label>
            </div>

            <textarea
              value={roundTripJson}
              onChange={(e) => setRoundTripJson(e.target.value)}
              rows={5}
              placeholder='Paste uor.foundry.source-package.v1 JSON to verify SHA-256 hashes, path safety, and round-trip integrity...'
              className="w-full p-2.5 text-[11px] font-mono bg-[#111827] border border-slate-700 rounded text-slate-200 placeholder-slate-500"
            />

            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={!roundTripJson.trim()}
                onClick={() => handleVerifyRoundTrip(roundTripJson)}
                data-testid="verify-round-trip-btn"
                className="px-3 py-1.5 text-xs font-medium text-slate-100 border border-slate-700 hover:border-slate-500 disabled:opacity-40 rounded"
              >
                Verify Integrity &amp; Classification
              </button>
              {roundTripResult?.ok && roundTripResult.manifest && roundTripResult.workspace && (
                <button
                  type="button"
                  onClick={() =>
                    onImportVerifiedSourcePackage({
                      projectId: project.id,
                      manifest: roundTripResult.manifest!,
                      workspace: roundTripResult.workspace!,
                    })
                  }
                  className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-emerald-200 bg-emerald-950/40 border border-emerald-500/40 hover:bg-emerald-950/60 rounded"
                >
                  <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>Restore Verified Files into Draft</span>
                </button>
              )}
            </div>

            {roundTripResult && (
              <div
                data-testid="round-trip-verification-result"
                className={`p-2.5 rounded border text-[11px] font-mono ${
                  roundTripResult.ok
                    ? 'bg-emerald-950/25 border-emerald-500/35 text-emerald-200'
                    : 'bg-rose-950/25 border-rose-500/35 text-rose-200'
                }`}
              >
                {roundTripResult.message}
              </div>
            )}
          </div>
        </div>

        {/* Phase B & C: Source-Package to Runtime Handoff Preview & Read-Only Calculator Intake Flow */}
        <div
          className="p-4 bg-[#0B0F17] border border-slate-800 rounded space-y-3 text-xs"
          data-testid="runtime-handoff-preview-panel"
        >
          <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-slate-800">
            <div>
              <div className="font-medium text-slate-100">
                Source-Package to Runtime Handoff Preview &amp; Read-Only Intake Validation
              </div>
              <p className="text-[11px] text-slate-400 mt-0.5">
                Validates manifest schema (<span className="font-mono">{SOURCE_PACKAGE_SCHEMA}</span>), file identities, SHA-256 digests, path safety, operator review, lockfile closure, and toolchain compatibility before dispatching read-only intake stages (`INTAKE`, `SPECIFY`, `LOCK`, `CHECK`).
              </p>
            </div>
            <button
              type="button"
              onClick={handleGenerateHandoffPreview}
              data-testid="generate-handoff-preview-btn"
              className="px-3 py-1.5 text-xs font-medium text-slate-100 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded whitespace-nowrap"
            >
              Preview Runtime Handoff Contract
            </button>
          </div>

          {handoffPreview && (
            <div className="space-y-3" data-testid="handoff-preview-details">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5 text-[11px] font-mono">
                <div className="p-2.5 bg-[#111827] border border-slate-800 rounded">
                  <div className="text-slate-500">Package Digest (SHA-256)</div>
                  <div className="text-slate-200 truncate mt-0.5">
                    {handoffPreview.preview.packageDigestSha256}
                  </div>
                </div>
                <div className="p-2.5 bg-[#111827] border border-slate-800 rounded">
                  <div className="text-slate-500">Handoff Gate Checks</div>
                  <div className="text-emerald-300 mt-0.5">
                    {handoffPreview.validation.valid ? 'ALL 7 GATES VERIFIED' : 'GATE FAILURE'} ·{' '}
                    {handoffPreview.preview.verifiedFileCount} files ·{' '}
                    {handoffPreview.preview.lockfileRefs.join(', ')}
                  </div>
                </div>
                <div className="p-2.5 bg-[#111827] border border-slate-800 rounded">
                  <div className="text-slate-500">Target Windmill Flow</div>
                  <div className="text-sky-300 mt-0.5">
                    {handoffPreview.preview.targetWindmillWorkspace} ::{' '}
                    {handoffPreview.preview.readOnlyValidationStages[0]?.windmillFlowPath}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 text-[11px]">
                <div className="p-2.5 bg-[#111827] border border-slate-800 rounded space-y-1">
                  <div className="font-semibold text-slate-200">
                    Canonical Read-Only Intake Stages (`examples/Calculator`)
                  </div>
                  <ul className="space-y-1 font-mono text-slate-300">
                    {handoffPreview.preview.readOnlyValidationStages.map((s) => (
                      <li key={s.commandId} className="truncate">
                        [{s.stageContractName}] {s.commandId} &rarr; {s.validatedArgv.join(' ')}
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="p-2.5 bg-[#111827] border border-slate-800 rounded space-y-1 text-slate-300">
                  <div className="font-semibold text-slate-200">
                    4-Layer Epistemic Separation Boundary
                  </div>
                  <p>
                    <strong className="text-slate-200">1. Authored Source:</strong>{' '}
                    {handoffPreview.preview.separationBoundaries.authoredSourceState}
                  </p>
                  <p>
                    <strong className="text-slate-200">2. Compiled Artifacts:</strong>{' '}
                    {handoffPreview.preview.separationBoundaries.compiledArtifactState}
                  </p>
                  <p>
                    <strong className="text-slate-200">3. Independent Verifier:</strong>{' '}
                    {handoffPreview.preview.separationBoundaries.independentVerificationState}
                  </p>
                  <p>
                    <strong className="text-slate-200">4. Release Authorization:</strong>{' '}
                    {handoffPreview.preview.separationBoundaries.releaseAuthorizationState}
                  </p>
                </div>
              </div>

              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2 border-t border-slate-800">
                <label className="flex items-center gap-2 cursor-pointer text-[11px] text-slate-300">
                  <input
                    type="checkbox"
                    checked={handoffOperatorConfirmed}
                    onChange={(e) => setHandoffOperatorConfirmed(e.target.checked)}
                    data-testid="confirm-runtime-handoff-checkbox"
                    className="rounded border-slate-600 bg-slate-900 text-blue-600"
                  />
                  <span>
                    Confirm explicit operator handoff to read-only intake validation (`uor-offline-foundry`)
                  </span>
                </label>

                <button
                  type="button"
                  disabled={!handoffOperatorConfirmed || !handoffPreview.validation.valid}
                  onClick={handleExecuteReadOnlyIntakeFlow}
                  data-testid="run-calculator-handoff-validation-btn"
                  className="px-3.5 py-1.5 text-xs font-medium text-white bg-blue-600 hover:bg-blue-500 disabled:bg-slate-800 disabled:text-slate-500 rounded whitespace-nowrap"
                >
                  Execute Read-Only Intake Validation
                </button>
              </div>

              {handoffFlowResult && (
                <div
                  data-testid="calculator-handoff-flow-result"
                  className="p-3 bg-[#111827] border border-slate-700 rounded space-y-2 text-[11px] font-mono"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-slate-200">
                      Intake Stage: {handoffFlowResult.intakeStageResult.commandId} (sideEffectsExecuted:{' '}
                      {String(handoffFlowResult.intakeStageResult.sideEffectsExecuted)})
                    </span>
                    <div className="flex items-center gap-1.5">
                      <span className="text-slate-400">Authoritative Lifecycle:</span>
                      <StatusTag value={handoffFlowResult.evidenceLifecycle.currentState} />
                    </div>
                  </div>
                  <div className="text-slate-300">
                    {handoffFlowResult.intakeStageResult.diagnostic}
                  </div>
                  <div className="text-amber-300">
                    Release Eligible: {String(handoffFlowResult.evidenceLifecycle.releaseEligible)} ·{' '}
                    {handoffFlowResult.evidenceLifecycle.blockingReasons[0] ?? 'No blockers'}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </section>
    </div>
  );
};
