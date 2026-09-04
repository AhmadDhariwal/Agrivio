const { sendSuccessEnvelope } = require('../../../platform/http/response-envelope');
const { parsePaginationQuery } = require('../../../platform/http/parse-pagination-query');

function createOnboardingController(deps) {
  return {
    async submitActivationRequest(req, res, next) {
      try {
        const result = await deps.onboardingService.submitActivationRequest(req.body ?? {});
        sendSuccessEnvelope(res, result.duplicate ? 200 : 201, result);
      } catch (error) {
        next(error);
      }
    },

    async activateOwner(req, res, next) {
      try {
        const result = await deps.onboardingService.activateOwner(req.body ?? {});
        sendSuccessEnvelope(res, 200, result);
      } catch (error) {
        next(error);
      }
    },
  };
}

function createPlatformOrganizationController(deps) {
  return {
    async list(req, res, next) {
      try {
        const { page, pageSize, skip } = parsePaginationQuery(req.query);
        const status = typeof req.query['status'] === 'string' ? req.query['status'] : undefined;
        const result = await deps.onboardingService.listOrganizations({
          ...(status === undefined ? {} : { status }),
          search: typeof req.query.search === 'string' ? req.query.search : undefined,
          plan: typeof req.query.plan === 'string' ? req.query.plan : undefined,
          subscriptionStatus:
            typeof req.query.subscriptionStatus === 'string'
              ? req.query.subscriptionStatus
              : undefined,
          createdFrom:
            typeof req.query.createdFrom === 'string' ? req.query.createdFrom : undefined,
          createdTo: typeof req.query.createdTo === 'string' ? req.query.createdTo : undefined,
          sort: typeof req.query.sort === 'string' ? req.query.sort : undefined,
          direction: typeof req.query.direction === 'string' ? req.query.direction : undefined,
          skip,
          pageSize,
        });
        sendSuccessEnvelope(res, 200, result.items, { page, pageSize, total: result.total });
      } catch (error) {
        next(error);
      }
    },

    async create(req, res, next) {
      try {
        const actor = req.platformActor;
        const result = await deps.onboardingService.createOrganization(
          req.body ?? {},
          { actorId: actor?.actorId ?? 'unknown' },
          req.get('Idempotency-Key'),
        );
        sendSuccessEnvelope(res, result.statusCode ?? 201, result.data);
      } catch (error) {
        next(error);
      }
    },

    async getById(req, res, next) {
      try {
        const id = String(req.params['id'] ?? '');
        const result = await deps.onboardingService.getOrganization(id);
        sendSuccessEnvelope(res, 200, result);
      } catch (error) {
        next(error);
      }
    },

    async update(req, res, next) {
      try {
        const result = await deps.onboardingService.updateOrganizationProfile(
          String(req.params.id ?? ''),
          req.body ?? {},
          { actorId: req.platformActor?.actorId ?? 'unknown' },
        );
        sendSuccessEnvelope(res, 200, result);
      } catch (error) {
        next(error);
      }
    },

    async getUsage(req, res, next) {
      try {
        const result = await deps.onboardingService.getOrganizationUsage(
          String(req.params.id ?? ''),
        );
        sendSuccessEnvelope(res, 200, result);
      } catch (error) {
        next(error);
      }
    },

    async listMembers(req, res, next) {
      try {
        const { page, pageSize, skip } = parsePaginationQuery(req.query);
        const result = await deps.onboardingService.listOrganizationMembers(
          String(req.params.id ?? ''),
          {
            search: typeof req.query.search === 'string' ? req.query.search : undefined,
            status: typeof req.query.status === 'string' ? req.query.status : undefined,
            role: typeof req.query.role === 'string' ? req.query.role : undefined,
            skip,
            pageSize,
          },
        );
        sendSuccessEnvelope(res, 200, result.items, { page, pageSize, total: result.total });
      } catch (error) {
        next(error);
      }
    },

    async approve(req, res, next) {
      try {
        const id = String(req.params['id'] ?? '');
        const actor = req.platformActor;
        const result = await deps.onboardingService.approveOrganization(id, {
          actorId: actor?.actorId ?? 'unknown',
        });
        sendSuccessEnvelope(res, 200, result);
      } catch (error) {
        next(error);
      }
    },

    async reissueActivation(req, res, next) {
      try {
        const id = String(req.params['id'] ?? '');
        const actor = req.platformActor;
        const result = await deps.onboardingService.reissueOwnerActivationToken(id, {
          actorId: actor?.actorId ?? 'unknown',
        });
        sendSuccessEnvelope(res, 200, result);
      } catch (error) {
        next(error);
      }
    },

    /**
     * Explicit reject route — name matches behaviour.
     */
    async reject(req, res, next) {
      try {
        const id = String(req.params['id'] ?? '');
        const actor = req.platformActor;
        const result = await deps.onboardingService.rejectOrganization(id, req.body ?? {}, {
          actorId: actor?.actorId ?? 'unknown',
        });
        sendSuccessEnvelope(res, 200, result);
      } catch (error) {
        next(error);
      }
    },

    async suspend(req, res, next) {
      try {
        const id = String(req.params['id'] ?? '');
        const actor = req.platformActor;
        const result = await deps.onboardingService.suspendOrganization(
          id,
          req.body ?? {},
          { actorId: actor?.actorId ?? 'unknown' },
          req.get('Idempotency-Key'),
        );
        sendSuccessEnvelope(res, result.statusCode ?? 200, result.data);
      } catch (error) {
        next(error);
      }
    },

    async reactivate(req, res, next) {
      try {
        const result = await deps.onboardingService.reactivateOrganization(
          String(req.params.id ?? ''),
          req.body ?? {},
          { actorId: req.platformActor?.actorId ?? 'unknown' },
          req.get('Idempotency-Key'),
        );
        sendSuccessEnvelope(res, result.statusCode ?? 200, result.data);
      } catch (error) {
        next(error);
      }
    },
  };
}

module.exports = {
  createOnboardingController,
  createPlatformOrganizationController,
};
