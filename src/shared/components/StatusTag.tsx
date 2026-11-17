import React from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  History,
  Lock,
  ShieldAlert,
  Unplug,
  XCircle,
} from 'lucide-react';
import {
  ApprovalDisposition,
  ArtifactLifecycleBadge,
  ArtifactLifecycleState,
  ArtifactPreviewStatus,
  AuthoritativeEvidenceLifecycleState,
  ConnectionStatus,
  DraftProposalStatus,
  EpistemicCondition,
  HoloArchiveValidationStatus,
  IntegrationMode,
  ProjectLifecycleStatus,
  StageRunStatus,
  VerificationStatus,
  WindmillJobState,
} from '../types/foundry';

type StatusValue =
  | VerificationStatus
  | EpistemicCondition
  | ConnectionStatus
  | StageRunStatus
  | ProjectLifecycleStatus
  | ApprovalDisposition
  | ArtifactLifecycleBadge
  | ArtifactLifecycleState
  | HoloArchiveValidationStatus
  | IntegrationMode
  | ArtifactPreviewStatus
  | WindmillJobState
  | DraftProposalStatus
  | AuthoritativeEvidenceLifecycleState
  | 'CANDIDATE'
  | 'STALE'
  | 'QUEUED'
  | 'SIMULATED'
  | 'BLOCKED'
  | 'SATISFIED'
  | 'GAP'
  | 'UNTESTED'
  | 'REFUTED';

interface StatusTagProps {
  value: StatusValue;
  className?: string;
}

export const StatusTag: React.FC<StatusTagProps> = ({ value, className = '' }) => {
  let colorClasses = 'border-slate-700/80 bg-slate-900/80 text-slate-300';
  let Icon: React.ComponentType<{ className?: string }> | null = null;

  switch (value) {
    case 'PASS':
    case 'COMPLETED':
    case 'DOCUMENTED':
    case 'APPROVED_FOR_TEST_SIMULATION':
    case 'APPROVED_FOR_QUALIFICATION':
    case 'APPROVED_FOR_RELEASE':
    case 'RELEASE APPROVED':
    case 'Validated':
    case 'VERIFIED':
    case 'APPROVED':
    case 'LOCAL':
    case 'LOCAL READ-ONLY CONNECTED':
    case 'ONLINE':
    case 'SATISFIED':
      colorClasses =
        value === 'DOCUMENTED' || value === 'LOCAL'
          ? 'border-sky-500/30 bg-sky-950/40 text-sky-300'
          : 'border-emerald-500/35 bg-emerald-950/40 text-emerald-300';
      Icon = CheckCircle2;
      break;
    case 'STRUCTURAL PREFLIGHT PASS':
    case 'PREFLIGHT_CHECKED':
    case 'PREPARED':
    case 'REGISTERED':
    case 'CANDIDATE':
      colorClasses = 'border-sky-500/35 bg-sky-950/45 text-sky-300';
      Icon = Clock;
      break;
    case 'FAIL':
    case 'FAILED':
    case 'REJECTED':
    case 'CANCELLED':
    case 'REJECTED_JSON_AS_HOLO_PP3001':
    case 'INVALID_MAGIC_OR_FOOTER':
    case 'UNSUPPORTED_ARCHIVE_VERSION':
    case 'INVALID_MANIFEST':
    case 'REFUTED':
    case 'STALE':
      colorClasses = 'border-rose-500/40 bg-rose-950/45 text-rose-300';
      Icon = XCircle;
      break;
    case 'NOT VERIFIED':
    case 'UNVERIFIED':
    case 'BLOCKED':
    case 'DISABLED':
    case 'RELEASE BLOCKED':
    case 'PENDING VERIFICATION':
    case 'Pending':
    case 'INTERRUPTED':
    case 'PENDING_REVIEW':
    case 'GAP':
    case 'UNTESTED':
      colorClasses = 'border-amber-500/35 bg-amber-950/35 text-amber-300';
      Icon =
        value === 'BLOCKED' || value === 'DISABLED' || value === 'RELEASE BLOCKED'
          ? Lock
          : value === 'Pending' || value === 'PENDING_REVIEW'
            ? Clock
            : ShieldAlert;
      break;
    case 'Superseded':
    case 'BUILT':
    case 'GENERATED':
      colorClasses = 'border-violet-500/35 bg-violet-950/35 text-violet-300';
      Icon = History;
      break;
    case 'NOT CONNECTED':
    case 'UNAVAILABLE':
      colorClasses = 'border-rose-500/30 bg-rose-950/30 text-rose-300';
      Icon = Unplug;
      break;
    case 'PROPOSED':
    case 'SIMULATED':
    case 'SIMULATION COMPLETE':
    case 'DEMO':
    case 'DRAFT':
      colorClasses = 'border-indigo-500/35 bg-indigo-950/40 text-indigo-300';
      Icon = AlertTriangle;
      break;
    case 'RUNNING':
    case 'IN WORKFLOW':
      colorClasses = 'border-blue-500/40 bg-blue-950/45 text-blue-300';
      Icon = Clock;
      break;
    case 'NOT RUN':
    case 'PENDING':
    case 'DEFERRED':
    case 'INTAKE':
    case 'VERIFICATION PENDING':
    case 'REVIEW REQUIRED':
    case 'QUEUED':
    default:
      colorClasses = 'border-slate-700 bg-slate-900 text-slate-300';
      Icon = Clock;
      break;
  }

  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2 py-0.5 text-[11px] font-mono font-medium tracking-tight border rounded-sm whitespace-nowrap shrink-0 ${colorClasses} ${className}`}
    >
      {Icon && <Icon className="w-3 h-3 shrink-0" aria-hidden="true" />}
      <span>{value}</span>
    </span>
  );
};
