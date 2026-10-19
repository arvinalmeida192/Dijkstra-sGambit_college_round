import { spawn } from 'node:child_process'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

const DEFAULT_TIMEOUT_MS = 2500
const MAX_OUTPUT_BYTES = 64 * 1024

const WORKER_SCRIPT = `
'use strict';
const vm = require('node:vm');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const payloadRaw = fs.readFileSync(0, 'utf8');
const payload = JSON.parse(payloadRaw);
const code = String(payload.code || '');
const assertions = Array.isArray(payload.assertions) ? payload.assertions : [];
const vmTimeoutMs = Math.min(Math.max(Number(payload.vmTimeoutMs) || 1200, 100), 2000);

// Transform simple ESM "export function foo" / "export const foo" into module.exports assignments
// so both CommonJS (module.exports) and simple ES module files work deterministically.
const exportedNames = [];
const normalizedCode = code
  .replace(/export\\s+async\\s+function\\s+([a-zA-Z0-9_$]+)/g, (_, name) => {
    exportedNames.push(name);
    return 'async function ' + name;
  })
  .replace(/export\\s+function\\s+([a-zA-Z0-9_$]+)/g, (_, name) => {
    exportedNames.push(name);
    return 'function ' + name;
  })
  .replace(/export\\s+const\\s+([a-zA-Z0-9_$]+)/g, (_, name) => {
    exportedNames.push(name);
    return 'const ' + name;
  });

const moduleObj = { exports: {} };
const sandbox = Object.create(null);
sandbox.module = moduleObj;
sandbox.exports = moduleObj.exports;
sandbox.Math = Math;
sandbox.Date = Date;
sandbox.JSON = JSON;
sandbox.Array = Array;
sandbox.Object = Object;
sandbox.String = String;
sandbox.Number = Number;
sandbox.Boolean = Boolean;
sandbox.RegExp = RegExp;
sandbox.Map = Map;
sandbox.Set = Set;
sandbox.Error = Error;
sandbox.TypeError = TypeError;
sandbox.RangeError = RangeError;
sandbox.BigInt = BigInt;
sandbox.Uint8Array = Uint8Array;
sandbox.Int32Array = Int32Array;
sandbox.Float64Array = Float64Array;
sandbox.encodeURIComponent = encodeURIComponent;
sandbox.decodeURIComponent = decodeURIComponent;
sandbox.parseInt = parseInt;
sandbox.parseFloat = parseFloat;
sandbox.isNaN = isNaN;
sandbox.isFinite = isFinite;

const context = vm.createContext(sandbox, {
  codeGeneration: { strings: false, wasm: false },
});

const footer = exportedNames.length > 0
  ? '\\n;(' + JSON.stringify(exportedNames) + ').forEach(function(n){ try { const v = eval(n); if (typeof v !== "undefined" && typeof module.exports[n] === "undefined") module.exports[n] = v; } catch (_) {} });'
  : '';

try {
  const script = new vm.Script(normalizedCode + footer, { filename: 'submitted-deliverable.js' });
  script.runInContext(context, { timeout: vmTimeoutMs });
} catch (err) {
  process.stdout.write(JSON.stringify({
    passed: false,
    error: 'Compilation or initialization error: ' + (err && err.message ? err.message : String(err)),
    results: [],
  }));
  process.exit(0);
}

const results = [];
let allPassed = true;

for (let i = 0; i < assertions.length; i++) {
  const item = assertions[i] || {};
  const label = String(item.name || ('Assertion #' + (i + 1)));
  const fnName = String(item.fn || '').trim();
  const args = Array.isArray(item.args) ? item.args : [];
  const expected = item.expected;

  try {
    let targetFn = null;
    if (fnName && moduleObj.exports && typeof moduleObj.exports[fnName] === 'function') {
      targetFn = moduleObj.exports[fnName];
    } else if (fnName && typeof sandbox[fnName] === 'function') {
      targetFn = sandbox[fnName];
    } else if (!fnName && typeof moduleObj.exports === 'function') {
      targetFn = moduleObj.exports;
    }

    if (typeof targetFn !== 'function') {
      allPassed = false;
      results.push({
        name: label,
        passed: false,
        error: 'Exported function "' + (fnName || 'default') + '" not found in deliverable.',
      });
      continue;
    }

    context.__invokeFn = targetFn;
    context.__invokeArgs = JSON.parse(JSON.stringify(args));
    const callScript = new vm.Script('__invokeFn.apply(null, __invokeArgs)', {
      filename: 'assertion-' + (i + 1) + '.js',
    });
    const actualRaw = callScript.runInContext(context, { timeout: vmTimeoutMs });
    const actual = actualRaw !== undefined ? JSON.parse(JSON.stringify(actualRaw)) : undefined;

    assert.deepStrictEqual(actual, expected);
    results.push({
      name: label,
      passed: true,
      actual,
      expected,
    });
  } catch (err) {
    allPassed = false;
    results.push({
      name: label,
      passed: false,
      error: err && err.message ? err.message : String(err),
    });
  }
}

process.stdout.write(JSON.stringify({
  passed: allPassed && results.length > 0,
  results,
}));
`

