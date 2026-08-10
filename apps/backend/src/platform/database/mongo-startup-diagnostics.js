const { MongoClient } = require('mongodb');

const DIAGNOSTIC_TIMEOUT_MS = 4_000;

function extractReplicaSetFromUri(mongodbUri) {
  try {
    const normalized = mongodbUri.replace(/^mongodb(\+srv)?:\/\//i, 'http://');
    const url = new URL(normalized);
    return url.searchParams.get('replicaSet');
  } catch {
    const match = /(?:\?|&)replicaSet=([^&]+)/i.exec(mongodbUri);
    return match ? decodeURIComponent(match[1]) : null;
  }
}

function assertMongoConnectionContract(config) {
  const issues = [];

  if (!config || typeof config.mongodbUri !== 'string' || config.mongodbUri.trim() === '') {
    issues.push('MONGODB_URI is missing or empty');
  }
  if (
    !config ||
    typeof config.mongodbDbName !== 'string' ||
    config.mongodbDbName.trim() === ''
  ) {
    issues.push('MONGODB_DB_NAME is missing or empty');
  }
  if (
    !config ||
    typeof config.mongodbReplicaSet !== 'string' ||
    config.mongodbReplicaSet.trim() === ''
  ) {
    issues.push('MONGODB_REPLICA_SET is missing or empty');
  }

  if (issues.length > 0) {
    return {
      ok: false,
      code: 'invalid_database_configuration',
      message: `Invalid database configuration:\n- ${issues.join('\n- ')}`,
    };
  }

  const uriReplicaSet = extractReplicaSetFromUri(config.mongodbUri);
  if (!uriReplicaSet) {
    return {
      ok: false,
      code: 'invalid_database_configuration',
      message:
        'Invalid database configuration:\n- MONGODB_URI must include replicaSet=<name> (standalone MongoDB is not supported)',
    };
  }

  if (uriReplicaSet !== config.mongodbReplicaSet) {
    return {
      ok: false,
      code: 'invalid_database_configuration',
      message: `Invalid database configuration:\n- MONGODB_URI replicaSet=${uriReplicaSet} does not match MONGODB_REPLICA_SET=${config.mongodbReplicaSet}`,
    };
  }

  return { ok: true, code: 'ok', message: 'ok', uriReplicaSet };
}

function buildDirectUri(mongodbUri) {
  try {
    const normalized = mongodbUri.replace(/^mongodb(\+srv)?:\/\//i, 'http://');
    const url = new URL(normalized);
    url.searchParams.delete('replicaSet');
    url.searchParams.set('directConnection', 'true');
    const protocol = mongodbUri.startsWith('mongodb+srv://') ? 'mongodb+srv://' : 'mongodb://';
    return `${protocol}${url.host}${url.pathname}?${url.searchParams.toString()}`;
  } catch {
    const base = mongodbUri.split('?')[0];
    return `${base}?directConnection=true`;
  }
}

async function withClient(uri, run) {
  const client = new MongoClient(uri, {
    serverSelectionTimeoutMS: DIAGNOSTIC_TIMEOUT_MS,
  });
  try {
    await client.connect();
    return await run(client);
  } finally {
    await client.close().catch(() => undefined);
  }
}

async function readHello(client) {
  return client.db('admin').command({ hello: 1 });
}

/**
 * Classify why Agrivio cannot use the configured MongoDB replica-set topology.
 * Never falls back to standalone acceptance.
 */
async function diagnoseMongoStartupFailure(config, connectError) {
  const contract = assertMongoConnectionContract(config);
  if (!contract.ok) {
    return contract;
  }

  const expectedRs = config.mongodbReplicaSet;
  const originalMessage =
    connectError instanceof Error ? connectError.message : String(connectError);

  let directHello;
  try {
    directHello = await withClient(buildDirectUri(config.mongodbUri), readHello);
  } catch (directError) {
    const directMessage =
      directError instanceof Error ? directError.message : String(directError);
    return {
      ok: false,
      code: 'mongo_unreachable',
      message: [
        'MongoDB is unreachable at the configured host/port.',
        `Expected replica set '${expectedRs}' and database '${config.mongodbDbName}'.`,
        `Direct probe error: ${directMessage}`,
        `Original driver error: ${originalMessage}`,
        'Verify mongod is listening on 127.0.0.1:27017, then run `npm run db:status`.',
      ].join('\n'),
    };
  }

  const observedSetName =
    typeof directHello.setName === 'string' && directHello.setName.trim() !== ''
      ? directHello.setName
      : null;

  if (!observedSetName) {
    return {
      ok: false,
      code: 'mongo_not_replica_set',
      message: [
        'MongoDB is reachable but is not running as a replica set.',
        `Agrivio requires single-node replica set '${expectedRs}' (transactions); standalone mode is not supported.`,
        'For a locally installed MongoDB on Windows, set replication.replSetName: rs0 in mongod.cfg, restart the MongoDB service, then run `npm run db:init`.',
        'Docker alternative: `npm run db:up` then `npm run db:init`.',
        `Original driver error: ${originalMessage}`,
      ].join('\n'),
    };
  }

  if (observedSetName !== expectedRs) {
    return {
      ok: false,
      code: 'wrong_replica_set_name',
      message: [
        `MongoDB is reachable as replica set '${observedSetName}', but Agrivio expects '${expectedRs}'.`,
        'Align mongod replication.replSetName / rs.initiate _id with MONGODB_REPLICA_SET and the replicaSet query param in MONGODB_URI.',
        `Original driver error: ${originalMessage}`,
      ].join('\n'),
    };
  }

  const isPrimary = directHello.isWritablePrimary === true;
  if (!isPrimary) {
    return {
      ok: false,
      code: 'no_primary',
      message: [
        `MongoDB replica set '${expectedRs}' is reachable but has no PRIMARY on this member.`,
        'Wait for primary election or run `npm run db:init`, then `npm run db:status`.',
        `Original driver error: ${originalMessage}`,
      ].join('\n'),
    };
  }

  try {
    await withClient(config.mongodbUri, async (client) => {
      await client.db(config.mongodbDbName).command({ ping: 1 });
    });
  } catch (dbError) {
    const dbMessage = dbError instanceof Error ? dbError.message : String(dbError);
    return {
      ok: false,
      code: 'invalid_database_configuration',
      message: [
        `Replica set '${expectedRs}' has a PRIMARY, but database connectivity for '${config.mongodbDbName}' failed.`,
        `Database probe error: ${dbMessage}`,
        `Original driver error: ${originalMessage}`,
      ].join('\n'),
    };
  }

  return {
    ok: false,
    code: 'mongo_connection_failed',
    message: [
      'MongoDB topology looks healthy under a direct probe, but the replica-set URI connection still failed.',
      `Original driver error: ${originalMessage}`,
      'Confirm MONGODB_URI uses 127.0.0.1:27017/?replicaSet=rs0 and run `npm run db:status`.',
    ].join('\n'),
  };
}

/**
 * After a successful mongoose.connect, refuse non-PRIMARY / wrong RS topologies.
 */
async function assertConnectedReplicaSetReady(config) {
  const contract = assertMongoConnectionContract(config);
  if (!contract.ok) {
    const error = new Error(contract.message);
    error.code = contract.code;
    throw error;
  }

  const hello = await withClient(config.mongodbUri, readHello);
  const observedSetName =
    typeof hello.setName === 'string' && hello.setName.trim() !== '' ? hello.setName : null;

  if (!observedSetName) {
    const error = new Error(
      [
        'Connected to MongoDB, but the deployment is not a replica set.',
        'Agrivio does not allow standalone mode.',
      ].join('\n'),
    );
    error.code = 'mongo_not_replica_set';
    throw error;
  }

  if (observedSetName !== config.mongodbReplicaSet) {
    const error = new Error(
      `Connected replica set '${observedSetName}' does not match MONGODB_REPLICA_SET='${config.mongodbReplicaSet}'.`,
    );
    error.code = 'wrong_replica_set_name';
    throw error;
  }

  if (hello.isWritablePrimary !== true) {
    const error = new Error(
      `Replica set '${config.mongodbReplicaSet}' is connected but this member is not PRIMARY.`,
    );
    error.code = 'no_primary';
    throw error;
  }
}

module.exports = {
  extractReplicaSetFromUri,
  assertMongoConnectionContract,
  diagnoseMongoStartupFailure,
  assertConnectedReplicaSetReady,
  buildDirectUri,
};
