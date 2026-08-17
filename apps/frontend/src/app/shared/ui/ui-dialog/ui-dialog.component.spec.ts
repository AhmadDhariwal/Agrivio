import { ComponentFixture, TestBed } from '@angular/core/testing';
import { UiDialogComponent } from './ui-dialog.component';

describe('UiDialogComponent body scroll lock', () => {
  let fixtures: ComponentFixture<UiDialogComponent>[];

  beforeEach(async () => {
    fixtures = [];
    document.body.style.overflow = '';
    await TestBed.configureTestingModule({
      imports: [UiDialogComponent],
    }).compileComponents();
  });

  afterEach(() => {
    for (const fixture of fixtures) {
      fixture.destroy();
    }
    document.body.style.overflow = '';
  });

  async function createDialog(open = false): Promise<ComponentFixture<UiDialogComponent>> {
    const fixture = TestBed.createComponent(UiDialogComponent);
    fixtures.push(fixture);
    fixture.componentRef.setInput('title', 'Test dialog');
    fixture.componentRef.setInput('open', open);
    fixture.detectChanges();
    await fixture.whenStable();
    return fixture;
  }

  it('preserves the previous body overflow value and restores it on close', async () => {
    document.body.style.overflow = 'scroll';

    const fixture = await createDialog(true);
    expect(document.body.style.overflow).toBe('hidden');

    fixture.componentRef.setInput('open', false);
    fixture.detectChanges();
    await fixture.whenStable();

    expect(document.body.style.overflow).toBe('scroll');
  });

  it('restores the previous body overflow value on destroy while open', async () => {
    document.body.style.overflow = 'auto';

    const fixture = await createDialog(true);
    expect(document.body.style.overflow).toBe('hidden');

    fixture.destroy();
    fixtures = fixtures.filter((item) => item !== fixture);

    expect(document.body.style.overflow).toBe('auto');
  });

  it('keeps body scrolling locked while another dialog remains open', async () => {
    document.body.style.overflow = '';

    const first = await createDialog(true);
    const second = await createDialog(true);
    expect(document.body.style.overflow).toBe('hidden');

    first.componentRef.setInput('open', false);
    first.detectChanges();
    await first.whenStable();

    expect(document.body.style.overflow).toBe('hidden');

    second.componentRef.setInput('open', false);
    second.detectChanges();
    await second.whenStable();

    expect(document.body.style.overflow).toBe('');
  });
});
