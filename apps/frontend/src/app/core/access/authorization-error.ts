import { HttpErrorResponse } from '@angular/common/http';

export const ACCESS_DENIED_MESSAGE =
  "You don't have permission to access this area. Contact your organization administrator if you need access.";

export const ASSIGNMENT_DENIED_MESSAGE = "You don't have access to this branch or warehouse.";

export const FEATURE_UNAVAILABLE_MESSAGE = 'This feature is not enabled for your organization.';

export const MISSING_ASSIGNMENT_MESSAGE =
  'No branch or warehouse access has been assigned to your account.';

function apiError(error: HttpErrorResponse): { code?: string; message?: string } {
  const payload = error.error?.error;
  if (payload === null || payload === undefined || typeof payload !== 'object') {
    return {};
  }
  return payload as { code?: string; message?: string };
}

function isRawHttpFailure(message: unknown): boolean {
  return (
    typeof message === 'string' &&
    /request failed with status code|http failure response/i.test(message)
  );
}

export function authorizationErrorCode(error: unknown): string | null {
  if (!(error instanceof HttpErrorResponse)) {
    return null;
  }
  const code = apiError(error).code;
  return typeof code === 'string' && code.trim() !== '' ? code : null;
}

export function mapAuthorizationError(error: unknown, fallback = ACCESS_DENIED_MESSAGE): string {
  if (!(error instanceof HttpErrorResponse)) {
    return fallback;
  }

  const { code, message: apiMessage } = apiError(error);
  const usableApiMessage =
    typeof apiMessage === 'string' && apiMessage.trim() !== '' && !isRawHttpFailure(apiMessage)
      ? apiMessage.trim()
      : null;

  switch (code) {
    case 'ASSIGNMENT_SCOPE_DENIED':
      return ASSIGNMENT_DENIED_MESSAGE;
    case 'PERMISSION_DENIED':
    case 'FORBIDDEN':
    case 'ROLE_HIERARCHY_DENIED':
    case 'TENANT_ACCESS_DENIED':
      return usableApiMessage ?? ACCESS_DENIED_MESSAGE;
    case 'ORG_CAPABILITY_DISABLED':
      return FEATURE_UNAVAILABLE_MESSAGE;
    case 'SUBSCRIPTION_ACCESS_DENIED':
      return usableApiMessage ?? 'Subscription access is not available.';
    case 'LAST_OWNER_PROTECTED':
      return usableApiMessage ?? 'Every active organization must retain at least one active Owner';
    case 'AUTH_REQUIRED':
    case 'UNAUTHORIZED':
      return usableApiMessage ?? 'Please sign in to continue.';
    case 'CONTEXT_REQUIRED':
      return usableApiMessage ?? 'Organization context is required.';
    default:
      break;
  }

  if (isRawHttpFailure(error.message) || isRawHttpFailure(apiMessage)) {
    if (error.status === 403) {
      return ACCESS_DENIED_MESSAGE;
    }
    if (error.status === 401) {
      return 'Please sign in to continue.';
    }
  }

  return usableApiMessage ?? fallback;
}
