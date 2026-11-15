export type NavigationSectionId =
  | 'overview'
  | 'projects'
  | 'workflows'
  | 'verification'
  | 'ai-assistance'
  | 'artifacts'
  | 'approvals'
  | 'connections'
  | 'repositories';

/**
 * Epistemic classification required across all console claims and integrations.
 */
export type EpistemicCondition = 'DOCUMENTED' | 'PROPOSED' | 'UNVERIFIED';

export type VerificationStatus = 'PASS' | 'FAIL' | 'NOT RUN' | 'NOT VERIFIED';

export type ConnectionStatus = 'NOT CONNECTED' | 'PENDING VERIFICATION';

export type ProductFamily =
  | 'application'
  | 'formal-verification'
  | 'scientific-computation'
  | 'other';

export type WorkflowStageId =
  | 'intake'
  | 'plan'
  | 'build'
  | 'test'
  | 'verify'
  | 'review'
  | 'package'
  | 'release';

export type UorGateId =
  | 'REGISTER'
  | 'REVIEW'
  | 'AUTHORIZE TEST'
  | 'EXECUTE'
  | 'VERIFY EVIDENCE'
  | 'QUALIFY'
  | 'REVIEW RELEASE';

export type StageRunStatus =
  | 'PENDING'
  | 'RUNNING'
  | 'COMPLETED'
  | 'FAILED'
  | 'BLOCKED'
  | 'SKIPPED';

export type ProjectLifecycleStatus =
  | 'INTAKE'
  | 'IN WORKFLOW'
  | 'VERIFICATION PENDING'
  | 'REVIEW REQUIRED'
  | 'RELEASE BLOCKED'
  | 'SIMULATION COMPLETE';

export type EngineeringComponentId =
  | 'prismpm-calculator'
  | 'lexlean-compiler'
  | 'lexlean-mcp-gateway'
  | 'uor-framework-ontology'
  | 'prism-stdlib'
  | 'forge-kernel'
  | 'hologram-forge-core';

export interface EngineeringComponent {
  id: EngineeringComponentId;
  name: string;
  repositoryName: string;
  repositoryUrl?: string;
  ownershipBoundary: string;
  epistemicCondition: EpistemicCondition;
  documentedCommand?: string;
  defaultWorkflowId: string;
  supportedFamilies: ProductFamily[];
  notes: string;
}

export interface WorkflowStageTemplate {
  id: WorkflowStageId;
  label: string;
  uorGate: UorGateId;
  ownerBoundary: string;
  description: string;
  failClosedRule: string;
  documentedSource: string;
  epistemicCondition: EpistemicCondition;
}

export interface WorkflowDefinition {
  id: string;
  name: string;
  sourceReference: string;
  epistemicCondition: EpistemicCondition;
  description: string;
  supportedFamilies: ProductFamily[];
  windmillFlowPath: string;
  stages: WorkflowStageTemplate[];
}

export interface StageExecutionRecord {
  stageId: WorkflowStageId;
  label: string;
  uorGate: UorGateId;
  status: StageRunStatus;
  executedBy: string;
  startedAt?: string;
  completedAt?: string;
  summary: string;
  commandOrContract?: string;
  isSimulated: boolean;
}

export interface WorkflowRun {
  id: string;
  projectId: string;
  workflowId: string;
  workflowName: string;
  currentStageId: WorkflowStageId;
  overallStatus: 'QUEUED' | 'RUNNING' | 'BLOCKED' | 'FAILED' | 'COMPLETED';
  executionMode: 'BROWSER_SIMULATION';
  windmillTargetPath: string;
  startedAt: string;
  updatedAt: string;
  stages: StageExecutionRecord[];
}

export type ProjectTemplateId =
  | 'application'
  | 'formal-verification'
  | 'scientific-computation';

export interface ProjectTemplateSpec {
  id: ProjectTemplateId;
  title: string;
  productFamily: ProductFamily;
  componentId: EngineeringComponentId;
  workflowId: string;
  defaultNamePrefix: string;
  purpose: string;
  declaredInputs: string;
  environmentDeclaration: string;
  sourceRevision: string;
  description: string;
}

