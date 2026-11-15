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

export interface VerificationSuiteRecord {
  id: string;
  projectId: string;
  suiteName: string;
  authority: VerificationSuiteAuthority;
  status: VerificationStatus;
  epistemicCondition: EpistemicCondition;
  evidenceId: string;
  sourceRevision: string;
  toolchainIdentity: string;
  executionRecord: string;
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
  | 'REJECTED'
  | 'BLOCKED';

export interface ApprovalDecisionRecord {
  id: string;
  projectId: string;
  gate: 'EXECUTION_AUTHORIZATION' | 'TECHNICAL_QUALIFICATION' | 'RELEASE_AUTHORIZATION';
  title: string;
  requiredRole: string;
  authorizedReviewer: string;
  disposition: ApprovalDisposition;
  aiPermitted: false;
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

export interface DraftChangeProposal {
  id: string;
  summary: string;
  targetElement?: PreviewElementRef;
  patch: Partial<Omit<PreviewConfigState, 'projectId' | 'lastUpdatedAt'>>;
  addWidget?: PreviewCustomWidget;
  applied: boolean;
  isSimulated: true;
  authorityNote: string;
}

export interface ConversationMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: string;
  referencedElement?: PreviewElementRef;
  draftProposal?: DraftChangeProposal;
  suggestedWorkflowAction?: {
    label: string;
    targetMode: WorkspaceMode;
  };
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

export interface OfflineQueueItem {
  id: string;
  projectId: string;
  kind: 'WORKFLOW_DISPATCH' | 'DRAFT_SYNC' | 'VERIFICATION_REQUEST';
  label: string;
  targetEndpoint: string;
  createdAt: string;
  status: 'QUEUED_LOCAL' | 'SIMULATED_LOCAL';
}

