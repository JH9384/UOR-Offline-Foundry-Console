import React, { useState } from 'react';
import {
  AlertTriangle,
  ExternalLink,
  FileCode2,
  GitCommit,
  Lock,
  Scale,
  ShieldAlert,
  ShieldCheck,
} from 'lucide-react';
import { prepareRustWorkspaceModelContract } from '../../adapters/windmillExecutionService';
import { sourceComplianceService } from '../../services/sourceComplianceService';
import {
  ApprovalDecisionRecord,
  ArtifactProvenanceRecord,
  ClaimEpistemicState,
  ProjectRecord,
  ReviewedSourceId,
  SourceIntegrationStatus,
  VerificationSuiteRecord,
} from '../../types/foundry';
import { StatusTag } from '../StatusTag';

interface SourceCompliancePanelProps {
  project: ProjectRecord;
  projects?: ProjectRecord[];
  onSelectProject?: (projectId: string) => void;
  verifications: VerificationSuiteRecord[];
  artifacts: ArtifactProvenanceRecord[];
  approvals: ApprovalDecisionRecord[];
}

function claimStateClass(state: ClaimEpistemicState): string {
  switch (state) {
    case 'proved':
      return 'border-emerald-500/40 bg-emerald-950/35 text-emerald-300';
    case 'built':
    case 'tested':
      return 'border-sky-500/40 bg-sky-950/35 text-sky-300';
    case 'observed':
      return 'border-indigo-500/40 bg-indigo-950/35 text-indigo-300';
    case 'untested':
    case 'blocked':
      return 'border-amber-500/40 bg-amber-950/35 text-amber-300';
    case 'refuted':
      return 'border-rose-500/45 bg-rose-950/40 text-rose-300';
  }
}

function integrationStatusClass(status: SourceIntegrationStatus): string {
  switch (status) {
    case 'CONNECTED':
    case 'QUALIFIED':
      return 'border-emerald-500/40 bg-emerald-950/40 text-emerald-300';
    case 'CANDIDATE':
      return 'border-sky-500/40 bg-sky-950/35 text-sky-300';
    case 'REFERENCE ONLY':
    default:
      return 'border-slate-600 bg-slate-900 text-slate-300';
  }
}

function requirementBadgeClass(
  status: 'SATISFIED' | 'GAP' | 'BLOCKED' | 'NOT APPLICABLE'
): string {
  switch (status) {
    case 'SATISFIED':
      return 'border-emerald-500/40 bg-emerald-950/35 text-emerald-300';
    case 'GAP':
      return 'border-amber-500/40 bg-amber-950/35 text-amber-300';
    case 'BLOCKED':
      return 'border-rose-500/40 bg-rose-950/40 text-rose-300';
    case 'NOT APPLICABLE':
      return 'border-slate-700 bg-slate-900/70 text-slate-400';
  }
}

