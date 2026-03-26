/**
 * AgentVault — single start script
 *
 * Starts everything in order and runs the demo:
 *   1. Kill anything on ports 3402 / 3500 / 5173
 *   2. Start FIL-x402 facilitator  (:3402)
 *   3. Wait until it responds
 *   4. Start AgentVault            (:3500)
 *   5. Wait until it responds
 *   6. Start frontend dashboard    (:5173)
 *   7. Wait until it responds
 *   8. Run the demo script
 *   9. Print browser URL
 *
 * Usage:
 *   npm run demo:start          — full demo (scenes 1-4)
 *   npm run demo:start clawvault — ClawVault demo (scene 5)
 */

import { spawn, execSync } from 'child_process';
import { writeFileSync, openSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname    = path.dirname(fileURLToPath(import.meta.url));
const ROOT         = path.resolve(__dirname, '..');
const FACILITATOR  = path.resolve(ROOT, '../FIL-x402/facilitator');
const FRONTEND     = path.resolve(ROOT, 'frontend');
const PID_FILE     = '/tmp/agentvault-pids.json';
// demo:start only boots services — run npm run demo or npm run demo:clawvault separately

const c = {
  reset:   '\x1b[0m',
  bold:    '\x1b[1m',
  dim:     '\x1b[2m',
  green:   '\x1b[32m',
  cyan:    '\x1b[36m',
  yellow:  '\x1b[33m',
  red:     '\x1b[31m',
};

function log(msg: string)  { console.log(`  ${c.cyan}›${c.reset}  ${msg}`); }
function ok(msg: string)   { console.log(`  ${c.green}✓${c.reset}  ${msg}`); }
function err(msg: string)  { console.log(`  ${c.red}✗${c.reset}  ${msg}`); }
function bold(msg: string) { console.log(`\n${c.bold}${msg}${c.reset}`); }

// ─── Kill existing processes on a port ───────────────────────────────────────

function killPort(port: number) {
  try {
    execSync(`lsof -ti :${port} | xargs kill -9 2>/dev/null`, { stdio: 'ignore' });
  } catch {
    // nothing was running
  }
}

// ─── Poll until a URL responds ────────────────────────────────────────────────

async function waitForPort(url: string, label: string, timeoutMs = 30_000): Promise<void> {
  const start = Date.now();
  process.stdout.write(`  ${c.cyan}›${c.reset}  Waiting for ${label} `);
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url);
      if (res.ok) {
        console.log(` ${c.green}✓${c.reset}`);
        return;
      }
    } catch {
      // not ready yet
    }
    process.stdout.write('.');
    await new Promise(r => setTimeout(r, 800));
  }
  console.log(` ${c.red}✗${c.reset}`);
  throw new Error(`${label} did not start within ${timeoutMs / 1000}s`);
}

// ─── Spawn a background process, log to file ─────────────────────────────────

function spawnBackground(label: string, cmd: string, args: string[], cwd: string, logFile: string, env?: Record<string, string | undefined>) {
  const out = openSync(logFile, 'w');
  const proc = spawn(cmd, args, {
    cwd,
    stdio: ['ignore', out, out],
    detached: false,
    shell: true,
    env: env ?? process.env,
  });
  proc.on('error', (e: Error) => err(`${label} crashed: ${e.message}`));
  return proc;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`\n${c.bold}${c.cyan}${'─'.repeat(58)}${c.reset}`);
  console.log(`${c.bold}${c.cyan}  AgentVault — Starting Demo${c.reset}`);
  console.log(`${c.bold}${c.cyan}${'─'.repeat(58)}${c.reset}\n`);

  // 1. Clear ports
  bold('Step 1: Clearing ports');
  killPort(3402);
  killPort(3500);
  killPort(5173);
  ok('Ports 3402, 3500 and 5173 cleared');

  // 2. Start FIL-x402 facilitator
  bold('Step 2: Starting FIL-x402 facilitator (:3402)');
  // Strip PORT from env so AgentVault's PORT=3500 doesn't bleed into the facilitator
  const { PORT: _port, ...facilitatorEnv } = process.env;
  const facilitator = spawnBackground(
    'FIL-x402',
    'npm', ['run', 'dev'],
    FACILITATOR,
    '/tmp/facilitator.log',
    facilitatorEnv
  );
  await waitForPort('http://localhost:3402/health', 'FIL-x402 (:3402)', 60_000);
  ok('FIL-x402 facilitator running');

  // 3. Start AgentVault
  bold('Step 3: Starting AgentVault (:3500)');
  const server = spawnBackground(
    'AgentVault',
    'npm', ['run', 'dev'],
    ROOT,
    '/tmp/agentvault.log'
  );
  await waitForPort('http://localhost:3500/health', 'AgentVault (:3500)');
  const healthRes  = await fetch('http://localhost:3500/health');
  const health     = await healthRes.json() as Record<string, unknown>;
  const stor       = (health.storage as Record<string, unknown>).provider ?? 'unknown';
  const mockMode   = (health.x402 as Record<string, unknown>).mock;
  ok(`AgentVault running  →  storage=${stor}  x402.mock=${mockMode}`);

  // 4. Start frontend
  bold('Step 4: Starting frontend dashboard (:5173)');
  const frontend = spawnBackground(
    'Frontend',
    'npm', ['run', 'dev'],
    FRONTEND,
    '/tmp/frontend.log'
  );
  await waitForPort('http://localhost:5173', 'Frontend (:5173)');
  ok('Frontend running  →  http://localhost:5173');

  // Save PIDs for stop script
  writeFileSync(PID_FILE, JSON.stringify({
    facilitator: facilitator.pid,
    server: server.pid,
    frontend: frontend.pid,
  }));

  // Done — all services running, open browser and run demos manually
  console.log(`\n${c.bold}${c.cyan}${'─'.repeat(58)}${c.reset}`);
  console.log(`${c.bold}${c.green}  ✓ All services running.${c.reset}`);
  console.log(`${c.bold}${c.cyan}${'─'.repeat(58)}${c.reset}\n`);
  console.log(`  ${c.bold}Dashboard:${c.reset}  http://localhost:5173`);
  console.log(`  ${c.bold}Run demo:${c.reset}   npm run demo`);
  console.log(`  ${c.bold}ClawVault:${c.reset}  npm run demo:clawvault`);
  console.log(`  ${c.dim}Stop all:${c.reset}   npm run demo:stop\n`);
}

main().catch((e) => {
  err(e.message);
  process.exit(1);
});
