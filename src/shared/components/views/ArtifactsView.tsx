import React, { useEffect, useRef, useState } from 'react';
import {
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Download,
  FileCheck2,
  FileWarning,
  Lock,
  Maximize2,
  Search,
  ShieldCheck,
  X,
} from 'lucide-react';
import {
  buildHologramV4Buffer,
  HologramV4ParsedArtifact,
  parseHologramV4Header,
} from '../../services/hologramService';
import {
  canDownloadVerifiedArtifact,
  getDirectDownloadBlockReason,
} from '../../services/holoArchiveValidator';
import {
  ArtifactLifecycleBadge,
  ArtifactProvenanceRecord,
  PrismOutputClassId,
  ProjectRecord,
} from '../../types/foundry';
import { ensureProjectAuthoringWorkspace } from '../../services/sourceAuthoringService';
import { ArtifactDependencyDag } from '../ArtifactDependencyDag';
import { StatusTag } from '../StatusTag';

interface ArtifactsViewProps {
  projects: ProjectRecord[];
  artifacts: ArtifactProvenanceRecord[];
  selectedProjectId: string;
  artifactBuffers?: Record<string, ArrayBuffer>;
}

type UnifiedArtifactCategory =
  | 'all'
  | 'source_package'
  | 'prism_model'
  | 'generated_lean'
  | 'cargo_output'
  | 'core_wasm'
  | 'portable_view'
  | 'hologram_archive'
  | 'build_manifests'
  | 'verification_evidence'
  | 'release_decision';

export const UNIFIED_ARTIFACT_CATEGORIES: Array<{
  id: UnifiedArtifactCategory;
  label: string;
  outputClasses?: PrismOutputClassId[];
}> = [
  { id: 'all', label: 'All Categories (10)' },
  { id: 'source_package', label: '1. Source Package (Authored Draft)' },
  { id: 'prism_model', label: '2. Prism Model', outputClasses: ['model_prism_json', 'authoritative_lex_tex'] },
  { id: 'generated_lean', label: '3. Generated Lean', outputClasses: ['generated_lean_proof_evidence', 'lcnf_outputs'] },
  { id: 'cargo_output', label: '4. Cargo Output', outputClasses: ['generated_cargo_package'] },
  { id: 'core_wasm', label: '5. Core-Wasm', outputClasses: ['core_wasm_module'] },
  { id: 'portable_view', label: '6. Portable View', outputClasses: ['portable_view_assets'] },
  { id: 'hologram_archive', label: '7. Hologram Archive (.holo)', outputClasses: ['physical_holo_archive'] },
  { id: 'build_manifests', label: '8. Build Manifests', outputClasses: ['build_manifests_and_digests'] },
  { id: 'verification_evidence', label: '9. Verification Evidence', outputClasses: ['independent_acceptance_records'] },
  { id: 'release_decision', label: '10. Release Decision', outputClasses: ['release_decision_records'] },
];

type ArtifactStatusFilter =
  | 'all'
  | ArtifactLifecycleBadge
  | ArtifactProvenanceRecord['releaseReadiness']
  | 'SYNTHETIC_DEMO_DIGEST'
  | 'DOCUMENTED_REFERENCE_DIGEST';

function resolveArtifactStatus(art: ArtifactProvenanceRecord): ArtifactLifecycleBadge {
  if (art.provenanceStatus) return art.provenanceStatus;
  if (art.id === 'art-prism-crate') return 'Superseded';
  return 'Pending';
}