export interface ProjectRecord {
  id: string;
  name: string;
  productFamily: ProductFamily;
  componentId: EngineeringComponentId;
  workflowId: string;
  purpose: string;
  declaredInputs: string;
  environmentDeclaration: string;
  sourceRevision: string;
  lifecycleStatus: ProjectLifecycleStatus;
  createdAt: string;
  updatedAt: string;
  lastOpenedAt?: string;
  archived?: boolean;
  isSyntheticDemo: boolean;
  acceptancePolicySchema: string;
  releaseBlockedReasons: string[];
}

export interface EngineeringIntakePayload {
  projectName: string;
  productFamily: ProductFamily;
  componentId: EngineeringComponentId;
  workflowId: string;
  purpose: string;
  declaredInputs: string;
  environmentDeclaration: string;
  sourceRevision: string;
  acknowledgeBoundary: boolean;
}

export type VerificationSuiteAuthority =
  | 'LexLean'
  | 'PrismPM'
  | 'Forge Kernel'
  | 'Hologram Forge Application Core'
  | 'Browser & Identity Acceptance Suites';

export type EvidenceAuthenticationStatus =
  | 'AUTHENTICATED_BY_VERIFIER'
  | 'UNAUTHENTICATED'
  | 'SIMULATED_ONLY'
  | 'STALE';

export interface VerificationPolicySuiteRequirement {
  authority: VerificationSuiteAuthority;
  suiteId: string;
  suiteLabel: string;
  minSuiteVersion: string;
}

export interface VerificationPolicy {
  policyId: string;
  policyVersion: string;
  productFamily: ProductFamily;
  description: string;
  requiredSuites: VerificationPolicySuiteRequirement[];
}

export interface VerificationSuiteRecord {
  id: string;
  projectId: string;
  suiteId?: string;
  suiteVersion?: string;
  suiteName: string;
  authority: VerificationSuiteAuthority;
  status: VerificationStatus;
  epistemicCondition: EpistemicCondition;
  evidenceId: string;
  sourceRevision: string;
  toolchainIdentity: string;
  executionRecord: string;
  authenticExecutionRef?: string;
  evidenceProvenance?: string;
  authenticationStatus?: EvidenceAuthenticationStatus;
  policyVersion?: string;
  artifactHash?: string;
  lastCheckedAt?: string;
  isSimulated: boolean;
  blockingForRelease: boolean;
  notes: string;
}

export type ArtifactLifecycleBadge = 'Validated' | 'Pending' | 'Superseded';

export interface ArtifactProvenanceRecord {
  id: string;
  projectId: string;
  artifactName: string;
  artifactFormat: string;
  sha256Digest: string;
  digestMode: 'SYNTHETIC_DEMO_DIGEST' | 'DOCUMENTED_REFERENCE_DIGEST' | 'UNAVAILABLE';
  provenanceStatus?: ArtifactLifecycleBadge;
  sourceRevision: string;
  inputDependencies: string[];
  toolchainIdentity: string;
  evidenceRefs: string[];
  releaseReadiness: 'BLOCKED' | 'SIMULATED_ONLY' | 'NOT_ASSESSED';
  blockingReasons: string[];
  createdAt: string;
}

export type ApprovalDisposition =
  | 'PENDING'
  | 'DEFERRED'
  | 'APPROVED_FOR_TEST_SIMULATION'
  | 'APPROVED_FOR_QUALIFICATION'
  | 'APPROVED_FOR_RELEASE'
  | 'REJECTED'
  | 'BLOCKED';

export type AuthorizationScope =
  | 'TEST_EXECUTION'
  | 'TECHNICAL_QUALIFICATION'
  | 'PRODUCTION_RELEASE';

export interface ApprovalDecisionRecord {
  id: string;
  projectId: string;
  gate: 'EXECUTION_AUTHORIZATION' | 'TECHNICAL_QUALIFICATION' | 'RELEASE_AUTHORIZATION';
  authorizationScope?: AuthorizationScope;
  title: string;
  requiredRole: string;
  authorizedReviewer: string;
  authenticatedApproverId?: string;
  disposition: ApprovalDisposition;
  aiPermitted: false;
  isSimulated?: boolean;
  artifactDigest?: string;
  sourceRevision?: string;
  evidenceRefs?: string[];
  policyVersion?: string;
  rationale: string;
  decidedAt?: string;
  policyReference: string;
}

