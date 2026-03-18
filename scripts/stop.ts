/**
 * AgentVault — stop all demo processes
 *
 * Kills AgentVault (:3500) and FIL-x402 facilitator (:3402).
 *
 * Usage:
 *   npm run demo:stop
 */

import { execSync } from 'child_process';
import { readFileSync, existsSync, unlinkSync } from 'fs';

const PID_FILE = '/tmp/agentvault-pids.json';

const c = {
  reset: '\x1b[0m',
  bold:  '\x1b[1m',
  green: '\x1b[32m',
  cyan:  '\x1b[36m',
  dim:   '\x1b[2m',
};

function killPort(port: number, label: string) {
  try {
    execSync(`lsof -ti :${port} | xargs kill -9 2>/dev/null`, { stdio: 'ignore' });
    console.log(`  ${c.green}✓${c.reset}  Stopped ${label} (:${port})`);
  } catch {
    console.log(`  ${c.dim}–  ${label} (:${port}) was not running${c.reset}`);
  }
}

console.log(`\n${c.bold}${c.cyan}Stopping AgentVault demo...${c.reset}\n`);

killPort(3500, 'AgentVault');
killPort(3402, 'FIL-x402 facilitator');
killPort(5173, 'Frontend dashboard');

if (existsSync(PID_FILE)) {
  unlinkSync(PID_FILE);
}

console.log(`\n  ${c.bold}All stopped.${c.reset}\n`);
