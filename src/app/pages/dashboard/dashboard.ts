import { DatePipe, DecimalPipe } from '@angular/common';
import { Component, computed, inject } from '@angular/core';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';

import { CurrencyCode, Invoice } from '../../core/models/invoice.model';
import { GeneratedInvoices } from '../../core/services/generated-invoices';
import { Invoices } from '../../core/services/invoices';

interface ClientSummary {
  clientName: string;
  currency: CurrencyCode;
  recurrences: number;
  total: number;
}

interface UpcomingCharge {
  number: string;
  clientName: string;
  recurringDay: number;
  amount: number;
  currency: CurrencyCode;
  nextChargeDate: Date;
}

@Component({
  selector: 'app-dashboard-page',
  imports: [DatePipe, DecimalPipe, MatCardModule, MatIconModule],
  templateUrl: './dashboard.html',
  styleUrl: './dashboard.scss',
})
export class DashboardPage {
  private readonly recurrencesService = inject(Invoices);
  private readonly generatedInvoicesService = inject(GeneratedInvoices);

  readonly invoices = this.recurrencesService.items;
  readonly generatedInvoices = this.generatedInvoicesService.items;
  readonly recurrenceCount = computed(() => this.invoices().length);
  readonly pendingCount = computed(
    () => this.generatedInvoices().filter((invoice) => invoice.status === 'Pendiente').length,
  );
  readonly paidCount = computed(
    () => this.generatedInvoices().filter((invoice) => invoice.status === 'Pagada').length,
  );
  readonly nioRecurringTotal = computed(() => this.totalByCurrency(this.invoices(), 'NIO'));
  readonly usdRecurringTotal = computed(() => this.totalByCurrency(this.invoices(), 'USD'));
  readonly topClients = computed<ClientSummary[]>(() => {
    const grouped = new Map<string, ClientSummary>();

    for (const invoice of this.invoices()) {
      const key = `${invoice.clientName}-${invoice.currency}`;
      const current = grouped.get(key) ?? {
        clientName: invoice.clientName,
        currency: invoice.currency,
        recurrences: 0,
        total: 0,
      };

      current.recurrences += 1;
      current.total += invoice.amount;
      grouped.set(key, current);
    }

    return [...grouped.values()]
      .sort((left, right) => right.total - left.total)
      .slice(0, 5);
  });
  readonly recentInvoices = computed(() =>
    [...this.generatedInvoices()]
      .sort((left, right) => right.issueDate.localeCompare(left.issueDate))
      .slice(0, 5),
  );
  readonly upcomingCharges = computed<UpcomingCharge[]>(() =>
    [...this.invoices()]
      .map((invoice) => ({
        number: invoice.number,
        clientName: invoice.clientName,
        recurringDay: invoice.recurringDay,
        amount: invoice.amount,
        currency: invoice.currency,
        nextChargeDate: this.getNextChargeDate(invoice.recurringDay),
      }))
      .sort((left, right) => left.nextChargeDate.getTime() - right.nextChargeDate.getTime())
      .slice(0, 5),
  );

  currencySymbol(currency: CurrencyCode) {
    return currency === 'USD' ? '$' : 'C$';
  }

  private totalByCurrency(source: { currency: CurrencyCode; amount: number }[], currency: CurrencyCode) {
    return source
      .filter((invoice) => invoice.currency === currency)
      .reduce((sum, invoice) => sum + invoice.amount, 0);
  }

  private getNextChargeDate(day: number) {
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
