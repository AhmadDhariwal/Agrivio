import { initializeReplicaSet } from './lib/replica-set.mjs';
import { REPLICA_SET_NAME } from './lib/constants.mjs';

try {
  const summary = await initializeReplicaSet();
  console.log(
    `[agrivio] Replica set '${REPLICA_SET_NAME}' is ready (member state: ${summary.state ?? 'PRIMARY'}).`,
  );
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[agrivio] db:init failed: ${message}`);
  process.exit(1);
}
