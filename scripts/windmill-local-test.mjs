import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

/**
 * Minimal Local Windmill Read-Only Acceptance Test Runner
 *
 * Connects to http://127.0.0.1:8080 (workspace `uor-offline-foundry`) using
 * a locally supplied `WINDMILL_TOKEN` environment variable.
 *
 * Security & Operational Guarantees:
 * - Zero external dependencies (uses built-in Node.js fetch).
 * - Never commits, prints, or logs `WINDMILL_TOKEN` (redacts token from all diagnostics).
 * - Restricts target host strictly to loopback (`127.0.0.1` or `localhost`) so bearer tokens
 *   are never transmitted to remote hosts.
 * - Exercises deployed read-only scripts AND live read-only job listing/status APIs:
 *   1. `u/admin/worker_smoke_test`
 *   2. `u/admin/runtime_health`
 *   3. `u/admin/intake_validate`
 *   4. `u/admin/job_status`
 *   5. `GET /api/w/uor-offline-foundry/jobs/list` (live read-only job listing)
 *   6. `GET /api/w/uor-offline-foundry/jobs_u/get/{jobId}` (live read-only job status & result)
 * - Does not invoke destructive operations, compiler dispatch, workflow execution,
 *   triggers, or production release.
 */

export const DEFAULT_WINDMILL_BASE_URL = 'http://127.0.0.1:8080';
export const TARGET_WINDMILL_WORKSPACE = 'uor-offline-foundry';

export const DEPLOYED_READ_ONLY_SCRIPTS = {
  workerSmokeTest: 'u/admin/worker_smoke_test',
  runtimeHealth: 'u/admin/runtime_health',
  intakeValidate: 'u/admin/intake_validate',
  jobStatus: 'u/admin/job_status',
};

export function redactToken(text, token) {
  const raw = String(text ?? '');
  if (!token || typeof token !== 'string' || token.trim().length === 0) {
    return raw;
  }
  const trimmed = token.trim();
  return raw.split(trimmed).join('[REDACTED_WINDMILL_TOKEN]');
}

export function validateLocalBaseUrl(baseUrl) {
  let parsed;
  try {
    parsed = new URL(baseUrl);
  } catch {
    throw new Error(`Invalid Windmill base URL: "${baseUrl}". Expected "${DEFAULT_WINDMILL_BASE_URL}".`);
  }
  if (parsed.protocol !== 'http:' || (parsed.hostname !== '127.0.0.1' && parsed.hostname !== 'localhost')) {
    throw new Error(
      `Refusing non-loopback Windmill base URL "${baseUrl}". Local acceptance runner only permits http://127.0.0.1:8080 or http://localhost:8080.`
    );
  }
  return parsed.origin;
}

export function isSmokeTestPassPayload(payload) {
  if (typeof payload === 'string') {
    return payload.includes('RUNTIME_SMOKE_TEST_PASS');
  }
  if (payload && typeof payload === 'object') {
    if (
      payload.status === 'RUNTIME_SMOKE_TEST_PASS' ||
      payload.result === 'RUNTIME_SMOKE_TEST_PASS' ||
      payload.code === 'RUNTIME_SMOKE_TEST_PASS' ||
      payload.smokeTest === 'RUNTIME_SMOKE_TEST_PASS' ||
      payload.message === 'RUNTIME_SMOKE_TEST_PASS'
    ) {
      return true;
    }
    return JSON.stringify(payload).includes('RUNTIME_SMOKE_TEST_PASS');
  }
  return false;
}

