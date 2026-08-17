const { createAuditWriter } = require('../../platform/audit/audit-writer');
const { conflict, forbidden, unauthorized } = require('../../platform/errors/app-error');
const { generateOpaqueToken, generatePasswordResetToken, hashToken } = require('./crypto-tokens');
const { hashPassword, verifyPassword } = require('./password.service');
const {
  permissionsForMembershipRole,
  permissionsForPlatformAccess,
} = require('./role-permissions');
const { assertAssignmentSelection } = require('./assignment-scope');
const {
  parseLoginBody,
  parsePasswordResetConfirmBody,
  parsePasswordResetRequestBody,
  parseSessionContextBody,
} = require('./auth.validation');
const { createAuthRateLimiter, resolveAuthRateLimiterOptions } = require('./auth.rate-limit');

const INACTIVITY_MS = 30 * 60 * 1000;
const ABSOLUTE_MS = 12 * 60 * 60 * 1000;
const PREAUTH_MS = 60 * 60 * 1000;
const RESET_TTL_MS = 30 * 60 * 1000;

function asDate(value) {
  return value instanceof Date ? value : new Date(String(value));
}

function createAuthService(deps) {
  const store = deps.store;
  const now = deps.now ?? (() => new Date());
  const nodeEnv = deps.nodeEnv ?? 'development';
  const rateLimiter =
    deps.rateLimiter ?? createAuthRateLimiter(resolveAuthRateLimiterOptions(nodeEnv));
  const auditWriter = createAuditWriter({
    append: (session, event) => store.appendAuditEvent(session, event),
  });

  function computeExpiry(at, absoluteExpiresAt) {
    return new Date(Math.min(at.getTime() + INACTIVITY_MS, absoluteExpiresAt.getTime()));
  }

  function assertSessionAlive(session, at) {
    if (session.revokedAt !== undefined && session.revokedAt !== null) {
      throw unauthorized('Session is no longer valid');
    }
    if (asDate(session.expiresAt).getTime() <= at.getTime()) {
      throw unauthorized('Session has expired');
    }
    if (asDate(session.absoluteExpiresAt).getTime() <= at.getTime()) {
      throw unauthorized('Session has expired');
    }
  }

  async function loadAssignments(membershipId) {
    if (typeof store.listAccessAssignmentsByMembershipId !== 'function') {
      return [];
    }
    return store.listAccessAssignmentsByMembershipId(String(membershipId));
  }

  function splitAssignments(assignments) {
    const branchAssignments = [];
    const warehouseAssignments = [];
    for (const assignment of assignments) {
      if (assignment['status'] !== undefined && assignment['status'] !== 'active') {
        continue;
      }
      const entry = {
        id: String(assignment['_id'] ?? assignment['targetId']),
        targetId: String(assignment['targetId']),
        organizationId: String(assignment['organizationId']),
      };
      if (assignment['assignmentType'] === 'branch') {
        branchAssignments.push(entry);
      } else if (assignment['assignmentType'] === 'warehouse') {
        warehouseAssignments.push(entry);
      }
    }
    return { branchAssignments, warehouseAssignments };
  }

  function assertPersistedScopeStillValid(role, organizationId, assignments, session) {
    const branchId =
      session.activeBranchId === undefined || session.activeBranchId === null
        ? null
        : String(session.activeBranchId);
    const warehouseId =
      session.activeWarehouseId === undefined || session.activeWarehouseId === null
        ? null
        : String(session.activeWarehouseId);

    if (branchId !== null) {
      assertAssignmentSelection(role, organizationId, assignments, branchId, null);
    }
    if (warehouseId !== null) {
      assertAssignmentSelection(role, organizationId, assignments, null, warehouseId);
    }
  }

  async function buildAvailableContexts(user) {
    const contexts = [];
    if (user['platformAccess'] === 'super_admin') {
      contexts.push({
        contextType: 'platform',
        role: 'Super Admin',
        permissions: permissionsForPlatformAccess('super_admin'),
      });
    }

    const memberships = await store.listMembershipsByUserId(String(user['_id']));
    for (const membership of memberships) {
      if (membership['status'] !== 'active') {
        continue;
      }
      const assignments = await loadAssignments(membership['_id']);
      const { branchAssignments, warehouseAssignments } = splitAssignments(assignments);
      contexts.push({
        contextType: 'organization',
        membershipId: String(membership['_id']),
        organizationId: String(membership['organizationId']),
        role: membership['role'],
        permissions: permissionsForMembershipRole(
          String(membership['role']),
          membership['conditionalPermissionGrants'] ?? [],
        ),
        branchAssignments,
        warehouseAssignments,
      });
    }
    return contexts;
  }

  function chooseDefaultContext(user, availableContexts) {
    if (availableContexts.length === 0) {
      throw forbidden('No authorized session context is available');
    }
    const orgContext = availableContexts.find((item) => item['contextType'] === 'organization');
    if (orgContext !== undefined) {
      return orgContext;
    }
    const first = availableContexts[0];
    if (first === undefined) {
      throw forbidden('No authorized session context is available');
    }
    return first;
  }

  function sessionFieldsForContext(context) {
    const fields = {
      activeContextType: context['contextType'],
    };
    if (context['contextType'] === 'organization') {
      fields.activeMembershipId = context['membershipId'];
      fields.activeOrganizationId = context['organizationId'];
      if (context['branchId'] !== undefined && context['branchId'] !== null) {
        fields.activeBranchId = context['branchId'];
      }
      if (context['warehouseId'] !== undefined && context['warehouseId'] !== null) {
        fields.activeWarehouseId = context['warehouseId'];
      }
    }
    return fields;
  }

  async function createAuthenticatedSession(user, context, at) {
    const sessionToken = generateOpaqueToken();
    const csrfToken = generateOpaqueToken();
    const absoluteExpiresAt = new Date(at.getTime() + ABSOLUTE_MS);
    const expiresAt = computeExpiry(at, absoluteExpiresAt);

    const record = await store.insertSession(null, {
      tokenHash: sessionToken.tokenHash,
      csrfHash: csrfToken.tokenHash,
      userId: user['_id'],
      ...sessionFieldsForContext(context),
      absoluteExpiresAt,
      lastSeenAt: at,
      expiresAt,
    });

    return {
      sessionRecord: record,
      sessionToken: sessionToken.token,
      csrfToken: csrfToken.token,
      maxAgeSeconds: Math.max(1, Math.floor((expiresAt.getTime() - at.getTime()) / 1000)),
    };
  }

  async function touchSession(session, at) {
    const absoluteExpiresAt = asDate(session.absoluteExpiresAt);
    const expiresAt = computeExpiry(at, absoluteExpiresAt);
    return store.updateSession(null, String(session['_id']), {
      lastSeenAt: at,
      expiresAt,
    });
  }

  async function rotateSession(session, user, context, at) {
    await store.revokeSessionByTokenHash(null, session.tokenHash, at);
    return createAuthenticatedSession(user, context, at);
  }

  async function assertActiveMembership(user, session) {
    if (session.activeContextType === 'platform') {
      if (user['platformAccess'] !== 'super_admin') {
        throw unauthorized('Platform context is no longer authorized');
      }
      return {
        contextType: 'platform',
        role: 'Super Admin',
        permissions: permissionsForPlatformAccess('super_admin'),
        branchAssignments: [],
        warehouseAssignments: [],
      };
    }

    if (session.activeContextType !== 'organization') {
      throw unauthorized('Authentication required');
    }

    const membershipId = session.activeMembershipId;
    if (membershipId === undefined || membershipId === null) {
      throw unauthorized('Organization context is no longer authorized');
    }

    const membership = await store.findMembershipById(String(membershipId));
    if (membership === null || membership['status'] !== 'active') {
      throw unauthorized('Organization membership is no longer active');
    }
    if (String(membership['userId']) !== String(user['_id'])) {
      throw unauthorized('Organization membership is no longer authorized');
    }
    if (
      session.activeOrganizationId !== undefined &&
      String(membership['organizationId']) !== String(session.activeOrganizationId)
    ) {
      throw unauthorized('Organization membership is no longer authorized');
    }

    const assignments = await loadAssignments(membership['_id']);
    assertPersistedScopeStillValid(
      String(membership['role']),
      String(membership['organizationId']),
      assignments,
      session,
    );
    const { branchAssignments, warehouseAssignments } = splitAssignments(assignments);

    return {
      contextType: 'organization',
      membershipId: String(membership['_id']),
      organizationId: String(membership['organizationId']),
      role: membership['role'],
      permissions: permissionsForMembershipRole(
        String(membership['role']),
        membership['conditionalPermissionGrants'] ?? [],
      ),
      branchAssignments,
      warehouseAssignments,
      branchId:
        session.activeBranchId === undefined || session.activeBranchId === null
          ? null
          : String(session.activeBranchId),
      warehouseId:
        session.activeWarehouseId === undefined || session.activeWarehouseId === null
          ? null
          : String(session.activeWarehouseId),
    };
  }

  function buildAuthContext(user, session, active) {
    return {
      userId: String(user['_id']),
      contextType: active.contextType,
      permissions: [...(active.permissions ?? [])],
      role: active.role,
      branchAssignments: active.branchAssignments ?? [],
      warehouseAssignments: active.warehouseAssignments ?? [],
      ...(active.membershipId === undefined ? {} : { membershipId: active.membershipId }),
      ...(active.organizationId === undefined ? {} : { organizationId: active.organizationId }),
      ...(active.branchId === undefined || active.branchId === null
        ? {}
        : { branchId: active.branchId }),
      ...(active.warehouseId === undefined || active.warehouseId === null
        ? {}
        : { warehouseId: active.warehouseId }),
      isPlatformSuperAdmin:
        active.contextType === 'platform' && user['platformAccess'] === 'super_admin',
    };
  }

  return {
    async issueCsrf(sessionToken) {
      const at = now();
      if (typeof sessionToken === 'string' && sessionToken !== '') {
        const existing = await store.findSessionByTokenHash(hashToken(sessionToken));
        if (existing !== null) {
          try {
            assertSessionAlive(existing, at);
            const csrf = generateOpaqueToken();
            await store.updateSession(null, String(existing['_id']), {
              csrfHash: csrf.tokenHash,
              lastSeenAt: at,
              expiresAt: computeExpiry(at, asDate(existing.absoluteExpiresAt)),
            });
            return {
              csrfToken: csrf.token,
              sessionToken,
              maxAgeSeconds: Math.max(
                1,
                Math.floor((asDate(existing.expiresAt).getTime() - at.getTime()) / 1000),
              ),
              rotatedSession: false,
            };
          } catch {
            await store.revokeSessionByTokenHash(null, existing.tokenHash, at);
          }
        }
      }

      const sessionOpaque = generateOpaqueToken();
      const csrf = generateOpaqueToken();
      const absoluteExpiresAt = new Date(at.getTime() + PREAUTH_MS);
      const expiresAt = absoluteExpiresAt;
      await store.insertSession(null, {
        tokenHash: sessionOpaque.tokenHash,
        csrfHash: csrf.tokenHash,
        activeContextType: 'none',
        absoluteExpiresAt,
        lastSeenAt: at,
        expiresAt,
      });

      return {
        csrfToken: csrf.token,
        sessionToken: sessionOpaque.token,
        maxAgeSeconds: Math.max(1, Math.floor((expiresAt.getTime() - at.getTime()) / 1000)),
        rotatedSession: true,
      };
    },

    async assertCsrf(sessionToken, csrfToken) {
      if (typeof sessionToken !== 'string' || sessionToken === '') {
        throw forbidden('CSRF validation failed');
      }
      if (typeof csrfToken !== 'string' || csrfToken === '') {
        throw forbidden('CSRF validation failed');
      }
      const session = await store.findSessionByTokenHash(hashToken(sessionToken));
      if (session === null) {
        throw forbidden('CSRF validation failed');
      }
      assertSessionAlive(session, now());
      if (session.csrfHash !== hashToken(csrfToken)) {
        throw forbidden('CSRF validation failed');
      }
      return session;
    },

    async resolveAuthenticatedSession(sessionToken) {
      if (typeof sessionToken !== 'string' || sessionToken === '') {
        throw unauthorized('Authentication required');
      }
      const at = now();
      const session = await store.findSessionByTokenHash(hashToken(sessionToken));
      if (session === null || session.userId === undefined || session.userId === null) {
        throw unauthorized('Authentication required');
      }
      assertSessionAlive(session, at);
      const user = await store.findUserById(String(session.userId));
      if (user === null || user['status'] !== 'active') {
        throw unauthorized('Authentication required');
      }

      const active = await assertActiveMembership(user, session);
      await touchSession(session, at);
      const authContext = buildAuthContext(user, session, active);
      return { session, user, active, authContext };
    },

    async login(body, transport) {
      rateLimiter.assertAllowed(`login:${transport.clientKey}`);
      await this.assertCsrf(transport.sessionToken, transport.csrfToken);
      const input = parseLoginBody(body);
      rateLimiter.assertAllowed(`login:${transport.clientKey}:${input.email}`);

      const user = await store.findUserByEmailNormalized(input.email);
      if (user === null || typeof user['passwordHash'] !== 'string') {
        throw unauthorized('Invalid email or password');
      }
      if (user['status'] === 'deactivated' || user['status'] === 'pending_activation') {
        throw unauthorized('Invalid email or password');
      }
      if (user['status'] !== 'active') {
        throw unauthorized('Invalid email or password');
      }

      const passwordOk = await verifyPassword(String(user['passwordHash']), input.password);
      if (!passwordOk) {
        throw unauthorized('Invalid email or password');
      }

      const at = now();
      if (typeof transport.sessionToken === 'string') {
        await store.revokeSessionByTokenHash(null, hashToken(transport.sessionToken), at);
      }

      const availableContexts = await buildAvailableContexts(user);
      const context = chooseDefaultContext(user, availableContexts);
      const created = await createAuthenticatedSession(user, context, at);

      await auditWriter.appendBusinessEvent(null, {
        actorId: String(user['_id']),
        action: 'auth.login',
        resourceType: 'auth_session',
        resourceId: String(created.sessionRecord['_id']),
        ...(context['organizationId'] === undefined
          ? {}
          : { organizationId: String(context['organizationId']) }),
      });

      rateLimiter.reset(`login:${transport.clientKey}:${input.email}`);

      return {
        ...created,
        session: await this.buildSessionSnapshot(user, created.sessionRecord, availableContexts),
      };
    },

    async logout(transport) {
      await this.assertCsrf(transport.sessionToken, transport.csrfToken);
      const at = now();
      if (typeof transport.sessionToken === 'string' && transport.sessionToken !== '') {
        const hash = hashToken(transport.sessionToken);
        const session = await store.findSessionByTokenHash(hash);
        await store.revokeSessionByTokenHash(null, hash, at);
        if (session?.userId !== undefined) {
          await auditWriter.appendBusinessEvent(null, {
            actorId: String(session.userId),
            action: 'auth.logout',
            resourceType: 'auth_session',
            resourceId: String(session['_id']),
          });
        }
      }
      return { status: 'logged_out' };
    },

    async getSession(sessionToken) {
      const { session, user } = await this.resolveAuthenticatedSession(sessionToken);
      const availableContexts = await buildAvailableContexts(user);
      return this.buildSessionSnapshot(user, session, availableContexts);
    },

    async switchContext(body, transport) {
      const { session, user } = await this.resolveAuthenticatedSession(transport.sessionToken);
      await this.assertCsrf(transport.sessionToken, transport.csrfToken);
      const input = parseSessionContextBody(body);
      const availableContexts = await buildAvailableContexts(user);
      const at = now();

      let selected;
      if (input.contextType === 'platform') {
        selected = availableContexts.find((item) => item['contextType'] === 'platform');
      } else if (input.membershipId !== undefined) {
        selected = availableContexts.find(
          (item) =>
            item['contextType'] === 'organization' &&
            String(item['membershipId']) === input.membershipId,
        );
      } else if (input.organizationId !== undefined) {
        selected = availableContexts.find(
          (item) =>
            item['contextType'] === 'organization' &&
            String(item['organizationId']) === input.organizationId,
        );
      }

      if (selected === undefined) {
        throw forbidden('Requested session context is not authorized');
      }

      let nextContext = { ...selected };
      if (selected['contextType'] === 'organization') {
        const assignments = await loadAssignments(selected['membershipId']);
        const branchId = Object.prototype.hasOwnProperty.call(input, 'branchId')
          ? input.branchId
          : null;
        const warehouseId = Object.prototype.hasOwnProperty.call(input, 'warehouseId')
          ? input.warehouseId
          : null;

        assertAssignmentSelection(
          String(selected['role']),
          String(selected['organizationId']),
          assignments,
          branchId,
          warehouseId,
        );

        nextContext = {
          ...selected,
          ...(branchId === null ? {} : { branchId }),
          ...(warehouseId === null ? {} : { warehouseId }),
        };
      }

      const rotated = await rotateSession(session, user, nextContext, at);
      await auditWriter.appendBusinessEvent(null, {
        actorId: String(user['_id']),
        action: 'auth.session_context_switched',
        resourceType: 'auth_session',
        resourceId: String(rotated.sessionRecord['_id']),
        ...(nextContext['organizationId'] === undefined
          ? {}
          : { organizationId: String(nextContext['organizationId']) }),
        metadata: {
          contextType: nextContext['contextType'],
          ...(nextContext['membershipId'] === undefined
            ? {}
            : { membershipId: String(nextContext['membershipId']) }),
          ...(nextContext['branchId'] === undefined
            ? {}
            : { branchId: String(nextContext['branchId']) }),
          ...(nextContext['warehouseId'] === undefined
            ? {}
            : { warehouseId: String(nextContext['warehouseId']) }),
        },
      });

      return {
        ...rotated,
        session: await this.buildSessionSnapshot(user, rotated.sessionRecord, availableContexts),
      };
    },

    async requestPasswordReset(body, transport) {
      rateLimiter.assertAllowed(`reset-request:${transport.clientKey}`);
      const input = parsePasswordResetRequestBody(body);
      rateLimiter.assertAllowed(`reset-request:${transport.clientKey}:${input.email}`);

      const user = await store.findUserByEmailNormalized(input.email);
      let issuedToken;
      if (user !== null && user['status'] === 'active') {
        const token = generatePasswordResetToken();
        const at = now();
        await store.insertPasswordResetToken(null, {
          userId: user['_id'],
          tokenHash: token.tokenHash,
          expiresAt: new Date(at.getTime() + RESET_TTL_MS),
        });
        issuedToken = token.token;
        if (deps.mailTransport && typeof deps.mailTransport.sendPasswordReset === 'function') {
          try {
            await deps.mailTransport.sendPasswordReset({
              email: input.email,
              token: token.token,
            });
          } catch {
            // Generic response is still returned; delivery failure is not enumerated.
          }
        }
        await auditWriter.appendBusinessEvent(null, {
          actorId: String(user['_id']),
          action: 'auth.password_reset_requested',
          resourceType: 'password_reset_token',
        });
      }

      return {
        accepted: true,
        message: 'If an account exists for that email, a reset token has been issued.',
        ...(nodeEnv === 'test' && issuedToken !== undefined
          ? { resetTokenForTest: issuedToken }
          : {}),
      };
    },

    async confirmPasswordReset(body, transport) {
      rateLimiter.assertAllowed(`reset-confirm:${transport.clientKey}`);
      await this.assertCsrf(transport.sessionToken, transport.csrfToken);
      const input = parsePasswordResetConfirmBody(body);
      const at = now();
      const tokenHash = hashToken(input.token);
      const record = await store.findPasswordResetTokenByHash(tokenHash);

      if (record === null) {
        throw forbidden('Reset token is invalid or expired');
      }
      if (record['consumedAt'] !== undefined && record['consumedAt'] !== null) {
        throw conflict('Reset token has already been used');
      }
      if (asDate(record['expiresAt']).getTime() <= at.getTime()) {
        throw forbidden('Reset token is invalid or expired');
      }

      const user = await store.findUserById(String(record['userId']));
      if (user === null || user['status'] !== 'active') {
        throw forbidden('Reset token is invalid or expired');
      }

      const passwordHash = await hashPassword(input.password);
      await store.updateUser(null, String(user['_id']), { passwordHash });
      await store.updatePasswordResetToken(null, String(record['_id']), { consumedAt: at });
      await store.revokeAllSessionsForUser(null, String(user['_id']), at);

      if (typeof transport.sessionToken === 'string') {
        await store.revokeSessionByTokenHash(null, hashToken(transport.sessionToken), at);
      }

      const csrf = await this.issueCsrf(undefined);

      await auditWriter.appendBusinessEvent(null, {
        actorId: String(user['_id']),
        action: 'auth.password_reset_completed',
        resourceType: 'user',
        resourceId: String(user['_id']),
      });

      return {
        status: 'password_reset',
        ...csrf,
      };
    },

    async establishSessionForUser(userId) {
      const user = await store.findUserById(userId);
      if (user === null || user['status'] !== 'active') {
        throw unauthorized('Authentication required');
      }
      const availableContexts = await buildAvailableContexts(user);
      const context = chooseDefaultContext(user, availableContexts);
      const created = await createAuthenticatedSession(user, context, now());
      return {
        ...created,
        session: await this.buildSessionSnapshot(user, created.sessionRecord, availableContexts),
      };
    },

    async buildSessionSnapshot(user, session, availableContexts) {
      const active =
        availableContexts.find((item) => {
          if (session.activeContextType === 'platform') {
            return item['contextType'] === 'platform';
          }
          if (session.activeContextType === 'organization') {
            return (
              item['contextType'] === 'organization' &&
              String(item['membershipId']) === String(session.activeMembershipId)
            );
          }
          return false;
        }) ?? null;

      const activeContext =
        active === null
          ? null
          : {
              ...active,
              ...(session.activeBranchId === undefined || session.activeBranchId === null
                ? {}
                : { branchId: String(session.activeBranchId) }),
              ...(session.activeWarehouseId === undefined || session.activeWarehouseId === null
                ? {}
                : { warehouseId: String(session.activeWarehouseId) }),
            };

      let subscriptionAccessState = null;
      if (
        activeContext?.contextType === 'organization' &&
        typeof deps.resolveSubscriptionAccessState === 'function' &&
        activeContext.organizationId !== undefined
      ) {
        const access = await deps.resolveSubscriptionAccessState(
          String(activeContext.organizationId),
        );
        subscriptionAccessState = {
          status: access.status,
          accessLevel: access.accessLevel,
          operationalWriteAllowed: access.operationalWriteAllowed,
          billingAccessAllowed: access.billingAccessAllowed,
          planCode: access.planCode ?? null,
          planVersion: access.planVersion ?? null,
          trialEndsAt: access.trialEndsAt ?? null,
          graceEndsAt: access.graceEndsAt ?? null,
          periodEndsAt: access.periodEndsAt ?? null,
          warnings: access.warnings ?? [],
        };
      }

      return {
        user: {
          id: String(user['_id']),
          email: user['email'],
          displayName: user['displayName'],
          status: user['status'],
        },
        activeContext,
        availableContexts,
        branchAssignments: active?.branchAssignments ?? [],
        warehouseAssignments: active?.warehouseAssignments ?? [],
        subscriptionAccessState,
      };
    },
  };
}

module.exports = {
  createAuthService,
  INACTIVITY_MS,
  ABSOLUTE_MS,
  RESET_TTL_MS,
};
