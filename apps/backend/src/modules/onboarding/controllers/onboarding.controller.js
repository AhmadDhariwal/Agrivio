const { sendSuccessEnvelope } = require('../../../platform/http/response-envelope');

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
        const status = typeof req.query['status'] === 'string' ? req.query['status'] : undefined;
        const result = await deps.onboardingService.listOrganizations(
          status === undefined ? {} : { status },
        );
        sendSuccessEnvelope(res, 200, { items: result });
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
  };
}

module.exports = {
  createOnboardingController,
  createPlatformOrganizationController,
};
