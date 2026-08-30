const { sendSuccessEnvelope } = require('../../../platform/http/response-envelope');
const { forbidden, notFound, validationFailed } = require('../../../platform/errors/app-error');

function requireOrganizationContext(req) {
  const organizationId = req.authContext?.organizationId;
  if (typeof organizationId !== 'string' || organizationId === '') {
    throw forbidden('Organization context is required');
  }
  return organizationId;
}

function expectedVersionFromQuery(req) {
  const raw = req.query.expectedVersion;
  const value = typeof raw === 'string' && /^\d+$/.test(raw) ? Number(raw) : NaN;
  if (!Number.isInteger(value) || value < 0) {
    throw validationFailed('expectedVersion query parameter is required');
  }
  return value;
}

function createCapabilityController(deps) {
  return {
    async getCurrent(req, res, next) {
      try {
        const organizationId = requireOrganizationContext(req);
        const result = await deps.capabilityService.resolveEffective(organizationId, {
          permissions: req.authContext.permissions ?? [],
          ...(req.subscriptionAccessState === undefined
            ? {}
            : { subscriptionAccessState: req.subscriptionAccessState }),
          ...(req.subscriptionAccessState === undefined
            ? {}
            : { operationalAllowed: req.subscriptionAccessState.accessLevel === 'operational' }),
        });
        sendSuccessEnvelope(res, 200, {
          organizationId,
          version: result.version,
          controls: result.controls.map((control) => ({
            key: control.key,
            type: control.type,
            value: control.effectiveValue,
            reasons: control.reasons,
          })),
        });
      } catch (error) {
        next(error);
      }
    },

    async getRegistry(_req, res, next) {
      try {
        sendSuccessEnvelope(res, 200, { controls: deps.capabilityService.listRegistry() });
      } catch (error) {
        next(error);
      }
    },

    async getOrganizationPolicy(req, res, next) {
      try {
        const organizationId = String(req.params.id ?? '');
        const organization = await deps.getOrganization(organizationId);
        if (organization === null) {
          throw notFound('Organization not found');
        }
        const result = await deps.capabilityService.resolveEffective(organizationId);
        sendSuccessEnvelope(res, 200, {
          organization,
          policy: {
            version: result.version,
            updatedBy: result.updatedBy,
            updatedAt: result.updatedAt,
            operationalAllowed: result.operationalAllowed,
            controls: result.controls,
          },
        });
      } catch (error) {
        next(error);
      }
    },

    async updateOrganizationPolicy(req, res, next) {
      try {
        const organizationId = String(req.params.id ?? '');
        await deps.requireOrganization(organizationId);
        const result = await deps.capabilityService.updatePolicy(organizationId, req.body ?? {}, {
          actorId: req.platformActor.actorId,
        });
        sendSuccessEnvelope(res, 200, result);
      } catch (error) {
        next(error);
      }
    },

    async resetOverride(req, res, next) {
      try {
        const organizationId = String(req.params.id ?? '');
        await deps.requireOrganization(organizationId);
        const result = await deps.capabilityService.resetOverride(
          organizationId,
          String(req.params.key ?? ''),
          expectedVersionFromQuery(req),
          { actorId: req.platformActor.actorId },
          typeof req.query.reason === 'string' ? req.query.reason : undefined,
        );
        sendSuccessEnvelope(res, 200, result);
      } catch (error) {
        next(error);
      }
    },

    async resetModule(req, res, next) {
      try {
        const organizationId = String(req.params.id ?? '');
        await deps.requireOrganization(organizationId);
        const result = await deps.capabilityService.resetModule(
          organizationId,
          String(req.params.moduleKey ?? ''),
          expectedVersionFromQuery(req),
          { actorId: req.platformActor.actorId },
          typeof req.query.reason === 'string' ? req.query.reason : undefined,
        );
        sendSuccessEnvelope(res, 200, result);
      } catch (error) {
        next(error);
      }
    },

    async resetAll(req, res, next) {
      try {
        const organizationId = String(req.params.id ?? '');
        await deps.requireOrganization(organizationId);
        const result = await deps.capabilityService.resetAll(
          organizationId,
          expectedVersionFromQuery(req),
          { actorId: req.platformActor.actorId },
          typeof req.query.reason === 'string' ? req.query.reason : undefined,
        );
        sendSuccessEnvelope(res, 200, result);
      } catch (error) {
        next(error);
      }
    },

    async getHistory(req, res, next) {
      try {
        const organizationId = String(req.params.id ?? '');
        await deps.requireOrganization(organizationId);
        const events = await deps.capabilityService.getHistory(organizationId);
        sendSuccessEnvelope(res, 200, { items: events });
      } catch (error) {
        next(error);
      }
    },
  };
}

module.exports = {
  createCapabilityController,
};