export interface AiAdvisoryEntry {
  id: string;
  projectId?: string;
  category: 'research' | 'planning' | 'interpretation' | 'workflow-recommendation';
  promptSummary: string;
  responseSummary: string;
  recommendedWorkflowId?: string;
  observations: string[];
  citedRepositories: string[];
  generatedAt: string;
  isSimulated: true;
  targetRuntimeNote: string;
}

export interface SystemConnectionRecord {
  id: string;
  name: string;
  category: 'Orchestration' | 'AI Runtime' | 'Source Control' | 'Compiler & MCP' | 'Engineering Core' | 'Verification';
  status: ConnectionStatus;
  epistemicCondition: EpistemicCondition;
  targetEndpoint: string;
  workspaceOrScope: string;
  authMode: string;
  capabilities: string[];
  diagnosticNote: string;
}

export interface RepositoryReferenceRecord {
  id: string;
  name: string;
  owner: string;
  canonicalUrl: string;
  role: string;
  epistemicCondition: EpistemicCondition;
  accessVerified: boolean;
  observedCapabilities: string[];
  documentedInterfaces: string[];
  existingTemplatesOrWorkflows: string[];
  dependencies: string[];
  verificationMechanisms: string[];
  missingOrUnclear: string[];
  consoleIntegrationPoints: string[];
}

export interface ActivityEvent {
  id: string;
  timestamp: string;
  actor: string;
  category: 'INTAKE' | 'WORKFLOW' | 'VERIFICATION' | 'GOVERNANCE' | 'ADVISORY';
  projectId?: string;
  summary: string;
  isSimulated: boolean;
}

export type IntegrationMode = 'DEMO' | 'LOCAL' | 'ONLINE';

export type ConnectivityProfile =
  | 'OFFLINE_ONLY'
  | 'LOCAL_CONNECTED'
  | 'ONLINE_AUTHORIZED'
  | 'AIR_GAPPED_TRANSFER';

export type WindmillDeploymentOption =
  | 'VITE_AUTHENTICATED_LOCAL_PROXY'
  | 'WINDMILL_NATIVE_WMILL_TS';

export type WindmillJobState =
  | 'QUEUED'
  | 'RUNNING'
  | 'COMPLETED'
  | 'FAILED'
  | 'CANCELLED'
  | 'INTERRUPTED';

export interface WindmillHealthStatus {
  mode: IntegrationMode;
  deploymentOption: WindmillDeploymentOption;
  workspace: string;
  endpoint: string;
  reachable: boolean;
  authenticated: boolean;
  permissionsValidated: boolean;
  checkedAt: string;
  diagnosticMessage: string;
}

export interface WindmillJobIdentity {
  jobId: string;
  workspace: string;
  flowPath: string;
  flowVersion: string;
  submittedAt: string;
  idempotencyKey: string;
}

export interface WindmillExecutionRequest {
  requestId: string;
  idempotencyKey: string;
  projectId: string;
  workflowId: string;
  flowPath: string;
  flowVersion: string;
  sourceRevision: string;
  operatorApproved: boolean;
  requestedAt: string;
}

export interface WindmillJobRecord {
  jobId: string;
  projectId: string;
  workflowId: string;
  workflowName: string;
  flowPath: string;
  flowVersion: string;
  flowRegisteredInWorkspace: boolean;
  sourceRevision: string;
  state: WindmillJobState;
  startedAt: string;
  completedAt?: string;
  durationMs?: number;
  logs: string[];
  structuredResult?: Record<string, unknown>;
  artifactRefs: string[];
  evidenceRefs: string[];
  retryAvailable: boolean;
  idempotencyKey: string;
  isSyntheticFixture: boolean;
}

export interface VerifiedEvidenceRef {
  evidenceId: string;
  authority: VerificationSuiteAuthority;
  artifactDigest: string;
  sourceRevision: string;
  status: VerificationStatus;
  verifiedAt?: string;
  isAuthoritative: boolean;
}

