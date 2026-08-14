const { BackupOperationModel } = require('./persistence/backup-operation.model');
const { RestoreOperationModel } = require('./persistence/restore-operation.model');

function createMongooseOperationsStore() {
  return {
    async insertBackup(_session, doc) {
      const [created] = await BackupOperationModel.create([doc]);
      return created.toObject();
    },
    async listBackups() {
      return BackupOperationModel.find({}).sort({ recordedAt: -1 }).lean().exec();
    },
    async insertRestore(_session, doc) {
      const [created] = await RestoreOperationModel.create([doc]);
      return created.toObject();
    },
    async findRestoreById(id) {
      const mongoose = require('mongoose');
      if (!mongoose.isValidObjectId(id)) {
        return null;
      }
      return RestoreOperationModel.findById(id).lean().exec();
    },
  };
}

function createInMemoryOperationsStore() {
  const backups = [];
  const restores = [];
  let seq = 1;

  return {
    async insertBackup(_session, doc) {
      const record = { _id: `backup-${seq++}`, ...doc };
      backups.push(record);
      return { ...record };
    },
    async listBackups() {
      return backups
        .slice()
        .sort((a, b) => new Date(b.recordedAt).getTime() - new Date(a.recordedAt).getTime())
        .map((item) => ({ ...item }));
    },
    async insertRestore(_session, doc) {
      const record = { _id: `restore-${seq++}`, ...doc };
      restores.push(record);
      return { ...record };
    },
    async findRestoreById(id) {
      const record = restores.find((item) => String(item._id) === String(id));
      return record === undefined ? null : { ...record };
    },
  };
}

module.exports = {
  createMongooseOperationsStore,
  createInMemoryOperationsStore,
};
