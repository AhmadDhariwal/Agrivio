const {
  createMockTransactionSessionPort,
  createTransactionRunner,
} = require('../../platform/transactions/transaction-runner');
const { createAuditWriter } = require('../../platform/audit/audit-writer');
const { assertOptimisticVersion } = require('../../platform/validation/request-validation');
const { conflict, notFound } = require('../../platform/errors/app-error');
const {
  assertCreationLimit,
  attachSoftWarning,
} = require('../subscriptions/creation-limit');
const {
  generateActivationToken,
  normalizeEmail,
} = require('./crypto-tokens');
const {
  assertOwnerPresenceAfterMembershipChange,
} = require('./owner-presence');
const { parseEmployeeCreate, parseEmployeePatch } = require('./employees.validation');
const {
  createInMemoryEmployeesStore,
  createMongooseEmployeesStore,
} = require('./employees.store');

const DEFAULT_ACTIVATION_TTL_MS = 24 * 60 * 60 * 1000;

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

function buildActivationPath(token) {
  return `/activate?token=${encodeURIComponent(token)}`;
}

function buildActivationUrl(publicWebBaseUrl, token) {
  return `${publicWebBaseUrl}${buildActivationPath(token)}`;
}

function toEmployeeDto(membership, user, assignments = []) {
  return {
    id: String(user['_id']),
    membershipId: String(membership['_id']),
    email: String(user['email']),
    displayName: String(user['displayName']),
    role: String(membership['role']),
    status: String(membership['status']),
    userStatus: String(user['status']),
    version: Number(membership['version'] ?? 1),
    branchIds: assignments
      .filter((item) => item.assignmentType === 'branch')
      .map((item) => String(item.targetId)),
    warehouseIds: assignments
      .filter((item) => item.assignmentType === 'warehouse')
      .map((item) => String(item.targetId)),
  };
}

