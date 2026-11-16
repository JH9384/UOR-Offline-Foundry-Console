export type NavigationSectionId =
  | 'overview'
  | 'projects'
  | 'workflows'
  | 'verification'
  | 'compliance'
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
  | 'specify'
  | 'lock'
  | 'check'
  | 'build'
  | 'verify'
  | 'inspect'
  | 'preview'
  | 'review'
  | 'export_release';

export type WorkflowStageContractName =
  | 'INTAKE'
  | 'SPECIFY'
  | 'LOCK'
  | 'CHECK'
  | 'BUILD'
  | 'VERIFY'
  | 'INSPECT'
  | 'PREVIEW'
  | 'REVIEW'
  | 'EXPORT_RELEASE';

export type PrismInputMode = 'NATIVE_PRISM' | 'EXISTING_RUST' | 'GUIDED_PRODUCT';

export type PrismOutputClassId =
  | 'authoritative_lex_tex'
  | 'model_prism_json'
  | 'generated_lean_proof_evidence'
  | 'lcnf_outputs'
  | 'generated_cargo_package'
  | 'core_wasm_module'
  | 'portable_view_assets'
  | 'physical_holo_archive'
  | 'build_manifests_and_digests'
  | 'independent_acceptance_records'
  | 'release_decision_records';

export type ArtifactLifecycleState =
  | 'PROPOSED'
  | 'GENERATED'
  | 'BUILT'
  | 'PREFLIGHT_CHECKED'
  | 'VERIFIED'
  | 'FAILED'
  | 'UNAVAILABLE';

export interface StageProducedArtifactRef {
  path: string;
  outputClass: PrismOutputClassId;
  sha256Digest: string;
  byteLength?: number;
  verifiedOnDisk: boolean;
}

export interface LockfilePinCheck {
  filename: 'prismpm.lock' | 'lexlean.lock' | 'standards.lock' | 'Cargo.lock';
  required: boolean;
  present: boolean;
  digestPinned: boolean;
  pinValue?: string;
  note: string;
}

export interface OfflineLockClosureReport {
  readyForOfflineRun: boolean;
  checks: LockfilePinCheck[];
  blockingReasons: string[];
  checkedAt: string;
}

export interface UorustTypedRefusal {
  code:
    | 'UNSUPPORTED_RUST_ITEM'
    | 'AMBIGUOUS_ROUTE'
    | 'UNKNOWN_FACT'
    | 'INVALID_UTF8'
    | 'REQUEST_TOO_LARGE'
    | 'BROWSER_CARGO_FORBIDDEN';
  span?: string;
  fact?: string;
  message: string;
}

export interface GuidedProductDraftSpec {
  prompt: string;
  templateId: string;
  facetCoverage: Array<{
    facet: 'arch' | 'features' | 'behavior' | 'design' | 'sec' | 'qual' | 'release';
    covered: boolean;
    ownerModule: string;
  }>;
  draftLexTexPreview: string;
  humanReviewStatus: 'PENDING_HUMAN_REVIEW' | 'APPROVED_FOR_TOOLCHAIN' | 'REJECTED';
}

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
  | 'uorust-translator'
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
  stageContractName?: WorkflowStageContractName;
  label: string;
  uorGate: UorGateId;
  status: StageRunStatus;
  executedBy: string;
  projectId?: string;
  inputSourceIdentity?: string;
  sourceRevision?: string;
  toolchainIdentity?: string;
  validatedArgs?: string[];
  executionId?: string;
  startedAt?: string;
  completedAt?: string;
  summary: string;
  resultOrDiagnostic?: string;
  commandOrContract?: string;
  fixedCommandId?: string;
  producedArtifacts?: StageProducedArtifactRef[];
  evidenceRef?: string;
  failuresOrBlockingRules?: string[];
  finalState?: StageRunStatus;
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

export type ReviewedSourceId =
  | 'rule30'
  | 'prism-devrel'
  | 'stitch'
  | 'uorust'
  | 'prismpm'
  | 'lexlean'
  | 'foundry'
  | 'hologram-live';

