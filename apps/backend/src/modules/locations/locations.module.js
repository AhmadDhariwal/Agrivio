const {
  createMockTransactionSessionPort,
  createTransactionRunner,
} = require('../../platform/transactions/transaction-runner');
const { createAuditWriter } = require('../../platform/audit/audit-writer');
const { assertOptimisticVersion } = require('../../platform/validation/request-validation');
const { conflict, notFound, validationFailed } = require('../../platform/errors/app-error');
const { assertMasterUnused } = require('../../platform/lifecycle/record-in-use');
const {
  assertCreationLimit,
  attachSoftWarning,
} = require('../subscriptions/creation-limit');
const {
  parseBranchCreate,
  parseBranchPatch,
  parseWarehouseCreate,
  parseWarehousePatch,
  parseAccessAssignmentsReplace,
  toBranchDto,
  toWarehouseDto,
} = require('./locations.validation');
const {
  createInMemoryLocationsStore,
  createMongooseLocationsStore,
} = require('./locations.store');

function createMongooseTransactionSessionPort() {
  const mongoose = require('mongoose');
  return {
    async startSession() {
      return mongoose.startSession();
    },
    async withTransaction(session, work) {
      return session.withTransaction(async () => work(session));
    },
    async endSession(session) {
      await session.endSession();
    },
  };
}

function mapDuplicate(error, message) {
  if (error && error.agrivioDuplicate === true) {
    throw conflict(message);
  }
  throw error;
}

