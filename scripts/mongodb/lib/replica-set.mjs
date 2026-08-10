import { dockerComposeExec, resolveDockerBinaryOrNull } from './docker.mjs';
import { LOCAL_MONGODB_HOST, LOCAL_MONGODB_PORT, REPLICA_SET_NAME } from './constants.mjs';
import {
  formatNativeWindowsReplicaSetInstructions,
  initializeNativeReplicaSet,
  readNativeTopology,
} from './native-client.mjs';

/**
 * @returns {Promise<void>}
 */
export async function waitForMongodPing({ attempts = 60, delayMs = 1000 } = {}) {
  const docker = resolveDockerBinaryOrNull();
  if (!docker) {
    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      const topology = await readNativeTopology();
      if (topology.reachable) {
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
    throw new Error('MongoDB did not respond to ping within the expected startup window.');
  }

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const result = dockerComposeExec("db.adminCommand('ping')", { stdio: 'pipe' });
    if (result.status === 0) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }

  throw new Error('MongoDB did not respond to ping within the expected startup window.');
}

/**
 * @returns {{ initiated: boolean; primaryElected: boolean; state?: string; setName?: string | null }}
 */
export function readDockerReplicaSetSummary() {
  const statusResult = dockerComposeExec('JSON.stringify(rs.status())', { stdio: 'pipe' });
  if (statusResult.status !== 0) {
    return { initiated: false, primaryElected: false };
  }

  try {
    const status = JSON.parse(statusResult.stdout.trim());
    const self = status.members?.find((member) => member.self);
    const state = typeof self?.stateStr === 'string' ? self.stateStr : undefined;
    return {
      initiated: true,
      primaryElected: state === 'PRIMARY',
      state,
      setName: typeof status.set === 'string' ? status.set : REPLICA_SET_NAME,
    };
  } catch {
    return { initiated: false, primaryElected: false };
  }
}

/**
 * Prefer Docker Compose when available; otherwise use a locally installed mongod.
 */
export async function readReplicaSetSummary() {
  if (resolveDockerBinaryOrNull()) {
    try {
      return readDockerReplicaSetSummary();
    } catch {
      // Fall through to native probe when Compose is installed but unused.
    }
  }
  return readNativeTopology();
}

/**
 * Idempotent replica-set initialization for the local single-node topology.
 */
export async function initializeReplicaSet() {
  if (!resolveDockerBinaryOrNull()) {
    try {
      return await initializeNativeReplicaSet();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`${message}\n${formatNativeWindowsReplicaSetInstructions()}`);
    }
  }

  await waitForMongodPing();

  const summary = readDockerReplicaSetSummary();
  if (summary.primaryElected) {
    return summary;
  }

  if (!summary.initiated) {
    const host = `${LOCAL_MONGODB_HOST}:${LOCAL_MONGODB_PORT}`;
    const initiateScript = `rs.initiate({_id:'${REPLICA_SET_NAME}',members:[{_id:0,host:'${host}'}]})`;
    const initResult = dockerComposeExec(initiateScript, { stdio: 'pipe' });
    if (initResult.status !== 0) {
      const alreadyInit =
        initResult.stderr?.includes('already initialized') ||
        initResult.stdout?.includes('already initialized');
      if (!alreadyInit) {
        throw new Error(
          `Replica set initialization failed: ${initResult.stderr || initResult.stdout}`,
        );
      }
    }
  }

  for (let attempt = 1; attempt <= 60; attempt += 1) {
    const current = readDockerReplicaSetSummary();
    if (current.primaryElected) {
      return current;
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  throw new Error(`Replica set '${REPLICA_SET_NAME}' did not elect a PRIMARY in time.`);
}
