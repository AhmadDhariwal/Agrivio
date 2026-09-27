import { Component, input, output, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { UiPaginationComponent } from '../../../../shared/ui/ui-pagination/ui-pagination.component';
import { UiEmptyStateComponent } from '../../../../shared/ui/ui-empty-state/ui-empty-state.component';
import {
  ReportDataset,
  RECONCILIATION_CHECK_NAMES,
  ReconciliationCheckDto,
  ReconciliationFindingDto,
} from '../../models/reports.models';

@Component({
  selector: 'agrivio-reconciliation-view',
  standalone: true,
  imports: [CommonModule, UiPaginationComponent],
  templateUrl: './reconciliation-view.component.html',
  styleUrl: './reconciliation-view.component.scss',
})
export class ReconciliationViewComponent {
  dataset = input<ReportDataset | null>(null);
  pageChange = output<number>();

  reconciledCount = computed(() => {
    return this.dataset()?.checks?.filter((c) => c.status === 'Reconciled').length ?? 0;
  });

  mismatchCount = computed(() => {
    const checksMismatches = this.dataset()?.checks?.filter((c) => c.status === 'Mismatch Detected').length ?? 0;
    const findingsLength = this.dataset()?.rows?.length ?? 0;
    return Math.max(checksMismatches, findingsLength);
  });

  notCheckedCount = computed(() => {
    return this.dataset()?.checks?.filter((c) => c.status === 'Not Checked' || c.status?.toLowerCase().includes('not checked')).length ?? 0;
  });

  getHumanCheckName(code: string): string {
    if (!code) return 'System Integrity Check';
    // Exact match or prefix match in dictionary
    if (RECONCILIATION_CHECK_NAMES[code]) {
      return RECONCILIATION_CHECK_NAMES[code];
    }
    for (const [key, name] of Object.entries(RECONCILIATION_CHECK_NAMES)) {
      if (code.startsWith(key) || key.startsWith(code)) {
        return name;
      }
    }
    return code.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  }

  normalizeStatus(status?: string): string {
    if (!status) return 'not_checked';
    return status.toLowerCase().replace(/[^a-z0-9]+/g, '_');
  }

  formatDomain(domain?: string): string {
    if (!domain) return 'General';
    return domain.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  }
}
