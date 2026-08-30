import {
  ApplicationConfig,
  provideBrowserGlobalErrorListeners,
  provideZonelessChangeDetection,
} from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { appRoutes } from './app.routes';
import { authErrorInterceptor } from './core/interceptors/auth-error.interceptor';
import {
  API_AUDIT_EVENTS_PATH,
  API_IMPORTS_PATH,
  API_PLATFORM_OPERATIONS_BACKUPS_PATH,
  API_REPORTS_PATH,
} from '@agrivio/api-contracts';

import '../environments/environment';

void API_REPORTS_PATH;
void API_IMPORTS_PATH;
void API_AUDIT_EVENTS_PATH;
void API_PLATFORM_OPERATIONS_BACKUPS_PATH;

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideZonelessChangeDetection(),
    provideRouter(appRoutes),
    provideHttpClient(withInterceptors([authErrorInterceptor])),
  ],
};
