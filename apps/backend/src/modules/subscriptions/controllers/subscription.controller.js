const { sendSuccessEnvelope } = require('../../../platform/http/response-envelope');
const { validationFailed } = require('../../../platform/errors/app-error');

function readEvidenceUpload(req) {
  if (Buffer.isBuffer(req.body) && req.body.length > 0) {
    return {
      buffer: req.body,
      originalFileName: req.get('X-Filename') || 'evidence.bin',
      contentType: req.get('content-type') || 'application/octet-stream',
    };
  }
  throw validationFailed('Payment evidence file is required');
}

function sendEvidenceFile(res, evidence) {
  const safeFileName = String(evidence.originalFileName)
    .replace(/[\u0000-\u001f\u007f"]/g, '')
    .slice(0, 255);
  res.setHeader('Content-Type', evidence.contentType);
  res.setHeader('Content-Disposition', `attachment; filename="${safeFileName || 'evidence.bin'}"`);
  res.setHeader('Cache-Control', 'private, no-store');
  res.status(200).send(evidence.buffer);
}

function createSubscriptionController(deps) {
  const service = deps.subscriptionService;

  return {
    async getCurrent(req, res, next) {
      try {
        const data = await service.getOrganizationSubscription(req.authContext.organizationId);
        sendSuccessEnvelope(res, 200, data);
      } catch (error) {
        next(error);
      }
    },

    async listPlans(req, res, next) {
      try {
        const data = await service.listSelectablePlans();
        sendSuccessEnvelope(res, 200, { items: data });
      } catch (error) {
        next(error);
      }
    },

    async uploadEvidence(req, res, next) {
      try {
        const data = await service.uploadBillingEvidence(
          req.authContext.organizationId,
          readEvidenceUpload(req),
          { actorId: String(req.auth.user._id) },
        );
        sendSuccessEnvelope(res, 201, data);
      } catch (error) {
        next(error);
      }
    },

    async downloadEvidence(req, res, next) {
      try {
        const evidence = await service.readOrganizationBillingEvidence(
          req.authContext.organizationId,
          req.params.id,
        );
        sendEvidenceFile(res, evidence);
      } catch (error) {
        next(error);
      }
    },

    async submitBilling(req, res, next) {
      try {
        const data = await service.submitBillingEvidence(req.authContext.organizationId, req.body, {
          actorId: String(req.auth.user._id),
        });
        sendSuccessEnvelope(res, 201, data);
      } catch (error) {
        next(error);
      }
    },

    async listBilling(req, res, next) {
      try {
        const data = await service.listOrganizationBillingRecords(req.authContext.organizationId);
        sendSuccessEnvelope(res, 200, { items: data });
      } catch (error) {
        next(error);
      }
    },

    async getBilling(req, res, next) {
      try {
        const data = await service.getOrganizationBillingRecord(
          req.authContext.organizationId,
          req.params.id,
        );
        sendSuccessEnvelope(res, 200, data);
      } catch (error) {
        next(error);
      }
    },
  };
}

function createPlatformSubscriptionController(deps) {
  const service = deps.subscriptionService;

  return {
    async listPlans(_req, res, next) {
      try {
        const data = await service.listPlatformPlans();
        sendSuccessEnvelope(res, 200, { items: data });
      } catch (error) {
        next(error);
      }
    },

    async createPlan(req, res, next) {
      try {
        const data = await service.createPlanVersion(req.body, {
          actorId: req.platformActor.actorId,
        });
        sendSuccessEnvelope(res, 201, data);
      } catch (error) {
        next(error);
      }
    },

    async listSubscriptions(_req, res, next) {
      try {
        const data = await service.listPlatformSubscriptions();
        sendSuccessEnvelope(res, 200, { items: data });
      } catch (error) {
        next(error);
      }
    },

    async suspend(req, res, next) {
      try {
        const data = await service.suspendSubscription(req.params.id, req.body, {
          actorId: req.platformActor.actorId,
        });
        sendSuccessEnvelope(res, 200, data);
      } catch (error) {
        next(error);
      }
    },

    async reactivate(req, res, next) {
      try {
        const data = await service.reactivateSubscription(req.params.id, req.body, {
          actorId: req.platformActor.actorId,
        });
        sendSuccessEnvelope(res, 200, data);
      } catch (error) {
        next(error);
      }
    },

    async cancel(req, res, next) {
      try {
        const data = await service.cancelSubscription(req.params.id, req.body, {
          actorId: req.platformActor.actorId,
        });
        sendSuccessEnvelope(res, 200, data);
      } catch (error) {
        next(error);
      }
    },

    async changePlan(req, res, next) {
      try {
        const data = await service.changePlan(req.params.id, req.body, {
          actorId: req.platformActor.actorId,
        });
        sendSuccessEnvelope(res, 200, data);
      } catch (error) {
        next(error);
      }
    },

    async listBilling(req, res, next) {
      try {
        const data = await service.listPlatformBillingRecords(req.query);
        sendSuccessEnvelope(res, 200, data);
      } catch (error) {
        next(error);
      }
    },

    async downloadEvidence(req, res, next) {
      try {
        const evidence = await service.readPlatformBillingEvidence(req.params.id);
        sendEvidenceFile(res, evidence);
      } catch (error) {
        next(error);
      }
    },

    async startReview(req, res, next) {
      try {
        const data = await service.startBillingReview(req.params.id, req.body, {
          actorId: req.platformActor.actorId,
        });
        sendSuccessEnvelope(res, 200, data);
      } catch (error) {
        next(error);
      }
    },

    async getBilling(req, res, next) {
      try {
        const data = await service.getPlatformBillingRecord(req.params.id);
        sendSuccessEnvelope(res, 200, data);
      } catch (error) {
        next(error);
      }
    },

    async approveBilling(req, res, next) {
      try {
        const data = await service.approveBillingRecord(req.params.id, req.body, {
          actorId: req.platformActor.actorId,
        });
        sendSuccessEnvelope(res, 200, data);
      } catch (error) {
        next(error);
      }
    },

    async rejectBilling(req, res, next) {
      try {
        const data = await service.rejectBillingRecord(req.params.id, req.body, {
          actorId: req.platformActor.actorId,
        });
        sendSuccessEnvelope(res, 200, data);
      } catch (error) {
        next(error);
      }
    },
  };
}

module.exports = {
  createSubscriptionController,
  createPlatformSubscriptionController,
};
