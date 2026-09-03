import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { AuthSessionStore } from '../../../auth/data-access/auth-session.store';
import { PlatformOperationsApi } from '../../data-access/platform-operations.api';
import { PlatformOperationsStatusPage } from './operations-status.page';

describe('PlatformOperationsStatusPage', () => {
  it('renders authoritative backup metadata and separately reports non-Mongo coverage', async () => {
    await TestBed.configureTestingModule({
      imports: [PlatformOperationsStatusPage],
      providers: [
        {
          provide: AuthSessionStore,
          useValue: {
            hasPermission: (permission: string) =>
              ['operations.backups.view', 'platform.audit.view'].includes(permission),
          },
        },
        {
          provide: PlatformOperationsApi,
          useValue: {
            listBackups: () =>
              of([
                {
                  id: 'backup-1',
                  status: 'success',
                  recordedAt: '2026-09-03T10:01:00.000Z',
                  startedAt: '2026-09-03T10:00:00.000Z',
                  completedAt: '2026-09-03T10:01:00.000Z',
                  databaseName: 'Agrivio',
                  filename: 'agrivio.archive.gz',
                  fileSizeBytes: 4096,
                  sha256: 'a'.repeat(64),
                  manifestVerified: true,
                  checksumVerified: true,
                  retentionDays: 30,
                  expiresAt: '2026-10-03T10:01:00.000Z',
                  restoreReady: true,
                  coverage: 'mongodb_application_data',
                  failureVisible: false,
                  failureMessage: null,
                },
              ]),
            getAuditRetention: () =>
              of({
                scope: 'platform',
                organizationId: null,
                configuredRetentionDays: 30,
                retentionSource: 'platform_config',
                cutoffAt: '2026-08-04T10:00:00.000Z',
                oldestAccessibleEvent: '2026-08-05T10:00:00.000Z',
                newestEvent: '2026-09-03T10:00:00.000Z',
                currentEventCount: 10,
                expiredEventCount: 2,
                lastCleanupAt: null,
                nextCleanupAt: null,
              }),
          },
        },
      ],
    }).compileComponents();

    const fixture = TestBed.createComponent(PlatformOperationsStatusPage);
    fixture.detectChanges();
    fixture.componentInstance.loadRetention();
    fixture.detectChanges();
    const text = fixture.nativeElement.textContent as string;
    expect(text).toContain('Last successful backup');
    expect(text).toContain('Agrivio');
    expect(text).toContain('Manifest: verified');
    expect(text).toContain('Checksum: verified');
    expect(text).toContain('MongoDB application data only');
    expect(text).toContain('Purge expired records');
  });
});