/**
 * Run deterministic JS unit assertions against untrusted freelancer code in an isolated child process.
 * - Separate process with --max-old-space-size=64 and --disallow-code-generation-from-strings
 * - Stripped environment variables (no DB, JWT, signing keys, or payment credentials)
 * - Ephemeral temporary working directory
 * - VM context without require, fs, net, http, child_process, or process access
 * - Hard wall-clock timeout and stdout/stderr cap
 */
export async function runSandboxedJsTests({
  code,
  assertions = [],
  timeoutMs = DEFAULT_TIMEOUT_MS,
}) {
  if (typeof code !== 'string' || !code.trim()) {
    return {
      passed: false,
      error: 'Deliverable source code is empty.',
      results: [],
    }
  }
  if (!Array.isArray(assertions) || assertions.length === 0) {
    return {
      passed: false,
      error: 'No test assertions configured for SANDBOX_JS_TEST.',
      results: [],
    }
  }

  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'fairwork-verify-'))
  const workerPath = path.join(tmpDir, 'worker.cjs')

  try {
    await fs.writeFile(workerPath, WORKER_SCRIPT, { encoding: 'utf8', mode: 0o400 })

    return await new Promise((resolve) => {
      const child = spawn(
        process.execPath,
        [
          '--max-old-space-size=64',
          '--disallow-code-generation-from-strings',
          workerPath,
        ],
        {
          cwd: tmpDir,
          env: {
            NODE_ENV: 'sandbox',
            TZ: 'UTC',
          },
          stdio: ['pipe', 'pipe', 'pipe'],
        },
      )

      let stdout = ''
      let stderr = ''
      let killedByTimeout = false

      const timer = setTimeout(() => {
        killedByTimeout = true
        child.kill('SIGKILL')
      }, timeoutMs)

      child.stdout.on('data', (chunk) => {
        if (stdout.length < MAX_OUTPUT_BYTES) {
          stdout += chunk.toString('utf8')
        }
      })

      child.stderr.on('data', (chunk) => {
        if (stderr.length < MAX_OUTPUT_BYTES) {
          stderr += chunk.toString('utf8')
        }
      })

      child.on('error', (err) => {
        clearTimeout(timer)
        resolve({
          passed: false,
          error: `Sandbox process error: ${err.message}`,
          results: [],
        })
      })

      child.on('close', (exitCode) => {
        clearTimeout(timer)
        if (killedByTimeout) {
          resolve({
            passed: false,
            error: `Sandbox execution timed out after ${timeoutMs}ms.`,
            results: [],
          })
          return
        }
        if (exitCode !== 0 && !stdout.trim()) {
          resolve({
            passed: false,
            error: `Sandbox process exited with code ${exitCode}: ${stderr.trim() || 'Unknown error'}`,
            results: [],
          })
          return
        }
        try {
          const parsed = JSON.parse(stdout)
          resolve({
            passed: Boolean(parsed.passed),
            error: parsed.error || null,
            results: Array.isArray(parsed.results) ? parsed.results : [],
          })
        } catch {
          resolve({
            passed: false,
            error: `Failed to parse sandbox output: ${stderr.trim() || stdout.trim() || 'Empty output'}`,
            results: [],
          })
        }
      })

      child.stdin.write(
        JSON.stringify({
          code,
          assertions,
          vmTimeoutMs: Math.min(timeoutMs - 300, 1500),
        }),
      )
      child.stdin.end()
    })
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {})
  }
}