function createEmployeesService(deps) {
  const store = deps.store;
  const evaluateEntitlement = deps.evaluateEntitlement;
  const publicWebBaseUrl = deps.publicWebBaseUrl ?? 'http://localhost:4200';
  const activationTtlMs = deps.activationTtlMs ?? DEFAULT_ACTIVATION_TTL_MS;
  const now = deps.now ?? (() => new Date());
  const auditWriter = createAuditWriter({
    append: (session, event) => store.appendAuditEvent(session, event),
  });
  const transactionRunner = deps.transactionRunner;

  async function loadEmployee(organizationId, userId) {
    const membership = await store.findMembershipByOrganizationAndUserId(organizationId, userId);
    if (membership === null) {
      return null;
    }
    const user = await store.findUserById(String(membership['userId']));
    if (user === null) {
      return null;
    }
    const assignments = await store.listAccessAssignmentsByMembershipId(String(membership['_id']));
    return { membership, user, assignments };
  }

  return {
    async listEmployees(organizationId, options = {}) {
      let result;
      if (typeof store.listMembershipsPage === 'function') {
        result = await store.listMembershipsPage(organizationId, options, options);
      } else {
        const all = await store.listMembershipsByOrganizationId(organizationId);
        result = { items: all.slice(options.skip ?? 0, (options.skip ?? 0) + (options.pageSize ?? 25)), total: all.length };
      }
      const memberships = result.items;
      const items = [];
      for (const membership of memberships) {
        const user = membership.user ?? (await store.findUserById(String(membership['userId'])));
        if (user === null) {
          continue;
        }
        const assignments = await store.listAccessAssignmentsByMembershipId(
          String(membership['_id']),
        );
        items.push(toEmployeeDto(membership, user, assignments));
      }
      return { items, total: result.total };
    },

    async getEmployee(organizationId, userId) {
      const loaded = await loadEmployee(organizationId, userId);
      if (loaded === null) {
        throw notFound('Organization user not found');
      }
      return toEmployeeDto(loaded.membership, loaded.user, loaded.assignments);
    },

    async findEmployeeDisplayNamesByUserIds(organizationId, userIds) {
      if (!Array.isArray(userIds) || userIds.length === 0) {
        return new Map();
      }
      const uniqueIds = [
        ...new Set(
          userIds
            .filter((id) => id !== null && id !== undefined && String(id).trim() !== '')
            .map(String),
        ),
      ];
      if (uniqueIds.length === 0 || typeof store.findMembershipsWithUsersByUserIds !== 'function') {
        return new Map();
      }
      const rows = await store.findMembershipsWithUsersByUserIds(organizationId, uniqueIds);
      const nameMap = new Map();
      for (const row of rows) {
        const userId = String(row.userId ?? row.user?.['_id'] ?? '');
        if (userId === '') {
          continue;
        }
        nameMap.set(userId, String(row.user?.displayName ?? '—'));
      }
      return nameMap;
    },

    async createEmployee(organizationId, body, actor) {
      const input = parseEmployeeCreate(body);
      const emailNormalized = normalizeEmail(input.email);
      const currentUsage = await store.countActiveUsers(organizationId);
      const entitlement = await assertCreationLimit(
        evaluateEntitlement,
        organizationId,
        'activeUsers',
        currentUsage,
      );

      return transactionRunner.run(async (session) => {
        let user = await store.findUserByEmailNormalized(emailNormalized);
        let activationHandoff = null;

        if (user !== null) {
          if (user['platformAccess'] === 'super_admin' && input.role !== 'Owner') {
            // Super Admin may receive an org membership, but never via inventing platformAccess.
          }
          const existingMembership = await store.findMembershipByOrganizationAndUserId(
            organizationId,
            String(user['_id']),
          );
          if (existingMembership !== null) {
            throw conflict('User already belongs to this organization');
          }
        } else {
          user = await store.insertUser(session, {
            email: input.email,
            emailNormalized,
            displayName: input.displayName,
            status: 'pending_activation',
            version: 1,
          });
        }

        const hasCredentials =
          typeof user['passwordHash'] === 'string' && user['passwordHash'].length > 0;
        const membershipStatus =
          user['status'] === 'active' && hasCredentials ? 'active' : 'pending';

        const membership = await store.insertMembership(session, {
          organizationId,
          userId: user['_id'],
          role: input.role,
          status: membershipStatus,
          conditionalPermissionGrants: [],
          version: 1,
        });

        if (membershipStatus === 'pending' || user['status'] === 'pending_activation') {
          const expiresAt = new Date(now().getTime() + activationTtlMs);
          const { token, tokenHash } = generateActivationToken();
          await store.consumeOpenActivationTokens(
            session,
            String(user['_id']),
            organizationId,
            now(),
          );
          await store.insertActivationToken(session, {
            userId: user['_id'],
            organizationId,
            tokenHash,
            expiresAt,
            purpose: 'employee_activation',
          });
          if (user['displayName'] !== input.displayName && !hasCredentials) {
            user = await store.updateUser(session, String(user['_id']), {
              displayName: input.displayName,
            });
          }
          activationHandoff = {
            activationToken: token,
            activationTokenExpiresAt: expiresAt.toISOString(),
            activationPath: buildActivationPath(token),
            activationUrl: buildActivationUrl(publicWebBaseUrl, token),
          };
        } else if (user['displayName'] !== input.displayName) {
          user = await store.updateUser(session, String(user['_id']), {
            displayName: input.displayName,
            version: Number(user['version'] ?? 1) + 1,
          });
        }

        await auditWriter.appendBusinessEvent(session, {
          organizationId,
          actorId: actor.actorId,
          action: 'user.created',
          resourceType: 'organization_membership',
          resourceId: String(membership['_id']),
          metadata: { role: input.role, email: emailNormalized },
        });

        const dto = toEmployeeDto(membership, user, []);
        const withHandoff = activationHandoff === null ? dto : { ...dto, ...activationHandoff };
        return attachSoftWarning(withHandoff, entitlement);
      });
    },

    async updateEmployee(organizationId, userId, body, actor) {
      const { expectedVersion, patch } = parseEmployeePatch(body);

      return transactionRunner.run(async (session) => {
        const loaded = await loadEmployee(organizationId, userId);
        if (loaded === null) {
          throw notFound('Organization user not found');
        }
        const { membership, user } = loaded;
        assertOptimisticVersion(membership, expectedVersion);

        if (patch.role !== undefined && patch.role !== membership['role']) {
          const allMemberships = await store.listMembershipsByOrganizationId(organizationId);
          assertOwnerPresenceAfterMembershipChange(allMemberships, String(membership['_id']), {
            role: patch.role,
          });
        }

        const membershipPatch = {};
        if (patch.role !== undefined) {
          membershipPatch.role = patch.role;
        }
        if (Object.keys(membershipPatch).length > 0) {
          membershipPatch.version = Number(membership['version']) + 1;
        }

        let updatedMembership = membership;
        if (Object.keys(membershipPatch).length > 0) {
          updatedMembership = await store.updateMembership(
            session,
            String(membership['_id']),
            membershipPatch,
          );
        }

        let updatedUser = user;
        if (patch.displayName !== undefined) {
          updatedUser = await store.updateUser(session, String(user['_id']), {
            displayName: patch.displayName,
            version: Number(user['version'] ?? 1) + 1,
          });
        }

        await store.revokeAllSessionsForUser(session, String(user['_id']), now());

        await auditWriter.appendBusinessEvent(session, {
          organizationId,
          actorId: actor.actorId,
          action: 'user.updated',
          resourceType: 'organization_membership',
          resourceId: String(membership['_id']),
          metadata: { fields: Object.keys(patch) },
        });

        const assignments = await store.listAccessAssignmentsByMembershipId(
          String(membership['_id']),
        );
        return toEmployeeDto(updatedMembership, updatedUser, assignments);
      });
    },

    async deactivateEmployee(organizationId, userId, actor) {
      return transactionRunner.run(async (session) => {
        const loaded = await loadEmployee(organizationId, userId);
        if (loaded === null) {
          throw notFound('Organization user not found');
        }
        const { membership, user } = loaded;

        if (membership['status'] === 'deactivated') {
          return toEmployeeDto(membership, user, loaded.assignments);
        }

        const allMemberships = await store.listMembershipsByOrganizationId(organizationId);
        assertOwnerPresenceAfterMembershipChange(allMemberships, String(membership['_id']), {
          status: 'deactivated',
        });

        const updatedMembership = await store.updateMembership(session, String(membership['_id']), {
          status: 'deactivated',
          version: Number(membership['version']) + 1,
        });

        if (typeof store.revokeAccessAssignmentsForMembership === 'function') {
          await store.revokeAccessAssignmentsForMembership(
            session,
            String(membership['_id']),
            now(),
          );
        }

        await store.revokeAllSessionsForUser(session, String(user['_id']), now());

        await auditWriter.appendBusinessEvent(session, {
          organizationId,
          actorId: actor.actorId,
          action: 'user.deactivated',
          resourceType: 'organization_membership',
          resourceId: String(membership['_id']),
        });

        return toEmployeeDto(updatedMembership, user, []);
      });
    },

    async findMembershipInOrganization(organizationId, userId) {
      return store.findMembershipByOrganizationAndUserId(organizationId, userId);
    },
  };
}

function createEmployeesModule(options) {
  const persistence = options.persistence ?? 'memory';
  const store =
    options.store ??
    (persistence === 'mongoose' ? createMongooseEmployeesStore() : createInMemoryEmployeesStore());

  const sessionPort =
    options.sessionPort ??
    (persistence === 'mongoose'
      ? createMongooseTransactionSessionPort()
      : createMockTransactionSessionPort().port);

  const transactionRunner = options.transactionRunner ?? createTransactionRunner(sessionPort);
  const employeesService = createEmployeesService({
    store,
    transactionRunner,
    publicWebBaseUrl: options.publicWebBaseUrl,
    ...(options.evaluateEntitlement === undefined
      ? {}
      : { evaluateEntitlement: options.evaluateEntitlement }),
    ...(options.now === undefined ? {} : { now: options.now }),
    ...(options.activationTtlMs === undefined ? {} : { activationTtlMs: options.activationTtlMs }),
  });

  return {
    store,
    employeesService,
  };
}

module.exports = {
  createEmployeesService,
  createEmployeesModule,
  createInMemoryEmployeesStore,
  createMongooseEmployeesStore,
  toEmployeeDto,
};
