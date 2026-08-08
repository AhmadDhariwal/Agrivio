const { Router } = require('express');
const {
  API_AUTH_ACTIVATE_PATH,
  API_AUTH_CSRF_PATH,
  API_AUTH_LOGIN_PATH,
  API_AUTH_LOGOUT_PATH,
  API_AUTH_PASSWORD_RESET_CONFIRM_PATH,
  API_AUTH_PASSWORD_RESET_REQUEST_PATH,
  API_AUTH_SESSION_CONTEXT_PATH,
  API_AUTH_SESSION_PATH,
} = require('@agrivio/api-contracts');
const {
  createAuthTransportMiddleware,
  createRequireAuthMiddleware,
  createRequireCsrfMiddleware,
} = require('./auth.middleware');
const { createAuthController } = require('./auth.controller');

function registerAuthRoutes(deps) {
  const router = Router();
  const controller = createAuthController(deps);
  const transport = createAuthTransportMiddleware();
  const requireCsrf = createRequireCsrfMiddleware(deps);
  const requireAuth = createRequireAuthMiddleware(deps);

  router.use(transport);

  router.post(API_AUTH_CSRF_PATH, (req, res, next) => {
    void controller.csrf(req, res, next);
  });

  router.post(API_AUTH_LOGIN_PATH, requireCsrf, (req, res, next) => {
    void controller.login(req, res, next);
  });

  router.post(API_AUTH_LOGOUT_PATH, requireCsrf, (req, res, next) => {
    void controller.logout(req, res, next);
  });

  router.get(API_AUTH_SESSION_PATH, requireAuth, (req, res, next) => {
    void controller.session(req, res, next);
  });

  router.post(API_AUTH_SESSION_CONTEXT_PATH, requireAuth, requireCsrf, (req, res, next) => {
    void controller.switchContext(req, res, next);
  });

  router.post(API_AUTH_PASSWORD_RESET_REQUEST_PATH, (req, res, next) => {
    void controller.requestPasswordReset(req, res, next);
  });

  router.post(API_AUTH_PASSWORD_RESET_CONFIRM_PATH, requireCsrf, (req, res, next) => {
    void controller.confirmPasswordReset(req, res, next);
  });

  router.post(API_AUTH_ACTIVATE_PATH, requireCsrf, (req, res, next) => {
    void controller.activate(req, res, next);
  });

  return router;
}

module.exports = {
  registerAuthRoutes,
};