export const SourceCompliancePanel: React.FC<SourceCompliancePanelProps> = ({
  project,
  projects,
  onSelectProject,
  verifications,
  artifacts,
  approvals,
}) => {
  const [sourceFilter, setSourceFilter] = useState<'all' | ReviewedSourceId>('all');
  const reviewedSources = sourceComplianceService.getAllReviewedSources();
  const assessment = sourceComplianceService.assessProjectCompliance({
    project,
    verifications,
    artifacts,
    approvals,
  });

  const uorustContract =
    project.componentId === 'uorust-translator'
      ? prepareRustWorkspaceModelContract({
          projectId: project.id,
          sourceRevision: project.sourceRevision,
          declaredInputs: project.declaredInputs,
        })
      : null;

  const visibleSources =
    sourceFilter === 'all'
      ? reviewedSources
      : reviewedSources.filter((s) => s.id === sourceFilter);

  return (
    <div className="space-y-5" data-testid="source-compliance-panel">
      {/* Project Compliance Summary */}
      <section className="bg-[#111827] border border-slate-800/90 rounded-lg p-5 space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3 pb-3 border-b border-slate-800">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="font-display font-semibold text-sm text-slate-100">
                Project Compliance &amp; Source Pin Assessment
              </h2>
              <StatusTag value={assessment.currentQualificationState} />
            </div>
            <p className="text-xs text-slate-400 mt-1">
              Target project:{' '}
              <span className="text-slate-200 font-medium">{project.name}</span> · Revision{' '}
              <span className="font-mono text-slate-300">{project.sourceRevision}</span>
            </p>
          </div>

          {projects && onSelectProject && projects.length > 1 && (
            <label className="text-xs text-slate-400 flex items-center gap-2">
              <span>Inspect Project:</span>
              <select
                value={project.id}
                onChange={(e) => onSelectProject(e.target.value)}
                aria-label="Select project for compliance assessment"
                className="px-2.5 py-1.5 text-xs bg-[#090D14] border border-slate-700 rounded text-slate-100"
              >
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>

        {/* Governance Invariant Strip */}
        <div className="p-3 bg-[#090D14] border border-slate-800 rounded text-xs text-slate-300 flex items-start gap-2.5">
          <Scale className="w-4 h-4 text-sky-400 shrink-0 mt-0.5" aria-hidden="true" />
          <span>
            Documentation review, test runs, historical CI evidence, and AI summaries are{' '}
            <strong className="text-slate-100 font-medium">never</strong> proof of compliance or
            production release authorization. Applicability is evaluated per project before any
            requirement status is computed.
          </span>
        </div>

        {/* Pinned Source Revisions */}
        <div className="space-y-2">
          <h3 className="text-xs font-medium text-slate-300">
            Sources &amp; Pinned Revisions ({assessment.pinnedRevisions.length})
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
            {assessment.pinnedRevisions.map((pin) => (
              <div
                key={pin.sourceId}
                className="p-3 bg-[#0B0F17] border border-slate-800 rounded space-y-1.5 text-xs"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium text-slate-100 truncate">{pin.name}</span>
                  <span
                    className={`px-1.5 py-0.5 text-[10px] font-mono border rounded-sm shrink-0 ${integrationStatusClass(
                      pin.status
                    )}`}
                  >
                    {pin.status}
                  </span>
                </div>
                <div className="font-mono text-[11px] text-slate-300 flex items-center gap-1.5 break-all">
                  <GitCommit className="w-3 h-3 text-slate-500 shrink-0" aria-hidden="true" />
                  <span>{pin.commitSha}</span>
                </div>
                <div className="text-[11px] text-slate-400">
                  License: <span className="font-mono text-slate-300">{pin.licenseSpdx}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Verification Evidence & Qualification Summary */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 text-xs">
          <div className="p-3 bg-[#0B0F17] border border-slate-800 rounded space-y-1.5">
            <div className="text-[11px] text-slate-500 font-medium">
              Independent Verification Evidence
            </div>
            <p className="text-slate-200">{assessment.verificationEvidenceSummary}</p>
            <div className="text-[11px] text-slate-400">
              Current qualification state:{' '}
              <span className="font-mono text-amber-300">
                {assessment.currentQualificationState}
              </span>
            </div>
          </div>

          <div className="p-3 bg-[#0B0F17] border border-slate-800 rounded space-y-1.5">
            <div className="text-[11px] text-slate-500 font-medium">
              Coverage Gaps &amp; Release Blockers ({assessment.releaseBlockers.length})
            </div>
            <ul className="space-y-1 text-[11px] text-rose-200">
              {assessment.releaseBlockers.slice(0, 4).map((b, idx) => (
                <li key={idx} className="flex items-start gap-1.5">
                  <Lock className="w-3 h-3 text-amber-400 shrink-0 mt-0.5" aria-hidden="true" />
                  <span>{b}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Project-Specific Applicable Requirements Matrix */}
        <div className="space-y-2">
          <h3 className="text-xs font-medium text-slate-300">
            Applicable Requirements (Applicability Assessed First)
          </h3>
          <div className="border border-slate-800 rounded overflow-hidden divide-y divide-slate-800 bg-[#0B0F17]">
            {assessment.requirements.map((req) => (
              <div key={req.id} className="p-3.5 space-y-1.5 text-xs">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="font-mono text-[11px] text-slate-400 shrink-0">
                      {req.id}
                    </span>
                    <span className="font-medium text-slate-100">{req.title}</span>
                  </div>
                  <span
                    className={`px-2 py-0.5 text-[10px] font-mono border rounded-sm shrink-0 ${requirementBadgeClass(
                      req.statusLabel
                    )}`}
                  >
                    {req.statusLabel}
                  </span>
                </div>
                <p className="text-[11px] text-slate-400">{req.applicabilityRationale}</p>
                {req.gapReason && (
                  <p className="text-[11px] text-amber-200 flex items-start gap-1.5">
                    <ShieldAlert
                      className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5"
                      aria-hidden="true"
                    />
                    <span>{req.gapReason}</span>
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Future Windmill UORust Adapter Contract when applicable */}
        {uorustContract && (
          <div
            className="p-4 bg-[#0B1220] border border-sky-500/35 rounded-md space-y-2 text-xs"
            data-testid="uorust-windmill-contract"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2 font-medium text-sky-200">
                <FileCode2 className="w-4 h-4 text-sky-400" aria-hidden="true" />
                <span>Windmill UORust Modeling Contract (Fail-Closed)</span>
              </div>
              <StatusTag value="NOT CONNECTED" />
            </div>
            <div className="font-mono text-[11px] text-slate-300 space-y-1">
              <div>
                Target Flow: <span className="text-sky-300">{uorustContract.flowPath}</span>{' '}
                (workspace: {uorustContract.targetWorkspace})
              </div>
              <div>Idempotency Key: {uorustContract.request.idempotencyKey}</div>
            </div>
            <p className="text-[11px] text-amber-200">{uorustContract.failClosedNotice}</p>
            <ul className="space-y-1 text-[11px] text-slate-400 list-disc pl-4">
              {uorustContract.preconditions.map((pre, i) => (
                <li key={i}>{pre}</li>
              ))}
            </ul>
          </div>
        )}
      </section>

      {/* Full UOR Source Review & Compliance Register */}
      <section className="bg-[#111827] border border-slate-800/90 rounded-lg p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-800">
          <div>
            <h2 className="font-display font-semibold text-sm text-slate-100">
              UOR Source Review &amp; Compliance Register
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Commit-pinned inspection of upstream afflom repositories preserving exact claim
              states, licenses, and open blockers.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-1 p-1 bg-[#090D14] border border-slate-800 rounded-md">
            {(
              [
                { id: 'all', label: 'All Sources (4)' },
                { id: 'rule30', label: 'rule30' },
                { id: 'prism-devrel', label: 'prism-devrel' },
                { id: 'stitch', label: 'stitch' },
                { id: 'uorust', label: 'UORust' },
              ] as const
            ).map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => setSourceFilter(opt.id)}
                className={`px-2.5 py-1 text-[11px] font-mono rounded transition-colors ${
                  sourceFilter === opt.id
                    ? 'bg-slate-800 text-white'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-4">
          {visibleSources.map((src) => (
            <article
              key={src.id}
              className="p-4 bg-[#0B0F17] border border-slate-800 rounded-lg space-y-3 text-xs"
            >
              <div className="flex flex-wrap items-start justify-between gap-3 pb-2.5 border-b border-slate-800/80">
                <div className="space-y-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-display font-semibold text-sm text-slate-100">
                      {src.name}
                    </h3>
                    <span
                      className={`px-2 py-0.5 text-[10px] font-mono border rounded-sm ${integrationStatusClass(
                        src.integrationStatus
                      )}`}
                    >
                      {src.integrationStatus}
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center gap-3 text-[11px] font-mono text-slate-400">
                    <a
                      href={src.canonicalUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 text-blue-400 hover:underline"
                    >
                      <span>{src.canonicalUrl}</span>
                      <ExternalLink className="w-3 h-3" aria-hidden="true" />
                    </a>
                    <span>SHA: {src.reviewedCommitSha}</span>
                  </div>
                </div>
                <div className="text-[11px] font-mono text-slate-300 bg-[#111827] border border-slate-800 px-2.5 py-1 rounded">
                  License: {src.licenseSpdx}
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <div className="text-[11px] font-medium text-slate-400">
                    Intended UOR Offline Foundry Use
                  </div>
                  <p className="text-slate-200 leading-relaxed">{src.intendedUorUse}</p>
                  <div className="text-[11px] font-medium text-slate-400 pt-1">
                    Attribution &amp; License Notice
                  </div>
                  <p className="text-[11px] text-slate-300">{src.attributionNotice}</p>
                </div>

                <div className="space-y-1.5">
                  <div className="text-[11px] font-medium text-slate-400">
                    Relevant Inspected Paths
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {src.relevantPaths.map((p) => (
                      <code
                        key={p}
                        className="px-1.5 py-0.5 text-[10px] bg-[#111827] border border-slate-800 rounded text-slate-300"
                      >
                        {p}
                      </code>
                    ))}
                  </div>
                  <div className="text-[11px] font-medium text-slate-400 pt-1">
                    Offline Dependencies &amp; Availability
                  </div>
                  <p className="text-[11px] text-slate-300">
                    {src.dependenciesAndOfflineAvailability.join(' ')}
                  </p>
                </div>
              </div>

              {/* Claim Epistemic States Matrix */}
              <div className="space-y-1.5">
                <div className="text-[11px] font-medium text-slate-400">
                  Claim &amp; Conformance Register (Distinguished Epistemic States)
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  {src.claims.map((claim) => (
                    <div
                      key={claim.id}
                      className="p-2.5 bg-[#111827] border border-slate-800 rounded space-y-1"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-mono text-[11px] text-slate-200 font-medium">
                          {claim.id}
                        </span>
                        <span
                          className={`px-1.5 py-0.5 text-[10px] font-mono uppercase border rounded-sm ${claimStateClass(
                            claim.state
                          )}`}
                        >
                          {claim.state}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-300">{claim.statement}</p>
                      <p className="text-[10px] font-mono text-slate-500">
                        Mechanism: {claim.mechanism}
                      </p>
                      {claim.limitationOrBlocker && (
                        <p className="text-[11px] text-amber-200 flex items-start gap-1">
                          <AlertTriangle
                            className="w-3 h-3 text-amber-400 shrink-0 mt-0.5"
                            aria-hidden="true"
                          />
                          <span>{claim.limitationOrBlocker}</span>
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Open Blockers & Verification Mechanisms */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 pt-1">
                <div className="p-2.5 bg-[#111827] border border-slate-800 rounded space-y-1">
                  <div className="text-[11px] font-medium text-slate-400 flex items-center gap-1.5">
                    <ShieldCheck className="w-3.5 h-3.5 text-sky-400" aria-hidden="true" />
                    <span>Verification &amp; Conformance Mechanisms</span>
                  </div>
                  <ul className="space-y-1 text-[11px] text-slate-300 list-disc pl-4">
                    {src.verificationMechanisms.map((m, i) => (
                      <li key={i}>{m}</li>
                    ))}
                  </ul>
                </div>

                <div className="p-2.5 bg-rose-950/15 border border-rose-500/25 rounded space-y-1">
                  <div className="text-[11px] font-medium text-rose-200 flex items-center gap-1.5">
                    <ShieldAlert className="w-3.5 h-3.5 text-rose-400" aria-hidden="true" />
                    <span>Open Issues, Blockers &amp; Limitations</span>
                  </div>
                  <ul className="space-y-1 text-[11px] text-rose-200/90 list-disc pl-4">
                    {[...src.openIssuesAndBlockers, ...src.testEvidenceAndLimitations].map(
                      (b, i) => (
                        <li key={i}>{b}</li>
                      )
                    )}
                  </ul>
                </div>
              </div>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
};
