const { AsyncLocalStorage } = require('node:async_hooks');

const storage = new AsyncLocalStorage();

function runWithRequestContext(context, fn) {
  return storage.run(context, fn);
}

function enterRequestContext(context) {
  storage.enterWith(context);
  return context;
}

function getRequestContext() {
  return storage.getStore();
}

function getRequestId() {
  return storage.getStore()?.requestId;
}

module.exports = {
  runWithRequestContext,
  enterRequestContext,
  getRequestContext,
  getRequestId,
};
