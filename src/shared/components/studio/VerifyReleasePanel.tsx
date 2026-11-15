import React, { useState } from 'react';
import { ExternalLink, Lock, ShieldAlert } from 'lucide-react';
import { verificationAuthorityService } from '../../services/verificationAuthorityService';
import {
  ApprovalDecisionRecord,
  ArtifactProvenanceRecord,
  NavigationSectionId,
  ProjectRecord,
  VerificationSuiteRecord,
} from '../../types/foundry';
import { StatusTag } from '../StatusTag';
import { ApprovalsView } from '../views/ApprovalsView';
import { VerificationView } from '../views/VerificationView';
import { SourceCompliancePanel } from './SourceCompliancePanel';

export type VerifySubTab = 'evidence' | 'governance' | 'compliance';

interface VerifyReleasePanelProps {
  project: ProjectRecord;
  projects: ProjectRecord[];
  verifications: VerificationSuiteRecord[];
  artifacts: ArtifactProvenanceRecord[];
  approvals: ApprovalDecisionRecord[];
  activeSubTab?: VerifySubTab;
  onChangeSubTab?: (tab: VerifySubTab) => void;
  onSelectProject: (projectId: string) => void;
  onOpenAdvancedSection: (section: NavigationSectionId) => void;
}

export const VerifyReleasePanel: React.FC<VerifyReleasePanelProps> = ({
  project,
  projects,
  verifications,
  artifacts,
  approvals,
  activeSubTab,
  onChangeSubTab,
  onSelectProject,
  onOpenAdvancedSection,
}) => {
  const [internalTab, setInternalTab] = useState<VerifySubTab>('evidence');
  const subTab = activeSubTab ?? internalTab;
  const setSubTab = (tab: VerifySubTab) => {
    setInternalTab(tab);
    onChangeSubTab?.(tab);
  };

  const projectApprovals = approvals.filter((a) => a.projectId === project.id);
  const authoritySummary = verificationAuthorityService.evaluateProjectAuthority({
    project,
    verifications,
    artifacts,
    approvals,
  });

  return (
    <div className="space-y-5">
      {/* Independent Authority Gate Banner */}
      <section className="bg-[#111827] border border-slate-800/90 rounded-lg p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-semibold text-slate-100">
              Independent Verification &amp; Release Authority
            </span>
            <StatusTag value={authoritySummary.overallVerificationState} />
            <StatusTag
              value={
                authoritySummary.releaseEligible
                  ? 'APPROVED_FOR_RELEASE'
                  : 'RELEASE BLOCKED'
              }
            />
          </div>
          <div className="text-[11px] font-mono text-slate-400 tabular-nums">
            Policy: {authoritySummary.policyId ?? 'NONE'} ({authoritySummary.policyVersion ?? 'unestablished'}) · Authenticated PASS:{' '}
            {authoritySummary.authenticatedPassCount}/{authoritySummary.requiredSuiteCount}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 text-xs">
          <div className="p-3 bg-[#0B0F17] border border-slate-800 rounded space-y-1">
            <div className="text-[11px] text-slate-500">Digest &amp; Evidence Binding</div>
            <div className="font-mono text-slate-300 truncate">
              Digest: {authoritySummary.targetArtifactDigest ?? 'UNAVAILABLE'}
            </div>
            <div className="text-[11px] text-slate-400 flex items-center gap-1.5">
              <ShieldAlert className="w-3.5 h-3.5 text-amber-400 shrink-0" aria-hidden="true" />
              <span>
                {authoritySummary.digestMatched
                  ? 'Authenticated evidence covers all mandatory policy suites for this digest.'
                  : `${authoritySummary.missingRequirements.length} mandatory policy requirements unverified or unbound.`}
              </span>
            </div>
          </div>

          <div className="p-3 bg-[#0B0F17] border border-slate-800 rounded space-y-1">
            <div className="text-[11px] text-slate-500">Fail-Closed Release Authorization</div>
            <div className="text-[11px] text-slate-300 flex items-start gap-1.5">
              <Lock className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" aria-hidden="true" />
              <span>
                {authoritySummary.blockingReasons[0] ??
                  'All independent suites authenticated and human APPROVED_FOR_RELEASE recorded.'}
              </span>
            </div>
            {verifications.some((v) => v.projectId === project.id && v.authenticationStatus === 'STALE') && (
              <div className="text-[11px] font-mono text-rose-300 pt-1">
                Source change detected: prior verification evidence marked STALE (fresh re-run required).
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Sub-navigation */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-[#111827] border border-slate-800/90 rounded-lg px-5 py-3">
        <div className="flex flex-wrap items-center gap-1 p-1 bg-[#090D14] border border-slate-800 rounded-md">
          <button
            type="button"
            onClick={() => setSubTab('evidence')}
            className={`px-3 py-1 text-xs font-medium rounded transition-colors ${
              subTab === 'evidence'
                ? 'bg-slate-800 text-white'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Verification &amp; Evidence
          </button>
          <button
            type="button"
            onClick={() => setSubTab('governance')}
            className={`px-3 py-1 text-xs font-medium rounded transition-colors ${
              subTab === 'governance'
                ? 'bg-slate-800 text-white'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Release Governance ({projectApprovals.length})
          </button>
          <button
            type="button"
            onClick={() => setSubTab('compliance')}
            className={`px-3 py-1 text-xs font-medium rounded transition-colors ${
              subTab === 'compliance'
                ? 'bg-slate-800 text-white'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Source Review &amp; Compliance
          </button>
        </div>

        <button
          type="button"
          onClick={() => onOpenAdvancedSection('repositories')}
          className="inline-flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-200"
        >
          <span>Inspect Repository Boundaries</span>
          <ExternalLink className="w-3.5 h-3.5" aria-hidden="true" />
        </button>
      </div>

      {subTab === 'evidence' ? (
        <VerificationView
          projects={projects}
          verifications={verifications}
          selectedProjectId={project.id}
          onSelectProject={onSelectProject}
        />
      ) : subTab === 'governance' ? (
        <ApprovalsView
          projects={projects}
          approvals={projectApprovals.length > 0 ? projectApprovals : approvals}
        />
      ) : (
        <SourceCompliancePanel
          project={project}
          projects={projects}
          onSelectProject={onSelectProject}
          verifications={verifications}
          artifacts={artifacts}
          approvals={approvals}
        />
      )}
    </div>
  );
};