export interface WindmillConnectionDiagnostic {
  timestamp: string;
  endpoint: string;
  workspace: string;
  code: 'NOT_CONNECTED' | 'AUTH_NOT_VALIDATED' | 'FLOW_UNREGISTERED' | 'SANDBOX_ISOLATED';
  message: string;
  browserNavigatorOnline: boolean;
}

export type WorkspaceMode = 'chat' | 'preview' | 'build' | 'verify';

export interface PreviewElementRef {
  elementId: string;
  label: string;
  region: string;
  currentSummary: string;
}

export interface PreviewCustomWidget {
  id: string;
  label: string;
  kind: 'metric' | 'action' | 'note';
  value: string;
}

export interface PreviewConfigState {
  projectId: string;
  appTitle: string;
  subtitle: string;
  layoutDensity: 'comfortable' | 'compact';
  showProvenanceFooter: boolean;
  showMonospaceOutputs: boolean;
  primaryActionLabel: string;
  draftBannerNote?: string;
  customWidgets: PreviewCustomWidget[];
  lastUpdatedAt: string;
}

export type DraftProposalStatus = 'PENDING_REVIEW' | 'APPROVED' | 'REJECTED';

export interface DraftDiffField {
  field: string;
  label: string;
  before: string;
  after: string;
}

export interface DraftHistoryEntry {
  id: string;
  projectId: string;
  summary: string;
  timestamp: string;
  source: 'proposal' | 'checkpoint-restore' | 'undo' | 'redo' | 'reset';
  before: PreviewConfigState;
  after: PreviewConfigState;
}

export interface ProjectCheckpoint {
  id: string;
  projectId: string;
  name: string;
  createdAt: string;
  note?: string;
  preview: PreviewConfigState;
}

export interface DraftChangeProposal {
  id: string;
  summary: string;
  targetElement?: PreviewElementRef;
  patch: Partial<Omit<PreviewConfigState, 'projectId' | 'lastUpdatedAt'>>;
  addWidget?: PreviewCustomWidget;
  status?: DraftProposalStatus;
  applied: boolean;
  decidedAt?: string;
  isSimulated: true;
  authorityNote: string;
}

export type ChatProviderKind = 'MOCK_PREVIEW_PROVIDER' | 'WINDMILL_LM_STUDIO_RUNNABLE';

export type ChatGenerationState = 'IDLE' | 'GENERATING' | 'CANCELLED' | 'ERROR';

export interface ConversationMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: string;
  providerKind?: ChatProviderKind;
  referencedElement?: PreviewElementRef;
  draftProposal?: DraftChangeProposal;
  suggestedWorkflowAction?: {
    label: string;
    targetMode: WorkspaceMode;
  };
  errorDetail?: string;
  failed?: boolean;
  cancelled?: boolean;
  streaming?: boolean;
  retryPrompt?: string;
  isSimulated: boolean;
}

export interface ConversationThread {
  id: string;
  projectId: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  messages: ConversationMessage[];
}

export type ArtifactPreviewKind =
  | 'ui-build'
  | 'document'
  | 'json-artifact'
  | 'workflow-output'
  | 'image-diagram'
  | 'validation-report';

export type ArtifactPreviewStatus = 'DEMO' | 'DRAFT' | 'BUILT' | 'VERIFIED' | 'UNAVAILABLE';

export interface ArtifactPreviewPayload {
  id: string;
  projectId: string;
  kind: ArtifactPreviewKind;
  title: string;
  subtitle: string;
  status: ArtifactPreviewStatus;
  originLabel: string;
  isSandboxed: true;
  isAuthoritativeEvidence: false;
  contentText?: string;
  jsonPayload?: Record<string, unknown>;
  diagramNodes?: Array<{ id: string; label: string; gate?: string; status: string }>;
  reportItems?: Array<{ label: string; authority: string; status: VerificationStatus; detail: string }>;
  unavailableReason?: string;
  sourceRevision: string;
}

