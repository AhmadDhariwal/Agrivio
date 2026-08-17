import { isDevMode } from '@angular/core';
import { bootstrapApplication } from '@angular/platform-browser';
import { appConfig } from './app/app.config';
import { App } from './app/app';

function showBootstrapFailure(message: string, detail?: string): void {
  const root = document.querySelector('agrivio-root');
  if (!root || root.childElementCount > 0) {
    return;
  }
  const panel = document.createElement('div');
  panel.setAttribute('role', 'alert');
  panel.style.cssText =
    'margin:2rem auto;max-width:42rem;padding:1.25rem 1.5rem;border:1px solid #b91c1c;border-radius:0.5rem;background:#fef2f2;color:#7f1d1d;font-family:system-ui,sans-serif;line-height:1.5;';
  const title = document.createElement('h1');
  title.textContent = 'Agrivio failed to start';
  title.style.cssText = 'margin:0 0 0.5rem;font-size:1.125rem;';
  const body = document.createElement('p');
  body.textContent = message;
  body.style.margin = '0';
  panel.append(title, body);
  if (detail) {
    const pre = document.createElement('pre');
    pre.textContent = detail;
    pre.style.cssText =
      'margin:0.75rem 0 0;padding:0.75rem;overflow:auto;font-size:0.75rem;background:#fff;border-radius:0.375rem;';
    panel.append(pre);
  }
  root.append(panel);
}

bootstrapApplication(App, appConfig).catch((err: unknown) => {
  if (isDevMode()) {
    const detail = err instanceof Error ? err.stack ?? err.message : String(err);
    console.error('Agrivio failed to start', err);
    showBootstrapFailure(
      'The application could not bootstrap. Check the browser console and verify workspace packages are up to date.',
      detail,
    );
    return;
  }

  console.error('Agrivio failed to start');
  showBootstrapFailure('The application could not start. Please refresh the page and try again.');
});
