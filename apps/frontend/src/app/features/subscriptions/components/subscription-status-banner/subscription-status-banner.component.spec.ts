import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { SubscriptionStatusBannerComponent } from './subscription-status-banner.component';

describe('SubscriptionStatusBannerComponent', () => {
  let fixture: ComponentFixture<SubscriptionStatusBannerComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SubscriptionStatusBannerComponent],
      providers: [provideRouter([])],
    }).compileComponents();

    fixture = TestBed.createComponent(SubscriptionStatusBannerComponent);
  });

  it('renders suspended warning as informational UI only', () => {
    fixture.componentRef.setInput('accessState', { status: 'suspended' });
    fixture.detectChanges();
    const text = fixture.nativeElement.textContent as string;
    expect(text).toContain('Subscription suspended');
    expect(text).toContain('Informational only');
    const link = fixture.nativeElement.querySelector('a') as HTMLAnchorElement;
    expect(link.getAttribute('href')).toBe('/app/subscription/billing');
  });

  it('renders tenant recovery banner when subscription is missing or unavailable', () => {
    fixture.componentRef.setInput('accessState', null);
    fixture.detectChanges();
    const text = fixture.nativeElement.textContent as string;
    expect(text).toContain('Subscription unavailable');
    expect(text).toContain('No active subscription was found for this organization');
    const link = fixture.nativeElement.querySelector('a') as HTMLAnchorElement;
    expect(link).not.toBeNull();
    expect(link.textContent).toContain('Manage billing →');
  });

  it('hides Manage billing CTA when showManageBilling is false', () => {
    fixture.componentRef.setInput('accessState', null);
    fixture.componentRef.setInput('showManageBilling', false);
    fixture.detectChanges();
    const text = fixture.nativeElement.textContent as string;
    expect(text).toContain('Subscription unavailable');
    const link = fixture.nativeElement.querySelector('a');
    expect(link).toBeNull();
  });
});
