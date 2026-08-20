import { ComponentFixture, TestBed } from '@angular/core/testing';
import { UiModuleInfoComponent } from './ui-module-info.component';

describe('UiModuleInfoComponent', () => {
  let fixture: ComponentFixture<UiModuleInfoComponent>;
  let component: UiModuleInfoComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [UiModuleInfoComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(UiModuleInfoComponent);
    component = fixture.componentInstance;
  });

  it('renders title and description', () => {
    fixture.componentRef.setInput('title', 'About Products');
    fixture.componentRef.setInput('description', 'Manage product catalog and pricing.');
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('.ag-module-info__title')?.textContent).toContain(
      'About Products',
    );
    expect(compiled.querySelector('.ag-module-info__desc')?.textContent).toContain(
      'Manage product catalog and pricing.',
    );
  });

  it('starts collapsed by default and expands on toggle click', () => {
    fixture.componentRef.setInput('title', 'About Products');
    fixture.componentRef.setInput('description', 'Manage product catalog.');
    fixture.componentRef.setInput('items', ['Point 1', 'Point 2']);
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('[data-testid="module-info-details"]')).toBeNull();
    const toggleBtn = compiled.querySelector(
      '[data-testid="module-info-toggle"]',
    ) as HTMLButtonElement;
    expect(toggleBtn.textContent).toContain('Expand');

    toggleBtn.click();
    fixture.detectChanges();

    expect(compiled.querySelector('[data-testid="module-info-details"]')).not.toBeNull();
    expect(toggleBtn.textContent).toContain('Collapse');
    const items = compiled.querySelectorAll('.ag-module-info__item');
    expect(items.length).toBe(2);
    expect(items[0]?.textContent).toContain('Point 1');
  });

  it('honors defaultExpanded=true', () => {
    fixture.componentRef.setInput('title', 'About Opening Stock');
    fixture.componentRef.setInput('description', 'Initialize starting stock.');
    fixture.componentRef.setInput('items', ['Initial stock item']);
    fixture.componentRef.setInput('defaultExpanded', true);
    component.ngOnInit();
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('[data-testid="module-info-details"]')).not.toBeNull();
    const toggleBtn = compiled.querySelector(
      '[data-testid="module-info-toggle"]',
    ) as HTMLButtonElement;
    expect(toggleBtn.textContent).toContain('Collapse');
  });
});