export type SourceIntegrationStatus =
  | 'REFERENCE ONLY'
  | 'CANDIDATE'
  | 'QUALIFIED'
  | 'CONNECTED';

export type ClaimEpistemicState =
  | 'proved'
  | 'built'
  | 'tested'
  | 'observed'
  | 'untested'
  | 'blocked'
  | 'refuted';

export interface ClaimRegisterEntry {
  id: string;
  statement: string;
  state: ClaimEpistemicState;
  mechanism: string;
  limitationOrBlocker?: string;
}

export interface ReviewedSourceRecord {
  id: ReviewedSourceId;
  name: string;
  owner: string;
  canonicalUrl: string;
  reviewedCommitSha: string;
  reviewedCommitDate: string;
  relevantPaths: string[];
  licenseSpdx: string;
  attributionNotice: string;
  documentedCapabilities: string[];
  intendedUorUse: string;
  verificationMechanisms: string[];
  claimOrAcceptanceIds: string[];
  claims: ClaimRegisterEntry[];
  testEvidenceAndLimitations: string[];
  securityAndQualityRequirements: string[];
  dependenciesAndOfflineAvailability: string[];
  openIssuesAndBlockers: string[];
  integrationStatus: SourceIntegrationStatus;
}

export interface ProjectSourcePin {
  sourceId: ReviewedSourceId;
  commitSha: string;
  role: string;
}

export interface ProjectComplianceRequirement {
  id: string;
  sourceId: ReviewedSourceId;
  acceptanceId: string;
  sourceUrl: string;
  pinnedRevision: string;
  title: string;
  applicable: boolean;
  applicabilityRationale: string;
  applicableVerifier: string;
  executionIdentity: string;
  evidenceRecord: string;
  evaluationResult: 'PASS' | 'FAIL' | 'BLOCKED' | 'UNTESTED' | 'REFUTED' | 'NOT APPLICABLE';
  satisfied: boolean;
  statusLabel: 'SATISFIED' | 'GAP' | 'BLOCKED' | 'NOT APPLICABLE';
  gapReason?: string;
}

export interface ProjectComplianceAssessment {
  projectId: string;
  sourceIds: ReviewedSourceId[];
  pinnedRevisions: Array<{
    sourceId: ReviewedSourceId;
    name: string;
    repositoryUrl: string;
    commitSha: string;
    licenseSpdx: string;
    status: SourceIntegrationStatus;
  }>;
  requirements: ProjectComplianceRequirement[];
  verificationEvidenceSummary: string;
  coverageGaps: string[];
  currentQualificationState: 'NOT VERIFIED' | 'VERIFIED';
  releaseBlockers: string[];
  assessedAt: string;
}

export type ProjectTemplateId =
  | 'formal-research'
  | 'prism-product'
  | 'rust-workspace-model';

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
  sourceRefs: ProjectSourcePin[];
  previewMeta?: {
    primaryActionLabel: string;
    subtitle: string;
    customWidgets: Array<{ id: string; label: string; kind: 'metric' | 'action' | 'note'; value: string }>;
  };
}

export interface ProjectRecord {
  id: string;
  name: string;
  inputMode?: PrismInputMode;
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
  sourceRefs?: ProjectSourcePin[];
  templateOriginId?: ProjectTemplateId;
  lockfilesDeclared?: string[];
  guidedProductDraft?: GuidedProductDraftSpec;
  uorustRefusals?: UorustTypedRefusal[];
  authoringWorkspace?: ProjectAuthoringWorkspace;
}