function createLocationsService(deps) {
  const store = deps.store;
  const evaluateEntitlement = deps.evaluateEntitlement;
  const findMembershipInOrganization = deps.findMembershipInOrganization;
  const revokeSessionsForUser = deps.revokeSessionsForUser;
  const auditWriter = createAuditWriter({
    append: (session, event) => store.appendAuditEvent(session, event),
  });
  const transactionRunner = deps.transactionRunner;
  const now = deps.now ?? (() => new Date());

  return {
    async listBranches(organizationId, options = {}) {
      const items = await store.listBranches(organizationId);
      const filtered =
        options.status === 'active' || options.status === 'inactive'
          ? items.filter((item) => String(item.status) === options.status)
          : items;
      return { items: filtered.map(toBranchDto) };
    },

    async getBranch(organizationId, branchId) {
      const record = await store.findBranchById(organizationId, branchId);
      if (record === null) {
        throw notFound('Branch not found');
      }
      return toBranchDto(record);
    },

    async createBranch(organizationId, body, actor) {
      const input = parseBranchCreate(body);
      const currentUsage = await store.countBranches(organizationId);
      const entitlement = await assertCreationLimit(
        evaluateEntitlement,
        organizationId,
        'branches',
        currentUsage,
      );

      try {
        return await transactionRunner.run(async (session) => {
          const created = await store.insertBranch(session, {
            organizationId,
            ...input,
            version: 1,
          });
          await auditWriter.appendBusinessEvent(session, {
            organizationId,
            actorId: actor.actorId,
            action: 'branch.created',
            resourceType: 'branch',
            resourceId: String(created['_id']),
            metadata: { invoicePrefix: created.invoicePrefix },
          });
          const dto = toBranchDto(created);
          return attachSoftWarning(dto, entitlement);
        });
      } catch (error) {
        mapDuplicate(error, 'Branch name or invoice prefix already exists in this organization');
      }
    },

    async updateBranch(organizationId, branchId, body, actor) {
      const { expectedVersion, patch } = parseBranchPatch(body);
      try {
        return await transactionRunner.run(async (session) => {
          const current = await store.findBranchById(organizationId, branchId);
          if (current === null) {
            throw notFound('Branch not found');
          }
          assertOptimisticVersion(current, expectedVersion);
          const updated = await store.updateBranch(session, organizationId, branchId, {
            ...patch,
            version: Number(current['version']) + 1,
          });
          await auditWriter.appendBusinessEvent(session, {
            organizationId,
            actorId: actor.actorId,
            action: 'branch.updated',
            resourceType: 'branch',
            resourceId: branchId,
            metadata: { fields: Object.keys(patch) },
          });
          return toBranchDto(updated);
        });
      } catch (error) {
        mapDuplicate(error, 'Branch name or invoice prefix already exists in this organization');
      }
    },

    async deleteBranch(organizationId, branchId, actor) {
      const current = await store.findBranchById(organizationId, branchId);
      if (current === null) {
        throw notFound('Branch not found');
      }
      const extra =
        typeof deps.listBranchReferences === 'function'
          ? await deps.listBranchReferences(organizationId, branchId)
          : [];
      assertMasterUnused(extra);
      return transactionRunner.run(async (session) => {
        const deleted = await store.deleteBranch(session, organizationId, branchId);
        if (!deleted) {
          throw notFound('Branch not found');
        }
        await auditWriter.appendBusinessEvent(session, {
          organizationId,
          actorId: actor.actorId,
          action: 'branch.deleted',
          resourceType: 'branch',
          resourceId: branchId,
          metadata: { name: current.name },
        });
        return { id: branchId, deleted: true };
      });
    },

    async listWarehouses(organizationId, options = {}) {
      const items = await store.listWarehouses(organizationId);
      const filtered =
        options.status === 'active' || options.status === 'inactive'
          ? items.filter((item) => String(item.status) === options.status)
          : items;
      return { items: filtered.map(toWarehouseDto) };
    },

    async getWarehouse(organizationId, warehouseId) {
      const record = await store.findWarehouseById(organizationId, warehouseId);
      if (record === null) {
        throw notFound('Warehouse not found');
      }
      return toWarehouseDto(record);
    },

    async createWarehouse(organizationId, body, actor) {
      const input = parseWarehouseCreate(body);
      const currentUsage = await store.countWarehouses(organizationId);
      const entitlement = await assertCreationLimit(
        evaluateEntitlement,
        organizationId,
        'warehouses',
        currentUsage,
      );

      try {
        return await transactionRunner.run(async (session) => {
          const created = await store.insertWarehouse(session, {
            organizationId,
            ...input,
            version: 1,
          });
          await auditWriter.appendBusinessEvent(session, {
            organizationId,
            actorId: actor.actorId,
            action: 'warehouse.created',
            resourceType: 'warehouse',
            resourceId: String(created['_id']),
          });
          const dto = toWarehouseDto(created);
          return attachSoftWarning(dto, entitlement);
        });
      } catch (error) {
        mapDuplicate(error, 'Warehouse name already exists in this organization');
      }
    },

    async updateWarehouse(organizationId, warehouseId, body, actor) {
      const { expectedVersion, patch } = parseWarehousePatch(body);
      try {
        return await transactionRunner.run(async (session) => {
          const current = await store.findWarehouseById(organizationId, warehouseId);
          if (current === null) {
            throw notFound('Warehouse not found');
          }
          assertOptimisticVersion(current, expectedVersion);
          const updated = await store.updateWarehouse(session, organizationId, warehouseId, {
            ...patch,
            version: Number(current['version']) + 1,
          });
          await auditWriter.appendBusinessEvent(session, {
            organizationId,
            actorId: actor.actorId,
            action: 'warehouse.updated',
            resourceType: 'warehouse',
            resourceId: warehouseId,
            metadata: { fields: Object.keys(patch) },
          });
          return toWarehouseDto(updated);
        });
      } catch (error) {
        mapDuplicate(error, 'Warehouse name already exists in this organization');
      }
    },

    async deleteWarehouse(organizationId, warehouseId, actor) {
      const current = await store.findWarehouseById(organizationId, warehouseId);
      if (current === null) {
        throw notFound('Warehouse not found');
      }
      const extra =
        typeof deps.listWarehouseReferences === 'function'
          ? await deps.listWarehouseReferences(organizationId, warehouseId)
          : [];
      assertMasterUnused(extra);
      return transactionRunner.run(async (session) => {
        const deleted = await store.deleteWarehouse(session, organizationId, warehouseId);
        if (!deleted) {
          throw notFound('Warehouse not found');
        }
        await auditWriter.appendBusinessEvent(session, {
          organizationId,
          actorId: actor.actorId,
          action: 'warehouse.deleted',
          resourceType: 'warehouse',
          resourceId: warehouseId,
          metadata: { name: current.name },
        });
        return { id: warehouseId, deleted: true };
      });
    },

    async replaceAccessAssignments(organizationId, userId, body, actor) {
      const { branchIds, warehouseIds } = parseAccessAssignmentsReplace(body);
      if (typeof findMembershipInOrganization !== 'function') {
        throw validationFailed('Membership lookup is unavailable');
      }

      const membership = await findMembershipInOrganization(organizationId, userId);
      if (membership === null) {
        throw notFound('Organization user not found');
      }

      for (const branchId of branchIds) {
        const branch = await store.findBranchById(organizationId, branchId);
        if (branch === null) {
          throw validationFailed('Branch assignment must belong to the same organization', [
            { field: 'branchIds', message: `Unknown branch ${branchId}` },
          ]);
        }
      }
      for (const warehouseId of warehouseIds) {
        const warehouse = await store.findWarehouseById(organizationId, warehouseId);
        if (warehouse === null) {
          throw validationFailed('Warehouse assignment must belong to the same organization', [
            { field: 'warehouseIds', message: `Unknown warehouse ${warehouseId}` },
          ]);
        }
      }

      return transactionRunner.run(async (session) => {
        const existing = await store.listAccessAssignmentsByMembershipId(
          organizationId,
          String(membership['_id']),
        );

        const desired = [
          ...branchIds.map((targetId) => ({ assignmentType: 'branch', targetId })),
          ...warehouseIds.map((targetId) => ({ assignmentType: 'warehouse', targetId })),
        ];
        const desiredKeys = new Set(desired.map((item) => `${item.assignmentType}:${item.targetId}`));

        for (const assignment of existing) {
          const key = `${assignment.assignmentType}:${assignment.targetId}`;
          if (!desiredKeys.has(key) && assignment.status === 'active') {
            await store.updateAccessAssignment(session, String(assignment['_id']), {
              status: 'revoked',
              version: Number(assignment['version'] ?? 1) + 1,
            });
          }
        }

        for (const item of desired) {
          const found = existing.find(
            (assignment) =>
              assignment.assignmentType === item.assignmentType &&
              String(assignment.targetId) === String(item.targetId),
          );
          if (found === undefined) {
            await store.insertAccessAssignment(session, {
              organizationId,
              membershipId: membership['_id'],
              assignmentType: item.assignmentType,
              targetId: item.targetId,
              status: 'active',
              version: 1,
            });
          } else if (found.status !== 'active') {
            await store.updateAccessAssignment(session, String(found['_id']), {
              status: 'active',
              version: Number(found['version'] ?? 1) + 1,
            });
          }
        }

        await auditWriter.appendBusinessEvent(session, {
          organizationId,
          actorId: actor.actorId,
          action: 'access_assignments.replaced',
          resourceType: 'organization_membership',
          resourceId: String(membership['_id']),
          metadata: { branchIds, warehouseIds },
        });

        if (typeof revokeSessionsForUser === 'function') {
          await revokeSessionsForUser(session, String(membership['userId']), now());
        }

        const next = await store.listAccessAssignmentsByMembershipId(
          organizationId,
          String(membership['_id']),
        );
        return {
          membershipId: String(membership['_id']),
          userId: String(membership['userId']),
          branchIds: next
            .filter((item) => item.assignmentType === 'branch' && item.status === 'active')
            .map((item) => String(item.targetId)),
          warehouseIds: next
            .filter((item) => item.assignmentType === 'warehouse' && item.status === 'active')
            .map((item) => String(item.targetId)),
        };
      });
    },
  };
}

