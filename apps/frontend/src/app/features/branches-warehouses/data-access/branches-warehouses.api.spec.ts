import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { BranchesWarehousesApi } from './branches-warehouses.api';

describe('BranchesWarehousesApi bounded selector consumers', () => {
  let api: BranchesWarehousesApi;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    api = TestBed.inject(BranchesWarehousesApi);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('requests the configured bounded branch selector set explicitly', () => {
    let received = 0;
    api.listBranchOptions().subscribe((items) => { received = items.length; });

    const request = http.expectOne((candidate) => candidate.url.endsWith('/api/v1/branches'));
    expect(request.request.params.get('page')).toBe('1');
    expect(request.request.params.get('pageSize')).toBe('100');
    expect(request.request.params.get('status')).toBe('active');
    request.flush({ data: Array.from({ length: 37 }, (_, index) => ({ id: String(index) })), meta: { page: 1, pageSize: 100, total: 37 } });

    expect(received).toBe(37);
  });

  it('requests the configured bounded warehouse selector set explicitly', () => {
    api.listWarehouseOptions().subscribe();

    const request = http.expectOne((candidate) => candidate.url.endsWith('/api/v1/warehouses'));
    expect(request.request.params.get('page')).toBe('1');
    expect(request.request.params.get('pageSize')).toBe('100');
    expect(request.request.params.get('status')).toBe('active');
    request.flush({ data: [], meta: { page: 1, pageSize: 100, total: 0 } });
  });
});
