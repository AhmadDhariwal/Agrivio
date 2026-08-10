import { ComponentFixture, TestBed } from '@angular/core/testing';
import { LandingPage } from './landing.page';
import { provideRouter } from '@angular/router';

describe('LandingPage', () => {
  let fixture: ComponentFixture<LandingPage>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [LandingPage],
      providers: [provideRouter([])],
    }).compileComponents();

    fixture = TestBed.createComponent(LandingPage);
    fixture.detectChanges();
  });

  it('renders Agrivio brand and primary actions', () => {
    const text = fixture.nativeElement.textContent as string;
    expect(text).toContain('Agrivio');
    expect(text).toContain('Sign in');
    expect(text).toContain('Request organization access');
  });
});
