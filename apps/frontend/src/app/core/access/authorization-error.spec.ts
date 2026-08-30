import { HttpErrorResponse } from '@angular/common/http';
import {
  ACCESS_DENIED_MESSAGE,
  ASSIGNMENT_DENIED_MESSAGE,
  FEATURE_UNAVAILABLE_MESSAGE,
  mapAuthorizationError,
} from './authorization-error';

function httpError(status: number, code?: string, message?: string): HttpErrorResponse {
  return new HttpErrorResponse({
    status,
    statusText: status === 403 ? 'Forbidden' : 'Error',
    error: code === undefined ? 'Request failed with status code 403' : { error: { code, message } },
    url: '/api/v1/purchases',
  });
}

describe('mapAuthorizationError', () => {
  it('maps permission denial to the standard access-denied copy', () => {
    expect(mapAuthorizationError(httpError(403, 'PERMISSION_DENIED'))).toBe(ACCESS_DENIED_MESSAGE);
  });

  it('maps assignment denial without exposing raw HTTP text', () => {
    expect(mapAuthorizationError(httpError(403, 'ASSIGNMENT_SCOPE_DENIED'))).toBe(
      ASSIGNMENT_DENIED_MESSAGE,
    );
  });

  it('maps capability disabled to the feature-unavailable copy', () => {
    expect(mapAuthorizationError(httpError(403, 'ORG_CAPABILITY_DISABLED'))).toBe(
      FEATURE_UNAVAILABLE_MESSAGE,
    );
  });

  it('does not surface Angular or axios raw 403 text', () => {
    const error = new HttpErrorResponse({
      status: 403,
      statusText: 'Forbidden',
      error: 'Request failed with status code 403',
      url: '/api/v1/purchases',
    });
    expect(mapAuthorizationError(error)).toBe(ACCESS_DENIED_MESSAGE);
    expect(mapAuthorizationError(error)).not.toMatch(/status code 403/i);
  });
});