export const ArtifactsView: React.FC<ArtifactsViewProps> = ({
  projects,
  artifacts,
  selectedProjectId,
  artifactBuffers,
}) => {
  const [selectedId, setSelectedId] = useState<string>(
    artifacts.find((a) => a.projectId === selectedProjectId)?.id ?? artifacts[0]?.id ?? ''
  );
  const [searchQuery, setSearchQuery] = useState('');
  const [projectFilter, setProjectFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<ArtifactStatusFilter>('all');
  const [categoryFilter, setCategoryFilter] = useState<UnifiedArtifactCategory>('all');
  const [lastExportNotice, setLastExportNotice] = useState<string | null>(null);
  const [metadataExpanded, setMetadataExpanded] = useState<boolean>(false);
  const [metadataModalOpen, setMetadataModalOpen] = useState<boolean>(false);
  const [holoInspection, setHoloInspection] = useState<HologramV4ParsedArtifact | null>(null);
  const [inspectingHolo, setInspectingHolo] = useState<boolean>(false);
  const [autoScanStatus, setAutoScanStatus] = useState<string | null>(null);
  const [selectionRevision, setSelectionRevision] = useState<number>(0);
  const inspectionRequestIdRef = useRef<number>(0);

  const filteredArtifacts = artifacts.filter((art) => {
    const proj = projects.find((p) => p.id === art.projectId);
    const q = searchQuery.trim().toLowerCase();
    const rowStatus = resolveArtifactStatus(art);
    const matchesSearch =
      !q ||
      art.artifactName.toLowerCase().includes(q) ||
      art.artifactFormat.toLowerCase().includes(q) ||
      art.sha256Digest.toLowerCase().includes(q) ||
      art.sourceRevision.toLowerCase().includes(q) ||
      rowStatus.toLowerCase().includes(q) ||
      (proj?.name.toLowerCase().includes(q) ?? false);

    const matchesProject = projectFilter === 'all' || art.projectId === projectFilter;
    const matchesStatus =
      statusFilter === 'all' ||
      rowStatus === statusFilter ||
      art.releaseReadiness === statusFilter ||
      art.digestMode === statusFilter;

    const selectedCategorySpec = UNIFIED_ARTIFACT_CATEGORIES.find((c) => c.id === categoryFilter);
    const matchesCategory =
      categoryFilter === 'all' ||
      categoryFilter === 'source_package' ||
      (selectedCategorySpec?.outputClasses?.includes(art.outputClass) ?? true);

    return matchesSearch && matchesProject && matchesStatus && matchesCategory;
  });

  const activeArtifact =
    filteredArtifacts.find((a) => a.id === selectedId) ?? filteredArtifacts[0];
  const activeProject = activeArtifact
    ? projects.find((p) => p.id === activeArtifact.projectId)
    : undefined;

  const getGranularMetadata = (
    artifact: ArtifactProvenanceRecord,
    project?: ProjectRecord
  ) => {
    const isSynthetic = artifact.digestMode === 'SYNTHETIC_DEMO_DIGEST';
    return {
      timestamps: [
        { label: 'Artifact Recorded (UTC)', value: artifact.createdAt },
        { label: 'Artifact Recorded (Local)', value: new Date(artifact.createdAt).toLocaleString() },
        { label: 'Project Created (UTC)', value: project?.createdAt ?? 'Unavailable' },
        { label: 'Project Last Updated (UTC)', value: project?.updatedAt ?? 'Unavailable' },
      ],
      envVars: [
        {
          key: 'UOR_EXECUTION_MODE',
          value: isSynthetic ? 'BROWSER_SYNTHETIC_SIMULATION' : 'DOCUMENTED_REFERENCE_RECORD',
          source: 'Console Boundary',
        },
        {
          key: 'WINDMILL_TARGET_URL',
          value: 'http://127.0.0.1:8080 (NOT CONNECTED)',
          source: 'Proposed Runtime Target',
        },
        {
          key: 'WINDMILL_WORKSPACE',
          value: 'uor-offline-foundry',
          source: 'Proposed Runtime Target',
        },
        {
          key: 'CARGO_BUILD_FLAGS',
          value: artifact.toolchainIdentity.includes('PrismPM')
            ? '--locked --offline'
            : 'N/A (Simulated / Schema Ref)',
          source: 'UOR-Foundation/PrismPM',
        },
        {
          key: 'LEAN_TOOLCHAIN_PIN',
          value: artifact.toolchainIdentity.includes('4.32.1')
            ? 'leanprover/lean4:v4.32.1'
            : 'See Toolchain Identity',
          source: 'UOR-Foundation/LexLean',
        },
        {
          key: 'PUBLICATION_BOUNDARY',
          value: 'LOCAL_CREDENTIALS_EXCLUDED',
          source: 'JH9384/UOR-Workflow/PUBLICATION_BOUNDARY.md',
        },
      ],
    };
  };

  const granularMetadata = activeArtifact
    ? getGranularMetadata(activeArtifact, activeProject)
    : null;

  const handleSimulatedDownload = () => {
    if (!activeArtifact) return;

    const payload = {
      schema: 'uor.foundry.simulated-artifact-provenance.v1',
      exportKind: 'SIMULATED_SYNTHETIC_ARTIFACT_PROVENANCE',
      isSimulated: true,
      warning:
        'Simulated browser export only. This synthetic JSON record is not a verified PrismPM/LexLean build binary or live Windmill store artifact.',
      exportedAt: new Date().toISOString(),
      project: activeProject
        ? {
            id: activeProject.id,
            name: activeProject.name,
            productFamily: activeProject.productFamily,
            sourceRevision: activeProject.sourceRevision,
            lifecycleStatus: activeProject.lifecycleStatus,
            acceptancePolicySchema: activeProject.acceptancePolicySchema,
          }
        : { id: activeArtifact.projectId },
      artifact: {
        id: activeArtifact.id,
        artifactName: activeArtifact.artifactName,
        artifactFormat: activeArtifact.artifactFormat,
        sha256Digest: activeArtifact.sha256Digest,
        digestMode: activeArtifact.digestMode,
        sourceRevision: activeArtifact.sourceRevision,
        inputDependencies: activeArtifact.inputDependencies,
        toolchainIdentity: activeArtifact.toolchainIdentity,
        evidenceRefs: activeArtifact.evidenceRefs,
        releaseReadiness: activeArtifact.releaseReadiness,
        blockingReasons: activeArtifact.blockingReasons,
        createdAt: activeArtifact.createdAt,
      },
    };

    const filename = `${activeArtifact.id}-simulated-provenance.json`;
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
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

    setLastExportNotice(`Generated simulated JSON download: ${filename}`);
  };

  const isHoloArtifactSelected = Boolean(
    activeArtifact &&
      (activeArtifact.artifactName.toLowerCase().includes('.holo') ||
        activeArtifact.outputClass === 'physical_holo_archive' ||
        activeArtifact.artifactFormat.toLowerCase().includes('holo'))
  );

  const activeArtifactBuffer = activeArtifact ? artifactBuffers?.[activeArtifact.id] : undefined;

  const handleSelectArtifact = (artifactId: string) => {
    inspectionRequestIdRef.current += 1;
    setHoloInspection(null);
    setAutoScanStatus(null);
    setInspectingHolo(false);
    setLastExportNotice(null);
    setSelectedId(artifactId);
    setSelectionRevision((rev) => rev + 1);
  };

  // Trigger an automatic Hologram v4 structural preflight scan whenever a buffered `.holo`
  // artifact record is selected. Explicit file uploads are handled independently below.
  useEffect(() => {
    let cancelled = false;
    const requestId = ++inspectionRequestIdRef.current;

    setHoloInspection(null);

    if (!activeArtifact || !isHoloArtifactSelected) {
      setAutoScanStatus(null);
      setInspectingHolo(false);
      return () => {
        cancelled = true;
      };
    }

    if (!activeArtifactBuffer) {
      setInspectingHolo(false);
      setAutoScanStatus(
        `Structural Preflight Auto-Scan (${activeArtifact.artifactName}): awaiting local .holo file selection to inspect HOLO\\x04\\0 bytes, manifest, and SHA-256.`
      );
      return () => {
        cancelled = true;
      };
    }

    setInspectingHolo(true);
    setAutoScanStatus(
      `Structural Preflight (${activeArtifact.artifactName}): inspecting HOLO\\x04\\0 bytes...`
    );

    parseHologramV4Header(activeArtifactBuffer, {
      expectedProjectId: activeProject?.id,
      expectedSourceRevision: activeProject?.sourceRevision,
      isSyntheticFixture: activeArtifact.isSyntheticFixture,
    })
      .then((report) => {
        if (cancelled || inspectionRequestIdRef.current !== requestId) return;
        setHoloInspection(report);
        setAutoScanStatus(
          `Structural Preflight (${activeArtifact.artifactName}): ${report.status}${report.isSyntheticFixture ? ' [SYNTHETIC FIXTURE]' : ''} (${report.byteLength} bytes · sha256:${report.sha256Hash.slice(0, 12)}...)`
        );
      })
      .catch(() => {
        if (cancelled || inspectionRequestIdRef.current !== requestId) return;
        setHoloInspection(null);
        setAutoScanStatus(
          `Structural Preflight (${activeArtifact.artifactName}): inspection failed.`
        );
      })
      .finally(() => {
        if (!cancelled && inspectionRequestIdRef.current === requestId) {
          setInspectingHolo(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [
    activeArtifact?.id,
    activeArtifact?.artifactName,
    activeArtifact?.isSyntheticFixture,
    activeProject?.id,
    activeProject?.sourceRevision,
    isHoloArtifactSelected,
    activeArtifactBuffer,
    selectionRevision,
  ]);

  const runHoloBufferInspection = async (
    buffer: ArrayBuffer,
    label: string,
    options: {
      source?: 'upload' | 'self-test';
      requestId?: number;
    } = {}
  ) => {
    const source = options.source ?? 'self-test';
    const requestId = options.requestId ?? ++inspectionRequestIdRef.current;

    if (options.requestId === undefined) {
      setHoloInspection(null);
      setAutoScanStatus(`Inspecting ${label}...`);
      setInspectingHolo(true);
    }

    try {
      // Explicitly uploaded local files must be inspected independently of the currently
      // selected seeded artifact's projectId, sourceRevision, or synthetic fixture flag.
      const parseOptions =
        source === 'upload'
          ? {}
          : {
              expectedProjectId: activeProject?.id,
              expectedSourceRevision: activeProject?.sourceRevision,
            };

      const report = await parseHologramV4Header(buffer, parseOptions);
      if (inspectionRequestIdRef.current !== requestId) {
        return;
      }
      setHoloInspection(report);
      setAutoScanStatus(
        source === 'upload'
          ? `Uploaded File Inspection (${label}): ${report.status} (${report.byteLength} bytes · sha256:${report.sha256Hash.slice(0, 12)}...)`
          : `Auto-Scan (${label}): ${report.status} (${report.byteLength} bytes · sha256:${report.sha256Hash.slice(0, 12)}...)`
      );
      setLastExportNotice(`Inspected ${label}: ${report.status} (${report.byteLength} bytes)`);
    } finally {
      if (inspectionRequestIdRef.current === requestId) {
        setInspectingHolo(false);
      }
    }
  };

  const handleInspectFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const inputEl = e.currentTarget;
    const file = inputEl.files?.[0];
    if (!file) return;

    const requestId = ++inspectionRequestIdRef.current;
    setHoloInspection(null);
    setAutoScanStatus(`Inspecting ${file.name}...`);
    setInspectingHolo(true);
    setLastExportNotice(null);

    try {
      const buffer =
        typeof file.arrayBuffer === 'function'
          ? await file.arrayBuffer()
          : await new Response(file).arrayBuffer();

      if (inspectionRequestIdRef.current !== requestId) {
        return;
      }

      await runHoloBufferInspection(buffer, file.name, {
        source: 'upload',
        requestId,
      });
    } finally {
      if (inspectionRequestIdRef.current === requestId) {
        setInspectingHolo(false);
      }
      try {
        inputEl.value = '';
      } catch {
        // Ignore read-only value assignment in synthetic test inputs
      }
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-[#111827] border border-slate-800/90 rounded-lg p-5">
        <h2 className="font-display font-semibold text-sm text-slate-100">
          Artifacts & Content-Addressed Provenance
        </h2>
        <p className="text-xs text-slate-400 mt-1 leading-relaxed">
          Displays build outputs, SHA-256 digests, source revisions, input dependencies, toolchain identities, and release readiness grounded in PrismPM (<span className="font-mono">.holo v4</span>, <span className="font-mono">model.prism.json</span>) and LexLean (<span className="font-mono">lexlean/production-result/1</span>).
        </p>
      </div>

      {/* Search & Filter Controls */}
      <div className="bg-[#111827] border border-slate-800/90 rounded-lg p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <div className="relative flex-1 max-w-md">
          <Search
            className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2"
            aria-hidden="true"
          />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search artifact name, format, revision, or SHA-256..."
            aria-label="Search artifacts"
            className="w-full pl-9 pr-3 py-1.5 text-xs bg-[#0B0F17] border border-slate-700 rounded-md text-slate-100 placeholder-slate-500 focus:outline-none focus:border-blue-500"
          />
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <label htmlFor="artifact-project-filter" className="text-xs text-slate-400 whitespace-nowrap">
              Project:
            </label>
            <select
              id="artifact-project-filter"
              value={projectFilter}
              onChange={(e) => setProjectFilter(e.target.value)}
              className="px-3 py-1.5 text-xs bg-[#0B0F17] border border-slate-700 rounded-md text-slate-200 focus:outline-none focus:border-blue-500"
            >
              <option value="all">All Projects</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-2">
            <label htmlFor="artifact-category-filter" className="text-xs text-slate-400 whitespace-nowrap">
              Category:
            </label>
            <select
              id="artifact-category-filter"
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value as UnifiedArtifactCategory)}
              data-testid="artifact-category-filter"
              className="px-3 py-1.5 text-xs bg-[#0B0F17] border border-slate-700 rounded-md text-slate-200 focus:outline-none focus:border-blue-500"
            >
              {UNIFIED_ARTIFACT_CATEGORIES.map((cat) => (
                <option key={cat.id} value={cat.id}>
                  {cat.label}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-2">
            <label htmlFor="artifact-status-filter" className="text-xs text-slate-400 whitespace-nowrap">
              Status:
            </label>
            <select
              id="artifact-status-filter"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as ArtifactStatusFilter)}
              className="px-3 py-1.5 text-xs bg-[#0B0F17] border border-slate-700 rounded-md text-slate-200 focus:outline-none focus:border-blue-500"
            >
              <option value="all">All Statuses</option>
              <option value="Validated">Provenance: Validated</option>
              <option value="Pending">Provenance: Pending</option>
              <option value="Superseded">Provenance: Superseded</option>
              <option value="BLOCKED">Release: BLOCKED</option>
              <option value="SIMULATED_ONLY">Release: SIMULATED_ONLY</option>
              <option value="NOT_ASSESSED">Release: NOT_ASSESSED</option>
              <option value="DOCUMENTED_REFERENCE_DIGEST">Digest: Documented Reference</option>
              <option value="SYNTHETIC_DEMO_DIGEST">Digest: Synthetic Demo</option>
            </select>
          </div>
        </div>
      </div>

      {/* Category 1: Authored Source Package Inspector */}
      {(() => {
        const focusProj =
          projects.find((p) => p.id === (projectFilter !== 'all' ? projectFilter : selectedProjectId)) ??
          projects[0];
        if (!focusProj || (categoryFilter !== 'all' && categoryFilter !== 'source_package')) return null;
        const authored = ensureProjectAuthoringWorkspace(focusProj);
        return (
          <section
            className="bg-[#111827] border border-sky-500/35 rounded-lg p-4 space-y-2 text-xs"
            data-testid="artifacts-source-package-summary"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="font-medium text-sky-200">
                1. Source Package (Authored Inputs · {focusProj.name})
              </div>
              <span className="px-2 py-0.5 text-[10px] font-mono rounded border border-amber-500/40 bg-amber-950/30 text-amber-200">
                UNVERIFIED_AUTHORED_SOURCE_PACKAGE · NOT .holo
              </span>
            </div>
            <div className="text-[11px] font-mono text-slate-300">
              Files ({authored.files.length}): {authored.files.map((f) => f.path).join(', ')}
            </div>
            <div className="text-[11px] text-slate-400">
              Review Status: <span className="font-mono text-slate-200">{authored.reviewStatus}</span> · Expected Build Classes: <span className="font-mono text-slate-300">{authored.expectedOutputClasses.join(', ')}</span>
            </div>
          </section>
        );
      })()}

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
        <section className="xl:col-span-5 bg-[#111827] border border-slate-800/90 rounded-lg overflow-hidden">
          <div className="px-5 py-3.5 border-b border-slate-800 flex items-center justify-between">
            <h3 className="font-display font-semibold text-sm text-slate-100">
              Artifact Records
            </h3>
            <span className="text-xs font-mono text-slate-400 tabular-nums">
              {filteredArtifacts.length} / {artifacts.length} items
            </span>
          </div>
          {filteredArtifacts.length === 0 ? (
            <div className="p-8 text-center space-y-3">
              <p className="text-sm text-slate-400">
                No artifact records match the active search or filter criteria.
              </p>
              <button
                type="button"
                onClick={() => {
                  setSearchQuery('');
                  setProjectFilter('all');
                  setStatusFilter('all');
                }}
                className="px-3 py-1.5 text-xs text-blue-400 border border-slate-700 hover:border-slate-600 rounded-md"
              >
                Reset Filters
              </button>
            </div>
          ) : (
            <div className="divide-y divide-slate-800/70">
              {filteredArtifacts.map((art) => {
                const proj = projects.find((p) => p.id === art.projectId);
                const selected = activeArtifact?.id === art.id;
                const rowStatus = resolveArtifactStatus(art);
                return (
                  <button
                    key={art.id}
                    type="button"
                    onClick={() => handleSelectArtifact(art.id)}
                    className={`w-full text-left px-5 py-4 transition-colors block ${
                      selected ? 'bg-slate-800/75' : 'hover:bg-slate-900/60'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <span className="text-sm font-medium text-slate-100">{art.artifactName}</span>
                      <StatusTag value={rowStatus} />
                    </div>
                    <div className="mt-1 text-xs text-slate-400">
                      {proj?.name ?? art.projectId} · {art.digestMode}
                    </div>
                    <div className="mt-1 font-mono text-[11px] text-slate-500 truncate">
                      sha256:{art.sha256Digest}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </section>

        {activeArtifact ? (
          <section className="xl:col-span-7 bg-[#111827] border border-slate-800/90 rounded-lg p-6 space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 pb-4 border-b border-slate-800">
              <div className="min-w-0">
                <div className="text-xs font-mono text-slate-400">
                  {activeProject?.name ?? activeArtifact.projectId} · {activeArtifact.digestMode} ·{' '}
                  <span className="text-sky-300">{activeArtifact.outputClass}</span>
                </div>
                <h3 className="font-display font-semibold text-base text-slate-100 mt-1">
                  {activeArtifact.artifactName}
                </h3>
              </div>
              <div className="flex flex-wrap items-center gap-2 shrink-0">
                <StatusTag value={activeArtifact.artifactState} />
                <StatusTag value={resolveArtifactStatus(activeArtifact)} />
                <StatusTag value="BLOCKED" />
                <button
                  type="button"
                  onClick={handleSimulatedDownload}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-blue-600 hover:bg-blue-500 rounded-md transition-colors whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
                  title="Generates a synthetic JSON file in-browser representing this artifact's metadata and provenance record (simulated download)"
                >
                  <Download className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>Download Synthetic JSON (Simulated)</span>
                </button>
              </div>
            </div>

            {lastExportNotice && (
              <div className="px-3.5 py-2.5 bg-indigo-950/30 border border-indigo-500/35 rounded-md text-xs text-indigo-200 flex items-center justify-between gap-3">
                <span className="flex items-center gap-2">
                  <CheckCircle2 className="w-3.5 h-3.5 text-indigo-300 shrink-0" aria-hidden="true" />
                  <span className="font-mono">{lastExportNotice}</span>
                </span>
                <StatusTag value="SIMULATED" />
              </div>
            )}

            <dl className="space-y-4 text-xs">
              <div>
                <dt className="text-slate-500">Artifact Format / Schema</dt>
                <dd className="mt-1 font-mono text-slate-200">{activeArtifact.artifactFormat}</dd>
              </div>
              <div>
                <dt className="text-slate-500">SHA-256 Digest</dt>
                <dd className="mt-1 font-mono text-slate-200 break-all bg-[#0B0F17] border border-slate-800 rounded p-2.5">
                  {activeArtifact.sha256Digest}
                </dd>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <dt className="text-slate-500">Source Revision</dt>
                  <dd className="mt-1 font-mono text-slate-200">{activeArtifact.sourceRevision}</dd>
                </div>
                <div>
                  <dt className="text-slate-500">Toolchain Identity</dt>
                  <dd className="mt-1 font-mono text-slate-200">{activeArtifact.toolchainIdentity}</dd>
                </div>
              </div>
              <div>
                <dt className="text-slate-500">Input Dependencies</dt>
                <dd className="mt-1">
                  <ul className="space-y-1 font-mono text-slate-300 bg-[#0B0F17] border border-slate-800 rounded p-2.5">
                    {activeArtifact.inputDependencies.map((dep, i) => (
                      <li key={i}>{dep}</li>
                    ))}
                  </ul>
                </dd>
              </div>
              <div>
                <dt className="text-slate-500">Referenced Evidence IDs</dt>
                <dd className="mt-1 font-mono text-slate-300">
                  {activeArtifact.evidenceRefs.length > 0
                    ? activeArtifact.evidenceRefs.join(' · ')
                    : 'NONE RECORDED'}
                </dd>
              </div>
            </dl>

            {/* Direct Binary / Source / Runtime / Evidence Download Gate */}
            {(() => {
              const directAllowed = canDownloadVerifiedArtifact(activeArtifact);
              const blockReason = getDirectDownloadBlockReason(activeArtifact);
              const downloadTargets = [
                '.holo Archive Binary',
                'Generated Source Archive',
                'Core-Wasm + HOLOVIEW Bundle',
                'Verified Evidence Bundle',
              ];
              return (
                <div
                  className="p-4 bg-[#0B0F17] border border-slate-800 rounded-md space-y-3"
                  data-testid="direct-download-gate"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2 text-xs font-medium text-slate-200">
                      <ShieldCheck className="w-4 h-4 text-sky-400 shrink-0" aria-hidden="true" />
                      <span>Direct Verified Output Downloads (SHA-256 Gated)</span>
                    </div>
                    <StatusTag value={directAllowed ? 'Validated' : 'BLOCKED'} />
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {downloadTargets.map((label) => (
                      <button
                        key={label}
                        type="button"
                        disabled={!directAllowed}
                        title={blockReason ?? `Download verified ${label}`}
                        className="inline-flex items-center justify-between gap-2 px-3 py-2 text-xs font-mono border border-slate-800 bg-[#111827] text-slate-400 disabled:opacity-60 disabled:cursor-not-allowed rounded"
                      >
                        <span className="truncate">{label}</span>
                        <Lock className="w-3.5 h-3.5 text-amber-400 shrink-0" aria-hidden="true" />
                      </button>
                    ))}
                  </div>
                  {blockReason && (
                    <p className="text-[11px] text-amber-300" data-testid="direct-download-block-reason">
                      {blockReason}
                    </p>
                  )}
                </div>
              );
            })()}

            {/* Physical .holo Binary Archive Validator (HOLO\x04\0 / UORC\x02\x01 / PP3001) */}
            <div className="p-4 bg-[#0B0F17] border border-slate-800 rounded-md space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h4 className="text-xs font-medium text-slate-200">
                    Physical `.holo` Binary Archive Inspector (`HOLO\x04\0` / `UORC\x02\x01`)
                  </h4>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    Verifies real binary magic &amp; embedded Core-Wasm/HOLOVIEW headers; rejects JSON masquerading as `.holo` with `PP3001`.
                  </p>
                </div>
                <StatusTag value={activeArtifact.archiveValidationStatus ?? 'UNINSPECTED'} />
              </div>

              {(activeArtifact.coreWasmContract || activeArtifact.viewProfile) && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-[11px] font-mono text-slate-300">
                  {activeArtifact.coreWasmContract && (
                    <div className="p-2 bg-[#111827] border border-slate-800 rounded">
                      Core-Wasm: {activeArtifact.coreWasmContract}
                    </div>
                  )}
                  {activeArtifact.viewProfile && (
                    <div className="p-2 bg-[#111827] border border-slate-800 rounded">
                      View Profile: {activeArtifact.viewProfile}
                    </div>
                  )}
                </div>
              )}

              {autoScanStatus && (
                <div
                  className="px-2.5 py-1.5 rounded bg-[#111827] border border-slate-800 text-[11px] font-mono text-slate-300"
                  data-testid="holo-auto-scan-status"
                >
                  {autoScanStatus}
                </div>
              )}

              <div className="flex flex-wrap items-center gap-2">
                <label className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-200 bg-[#111827] border border-slate-700 hover:border-slate-600 rounded cursor-pointer">
                  <span>Inspect Local `.holo` File</span>
                  <input
                    type="file"
                    accept=".holo,.bin,.json"
                    onChange={handleInspectFileUpload}
                    className="sr-only"
                    aria-label="Inspect local .holo archive bytes"
                    data-testid="holo-file-input"
                  />
                </label>
                <button
                  type="button"
                  disabled={inspectingHolo}
                  onClick={() =>
                    runHoloBufferInspection(
                      buildHologramV4Buffer({
                        projectId: activeProject?.id ?? 'proj-prism-calc',
                        projectName: activeProject?.name ?? 'PrismPM Calculator Reference',
                        sourceRevision: activeProject?.sourceRevision ?? 'prismpm/main@6c876017',
                        isSyntheticFixture: true,
                      }),
                      'synthetic fixture HOLO v4 buffer'
                    )
                  }
                  className="px-2.5 py-1.5 text-[11px] font-mono text-sky-300 border border-sky-500/35 hover:bg-sky-950/30 rounded"
                >
                  Run Structural Preflight (Synthetic `HOLO\x04\0`)
                </button>
                <button
                  type="button"
                  disabled={inspectingHolo}
                  onClick={() =>
                    runHoloBufferInspection(
                      new TextEncoder().encode('{"fake":"holo-json"}').buffer,
                      'self-test JSON-as-.holo'
                    )
                  }
                  className="px-2.5 py-1.5 text-[11px] font-mono text-amber-300 border border-amber-500/35 hover:bg-amber-950/30 rounded"
                >
                  Test `PP3001` JSON Rejection
                </button>
                <button
                  type="button"
                  disabled={inspectingHolo}
                  onClick={() =>
                    runHoloBufferInspection(
                      buildHologramV4Buffer({
                        projectId: activeProject?.id ?? 'proj-prism-calc',
                        projectName: activeProject?.name ?? 'PrismPM Calculator Reference',
                        sourceRevision: activeProject?.sourceRevision ?? 'prismpm/main@6c876017',
                        corruptManifest: true,
                        isSyntheticFixture: true,
                      }),
                      'self-test corrupt v4 manifest'
                    )
                  }
                  className="px-2.5 py-1.5 text-[11px] font-mono text-rose-300 border border-rose-500/35 hover:bg-rose-950/30 rounded"
                >
                  Test Corrupt Manifest Rejection
                </button>
              </div>

              {holoInspection && (
                <div
                  className={`p-3 rounded border text-xs space-y-2 ${
                    holoInspection.valid
                      ? 'bg-sky-950/25 border-sky-500/35 text-sky-100'
                      : 'bg-rose-950/25 border-rose-500/35 text-rose-200'
                  }`}
                  data-testid="holo-inspection-result"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2 font-mono font-semibold">
                    <span className="flex items-center gap-2">
                      {holoInspection.valid ? (
                        <FileCheck2 className="w-4 h-4 text-sky-400 shrink-0" aria-hidden="true" />
                      ) : (
                        <FileWarning className="w-4 h-4 text-rose-400 shrink-0" aria-hidden="true" />
                      )}
                      <span>
                        {holoInspection.status}{' '}
                        {holoInspection.errorCode ? `(${holoInspection.errorCode})` : ''}
                      </span>
                    </span>
                    {holoInspection.isSyntheticFixture && (
                      <span className="px-1.5 py-0.5 text-[10px] rounded border border-indigo-500/40 bg-indigo-950/50 text-indigo-200">
                        SYNTHETIC FIXTURE · STRUCTURAL PREFLIGHT ONLY
                      </span>
                    )}
                  </div>
                  <p className="text-[11px]">{holoInspection.diagnostic}</p>
                  {holoInspection.trustLayers && (
                    <div
                      className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-1.5 pt-1 text-[10px] font-mono"
                      data-testid="holo-trust-layers"
                    >
                      <div className="px-2 py-1 rounded bg-black/30 border border-slate-800">
                        Structural preflight: {holoInspection.trustLayers.structuralPreflight}
                      </div>
                      <div className="px-2 py-1 rounded bg-black/30 border border-slate-800">
                        Digest check: {holoInspection.trustLayers.contentDigestValidation}
                      </div>
                      <div className="px-2 py-1 rounded bg-black/30 border border-slate-800">
                        Format parse: {holoInspection.trustLayers.archiveFormatParsing}
                      </div>
                      <div className="px-2 py-1 rounded bg-black/30 border border-slate-800 text-amber-300">
                        Independent Hologram verify: {holoInspection.trustLayers.independentHologramVerification}
                      </div>
                      <div className="px-2 py-1 rounded bg-black/30 border border-slate-800 text-amber-300">
                        PrismPM acceptance: {holoInspection.trustLayers.prismPmAcceptance}
                      </div>
                      <div className="px-2 py-1 rounded bg-black/30 border border-slate-800 text-rose-300">
                        Release auth: {holoInspection.trustLayers.productionReleaseAuthorization}
                      </div>
                    </div>
                  )}
                  {holoInspection.header && (
                    <div className="font-mono text-[10px] opacity-90 flex flex-wrap gap-x-3 gap-y-1">
                      <span>header: v{holoInspection.header.majorVersion}.{holoInspection.header.minorVersion}</span>
                      <span>sections: {holoInspection.header.sectionCount}</span>
                      <span>manifestLen: {holoInspection.header.manifestByteLength}B</span>
                      <span>footerNonZero: {String(holoInspection.header.footerNonZero)}</span>
                    </div>
                  )}
                  {holoInspection.manifest && (
                    <div
                      className="p-2 rounded bg-black/30 font-mono text-[10px] space-y-0.5 break-all"
                      data-testid="holo-manifest-summary"
                    >
                      <div>schema: {holoInspection.manifest.schema} · entrypoint: {holoInspection.manifest.entrypoint}</div>
                      <div>project: {holoInspection.manifest.projectId} · rev: {holoInspection.manifest.sourceRevision}</div>
                      <div>sections: {holoInspection.manifest.sections.join(', ')}</div>
                    </div>
                  )}
                  <div className="font-mono text-[10px] opacity-90 break-all">
                    sha256: {holoInspection.sha256Hex} · Core-Wasm magic: {String(holoInspection.hasCoreWasmMagic)} · HOLOVIEW magic: {String(holoInspection.hasHoloviewMagic)}
                  </div>
                </div>
              )}
            </div>

            <ArtifactDependencyDag artifact={activeArtifact} project={activeProject} />

            {/* Expandable Granular Build & Toolchain Metadata Row */}
            {granularMetadata && (
              <div className="border border-slate-800 rounded-md bg-[#0B0F17] overflow-hidden">
                <div className="px-4 py-3 flex flex-wrap items-center justify-between gap-3">
                  <button
                    type="button"
                    aria-expanded={metadataExpanded}
                    onClick={() => setMetadataExpanded((prev) => !prev)}
                    className="inline-flex items-center gap-2 text-xs font-medium text-slate-200 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded"
                  >
                    {metadataExpanded ? (
                      <ChevronDown className="w-4 h-4 text-blue-400 shrink-0" aria-hidden="true" />
                    ) : (
                      <ChevronRight className="w-4 h-4 text-slate-400 shrink-0" aria-hidden="true" />
                    )}
                    <span>Build Timestamps &amp; Sanitized Toolchain Environment</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setMetadataModalOpen(true)}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-medium text-slate-300 hover:text-white border border-slate-700 hover:border-slate-600 rounded transition-colors whitespace-nowrap"
                  >
                    <Maximize2 className="w-3 h-3" aria-hidden="true" />
                    <span>Open Metadata Modal</span>
                  </button>
                </div>

                {metadataExpanded && (
                  <div className="px-4 pb-4 pt-3 border-t border-slate-800 space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                      {granularMetadata.timestamps.map((ts) => (
                        <div key={ts.label}>
                          <div className="text-[11px] text-slate-500">{ts.label}</div>
                          <div className="mt-0.5 font-mono text-slate-200 tabular-nums">
                            {ts.value}
                          </div>
                        </div>
                      ))}
                    </div>

                    <div>
                      <div className="text-[11px] text-slate-500 mb-1.5">
                        Sanitized Toolchain &amp; Boundary Environment Variables
                      </div>
                      <div className="overflow-x-auto border border-slate-800/80 rounded">
                        <table className="w-full text-left border-collapse text-[11px]">
                          <thead>
                            <tr className="border-b border-slate-800 text-slate-400">
                              <th className="py-2 px-3">Variable</th>
                              <th className="py-2 px-3">Value</th>
                              <th className="py-2 px-3">Authority / Source</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-800/70 font-mono">
                            {granularMetadata.envVars.map((env) => (
                              <tr key={env.key}>
                                <td className="py-2 px-3 text-blue-300 whitespace-nowrap">{env.key}</td>
                                <td className="py-2 px-3 text-slate-200">{env.value}</td>
                                <td className="py-2 px-3 text-slate-500">{env.source}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            <div className="p-4 bg-[#0B0F17] border border-amber-500/30 rounded-md space-y-2">
              <div className="flex items-center gap-2 text-xs font-medium text-amber-300">
                <Lock className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                <span>Release Readiness: {activeArtifact.releaseReadiness}</span>
              </div>
              <ul className="space-y-1 text-xs text-slate-300 list-disc pl-4">
                {activeArtifact.blockingReasons.map((reason, i) => (
                  <li key={i}>{reason}</li>
                ))}
              </ul>
            </div>
          </section>
        ) : (
          <section className="xl:col-span-7 bg-[#111827] border border-slate-800/90 rounded-lg p-8 flex items-center justify-center text-xs text-slate-400">
            Select or reset filters to inspect an artifact provenance record.
          </section>
        )}
      </div>

      {/* Granular Metadata Modal */}
      {metadataModalOpen && activeArtifact && granularMetadata && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75"
          role="dialog"
          aria-modal="true"
          aria-labelledby="artifact-metadata-modal-title"
        >
          <div className="w-full max-w-3xl bg-[#111827] border border-slate-700/80 rounded-lg overflow-hidden max-h-[90vh] flex flex-col">
            <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between gap-4">
              <div className="min-w-0">
                <div className="text-[11px] font-mono text-slate-400">
                  {activeArtifact.id} · {activeArtifact.digestMode}
                </div>
                <h3
                  id="artifact-metadata-modal-title"
                  className="font-display font-semibold text-base text-slate-100 truncate mt-0.5"
                >
                  Granular Provenance &amp; Toolchain Metadata
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setMetadataModalOpen(false)}
                className="p-1.5 text-slate-400 hover:text-white rounded-md"
                aria-label="Close metadata modal"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-6 overflow-y-auto space-y-5 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {granularMetadata.timestamps.map((ts) => (
                  <div key={ts.label} className="p-3 bg-[#0B0F17] border border-slate-800 rounded">
                    <div className="text-slate-500">{ts.label}</div>
                    <div className="mt-1 font-mono text-slate-200 tabular-nums">{ts.value}</div>
                  </div>
                ))}
              </div>

              <div>
                <h4 className="font-medium text-slate-200 mb-2">
                  Sanitized Toolchain &amp; Boundary Environment
                </h4>
                <div className="overflow-x-auto bg-[#0B0F17] border border-slate-800 rounded">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-slate-800 text-[11px] text-slate-400">
                        <th className="py-2.5 px-3">Variable</th>
                        <th className="py-2.5 px-3">Value</th>
                        <th className="py-2.5 px-3">Source</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/70 font-mono text-[11px]">
                      {granularMetadata.envVars.map((env) => (
                        <tr key={env.key}>
                          <td className="py-2 px-3 text-blue-300 whitespace-nowrap">{env.key}</td>
                          <td className="py-2 px-3 text-slate-200">{env.value}</td>
                          <td className="py-2 px-3 text-slate-500">{env.source}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div>
                <h4 className="font-medium text-slate-200 mb-2">
                  Structured Provenance Record (JSON View)
                </h4>
                <pre className="p-3 bg-[#0B0F17] border border-slate-800 rounded font-mono text-[11px] text-slate-300 overflow-x-auto">
                  {JSON.stringify(
                    {
                      artifact: activeArtifact,
                      project: activeProject
                        ? {
                            id: activeProject.id,
                            name: activeProject.name,
                            acceptancePolicySchema: activeProject.acceptancePolicySchema,
                            lifecycleStatus: activeProject.lifecycleStatus,
                          }
                        : undefined,
                    },
                    null,
                    2
                  )}
                </pre>
              </div>
            </div>

            <div className="px-6 py-3.5 border-t border-slate-800 flex items-center justify-between gap-3">
              <span className="text-[11px] text-slate-500">
                Secrets and raw local controller paths are excluded per PUBLICATION_BOUNDARY.md.
              </span>
              <button
                type="button"
                onClick={() => setMetadataModalOpen(false)}
                className="px-4 py-1.5 text-xs font-medium text-slate-200 border border-slate-700 hover:border-slate-600 rounded-md"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
