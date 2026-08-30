import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { describe, expect, it } from 'vitest';
import { AuditInquiryPage } from './audit-inquiry.page';
import { AuditApi } from '../../data-access/audit.api';
import { AuthSessionStore } from '../../../auth/data-access/auth-session.store';

describe('AuditInquiryPage', () => {
  it('is defined', () => {
    expect(AuditInquiryPage).toBeTruthy();
  });

  it('renders the shared wrapping report toolbar', async () => {
    await TestBed.configureTestingModule({
      imports: [AuditInquiryPage],
      providers: [
        {
          provide: AuditApi,
          useValue: {
            query: () => of({ items: [], meta: { total: 0 } }),
          },
        },
        {
          provide: AuthSessionStore,
          useValue: {
            hasPermission: () => true,
            session: () => ({ subscriptionAccessState: { status: 'active' } }),
          },
        },
      ],
    }).compileComponents();

    const fixture: ComponentFixture<AuditInquiryPage> = TestBed.createComponent(AuditInquiryPage);
    fixture.detectChanges();
    const toolbar = fixture.nativeElement.querySelector('.report-toolbar') as HTMLElement | null;
    expect(toolbar).toBeTruthy();
    expect(fixture.nativeElement.querySelector('[data-testid="audit-from"]')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('[data-testid="audit-search"]')).toBeTruthy();
  });
});