function createLocationsModule(options) {
  const persistence = options.persistence ?? 'memory';
  const store =
    options.store ??
    (persistence === 'mongoose' ? createMongooseLocationsStore() : createInMemoryLocationsStore());

  const sessionPort =
    options.sessionPort ??
    (persistence === 'mongoose'
      ? createMongooseTransactionSessionPort()
      : createMockTransactionSessionPort().port);

  const transactionRunner = options.transactionRunner ?? createTransactionRunner(sessionPort);
  const locationsService = createLocationsService({
    store,
    transactionRunner,
    ...(options.evaluateEntitlement === undefined
      ? {}
      : { evaluateEntitlement: options.evaluateEntitlement }),
    ...(options.findMembershipInOrganization === undefined
      ? {}
      : { findMembershipInOrganization: options.findMembershipInOrganization }),
    ...(options.revokeSessionsForUser === undefined
      ? {}
      : { revokeSessionsForUser: options.revokeSessionsForUser }),
    ...(options.now === undefined ? {} : { now: options.now }),
    ...(options.listBranchReferences === undefined
      ? {}
      : { listBranchReferences: options.listBranchReferences }),
    ...(options.listWarehouseReferences === undefined
      ? {}
      : { listWarehouseReferences: options.listWarehouseReferences }),
  });

  return {
    store,
    locationsService,
  };
}

module.exports = {
  createLocationsService,
  createLocationsModule,
  createInMemoryLocationsStore,
  createMongooseLocationsStore,
};
