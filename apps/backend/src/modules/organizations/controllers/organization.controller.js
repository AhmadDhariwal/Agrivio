const { sendSuccessEnvelope } = require('../../../platform/http/response-envelope');
const {
  notFound,
  validationFailed,
  forbidden,
} = require('../../../platform/errors/app-error');
const { assertOptimisticVersion } = require('../../../platform/validation/request-validation');
const { normalizeOrganizationName } = require('../../identity/crypto-tokens');

function createOrganizationController(deps) {
  return {
    async getCurrent(req, res, next) {
      try {
        const organizationId = req.authContext?.organizationId;
        if (typeof organizationId !== 'string' || organizationId === '') {
          throw notFound('Organization not found');
        }

        const organization = await deps.findOrganizationById(organizationId);
        if (organization === null) {
          throw notFound('Organization not found');
        }

        sendSuccessEnvelope(res, 200, {
          id: String(organization['_id']),
          name: organization['name'],
          status: organization['status'],
          timezone: organization['timezone'],
          version: Number(organization['version'] ?? 1),
        });
      } catch (error) {
        next(error);
      }
    },

    async patchCurrent(req, res, next) {
      try {
        const organizationId = req.authContext?.organizationId;
        if (typeof organizationId !== 'string' || organizationId === '') {
          throw notFound('Organization not found');
        }
        if (typeof deps.updateOrganization !== 'function') {
          throw forbidden('Organization update is unavailable');
        }

        const body = req.body;
        if (body === null || typeof body !== 'object' || Array.isArray(body)) {
          throw validationFailed('Request body must be an object');
        }
        const expectedVersion = body.expectedVersion;
        if (
          typeof expectedVersion !== 'number' ||
          !Number.isInteger(expectedVersion) ||
          expectedVersion < 1
        ) {
          throw validationFailed('expectedVersion must be a positive integer', [
            { field: 'expectedVersion', message: 'expectedVersion must be a positive integer' },
          ]);
        }

        const patch = {};
        if (body.name !== undefined) {
          if (typeof body.name !== 'string' || body.name.trim() === '') {
            throw validationFailed('name is required', [
              { field: 'name', message: 'name is required' },
            ]);
          }
          const name = normalizeOrganizationName(body.name);
          patch.name = name;
          patch.nameNormalized = name.toLowerCase();
        }
        if (body.timezone !== undefined) {
          if (typeof body.timezone !== 'string' || body.timezone.trim() === '') {
            throw validationFailed('timezone is required', [
              { field: 'timezone', message: 'timezone must be an IANA identifier' },
            ]);
          }
          patch.timezone = body.timezone.trim();
        }
        if (Object.keys(patch).length === 0) {
          throw validationFailed('At least one organization field is required');
        }

        const organization = await deps.findOrganizationById(organizationId);
        if (organization === null) {
          throw notFound('Organization not found');
        }
        assertOptimisticVersion(organization, expectedVersion);

        const updated = await deps.updateOrganization(organizationId, {
          ...patch,
          version: Number(organization['version'] ?? 1) + 1,
        });

        if (typeof deps.appendOrganizationAudit === 'function') {
          await deps.appendOrganizationAudit({
            organizationId,
            actorId: String(req.authContext.userId),
            action: 'organization.updated',
            resourceType: 'organization',
            resourceId: organizationId,
            metadata: { fields: Object.keys(patch) },
          });
        }

        sendSuccessEnvelope(res, 200, {
          id: String(updated['_id']),
          name: updated['name'],
          status: updated['status'],
          timezone: updated['timezone'],
          version: Number(updated['version'] ?? 1),
        });
      } catch (error) {
        next(error);
      }
    },

    async getSetupProgress(req, res, next) {
      try {
        const organizationId = req.authContext?.organizationId;
        if (typeof organizationId !== 'string' || organizationId === '') {
          throw notFound('Organization not found');
        }
        if (typeof deps.setupProgressService?.getSetupProgress !== 'function') {
          throw forbidden('Setup progress is unavailable');
        }
        const data = await deps.setupProgressService.getSetupProgress(organizationId, {
          permissions: req.authContext?.permissions ?? [],
        });
        sendSuccessEnvelope(res, 200, data);
      } catch (error) {
        next(error);
      }
    },
  };
}

module.exports = {
  createOrganizationController,
};
