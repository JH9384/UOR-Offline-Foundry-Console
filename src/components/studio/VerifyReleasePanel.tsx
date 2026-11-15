import React, { useState } from 'react';
import { ExternalLink } from 'lucide-react';
import {
  ApprovalDecisionRecord,
  NavigationSectionId,
  ProjectRecord,
  VerificationSuiteRecord,
} from '../../types/foundry';
import { ApprovalsView } from '../views/ApprovalsView';
import { VerificationView } from '../views/VerificationView';

interface VerifyReleasePanelProps {
  project: ProjectRecord;
  projects: ProjectRecord[];
  verifications: VerificationSuiteRecord[];
  approvals: ApprovalDecisionRecord[];
  onSelectProject: (projectId: string) => void;
  onOpenAdvancedSection: (section: NavigationSectionId) => void;
}

export const VerifyReleasePanel: React.FC<VerifyReleasePanelProps> = ({
  project,
  projects,
  verifications,
  approvals,
  onSelectProject,
  onOpenAdvancedSection,
}) => {
  const [subTab, setSubTab] = useState<'evidence' | 'governance'>('evidence');

  const projectApprovals = approvals.filter((a) => a.projectId === project.id);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3 bg-[#111827] border border-slate-800/90 rounded-lg px-5 py-3">
        <div className="flex items-center gap-1 p-1 bg-[#090D14] border border-slate-800 rounded-md">
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
      ) : (
        <ApprovalsView
          projects={projects}
          approvals={projectApprovals.length > 0 ? projectApprovals : approvals}
        />
      )}
    </div>
  );
};