export type OperationSyncState =
  | 'LOCAL_ONLY'
  | 'PENDING_SYNC'
  | 'CONFLICT'
  | 'SYNCED'
  | 'AIR_GAPPED_EXPORTED';

export interface DurableOperation {
  operationId: string;
  projectId: string;
  kind:
    | 'PROJECT_DRAFT_SAVE'
    | 'CONVERSATION_TURN'
    | 'DRAFT_APPROVAL'
    | 'WORKFLOW_INTENT_STAGED'
    | 'AIR_GAPPED_BUNDLE_EXPORT';
  label: string;
  revision: number;
  timestamp: string;
  syncState: OperationSyncState;
  autoReplayPermitted: false;
  note: string;
}

export interface SyncConflictRecord {
  conflictId: string;
  entityType: 'PROJECT' | 'CONVERSATION' | 'DRAFT' | 'ARTIFACT_REF';
  entityId: string;
  localRevision: number;
  remoteRevision: string;
  detectedAt: string;
  summary: string;
  resolution: 'UNRESOLVED' | 'KEEP_LOCAL' | 'ACCEPT_REMOTE_METADATA';
}

export interface SanitizedAirGappedProject {
  projectId: string;
  approvedTitle: string;
  productFamily: ProductFamily;
  workflowId: string;
  sourceRevision: string;
  lifecycleStatus: ProjectLifecycleStatus;
  acceptancePolicySchema: string;
}

export interface SanitizedAirGappedArtifactRef {
  artifactId: string;
  projectId: string;
  artifactName: string;
  artifactFormat: string;
  sha256Digest: string;
  digestMode: 'DOCUMENTED_REFERENCE_DIGEST';
  sourceRevision: string;
}

export interface SanitizedAirGappedOperationRef {
  operationId: string;
  projectId: string;
  kind: DurableOperation['kind'];
  revision: number;
  timestamp: string;
  syncState: OperationSyncState;
}

export interface AirGappedExportPreview {
  schema: 'uor.foundry.air-gapped-bundle.v2';
  transferClassification: 'UNENCRYPTED_UNSIGNED_METADATA_ONLY';
  includedCategories: Array<{
    category: 'projects' | 'workflowMetadata' | 'artifactDigests' | 'operationRefs';
    count: number;
    description: string;
  }>;
  excludedCategories: string[];
  importPolicyStatus: 'DISABLED_NO_VALIDATED_POLICY';
  securityDisclaimer: string;
}

export interface AirGappedTransferBundle {
  schema: 'uor.foundry.air-gapped-bundle.v2';
  bundleId: string;
  exportedAt: string;
  workspace: 'uor-offline-foundry';
  integrationMode: IntegrationMode;
  transferClassification: 'UNENCRYPTED_UNSIGNED_METADATA_ONLY';
  importDisabled: true;
  autoReplayPermitted: false;
  operatorConfirmed: true;
  manifest: {
    includedCategories: string[];
    excludedCategories: string[];
    counts: {
      projects: number;
      artifactDigests: number;
      operationRefs: number;
    };
  };
  projects: SanitizedAirGappedProject[];
  artifactDigests: SanitizedAirGappedArtifactRef[];
  operationRefs: SanitizedAirGappedOperationRef[];
  securityDisclaimer: string;
}

export interface OfflineQueueItem {
  id: string;
  projectId: string;
  kind: 'WORKFLOW_DISPATCH' | 'DRAFT_SYNC' | 'VERIFICATION_REQUEST' | 'DRAFT_STAGED';
  label: string;
  targetEndpoint: string;
  createdAt: string;
  status: 'QUEUED_LOCAL' | 'SIMULATED_LOCAL' | 'STAGED_LOCAL';
  revision?: number;
  idempotencyKey?: string;
  retryRequiresConfirmation?: true;
  autoReplayPermitted?: false;
}

export interface WorkspaceBackupBundle {
  schema: 'uor.foundry.workspace-backup.v1';
  backupId: string;
  exportedAt: string;
  backupClassification: 'LOCAL_BROWSER_BACKUP_NON_AUTHORITATIVE';
  warning: string;
  snapshot: Record<string, unknown>;
}

