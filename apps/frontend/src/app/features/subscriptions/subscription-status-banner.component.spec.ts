import { ComponentFixture, TestBed } from '@angular/core/testing';
import { SubscriptionStatusBannerComponent } from './subscription-status-banner.component';

describe('SubscriptionStatusBannerComponent', () => {
  let fixture: ComponentFixture<SubscriptionStatusBannerComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SubscriptionStatusBannerComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(SubscriptionStatusBannerComponent);
  });

  it('renders suspended warning as informational UI only', () => {
    fixture.componentRef.setInput('accessState', { status: 'suspended' });
    fixture.detectChanges();
    const text = fixture.nativeElement.textContent as string;
    expect(text).toContain('Subscription suspended');
    expect(text).toContain('Informational only');
  });
});
