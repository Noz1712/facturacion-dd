import { DatePipe, DecimalPipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSelectModule } from '@angular/material/select';

import { GeneratedInvoice } from '../../core/models/generated-invoice.model';
import { CurrencyCode, Invoice } from '../../core/models/invoice.model';
import { GeneratedInvoices } from '../../core/services/generated-invoices';
import { Invoices } from '../../core/services/invoices';

interface UpcomingRecurrence {
  recurrence: Invoice;
  nextGenerateDate: Date;
  periodKey: string;
  alreadyGenerated: boolean;
}

@Component({
  selector: 'app-movements-page',
  imports: [
    DatePipe,
    DecimalPipe,
    MatButtonModule,
    MatCardModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatProgressSpinnerModule,
    MatSelectModule,
  ],
  templateUrl: './movements.html',
  styleUrl: './movements.scss',
})
export class MovementsPage {
  private readonly recurrencesService = inject(Invoices);
  private readonly generatedInvoicesService = inject(GeneratedInvoices);

  readonly recurrences = this.recurrencesService.items;
  readonly generatedInvoices = this.generatedInvoicesService.items;
  readonly loading = computed(
    () => this.recurrencesService.loading() || this.generatedInvoicesService.loading(),
  );
  readonly filters = signal({
    from: '',
    to: '',
  });
  readonly paymentDrafts = signal<Record<string, { status: GeneratedInvoice['status']; transactionNumber: string }>>({});
  readonly upcomingRecurrences = computed<UpcomingRecurrence[]>(() =>
    [...this.recurrences()]
      .map((recurrence) => {
        const nextGenerateDate = this.getNextGenerateDate(recurrence.recurringDay);
        const periodKey = `${nextGenerateDate.getFullYear()}-${String(nextGenerateDate.getMonth() + 1).padStart(2, '0')}`;
        const alreadyGenerated = this.generatedInvoices().some(
          (generated) =>
            generated.recurrenceId === recurrence.id && generated.periodKey === periodKey,
        );

        return {
          recurrence,
          nextGenerateDate,
          periodKey,
          alreadyGenerated,
        };
      })
      .filter((item) => this.matchesRange(item.nextGenerateDate))
      .sort((left, right) => left.nextGenerateDate.getTime() - right.nextGenerateDate.getTime())
      .slice(0, 8),
  );
  readonly recentGeneratedInvoices = computed(() =>
    this.generatedInvoices()
      .filter((invoice) => this.matchesRange(this.isoToDate(invoice.issueDate)))
      .slice(0, 10),
  );

  async generateNow(item: UpcomingRecurrence) {
    await this.generatedInvoicesService.generateNow(item.recurrence, item.nextGenerateDate);
  }

  async revert(invoiceId: string) {
    await this.generatedInvoicesService.revert(invoiceId);
  }

  updateDraft(
    invoice: GeneratedInvoice,
    patch: Partial<{ status: GeneratedInvoice['status']; transactionNumber: string }>,
  ) {
    this.paymentDrafts.update((drafts) => ({
      ...drafts,
      [invoice.id]: {
        status: patch.status ?? drafts[invoice.id]?.status ?? invoice.status,
        transactionNumber:
          patch.transactionNumber ?? drafts[invoice.id]?.transactionNumber ?? invoice.transactionNumber ?? '',
      },
    }));
  }

  updateFilter(field: 'from' | 'to', value: string) {
    this.filters.update((current) => ({
      ...current,
      [field]: value,
    }));
  }

  async savePayment(invoice: GeneratedInvoice) {
    const draft = this.paymentDrafts()[invoice.id];
    await this.generatedInvoicesService.updatePayment(
      invoice.id,
      draft?.status ?? invoice.status,
      draft?.transactionNumber ?? invoice.transactionNumber ?? '',
    );
  }

  getDraft(invoice: GeneratedInvoice) {
    return this.paymentDrafts()[invoice.id] ?? {
      status: invoice.status,
      transactionNumber: invoice.transactionNumber ?? '',
    };
  }

  currencySymbol(currency: CurrencyCode) {
    return currency === 'USD' ? '$' : 'C$';
  }

  private matchesRange(date: Date) {
    const from = this.parseDisplayDate(this.filters().from);
    const to = this.parseDisplayDate(this.filters().to);
    const value = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();

    if (from && value < from.getTime()) {
      return false;
    }

    if (to && value > to.getTime()) {
      return false;
    }

    return true;
  }

  private parseDisplayDate(value: string) {
    const trimmed = value.trim();
    if (!trimmed) {
      return null;
    }

    const match = trimmed.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (!match) {
      return null;
    }

    const [, day, month, year] = match;
    const parsed = new Date(Number(year), Number(month) - 1, Number(day));

    if (
      parsed.getFullYear() !== Number(year) ||
      parsed.getMonth() !== Number(month) - 1 ||
      parsed.getDate() !== Number(day)
    ) {
      return null;
    }

    return new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate());
  }

  private isoToDate(value: string) {
    const [year, month, day] = value.split('-').map(Number);
    return new Date(year, month - 1, day);
  }

  private getNextGenerateDate(day: number) {
    const today = new Date();
    const currentYear = today.getFullYear();
    const currentMonth = today.getMonth();
    const currentDay = today.getDate();

    const safeCurrentMonthDay = Math.min(day, new Date(currentYear, currentMonth + 1, 0).getDate());
    if (safeCurrentMonthDay >= currentDay) {
      return new Date(currentYear, currentMonth, safeCurrentMonthDay);
    }

    const nextMonthDate = new Date(currentYear, currentMonth + 1, 1);
    const safeNextMonthDay = Math.min(
      day,
      new Date(nextMonthDate.getFullYear(), nextMonthDate.getMonth() + 1, 0).getDate(),
    );

    return new Date(nextMonthDate.getFullYear(), nextMonthDate.getMonth(), safeNextMonthDay);
  }
}
