import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { runInNewContext } from 'node:vm';

const harness = readFileSync('apps/backend/tests/workflows/f09-performance-baseline.harness.js', 'utf8');
const resolvePartyId = runInNewContext(`${harness.match(/function resolvePartyId[\s\S]*?\n}/)[0]}; resolvePartyId`);

test('party IDs follow the data-array contract and reject empty or invalid lists', () => {
  for (const label of ['customers', 'suppliers']) {
    assert.equal(resolvePartyId({ status: 200, body: { data: [{ id: 'seed-id' }] } }, label), 'seed-id');
    for (const data of [[], [{ id: '' }], [{}], { items: [{ id: 'legacy' }] }, null]) {
      assert.throws(() => resolvePartyId({ status: 200, body: { data } }, label), new RegExp(label));
    }
    assert.throws(() => resolvePartyId({ status: 403, body: { data: [{ id: 'seed-id' }] } }, label), /HTTP 200/);
  }
});

const runner = readFileSync('scripts/run-regression.mjs', 'utf8').trimStart().replace(/^#![^\n]*\n/, '').replace(/^import .*;\r?\n/gm, '');

for (const platform of ['win32', 'linux']) {
  for (const fail of [false, true]) {
    test(`regression ${platform}: preserves inventory and ${fail ? 'failure' : 'success'} status without a shell`, async () => {
      const calls = [];
      const exits = [];
      await runInNewContext(`(async () => { ${runner} })()`, {
        dirname, join,
        process: { platform, execPath: 'node', argv: [], env: { npm_execpath: 'npm cli with spaces.js' }, exit: (code) => exits.push(code) },
        console: { log() {}, error() {} },
        spawnSync: (command, args, options) => {
          calls.push({ command, args, options });
          return { status: fail && args.includes('test:unit') ? 1 : 0 };
        },
      });
      assert.equal(calls.length, 8);
      const npmCalls = calls.slice(2);
      assert.deepEqual(Array.from(npmCalls, (call) => call.args.at(-1)), ['lint', 'typecheck', 'test:unit', 'test:integration', 'test:architecture', 'build']);
      for (const call of npmCalls) {
        assert.equal(call.options.shell, undefined);
        assert.equal(call.command, platform === 'win32' ? 'node' : 'npm');
        if (platform === 'win32') assert.equal(call.args[0], 'npm cli with spaces.js');
      }
      assert.deepEqual(exits, fail ? [1] : []);
    });
  }
}

test('npm spawning smoke resolves the real CLI without a shell', () => {
  const runNpm = runInNewContext(`${runner.match(/function runNpm[\s\S]*?\n}/)[0]}; runNpm`, {
    process, spawnSync, dirname, join,
  });
  assert.equal(runNpm('npm-version', ['--version']).status, 0);
});

test('rehearsal evidence gate results agree with tools and reconciliation', () => {
  const report = JSON.parse(readFileSync('docs/ops/F09-R1-F09-005-REHEARSAL-EVIDENCE.json', 'utf8'));
  assert.equal(report.relG10, 'pass');
  if (!report.backupTools.mongodumpBin || !report.backupTools.mongorestoreBin) {
    assert.equal(report.status, 'blocked');
    assert.equal(report.relG08, 'blocked');
    assert.equal(report.relG09, 'blocked');
    assert.equal(report.backup.blocked, true);
    assert.equal(report.restoreFailureDetection.missingArtifactNotSuccess, null);
    assert.equal(report.restore, undefined);
  } else {
    assert.equal(report.status, 'passed');
    assert.equal(report.relG08, 'pass');
    assert.equal(report.relG09, 'pass');
    assert.equal(report.restore.documentCountsMatchSource, true);
    assert.equal(report.inventoryReconciliation.match, true);
    assert.equal(report.ledgerReconciliation.match, true);
  }
  assert.equal(report.authorizationAudit.orgUserRestoreStatus, 403);
  for (const field of ['source', 'restored', 'importDb']) assert.ok(report.databases[field].endsWith(report.databases.runId));
  assert.equal(report.productionTargetVendorBackupVerification, 'pending');
});
