const mongoose = require('mongoose');
const { mkdir, readFile, writeFile } = require('node:fs/promises');
const { join } = require('node:path');
const { tmpdir } = require('node:os');
const { ImportJobModel, ImportRowErrorModel } = require('./persistence/import-job.model');
const { AuditEventModel } = require('../audit/persistence/audit-event.model');

function withSession(session) {
  return session ? { session } : {};
}

function workbookPath(storageRef) {
  return join(tmpdir(), 'agrivio-imports', storageRef.replaceAll(':', '_').replaceAll('/', '_'));
}

function createMongooseImportsStore() {
  return {
    async insertJob(session, doc) {
      const [created] = await ImportJobModel.create([doc], withSession(session));
      return created.toObject();
    },

    async findJobById(organizationId, id) {
      if (!mongoose.isValidObjectId(id)) {
        return null;
      }
      return ImportJobModel.findOne({ _id: id, organizationId }).lean().exec();
    },

    async updateJob(session, organizationId, id, patch) {
      return ImportJobModel.findOneAndUpdate(
        { _id: id, organizationId },
        { $set: patch },
        { new: true, ...withSession(session) },
      )
        .lean()
        .exec();
    },

    async claimExecute(organizationId, id) {
      return ImportJobModel.findOneAndUpdate(
        { _id: id, organizationId, status: { $in: ['confirmed', 'failed'] } },
        { $set: { status: 'executing' }, $inc: { version: 1 } },
        { new: true },
      )
        .lean()
        .exec();
    },

    async replaceErrors(session, organizationId, importJobId, errors) {
      await ImportRowErrorModel.deleteMany({ organizationId, importJobId }, withSession(session));
      if (errors.length === 0) {
        return;
      }
      await ImportRowErrorModel.create(
        errors.map((error) => ({
          organizationId,
          importJobId,
          rowNumber: error.rowNumber,
          field: error.field,
          code: error.code ?? '',
          message: error.message,
        })),
        withSession(session),
      );
    },

    async listErrors(organizationId, importJobId) {
      return ImportRowErrorModel.find({ organizationId, importJobId })
        .sort({ rowNumber: 1, field: 1 })
        .lean()
        .exec();
    },

    async writeWorkbook(storageRef, buffer) {
      const path = workbookPath(storageRef);
      await mkdir(join(tmpdir(), 'agrivio-imports'), { recursive: true });
      await writeFile(path, buffer);
    },

    async readWorkbook(storageRef) {
      return readFile(workbookPath(storageRef));
    },

    async appendAuditEvent(session, event) {
      await AuditEventModel.create([event], withSession(session));
    },
  };
}

function createInMemoryImportsStore() {
  const jobs = new Map();
  const errors = [];
  const workbooks = new Map();
  const audits = [];
  let seq = 1;

  return {
    async insertJob(_session, doc) {
      const id = `import-${seq++}`;
      const record = { _id: id, ...doc };
      jobs.set(id, record);
      return { ...record };
    },

    async findJobById(organizationId, id) {
      const record = jobs.get(id);
      if (record === undefined || String(record.organizationId) !== String(organizationId)) {
        return null;
      }
      return { ...record };
    },

    async updateJob(_session, organizationId, id, patch) {
      const existing = await this.findJobById(organizationId, id);
      if (existing === null) {
        return null;
      }
      const next = { ...existing, ...patch };
      jobs.set(id, next);
      return { ...next };
    },

    async claimExecute(organizationId, id) {
      const existing = await this.findJobById(organizationId, id);
      if (existing === null || (existing.status !== 'confirmed' && existing.status !== 'failed')) {
        return null;
      }
      const next = { ...existing, status: 'executing', version: Number(existing.version ?? 1) + 1 };
      jobs.set(id, next);
      return { ...next };
    },

    async replaceErrors(_session, organizationId, importJobId, nextErrors) {
      for (let index = errors.length - 1; index >= 0; index -= 1) {
        if (
          String(errors[index].organizationId) === String(organizationId) &&
          String(errors[index].importJobId) === String(importJobId)
        ) {
          errors.splice(index, 1);
        }
      }
      for (const error of nextErrors) {
        errors.push({
          organizationId,
          importJobId,
          rowNumber: error.rowNumber,
          field: error.field,
          code: error.code ?? '',
          message: error.message,
        });
      }
    },

    async listErrors(organizationId, importJobId) {
      return errors.filter(
        (item) =>
          String(item.organizationId) === String(organizationId) &&
          String(item.importJobId) === String(importJobId),
      );
    },

    async writeWorkbook(storageRef, buffer) {
      workbooks.set(storageRef, Buffer.from(buffer));
    },

    async readWorkbook(storageRef) {
      const buffer = workbooks.get(storageRef);
      if (!buffer) {
        throw new Error('Workbook storage is missing');
      }
      return Buffer.from(buffer);
    },

    async appendAuditEvent(_session, event) {
      audits.push(event);
    },

    listAuditsForTest() {
      return [...audits];
    },
  };
}

module.exports = {
  createInMemoryImportsStore,
  createMongooseImportsStore,
};
