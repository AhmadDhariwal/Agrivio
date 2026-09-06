export const APP_PATHS = Object.freeze({
  signIn: '/signin',
  context: '/context',
  workspace: '/app',
  platformWorkspace: '/app/platform/organizations',
  billing: '/app/subscription/billing',
});

export function authenticatedHomePath(
  activeContext: { contextType: 'platform' | 'organization' } | null,
): string {
  if (activeContext === null) {
    return APP_PATHS.context;
  }
  return activeContext.contextType === 'platform'
    ? APP_PATHS.platformWorkspace
    : APP_PATHS.workspace;
}
