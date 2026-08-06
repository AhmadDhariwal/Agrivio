// @ts-check
import { API_IDEMPOTENCY_KEY_HEADER } from '@agrivio/api-contracts';
import { sendSuccessEnvelope } from '../../../platform/http/response-envelope.js';
import { idempotencyConflict, validationFailed } from '../../../platform/errors/app-error.js';
import { requirePlatformActor } from '../middleware/platform-auth.middleware.js';

/**
 * Controller handlers for platform organization management.
 * Routes: GET/POST /api/v1/platform/organizations and sub-paths.
 *
 * @param {{
 *   platformOrgService: {
 *     listOrganizations: (query: { status?: string }) => Promise<unknown[]>;
 *     getOrganization: (id: string) => Promise<unknown>;
 *     decideOrganization: (params: {
 *       orgId: string; actorId: string; decision: 'approve' | 'reject'; planCode?: string; reason?: string;
 *     }) => Promise<{ decision: string; activationToken?: string }>;
 *   };
 *   idempotencyService: {
 *     execute: (scope: import('../../../platform/idempotency/idempotency-service.js').IdempotencyScope, key: string, fingerprint: unknown, handler: () => Promise<import('../../../platform/idempotency/idempotency-service.js').IdempotencyStoredResponse>) => Promise<{ replay: boolean; response: import('../../../platform/idempotency/idempotency-service.js').IdempotencyStoredResponse }>;
 *   };
 * }} deps
 */
export function createPlatformOrgHandlers({ platformOrgService, idempotencyService }) {
  /**
   * GET /api/v1/platform/organizations
   * @type {import('express').RequestHandler}
   */
  const listOrganizations = async (req, res, next) => {
    try {
      const status = typeof req.query['status'] === 'string' ? req.query['status'] : undefined;
      const orgs = await platformOrgService.listOrganizations(
        status !== undefined ? { status } : {},
      );
      return sendSuccessEnvelope(res, 200, orgs);
    } catch (error) {
      return next(error);
    }
  };

  /**
   * GET /api/v1/platform/organizations/:id
   * @type {import('express').RequestHandler}
   */
  const getOrganization = async (req, res, next) => {
    try {
      const rawId = req.params['id'];
      const org = await platformOrgService.getOrganization(typeof rawId === 'string' ? rawId : '');
      return sendSuccessEnvelope(res, 200, org);
    } catch (error) {
      return next(error);
    }
  };

  /**
   * POST /api/v1/platform/organizations/:id/approve
   * Idempotent: requires Idempotency-Key header.
   * @type {import('express').RequestHandler}
   */
  const decideOrganization = async (req, res, next) => {
    try {
      const actor = requirePlatformActor(req);
      const rawIdempotencyKey = req.headers[API_IDEMPOTENCY_KEY_HEADER.toLowerCase()];
      const idempotencyKey = Array.isArray(rawIdempotencyKey)
        ? rawIdempotencyKey[0]
        : rawIdempotencyKey;

      if (typeof idempotencyKey !== 'string' || idempotencyKey.trim().length === 0) {
        throw idempotencyConflict('Idempotency-Key header is required for this endpoint');
      }

      const rawId = req.params['id'];
      const orgId = typeof rawId === 'string' ? rawId : '';
      const body = /** @type {Record<string, unknown>} */ (req.body ?? {});

      const decision = body['decision'];
      if (decision !== 'approve' && decision !== 'reject') {
        throw validationFailed('decision must be "approve" or "reject"', [
          { field: 'decision', message: 'decision must be "approve" or "reject"' },
        ]);
      }

      const result = await idempotencyService.execute(
        {
          scopeType: 'platform',
          actorId: actor.userId,
          operation: `organization.decide.${orgId}`,
        },
        idempotencyKey.trim(),
        { orgId, decision, planCode: body['planCode'], reason: body['reason'] },
        async () => {
          const data = await platformOrgService.decideOrganization({
            orgId,
            actorId: actor.userId,
            decision,
            ...(typeof body['planCode'] === 'string' ? { planCode: body['planCode'] } : {}),
            ...(typeof body['reason'] === 'string' ? { reason: body['reason'] } : {}),
          });
          return { statusCode: 200, body: data };
        },
      );

      if (result.replay) {
        res.setHeader('Idempotency-Replayed', 'true');
        return sendSuccessEnvelope(res, result.response.statusCode, result.response.body);
      }

      return sendSuccessEnvelope(res, 200, result.response.body);
    } catch (error) {
      return next(error);
    }
  };

  return { listOrganizations, getOrganization, decideOrganization };
}
