import { Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { CatalogApi } from '../../data-access/catalog.api';
import { AuthSessionStore } from '../../../auth/data-access/auth-session.store';
import { UiPageHeaderComponent } from '../../../../shared/ui/ui-page-header/ui-page-header.component';
import { UiAlertComponent } from '../../../../shared/ui/ui-alert/ui-alert.component';
import { UiLoadingStateComponent } from '../../../../shared/ui/ui-loading-state/ui-loading-state.component';
import { UiFieldLabelComponent } from '../../../../shared/ui/ui-field-label/ui-field-label.component';
import { hasRequiredValidator } from '../../../../shared/form/form-field.util';

@Component({
  selector: 'agrivio-category-form-page',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    RouterLink,
    UiPageHeaderComponent,
    UiAlertComponent,
    UiLoadingStateComponent,
    UiFieldLabelComponent,
  ],
  templateUrl: './category-form.page.html',
  styleUrl: './category-form.page.scss',
})
export class CategoryFormPage {
  private readonly api = inject(CatalogApi);
  private readonly sessionStore = inject(AuthSessionStore);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly formBuilder = inject(FormBuilder);

  readonly categoryId = signal<string | null>(null);
  readonly loading = signal(false);
  readonly saving = signal(false);
  readonly errorMessage = signal<string | null>(null);
  readonly canManage = computed(() => this.sessionStore.hasPermission('catalog.manage'));
  private version = 1;

  readonly fieldRequired = hasRequiredValidator;

  readonly form = this.formBuilder.nonNullable.group({
    name: ['', [Validators.required, Validators.minLength(2)]],
    productClass: ['general' as string, [Validators.required]],
    status: ['active'],
  });

  constructor() {
    const id = this.route.snapshot.paramMap.get('id');
    if (id && id !== 'new') {
      this.categoryId.set(id);
      this.loading.set(true);
      this.api.getCategory(id).subscribe({
        next: (category) => {
          this.version = category.version;
          this.form.patchValue({
            name: category.name,
            productClass: category.productClass,
            status: category.status,
          });
          this.loading.set(false);
        },
        error: (error: unknown) => {
          this.loading.set(false);
          this.errorMessage.set(this.mapError(error, 'Unable to load category.'));
        },
      });
    }
  }

  save(): void {
    if (!this.canManage() || this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.saving.set(true);
    this.errorMessage.set(null);
    const value = this.form.getRawValue();
    const request$ =
      this.categoryId() === null
        ? this.api.createCategory({
            name: value.name,
            productClass: value.productClass,
          })
        : this.api.updateCategory(this.categoryId()!, {
            expectedVersion: this.version,
            name: value.name,
            productClass: value.productClass,
            status: value.status,
          });

    request$.subscribe({
      next: () => {
        this.saving.set(false);
        void this.router.navigateByUrl('/app/categories');
      },
      error: (error: unknown) => {
        this.saving.set(false);
        this.errorMessage.set(this.mapError(error, 'Unable to save category.'));
      },
    });
  }

  private mapError(error: unknown, fallback: string): string {
    if (!(error instanceof HttpErrorResponse)) {
      return fallback;
    }
    if (error.error?.error?.code === 'VERSION_CONFLICT') {
      return 'This category changed elsewhere. Reload and try again.';
    }
    return error.error?.error?.message ?? fallback;
  }
}