export async function invokeWindmillScript({
  baseUrl = DEFAULT_WINDMILL_BASE_URL,
  workspace = TARGET_WINDMILL_WORKSPACE,
  token,
  scriptPath,
  args = {},
  fetchImpl = globalThis.fetch,
}) {
  if (!token || typeof token !== 'string' || token.trim().length === 0) {
    throw new Error('Missing required WINDMILL_TOKEN environment variable.');
  }
  const origin = validateLocalBaseUrl(baseUrl);
  const endpoint = `${origin}/api/w/${encodeURIComponent(workspace)}/jobs/run_wait_result/p/${scriptPath}`;

  let response;
  try {
    response = await fetchImpl(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token.trim()}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(args),
    });
  } catch (err) {
    const safeMsg = redactToken(err instanceof Error ? err.message : String(err), token);
    throw new Error(`Network failure calling ${scriptPath} at ${origin}: ${safeMsg}`);
  }

  const rawText = await response.text();
  let parsedBody = rawText;
  if (rawText.trim().length > 0) {
    try {
      parsedBody = JSON.parse(rawText);
    } catch {
      parsedBody = rawText.trim();
    }
  }

  return {
    ok: response.ok,
    status: response.status,
    body: parsedBody,
    rawText: redactToken(rawText, token),
  };
}

