const { createAuditWriter } = require('../../platform/audit/audit-writer');
const { conflict, forbidden, unauthorized } = require('../../platform/errors/app-error');
const { generateOpaqueToken, generatePasswordResetToken, hashToken } = require('./crypto-tokens');
const { hashPassword, verifyPassword } = require('./password.service');
const {
  permissionsForMembershipRole,
  permissionsForPlatformAccess,
} = require('./role-permissions');
const {
  parseLoginBody,
  parsePasswordResetConfirmBody,
  parsePasswordResetRequestBody,
  parseSessionContextBody,
} = require('./auth.validation');
const { createAuthRateLimiter } = require('./auth.rate-limit');

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
  const rateLimiter = deps.rateLimiter ?? createAuthRateLimiter();
  const nodeEnv = deps.nodeEnv ?? 'development';
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
      contexts.push({
        contextType: 'organization',
        membershipId: String(membership['_id']),
        organizationId: String(membership['organizationId']),
        role: membership['role'],
        permissions: permissionsForMembershipRole(
          String(membership['role']),
          membership['conditionalPermissionGrants'] ?? [],
        ),
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

  async function createAuthenticatedSession(user, context, at) {
    const sessionToken = generateOpaqueToken();
    const csrfToken = generateOpaqueToken();
    const absoluteExpiresAt = new Date(at.getTime() + ABSOLUTE_MS);
    const expiresAt = computeExpiry(at, absoluteExpiresAt);

    const record = await store.insertSession(null, {
      tokenHash: sessionToken.tokenHash,
      csrfHash: csrfToken.tokenHash,
      userId: user['_id'],
      activeContextType: context['contextType'],
      ...(context['membershipId'] === undefined
        ? {}
        : { activeMembershipId: context['membershipId'] }),
      ...(context['organizationId'] === undefined
        ? {}
        : { activeOrganizationId: context['organizationId'] }),
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

  return {
    /**
     * Issue or refresh a CSRF binding (pre-auth or authenticated).
     */
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
      await touchSession(session, at);
      return { session, user };
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

      const rotated = await rotateSession(session, user, selected, at);
      await auditWriter.appendBusinessEvent(null, {
        actorId: String(user['_id']),
        action: 'auth.session_context_switched',
        resourceType: 'auth_session',
        resourceId: String(rotated.sessionRecord['_id']),
        ...(selected['organizationId'] === undefined
          ? {}
          : { organizationId: String(selected['organizationId']) }),
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

    /**
     * Establish authenticated session after Owner activation.
     */
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

      return {
        user: {
          id: String(user['_id']),
          email: user['email'],
          displayName: user['displayName'],
          status: user['status'],
        },
        activeContext: active,
        availableContexts,
        branchAssignments: [],
        warehouseAssignments: [],
        subscriptionAccessState: null,
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
