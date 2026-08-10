/**
 * Non-destructive helper: print/apply Windows native mongod rs0 config guidance.
 * Does not delete data volumes. Editing Program Files and Restart-Service require Administrator.
 *
 * Usage:
 *   node scripts/mongodb/configure-native-windows.mjs
 *   node scripts/mongodb/configure-native-windows.mjs --write-config
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import {
  formatNativeWindowsReplicaSetInstructions,
  readNativeTopology,
} from './lib/native-client.mjs';
import { REPLICA_SET_NAME } from './lib/constants.mjs';

const writeConfig = process.argv.includes('--write-config');

const DEFAULT_CFG = 'C:\\Program Files\\MongoDB\\Server\\8.2\\bin\\mongod.cfg';
const cfgPath = process.env.AGRIVIO_MONGOD_CFG || DEFAULT_CFG;

function ensureReplicationBlock(raw) {
  if (/^\s*replSetName\s*:/m.test(raw) || /replSetName\s*:\s*rs0/.test(raw)) {
    return { content: raw, changed: false };
  }

  if (/^#?replication:\s*$/m.test(raw)) {
    const content = raw.replace(
      /^#?replication:\s*$/m,
      `replication:\n  replSetName: ${REPLICA_SET_NAME}`,
    );
    return { content, changed: content !== raw };
  }

  const content = `${raw.trimEnd()}\n\nreplication:\n  replSetName: ${REPLICA_SET_NAME}\n`;
  return { content, changed: true };
}

const topology = await readNativeTopology();
console.log(`[agrivio] Current topology: ${JSON.stringify(topology)}`);

if (topology.primaryElected && topology.setName === REPLICA_SET_NAME) {
  console.log(`[agrivio] Local MongoDB already has PRIMARY for '${REPLICA_SET_NAME}'.`);
  process.exit(0);
}

console.log(formatNativeWindowsReplicaSetInstructions());

if (!writeConfig) {
  console.log(
    '[agrivio] Re-run with --write-config (Administrator) to patch mongod.cfg when needed.',
  );
  process.exit(topology.initiated ? 0 : 2);
}

if (!existsSync(cfgPath)) {
  console.error(`[agrivio] mongod.cfg not found at ${cfgPath}`);
  process.exit(1);
}

const original = readFileSync(cfgPath, 'utf8');
const { content, changed } = ensureReplicationBlock(original);
if (!changed) {
  console.log(`[agrivio] ${cfgPath} already declares a replSetName.`);
} else {
  try {
    writeFileSync(cfgPath, content, 'utf8');
    console.log(`[agrivio] Updated ${cfgPath} with replication.replSetName: ${REPLICA_SET_NAME}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[agrivio] Unable to write ${cfgPath}: ${message}`);
    console.error('[agrivio] Open an elevated shell and retry --write-config.');
    process.exit(1);
  }
}

const restart = spawnSync('powershell.exe', ['-Command', 'Restart-Service MongoDB'], {
  encoding: 'utf8',
  shell: false,
});
if (restart.status !== 0) {
  console.error(
    `[agrivio] Restart-Service MongoDB failed. Run elevated: Restart-Service MongoDB\n${
      restart.stderr || restart.stdout
    }`,
  );
  process.exit(1);
}

console.log('[agrivio] MongoDB service restarted. Next: npm run db:init && npm run db:status');
