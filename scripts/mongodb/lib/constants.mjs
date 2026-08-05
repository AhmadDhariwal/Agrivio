import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const scriptDir = dirname(fileURLToPath(import.meta.url));

export const REPO_ROOT = join(scriptDir, '../../..');

export const MONGO_IMAGE_TAG = '8.2.12';
export const MONGO_IMAGE = `mongo:${MONGO_IMAGE_TAG}`;
export const REPLICA_SET_NAME = 'rs0';
export const DEV_DATABASE_NAME = 'agrivio_dev';
export const TEST_DATABASE_PREFIX = 'agrivio_test_';
export const LOCAL_MONGODB_HOST = '127.0.0.1';
export const LOCAL_MONGODB_PORT = 27017;
export const LOCAL_MONGODB_URI = `mongodb://${LOCAL_MONGODB_HOST}:${LOCAL_MONGODB_PORT}/?replicaSet=${REPLICA_SET_NAME}`;
export const COMPOSE_FILE = join(REPO_ROOT, 'tools/docker/mongodb/compose.yml');
export const COMPOSE_SERVICE = 'mongodb';
