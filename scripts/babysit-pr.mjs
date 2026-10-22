#!/usr/bin/env node
// Watches one PR until it is closed or merged, you press Ctrl+C, or no change
// shows up for the idle window (default 2 hours). When something needs work
// (failing check, new human comment), it runs the /babysit-pr command once.
//
// Usage: node scripts/babysit-pr.mjs <pr-number> [interval-seconds=60] [idle-hours=2]

import { execFile, spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { promisify } from 'node:util';

const run = promisify(execFile);
const [prArg, intervalArg = '60', idleArg = '2'] = process.argv.slice(2);
const pr = Number(prArg);
if (!Number.isInteger(pr)) {
  console.error('usage: node scripts/babysit-pr.mjs <pr-number> [interval-seconds=60] [idle-hours=2]');
  process.exit(1);
}
const intervalMs = Number(intervalArg) * 1000;
const idleMs = Number(idleArg) * 3_600_000;
const failing = new Set(['FAILURE', 'TIMED_OUT', 'ACTION_REQUIRED', 'STARTUP_FAILURE', 'ERROR']);
const aiPrefix = '🤖 AI';

// Comments the AI already answered; only new human comments trigger work.
const seen = new Set();

const log = (msg) => console.log(`[${new Date().toLocaleString()}] ${msg}`);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const gh = async (args) => JSON.parse((await run('gh', args, { maxBuffer: 50e6 })).stdout);
const isHuman = (body) => !(body ?? '').startsWith(aiPrefix);

async function snapshot() {
  const view = await gh(['pr', 'view', String(pr), '--json', 'state,headRefOid,statusCheckRollup']);
  const [inline, issue, reviews] = await Promise.all([
    gh(['api', `repos/{owner}/{repo}/pulls/${pr}/comments`, '--paginate']),
    gh(['api', `repos/{owner}/{repo}/issues/${pr}/comments`, '--paginate']),
    gh(['api', `repos/{owner}/{repo}/pulls/${pr}/reviews`, '--paginate']),
  ]);

  const checks = (view.statusCheckRollup ?? []).map((c) => ({
    name: c.name ?? c.context,
    state: c.conclusion ?? c.state ?? c.status,
  }));
  const humanIds = [
    ...inline.filter((c) => isHuman(c.body)).map((c) => `inline:${c.id}`),
    ...issue.filter((c) => isHuman(c.body)).map((c) => `issue:${c.id}`),
    ...reviews.filter((r) => r.body && isHuman(r.body)).map((r) => `review:${r.id}`),
  ];
  const failingChecks = checks.filter((c) => failing.has(c.state));

  // Fingerprint covers everything that can change: commits, checks, comments, reviews.
  const fingerprint = createHash('sha256')
    .update(JSON.stringify({ sha: view.headRefOid, checks, humanIds, reviewStates: reviews.map((r) => r.state) }))
    .digest('hex');

  return { state: view.state, failingChecks, humanIds, fingerprint };
}

const needsWork = (snap) => snap.failingChecks.length > 0 || snap.humanIds.some((id) => !seen.has(id));

function runBabysitCommand() {
  return new Promise((resolve) => {
    // shell: true so the Windows `claude` shim resolves; the quoted args are passed through to the shell.
    const child = spawn(
      'claude',
      [
        '-p',
        '"/babysit-pr ' + pr + '"',
        '--permission-mode',
        'acceptEdits',
        '--allowedTools',
        '"Bash(gh:*)" "Bash(git:*)" "Bash(npm:*)" "Bash(node:*)" Read Edit Write Grep Glob',
      ],
      { shell: true, stdio: 'inherit' },
    );
    child.on('close', (code) => {
      log(`babysit command finished (exit ${code})`);
      resolve();
    });
  });
}

async function fix(snap) {
  log(`work needed: ${snap.failingChecks.length} failing check(s), new human comments: ${snap.humanIds.filter((id) => !seen.has(id)).length}`);
  await runBabysitCommand();
  snap.humanIds.forEach((id) => seen.add(id));
  return snapshot();
}

let snap = await snapshot();
if (snap.state !== 'OPEN') {
  log(`PR #${pr} is ${snap.state}. Nothing to watch.`);
  process.exit(0);
}
log(`watching PR #${pr} every ${intervalMs / 1000}s, stops after ${idleMs / 3_600_000}h with no change (Ctrl+C to stop)`);

let lastFingerprint = snap.fingerprint;
let lastChange = Date.now();
if (needsWork(snap)) {
  snap = await fix(snap);
  lastFingerprint = snap.fingerprint;
}

for (;;) {
  await sleep(intervalMs);
  try {
    snap = await snapshot();
  } catch (err) {
    log(`poll failed, will retry: ${err.message.split('\n')[0]}`);
    continue;
  }
  if (snap.state !== 'OPEN') {
    log(`PR #${pr} is ${snap.state}. Stopping.`);
    break;
  }
  if (snap.fingerprint !== lastFingerprint) {
    lastChange = Date.now();
    log('change detected');
    if (needsWork(snap)) {
      snap = await fix(snap);
      lastChange = Date.now();
    }
    lastFingerprint = snap.fingerprint;
  } else if (Date.now() - lastChange >= idleMs) {
    log(`no change for ${idleMs / 3_600_000}h. Stopping.`);
    break;
  }
}
