import mongoose from 'mongoose';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { BackupOperationModel } from './persistence/backup-operation.model.js';

describe('Backup operation Mongo persistence', () => {
  const uri = process.env['MONGODB_URI'] ?? 'mongodb://127.0.0.1:27017/Agrivio?replicaSet=rs0';
  const isolatedDb = `agrivio_backup_operation_${Date.now()}`;
  let mongoReady = false;

  beforeAll(async () => {
    const parsed = new URL(uri);
    parsed.pathname = `/${isolatedDb}`;
    try {
      await mongoose.connect(parsed.toString(), { serverSelectionTimeoutMS: 5000 });
      const hello = await mongoose.connection.db.admin().command({ hello: 1 });
      mongoReady = hello.setName === 'rs0' && hello.isWritablePrimary === true;
      if (!mongoReady) {
        await mongoose.disconnect();
        return;
      }
      await BackupOperationModel.syncIndexes();
    } catch {
      mongoReady = false;
      if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
    }
  }, 60000);

  afterAll(async () => {
    if (!mongoReady) return;
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  });

  it('persists verification metadata and enforces one running backup', async ({ skip }) => {
    if (!mongoReady) skip('Mongo replica set rs0 PRIMARY is required for backup index proof');
    await BackupOperationModel.create({
      status: 'running',
      recordedAt: new Date(),
      startedAt: new Date(),
      databaseName: isolatedDb,
      restoreReady: false,
    });
    await expect(
      BackupOperationModel.create({ status: 'running', recordedAt: new Date() }),
    ).rejects.toMatchObject({ code: 11000 });
    const indexes = await BackupOperationModel.collection.indexes();
    expect(
      indexes.some(
        (index) =>
          index.unique === true &&
          index.key.status === 1 &&
          index.partialFilterExpression?.status === 'running',
      ),
    ).toBe(true);
  });
});
