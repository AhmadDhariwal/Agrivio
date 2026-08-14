const { sendSuccessEnvelope } = require('../../../platform/http/response-envelope');
const { forbidden, validationFailed } = require('../../../platform/errors/app-error');

function requireOrganizationId(req) {
  const organizationId = req.authContext?.organizationId;
  if (typeof organizationId !== 'string' || organizationId === '') {
    throw forbidden('Organization context is required');
  }
  return organizationId;
}

function actorFrom(req) {
  return {
    actorId: String(req.authContext.userId),
    authContext: req.authContext,
  };
}

function readUpload(req) {
  if (Buffer.isBuffer(req.body) && req.body.length > 0) {
    return {
      buffer: req.body,
      originalFileName: req.get('X-Filename') || 'import.xls',
      contentType: req.get('content-type') || 'application/vnd.ms-excel',
    };
  }
  throw validationFailed('Workbook file is required', [
    { field: 'file', message: 'Send the Excel workbook as the request body' },
  ]);
}

function createImportsController(deps) {
  return {
    async listTemplates(req, res, next) {
      try {
        sendSuccessEnvelope(res, 200, deps.importsService.listTemplates());
      } catch (error) {
        next(error);
      }
    },

    async downloadTemplate(req, res, next) {
      try {
        const downloaded = deps.importsService.downloadTemplate(req.params.importType);
        res.setHeader('Content-Type', downloaded.contentType);
        res.setHeader('Content-Disposition', `attachment; filename="${downloaded.filename}"`);
        res.status(200).send(downloaded.buffer);
      } catch (error) {
        next(error);
      }
    },

    async createJob(req, res, next) {
      try {
        const data = await deps.importsService.createJob(
          requireOrganizationId(req),
          req.body ?? {},
          actorFrom(req),
        );
        sendSuccessEnvelope(res, 201, data);
      } catch (error) {
        next(error);
      }
    },

    async uploadWorkbook(req, res, next) {
      try {
        const data = await deps.importsService.uploadWorkbook(
          requireOrganizationId(req),
          req.params.id,
          readUpload(req),
          actorFrom(req),
        );
        sendSuccessEnvelope(res, 200, data);
      } catch (error) {
        next(error);
      }
    },

    async validateJob(req, res, next) {
      try {
        const data = await deps.importsService.validateJob(
          requireOrganizationId(req),
          req.params.id,
          req.authContext,
        );
        sendSuccessEnvelope(res, 200, data);
      } catch (error) {
        next(error);
      }
    },

    async getJob(req, res, next) {
      try {
        const data = await deps.importsService.getJob(requireOrganizationId(req), req.params.id);
        sendSuccessEnvelope(res, 200, data);
      } catch (error) {
        next(error);
      }
    },

    async listErrors(req, res, next) {
      try {
        const data = await deps.importsService.listErrors(
          requireOrganizationId(req),
          req.params.id,
        );
        sendSuccessEnvelope(res, 200, data);
      } catch (error) {
        next(error);
      }
    },

    async confirmJob(req, res, next) {
      try {
        const data = await deps.importsService.confirmJob(
          requireOrganizationId(req),
          req.params.id,
          actorFrom(req),
        );
        sendSuccessEnvelope(res, 200, data);
      } catch (error) {
        next(error);
      }
    },

    async executeJob(req, res, next) {
      try {
        const result = await deps.importsService.executeJob(
          requireOrganizationId(req),
          req.params.id,
          actorFrom(req),
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
  createImportsController,
};