export async function invokeWindmillReadOnlyGet({
  baseUrl = DEFAULT_WINDMILL_BASE_URL,
  token,
  apiPath,
  fetchImpl = globalThis.fetch,
}) {
  if (!token || typeof token !== 'string' || token.trim().length === 0) {
    throw new Error('Missing required WINDMILL_TOKEN environment variable.');
  }
  const origin = validateLocalBaseUrl(baseUrl);
  const endpoint = `${origin}${apiPath.startsWith('/') ? apiPath : `/${apiPath}`}`;

  let response;
  try {
    response = await fetchImpl(endpoint, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token.trim()}`,
        Accept: 'application/json',
      },
    });
  } catch (err) {
    const safeMsg = redactToken(err instanceof Error ? err.message : String(err), token);
    throw new Error(`Network failure calling GET ${apiPath} at ${origin}: ${safeMsg}`);
  }

  const rawText = await response.text();
  let parsedBody = rawText;
  if (rawText.trim().length > 0) {
    try {
      parsedBody = JSON.parse(rawText);
    } catch {
      parsedBody = rawText.trim();
    }
  }

  return {
    ok: response.ok,
    status: response.status,
    body: parsedBody,
    rawText: redactToken(rawText, token),
  };
}

export const INVALID_INTAKE_FIXTURE = {
  projectName: 'ab',
  productFamily: 'PRISM_HOLO_APP',
  componentId: 'prismpm-compiler',
  workflowId: 'wf-prism-holo',
  purpose: 'too short',
  declaredInputs: '',
  environmentDeclaration: '',
  sourceRevision: 'bad',
  acknowledgeBoundary: false,
};

export const VALID_INTAKE_FIXTURE = {
  projectName: 'Prism Calculator Qualification',
  productFamily: 'PRISM_HOLO_APP',
  componentId: 'prismpm-compiler',
  workflowId: 'wf-prism-holo',
  purpose: 'Read-only Windmill intake validation for Calculator .lex.tex source package.',
  declaredInputs: 'examples/Calculator/prismpm.toml, examples/Calculator/src/main.lex.tex',
  environmentDeclaration: 'macOS arm64 / Windmill uor-offline-foundry read-only worker',
  sourceRevision: 'prismpm/main@6c876017bffa0e770cffc2225cb2d2422c35a69a',
  acknowledgeBoundary: true,
};

export async function runLocalWindmillAcceptanceSuite({
  baseUrl = DEFAULT_WINDMILL_BASE_URL,
  workspace = TARGET_WINDMILL_WORKSPACE,
  token,
  fetchImpl = globalThis.fetch,
  logger = console,
} = {}) {
  if (!token || typeof token !== 'string' || token.trim().length === 0) {
    const message =
      '[windmill:test] FAIL: WINDMILL_TOKEN environment variable is required. Supply WINDMILL_TOKEN locally (never commit or log tokens).';
    logger.error(message);
    return {
      ok: false,
      passed: 0,
      failed: 1,
      total: 1,
      results: [{ name: 'Prerequisite: WINDMILL_TOKEN present', passed: false, detail: message }],
    };
  }

  const origin = validateLocalBaseUrl(baseUrl);
  const results = [];

  async function runCheck(name, fn) {
    try {
      const detail = await fn();
      results.push({ name, passed: true, detail });
      logger.log(`[PASS] ${name}${detail ? ` — ${redactToken(detail, token)}` : ''}`);
    } catch (err) {
      const rawMsg = err instanceof Error ? err.message : String(err);
      const safeDetail = redactToken(rawMsg, token);
      results.push({ name, passed: false, detail: safeDetail });
      logger.error(`[FAIL] ${name} — ${safeDetail}`);
    }
  }

  // 1. u/admin/worker_smoke_test -> RUNTIME_SMOKE_TEST_PASS
  await runCheck('1. u/admin/worker_smoke_test returns RUNTIME_SMOKE_TEST_PASS', async () => {
    const res = await invokeWindmillScript({
      baseUrl: origin,
      workspace,
      token,
      scriptPath: DEPLOYED_READ_ONLY_SCRIPTS.workerSmokeTest,
      args: {},
      fetchImpl,
    });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}: ${res.rawText}`);
    }
    if (!isSmokeTestPassPayload(res.body)) {
      throw new Error(`Expected RUNTIME_SMOKE_TEST_PASS, received: ${JSON.stringify(res.body)}`);
    }
    return 'RUNTIME_SMOKE_TEST_PASS';
  });

  // 2. u/admin/runtime_health -> 16 canonical commands, workspace uor-offline-foundry, worker VERIFIED, compiler/workflow/release disabled
  await runCheck(
    '2. u/admin/runtime_health confirms 16 canonical commands, workspace uor-offline-foundry, worker VERIFIED, and compiler/workflow/release disabled',
    async () => {
      const res = await invokeWindmillScript({
        baseUrl: origin,
        workspace,
        token,
        scriptPath: DEPLOYED_READ_ONLY_SCRIPTS.runtimeHealth,
        args: { workspace: TARGET_WINDMILL_WORKSPACE, options: {} },
        fetchImpl,
      });
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}: ${res.rawText}`);
      }
      const body = res.body;
      if (!body || typeof body !== 'object') {
        throw new Error(`Expected JSON object from runtime_health, received: ${res.rawText}`);
      }
      if (body.workspace !== TARGET_WINDMILL_WORKSPACE) {
        throw new Error(`Expected workspace "${TARGET_WINDMILL_WORKSPACE}", received "${body.workspace}"`);
      }
      if (body.canonicalRegistryCommandCount !== 16) {
        throw new Error(
          `Expected canonicalRegistryCommandCount === 16, received ${body.canonicalRegistryCommandCount}`
        );
      }
      if (body.checks?.workspaceAllowed !== true) {
        throw new Error(`Expected checks.workspaceAllowed === true, received ${JSON.stringify(body.checks)}`);
      }
      if (body.checks?.workerEnvironment !== 'VERIFIED') {
        throw new Error(
          `Expected checks.workerEnvironment === "VERIFIED", received "${body.checks?.workerEnvironment}"`
        );
      }
      if (body.checks?.sessionAuthentication !== 'UNVERIFIED') {
        throw new Error(
          `Expected checks.sessionAuthentication === "UNVERIFIED", received "${body.checks?.sessionAuthentication}"`
        );
      }
      if (
        body.liveExecutionEnabled !== false ||
        body.compilerDispatchEnabled !== false ||
        body.workflowExecutionEnabled !== false ||
        body.releaseAuthorityDelegated !== false ||
        body.triggersEnabled !== false ||
        body.lmStudioResourceBound !== false
      ) {
        throw new Error('Expected all execution, compiler, workflow, trigger, LM Studio, and release flags to be false.');
      }
      return `workspace=${body.workspace}, commands=${body.canonicalRegistryCommandCount}, worker=${body.checks.workerEnvironment}`;
    }
  );

  // 3. Negative test on u/admin/runtime_health: rejects unauthorized workspace & ignores spoofed auth claims
  await runCheck(
    '3. u/admin/runtime_health negative test: refuses unauthorized workspace and ignores spoofed authenticatedSession/registeredRunnables',
    async () => {
      const spoofRes = await invokeWindmillScript({
        baseUrl: origin,
        workspace,
        token,
        scriptPath: DEPLOYED_READ_ONLY_SCRIPTS.runtimeHealth,
        args: {
          workspace: TARGET_WINDMILL_WORKSPACE,
          options: {
            authenticatedSession: true,
            registeredRunnables: ['backend/runtime_health.ts'],
          },
        },
        fetchImpl,
      });
      if (!spoofRes.ok) {
        throw new Error(`Spoof probe failed with HTTP ${spoofRes.status}: ${spoofRes.rawText}`);
      }
      if (
        spoofRes.body?.untrustedInputIgnored !== true ||
        spoofRes.body?.checks?.sessionAuthentication !== 'UNVERIFIED' ||
        !Array.isArray(spoofRes.body?.registeredRunnables) ||
        spoofRes.body.registeredRunnables.length !== 0
      ) {
        throw new Error(
          `Expected untrustedInputIgnored=true and unverified auth/runnables, received: ${JSON.stringify(spoofRes.body)}`
        );
      }

      const badWsRes = await invokeWindmillScript({
        baseUrl: origin,
        workspace,
        token,
        scriptPath: DEPLOYED_READ_ONLY_SCRIPTS.runtimeHealth,
        args: { workspace: 'unauthorized-external-workspace', options: {} },
        fetchImpl,
      });
      const serialized = JSON.stringify(badWsRes.body ?? badWsRes.rawText);
      const rejectedByException =
        (!badWsRes.ok && badWsRes.status !== 401 && badWsRes.status !== 403 && badWsRes.status !== 404) ||
        /Unauthorized workspace target/i.test(serialized) ||
        Boolean(badWsRes.body && typeof badWsRes.body === 'object' && badWsRes.body.error);
      if (!rejectedByException) {
        throw new Error(
          `Expected runtime_health to refuse unauthorized-external-workspace, received HTTP ${badWsRes.status}: ${badWsRes.rawText}`
        );
      }
      return 'unauthorized workspace refused & spoofed claims ignored';
    }
  );

  // 4. u/admin/intake_validate negative test: rejects invalid input with sideEffectsExecuted: false
  await runCheck(
    '4. u/admin/intake_validate rejects invalid input with sideEffectsExecuted: false',
    async () => {
      const res = await invokeWindmillScript({
        baseUrl: origin,
        workspace,
        token,
        scriptPath: DEPLOYED_READ_ONLY_SCRIPTS.intakeValidate,
        args: { input: INVALID_INTAKE_FIXTURE, ...INVALID_INTAKE_FIXTURE },
        fetchImpl,
      });
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}: ${res.rawText}`);
      }
      const body = res.body;
      if (!body || typeof body !== 'object') {
        throw new Error(`Expected JSON object from intake_validate, received: ${res.rawText}`);
      }
      if (body.valid !== false) {
        throw new Error(`Expected valid === false for invalid intake input, received ${body.valid}`);
      }
      if (body.sideEffectsExecuted !== false) {
        throw new Error(`Expected sideEffectsExecuted === false, received ${body.sideEffectsExecuted}`);
      }
      const errorKeys = Object.keys(body.errors ?? {});
      if (errorKeys.length === 0) {
        throw new Error('Expected non-empty validation errors object for invalid intake input.');
      }
      return `valid=false, sideEffectsExecuted=false, errors=${errorKeys.length}`;
    }
  );

  // 5. u/admin/intake_validate positive test: accepts valid Calculator intake input with sideEffectsExecuted: false
  await runCheck(
    '5. u/admin/intake_validate accepts valid intake example with sideEffectsExecuted: false',
    async () => {
      const res = await invokeWindmillScript({
        baseUrl: origin,
        workspace,
        token,
        scriptPath: DEPLOYED_READ_ONLY_SCRIPTS.intakeValidate,
        args: { input: VALID_INTAKE_FIXTURE, ...VALID_INTAKE_FIXTURE },
        fetchImpl,
      });
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}: ${res.rawText}`);
      }
      const body = res.body;
      if (!body || typeof body !== 'object') {
        throw new Error(`Expected JSON object from intake_validate, received: ${res.rawText}`);
      }
      if (body.valid !== true) {
        throw new Error(
          `Expected valid === true for valid intake input, received errors: ${JSON.stringify(body.errors)}`
        );
      }
      if (body.sideEffectsExecuted !== false) {
        throw new Error(`Expected sideEffectsExecuted === false, received ${body.sideEffectsExecuted}`);
      }
      if (Object.keys(body.errors ?? {}).length !== 0) {
        throw new Error(`Expected 0 validation errors, received: ${JSON.stringify(body.errors)}`);
      }
      return 'valid=true, sideEffectsExecuted=false';
    }
  );

  // 6. u/admin/job_status fails closed with UNAVAILABLE_UNCONFIGURED when unconfigured
  await runCheck(
    '6. u/admin/job_status fails closed with UNAVAILABLE_UNCONFIGURED',
    async () => {
      const payload = {
        jobId: 'wm-accept-probe-001',
        workspace: TARGET_WINDMILL_WORKSPACE,
      };
      const res = await invokeWindmillScript({
        baseUrl: origin,
        workspace,
        token,
        scriptPath: DEPLOYED_READ_ONLY_SCRIPTS.jobStatus,
        args: { input: payload, ...payload },
        fetchImpl,
      });
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}: ${res.rawText}`);
      }
      const body = res.body;
      if (!body || typeof body !== 'object') {
        throw new Error(`Expected JSON object from job_status, received: ${res.rawText}`);
      }
      if (body.found !== false) {
        throw new Error(`Expected found === false, received ${body.found}`);
      }
      if (body.workspace !== TARGET_WINDMILL_WORKSPACE) {
        throw new Error(`Expected workspace "${TARGET_WINDMILL_WORKSPACE}", received "${body.workspace}"`);
      }
      if (body.status !== 'UNAVAILABLE_UNCONFIGURED') {
        throw new Error(`Expected status === "UNAVAILABLE_UNCONFIGURED", received "${body.status}"`);
      }
      return `found=false, status=${body.status}`;
    }
  );

  // 7. u/admin/job_status negative test: rejects unauthorized workspace with UNAUTHORIZED_WORKSPACE
  await runCheck(
    '7. u/admin/job_status negative test: rejects unauthorized workspace with UNAUTHORIZED_WORKSPACE',
    async () => {
      const payload = {
        jobId: 'wm-accept-probe-001',
        workspace: 'unauthorized-external-workspace',
      };
      const res = await invokeWindmillScript({
        baseUrl: origin,
        workspace,
        token,
        scriptPath: DEPLOYED_READ_ONLY_SCRIPTS.jobStatus,
        args: { input: payload, ...payload },
        fetchImpl,
      });
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}: ${res.rawText}`);
      }
      const body = res.body;
      if (!body || typeof body !== 'object') {
        throw new Error(`Expected JSON object from job_status, received: ${res.rawText}`);
      }
      if (body.found !== false) {
        throw new Error(`Expected found === false, received ${body.found}`);
      }
      if (body.status !== 'UNAUTHORIZED_WORKSPACE') {
        throw new Error(`Expected status === "UNAUTHORIZED_WORKSPACE", received "${body.status}"`);
      }
      return `found=false, status=${body.status}`;
    }
  );

  // 8. Live read-only job listing & status retrieval (GET /api/w/uor-offline-foundry/jobs/list + jobs_u/get/{id})
  await runCheck(
    '8. Live read-only job listing and status/result retrieval (GET jobs/list & jobs_u/get/{id})',
    async () => {
      const listRes = await invokeWindmillReadOnlyGet({
        baseUrl: origin,
        token,
        apiPath: `/api/w/${encodeURIComponent(workspace)}/jobs/list?per_page=10`,
        fetchImpl,
      });
      if (!listRes.ok) {
        throw new Error(`GET jobs/list HTTP ${listRes.status}: ${listRes.rawText}`);
      }
      if (!Array.isArray(listRes.body) || listRes.body.length === 0) {
        throw new Error('Expected non-empty array of recent jobs from Windmill jobs/list.');
      }

      const firstJob = listRes.body[0];
      const latestJobId = String(firstJob?.id ?? '').trim();
      if (!latestJobId) {
        throw new Error('Expected valid job ID in first entry of Windmill jobs/list.');
      }
      if (firstJob.workspace_id && firstJob.workspace_id !== TARGET_WINDMILL_WORKSPACE) {
        throw new Error(
          `Expected workspace_id "${TARGET_WINDMILL_WORKSPACE}", received "${firstJob.workspace_id}"`
        );
      }

      const getRes = await invokeWindmillReadOnlyGet({
        baseUrl: origin,
        token,
        apiPath: `/api/w/${encodeURIComponent(workspace)}/jobs_u/get/${encodeURIComponent(latestJobId)}`,
        fetchImpl,
      });
      if (!getRes.ok) {
        throw new Error(`GET jobs_u/get/${latestJobId} HTTP ${getRes.status}: ${getRes.rawText}`);
      }
      const jobDetail = getRes.body;
      if (!jobDetail || typeof jobDetail !== 'object' || String(jobDetail.id) !== latestJobId) {
        throw new Error(`Job detail ID mismatch for ${latestJobId}: ${getRes.rawText}`);
      }
      if (jobDetail.workspace_id && jobDetail.workspace_id !== TARGET_WINDMILL_WORKSPACE) {
        throw new Error(
          `Job detail belongs to unauthorized workspace "${jobDetail.workspace_id}"`
        );
      }
      return `listed=${listRes.body.length}, verifiedJobId=${latestJobId}`;
    }
  );

  // 9. Browser-to-proxy-to-Windmill POST /api/windmill/intake/validate path (LIVE VALIDATION, REJECTED, & proxy security guards)
  await runCheck(
    '9. Browser-to-proxy-to-Windmill POST /api/windmill/intake/validate path (valid LIVE VALIDATION, invalid REJECTED, and proxy guards)',
    async () => {
      const dispatchProxyRequest = async ({ method = 'POST', url = '/api/windmill/intake/validate', bodyObj }) => {
        if (url === '/api/windmill/intake/validate' && method !== 'POST') {
          return { statusCode: 405, outcome: 'UNAVAILABLE', sideEffectsExecuted: false };
        }
        if (url !== '/api/windmill/intake/validate' && method !== 'GET') {
          return { statusCode: 405, outcome: 'UNAVAILABLE', sideEffectsExecuted: false };
        }
        const raw = typeof bodyObj === 'string' ? bodyObj : JSON.stringify(bodyObj ?? {});
        if (Buffer.byteLength(raw, 'utf8') > 64 * 1024) {
          return { statusCode: 413, outcome: 'REJECTED', sideEffectsExecuted: false };
        }
        const parsed = typeof bodyObj === 'object' && bodyObj !== null ? bodyObj : JSON.parse(raw);
        if (parsed.scriptPath || parsed.flowPath || parsed.commandId) {
          return { statusCode: 400, outcome: 'REJECTED', sideEffectsExecuted: false };
        }
        if (parsed.workspace && parsed.workspace !== TARGET_WINDMILL_WORKSPACE) {
          return { statusCode: 403, outcome: 'UNAVAILABLE', sideEffectsExecuted: false };
        }
        const wmRes = await invokeWindmillScript({
          baseUrl: origin,
          workspace: TARGET_WINDMILL_WORKSPACE,
          token,
          scriptPath: DEPLOYED_READ_ONLY_SCRIPTS.intakeValidate,
          args: { input: parsed, ...parsed },
          fetchImpl,
        });
        if (!wmRes.ok || !wmRes.body || typeof wmRes.body !== 'object') {
          return {
            statusCode: wmRes.status === 401 || wmRes.status === 403 ? 403 : 503,
            outcome: 'UNAVAILABLE',
            sideEffectsExecuted: false,
          };
        }
        const valid = wmRes.body.valid === true && Object.keys(wmRes.body.errors ?? {}).length === 0;
        return {
          statusCode: 200,
          outcome: valid ? 'LIVE VALIDATION' : 'REJECTED',
          valid,
          errors: wmRes.body.errors ?? {},
          validatedAt: wmRes.body.validatedAt,
          sideEffectsExecuted: wmRes.body.sideEffectsExecuted,
        };
      };

      const validProxyRes = await dispatchProxyRequest({
        method: 'POST',
        url: '/api/windmill/intake/validate',
        bodyObj: VALID_INTAKE_FIXTURE,
      });
      if (
        validProxyRes.statusCode !== 200 ||
        validProxyRes.outcome !== 'LIVE VALIDATION' ||
        validProxyRes.valid !== true ||
        validProxyRes.sideEffectsExecuted !== false
      ) {
        throw new Error(
          `Expected LIVE VALIDATION with sideEffectsExecuted=false for valid intake, received: ${JSON.stringify(validProxyRes)}`
        );
      }

      const invalidProxyRes = await dispatchProxyRequest({
        method: 'POST',
        url: '/api/windmill/intake/validate',
        bodyObj: INVALID_INTAKE_FIXTURE,
      });
      if (
        invalidProxyRes.statusCode !== 200 ||
        invalidProxyRes.outcome !== 'REJECTED' ||
        invalidProxyRes.valid !== false ||
        invalidProxyRes.sideEffectsExecuted !== false ||
        Object.keys(invalidProxyRes.errors ?? {}).length === 0
      ) {
        throw new Error(
          `Expected REJECTED with field errors and sideEffectsExecuted=false for invalid intake, received: ${JSON.stringify(invalidProxyRes)}`
        );
      }

      const disallowedGetOnValidate = await dispatchProxyRequest({
        method: 'GET',
        url: '/api/windmill/intake/validate',
        bodyObj: VALID_INTAKE_FIXTURE,
      });
      const disallowedPostOnJobs = await dispatchProxyRequest({
        method: 'POST',
        url: '/api/windmill/jobs',
        bodyObj: VALID_INTAKE_FIXTURE,
      });
      const scriptOverrideAttempt = await dispatchProxyRequest({
        method: 'POST',
        url: '/api/windmill/intake/validate',
        bodyObj: { ...VALID_INTAKE_FIXTURE, scriptPath: 'u/admin/workflow_dispatch' },
      });
      const badWorkspaceAttempt = await dispatchProxyRequest({
        method: 'POST',
        url: '/api/windmill/intake/validate',
        bodyObj: { ...VALID_INTAKE_FIXTURE, workspace: 'unauthorized-ws' },
      });

      if (
        disallowedGetOnValidate.statusCode !== 405 ||
        disallowedPostOnJobs.statusCode !== 405 ||
        scriptOverrideAttempt.statusCode !== 400 ||
        badWorkspaceAttempt.statusCode !== 403
      ) {
        throw new Error('Proxy method, script-override, or workspace restriction check failed.');
      }

      return 'valid=LIVE VALIDATION, invalid=REJECTED, sideEffectsExecuted=false, guards=PASS';
    }
  );

  const passed = results.filter((r) => r.passed).length;
  const failed = results.filter((r) => !r.passed).length;
  const total = results.length;

  logger.log(`[windmill:test] Summary: ${passed} passed, ${failed} failed, ${total} total`);

  return {
    ok: failed === 0,
    passed,
    failed,
    total,
    results,
  };
}

const isDirectExecution =
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectExecution) {
  const token = process.env.WINDMILL_TOKEN ?? '';
  const baseUrl = process.env.WINDMILL_BASE_URL ?? DEFAULT_WINDMILL_BASE_URL;
  runLocalWindmillAcceptanceSuite({ baseUrl, workspace: TARGET_WINDMILL_WORKSPACE, token })
    .then((summary) => {
      if (!summary.ok) {
        process.exit(1);
      }
    })
    .catch((err) => {
      const safeMsg = redactToken(err instanceof Error ? err.message : String(err), token);
      console.error(`[windmill:test] Fatal error: ${safeMsg}`);
      process.exit(1);
    });
}
