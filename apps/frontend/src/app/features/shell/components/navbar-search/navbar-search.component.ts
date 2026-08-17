import {
  Component,
  DestroyRef,
  ElementRef,
  HostListener,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Router } from '@angular/router';
import { Observable, Subject, catchError, debounceTime, distinctUntilChanged, map, of, switchMap } from 'rxjs';
import { AuthSessionStore } from '../../../auth/data-access/auth-session.store';
import { CatalogApi } from '../../../catalog/data-access/catalog.api';

export interface SearchResultItem {
  readonly id: string;
  readonly title: string;
  readonly subtitle: string;
  readonly route: string;
  readonly group: 'Products' | string;
}

export interface SearchResultGroup {
  readonly name: 'Products' | string;
  readonly items: SearchResultItem[];
}

@Component({
  selector: 'agrivio-navbar-search',
  standalone: true,
  templateUrl: './navbar-search.component.html',
  styleUrl: './navbar-search.component.scss',
})
export class NavbarSearchComponent implements OnInit {
  private readonly sessionStore = inject(AuthSessionStore);
  private readonly catalogApi = inject(CatalogApi);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  private readonly elementRef = inject(ElementRef);

  readonly searchTerm = signal('');
  readonly isLoading = signal(false);
  readonly isOpen = signal(false);
  readonly hasError = signal(false);
  readonly groups = signal<SearchResultGroup[]>([]);
  readonly activeIndex = signal(-1);

  readonly flatResults = computed(() => this.groups().flatMap((g) => g.items));

  private readonly searchSubject = new Subject<string>();

  ngOnInit(): void {
    this.searchSubject
      .pipe(
        map((term) => term.trim()),
        debounceTime(280),
        distinctUntilChanged(),
        switchMap((term) => {
          if (term.length < 2) {
            this.isLoading.set(false);
            this.groups.set([]);
            this.activeIndex.set(-1);
            return of(null);
          }
          this.isLoading.set(true);
          this.hasError.set(false);
          return this.executeSearch(term).pipe(
            catchError(() => {
              this.hasError.set(true);
              this.isLoading.set(false);
              return of([]);
            }),
          );
        }),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((results) => {
        this.isLoading.set(false);
        if (results !== null) {
          this.groups.set(results);
          this.activeIndex.set(-1);
        }
      });
  }

  onInput(event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    this.searchTerm.set(value);
    if (value.trim().length >= 2) {
      this.isOpen.set(true);
    } else {
      this.isOpen.set(false);
    }
    this.searchSubject.next(value);
  }

  onFocus(): void {
    if (this.searchTerm().trim().length >= 2) {
      this.isOpen.set(true);
    }
  }

  clearSearch(): void {
    this.searchTerm.set('');
    this.groups.set([]);
    this.activeIndex.set(-1);
    this.isOpen.set(false);
    this.searchSubject.next('');
  }

  closeDropdown(): void {
    this.isOpen.set(false);
    this.activeIndex.set(-1);
  }

  selectResult(item: SearchResultItem): void {
    this.closeDropdown();
    this.searchTerm.set('');
    void this.router.navigateByUrl(item.route);
  }

  onKeyDown(event: KeyboardEvent): void {
    const total = this.flatResults().length;

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      if (!this.isOpen() && this.searchTerm().trim().length >= 2) {
        this.isOpen.set(true);
      }
      if (total > 0) {
        const next = this.activeIndex() + 1;
        this.activeIndex.set(next >= total ? 0 : next);
      }
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      if (!this.isOpen() && this.searchTerm().trim().length >= 2) {
        this.isOpen.set(true);
      }
      if (total > 0) {
        const prev = this.activeIndex() - 1;
        this.activeIndex.set(prev < 0 ? total - 1 : prev);
      }
    } else if (event.key === 'Enter') {
      if (this.isOpen() && total > 0) {
        event.preventDefault();
        const current = this.activeIndex();
        const results = this.flatResults();
        if (current >= 0 && current < total) {
          const item = results[current];
          if (item) {
            this.selectResult(item);
          }
        } else {
          const first = results[0];
          if (first) {
            this.selectResult(first);
          }
        }
      }
    } else if (event.key === 'Escape') {
      event.preventDefault();
      this.closeDropdown();
    }
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    if (!this.elementRef.nativeElement.contains(event.target as Node)) {
      this.closeDropdown();
    }
  }

  getItemFlatIndex(targetItem: SearchResultItem): number {
    return this.flatResults().findIndex((item) => item.id === targetItem.id && item.group === targetItem.group);
  }

  private executeSearch(term: string): Observable<SearchResultGroup[]> {
    const active = this.sessionStore.activeContext();
    if (!active || active.contextType !== 'organization') {
      return of([]);
    }

    if (!this.sessionStore.hasPermission('catalog.view')) {
      return of([]);
    }

    return this.catalogApi.listProducts({ q: term, limit: 5, status: 'active' }).pipe(
      map((items) => {
        const mapped: SearchResultItem[] = items.slice(0, 5).map((p) => ({
          id: p.id,
          title: p.name,
          subtitle: `SKU: ${p.sku}${p.baseUnitCode ? ` · ${p.baseUnitCode}` : ''}`,
          route: `/app/products/${p.id}`,
          group: 'Products',
        }));
        return mapped.length > 0 ? [{ name: 'Products', items: mapped }] : [];
      }),
      catchError(() => of([])),
    );
  }
}