export interface EngineeringIntakePayload {
  projectName: string;
  inputMode?: PrismInputMode;
  productFamily: ProductFamily;
  componentId: EngineeringComponentId;
  workflowId: string;
  purpose: string;
  declaredInputs: string;
  environmentDeclaration: string;
  sourceRevision: string;
  acknowledgeBoundary: boolean;
  sourceRefs?: ProjectSourcePin[];
  templateOriginId?: ProjectTemplateId;
  lockfilesDeclared?: string[];
  guidedPrompt?: string;
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

export type HoloArchiveValidationStatus =
  | 'STRUCTURAL PREFLIGHT PASS'
  | 'UNSUPPORTED_ARCHIVE_VERSION'
  | 'INVALID_MANIFEST'
  | 'REJECTED_JSON_AS_HOLO_PP3001'
  | 'INVALID_MAGIC_OR_FOOTER'
  | 'UNINSPECTED';

export type TrustLayerOutcome = 'PASS' | 'FAIL' | 'NOT_RUN_IN_BROWSER' | 'INCOMPLETE_UPSTREAM' | 'BLOCKED';

export interface HoloVerificationTrustLayers {
  structuralPreflight: 'PASS' | 'FAIL';
  contentDigestValidation: 'PASS' | 'FAIL' | 'UNVERIFIED_DIGEST';
  archiveFormatParsing: 'PASS' | 'FAIL';
  independentHologramVerification: 'NOT_RUN_IN_BROWSER' | 'PASS' | 'FAIL';
  prismPmAcceptance: 'INCOMPLETE_UPSTREAM' | 'PASS' | 'FAIL';
  productionReleaseAuthorization: 'BLOCKED' | 'APPROVED_FOR_RELEASE';
  isSyntheticFixture: boolean;
}

export interface ArtifactProvenanceRecord {
  id: string;
  projectId: string;
  artifactName: string;
  artifactFormat: string;
  outputClass: PrismOutputClassId;
  artifactState: ArtifactLifecycleState;
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
  byteLength?: number;
  fragmentRecoverySpec?: '2-of-3-xor-sha256-planned' | 'none';
  custodyBoundaryNote?: string;
  isSyntheticFixture?: boolean;
  previewContent?: string;
  /**
   * Direct binary/source/evidence download gating.
   * Downloads of `.holo`, Core-Wasm, HOLOVIEW, generated source, or evidence bundles
   * are disabled unless a verified tool-produced file exists with verified SHA-256
   * AND artifactState === 'VERIFIED'.
   */
  fileExistsOnDisk?: boolean;
  sha256Verified?: boolean;
  archiveValidationStatus?: HoloArchiveValidationStatus;
  coreWasmContract?: string;
  viewProfile?: string;
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

export type AuthoritativeEvidenceLifecycleState =
  | 'PREPARED'
  | 'REGISTERED'
  | 'RUNNING'
  | 'BUILT'
  | 'VERIFIED'
  | 'BLOCKED'
  | 'RELEASE APPROVED';

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
  registeredRunnables?: string[];
  registeredFlows?: string[];
  wmillContractStatus?:
    | 'WMILL_TS_NOT_GENERATED'
    | 'WMILL_CONTRACT_VALIDATED'
    | 'LOCAL_PROXY_VALIDATED';
  readOnlyHealthVerified?: boolean;
  dispatchEnabled?: boolean;
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

export type WindmillDiagnosticCode =
  | 'NOT_CONNECTED'
  | 'AUTH_NOT_VALIDATED'
  | 'FLOW_UNREGISTERED'
  | 'SANDBOX_ISOLATED'
  | 'INVALID_SOURCE_PACKAGE_HASH'
  | 'DUPLICATE_JOB_RESPONSE'
  | 'STALE_JOB_RESPONSE';

export interface WindmillConnectionDiagnostic {
  timestamp: string;
  endpoint: string;
  workspace: string;
  code: WindmillDiagnosticCode;
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
  stateSha256?: string;
  semanticReplayScope?: 'DETERMINISTIC_PURE_STATE_ONLY';
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
    | 'AIR_GAPPED_BUNDLE_EXPORT'
    | 'SOURCE_DRAFT_EDIT'
    | 'SOURCE_PACKAGE_EXPORT';
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

export type AuthoringFileKind =
  | 'lex_tex'
  | 'prismpm_toml'
  | 'lexlean_toml'
  | 'lockfile'
  | 'routes_toml'
  | 'facets_json'
  | 'views_json'
  | 'acceptance_json'
  | 'cargo_toml'
  | 'frontier_toml';

export type AuthoringSyntaxLanguage = 'lextex' | 'toml' | 'json' | 'rust';

export interface AuthoringSourceFile {
  path: string;
  kind: AuthoringFileKind;
  language: AuthoringSyntaxLanguage;
  content: string;
  sha256?: string;
  lastEditedAt: string;
  lastEditedBy: string;
  revisionNote?: string;
  isAuthoritativeInput: boolean;
}

export interface PreliminarySourceDiagnostic {
  id: string;
  filePath: string;
  line: number;
  severity: 'error' | 'warning' | 'info';
  code: string;
  message: string;
  isPreliminaryBrowserCheck: true;
}

export interface SourceRevisionEntry {
  revisionId: string;
  sourceRevision: string;
  summary: string;
  timestamp: string;
  author: string;
  changedFiles: string[];
  invalidatedVerification: boolean;
}

export interface SourceFileCheckpoint {
  id: string;
  projectId: string;
  name: string;
  createdAt: string;
  sourceRevision: string;
  filesSnapshot: AuthoringSourceFile[];
  stateSha256: string;
}

export interface AiSourceProposal {
  id: string;
  targetFilePath: string;
  summary: string;
  rationale: string;
  proposedContent: string;
  status: 'PENDING_REVIEW' | 'APPROVED' | 'REJECTED';
  createdAt: string;
  decidedAt?: string;
  isSimulated: true;
  authorityNote: string;
}

export interface ProjectAuthoringWorkspace {
  journeyType: 'PRISM_APPLICATION' | 'RUST_WORKSPACE' | 'FORMAL_RESEARCH';
  files: AuthoringSourceFile[];
  revisionHistory: SourceRevisionEntry[];
  checkpoints: SourceFileCheckpoint[];
  pendingAiProposals: AiSourceProposal[];
  capabilitiesDeclared: string[];
  acceptanceCriteria: string[];
  requiredToolchain: string[];
  expectedOutputClasses: PrismOutputClassId[];
  reviewStatus: 'DRAFT_UNREVIEWED' | 'OPERATOR_REVIEWED_FOR_HANDOFF';
  lastReviewedAt?: string;
}

export type SourcePackageDestination =
  | 'MAC_STUDIO_UOR_OFFLINE_FOUNDRY'
  | 'AIR_GAPPED_PHYSICAL_MEDIA';

export interface FoundrySourcePackageFileEntry {
  path: string;
  kind: AuthoringFileKind;
  language: AuthoringSyntaxLanguage;
  content: string;
  sha256: string;
  byteLength: number;
  isAuthoritativeInput: boolean;
}

export interface FoundrySourcePackageManifest {
  schema: 'uor.foundry.source-package.v1';
  packageId: string;
  packageClassification: 'UNVERIFIED_AUTHORED_SOURCE_PACKAGE';
  isHoloArchive: false;
  isCompilerGeneratedOutput: false;
  projectId: string;
  projectName: string;
  productFamily: ProductFamily;
  inputMode: PrismInputMode;
  journeyType: ProjectAuthoringWorkspace['journeyType'];
  sourceRevision: string;
  createdAt: string;
  exportedBy: string;
  targetDestination: SourcePackageDestination;
  targetWindmillWorkspace: 'uor-offline-foundry';
  reviewConfirmed: true;
  reviewSummary: string;
  reviewStatus: ProjectAuthoringWorkspace['reviewStatus'];
  lockfileRefs: string[];
  requiredToolchain: string[];
  inputHashes: Record<string, string>;
  capabilitiesAndPermissions: string[];
  acceptanceCriteria: string[];
  expectedOutputClasses: PrismOutputClassId[];
  files: FoundrySourcePackageFileEntry[];
  packageDigestSha256: string;
  securityDisclaimer: string;
}


