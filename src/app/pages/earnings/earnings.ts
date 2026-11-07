import { DecimalPipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';

import { GeneratedInvoice } from '../../core/models/generated-invoice.model';
import { CurrencyCode } from '../../core/models/invoice.model';
import { GeneratedInvoices } from '../../core/services/generated-invoices';
import { Invoices } from '../../core/services/invoices';

type RangeKey = 'month' | '3m' | '6m' | '12m' | 'year' | 'all';

interface Totals {
  billed: number;
  cost: number;
  profit: number;
  collected: number;
  receivable: number;
  profitCollected: number;
  count: number;
}

interface MonthBar extends Totals {
  key: string;
  label: string;
  heightPct: number;
}

interface ClientRow {
  clientName: string;
  billed: number;
  profit: number;
  marginPct: number;
  count: number;
}

const MONTHS = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

@Component({
  selector: 'app-earnings-page',
  imports: [DecimalPipe, MatButtonToggleModule, MatCardModule, MatIconModule],
  templateUrl: './earnings.html',
  styleUrl: './earnings.scss',
})
export class EarningsPage {
  private readonly generatedInvoicesService = inject(GeneratedInvoices);
  private readonly recurrencesService = inject(Invoices);

  readonly loading = this.generatedInvoicesService.loading;
  private readonly selectedCurrency = signal<CurrencyCode | null>(null);
  readonly range = signal<RangeKey>('12m');
  readonly hovered = signal<MonthBar | null>(null);
  readonly showTable = signal(false);

  readonly ranges: Array<{ key: RangeKey; label: string }> = [
    { key: 'month', label: 'Este mes' },
    { key: '3m', label: '3 meses' },
    { key: '6m', label: '6 meses' },
    { key: '12m', label: '12 meses' },
    { key: 'year', label: 'Este año' },
    { key: 'all', label: 'Todo' },
  ];

  /** Currencies are never mixed: there is no exchange rate in the app. */
  readonly availableCurrencies = computed<CurrencyCode[]>(() => {
    const used = new Set(this.generatedInvoicesService.items().map((item) => item.currency));
    const list = (['NIO', 'USD'] as CurrencyCode[]).filter((code) => used.has(code));
    return list.length ? list : ['NIO'];
  });

  /** Selected currency, falling back to one that actually has invoices. */
  readonly currency = computed<CurrencyCode>(() => {
    const available = this.availableCurrencies();
    const selected = this.selectedCurrency();
    return selected && available.includes(selected) ? selected : available[0];
  });

  private readonly invoicesInCurrency = computed(() =>
    this.generatedInvoicesService.items().filter((item) => item.currency === this.currency()),
  );

  readonly rangeInvoices = computed(() => {
    const fromKey = this.rangeStartKey(this.range());
    return this.invoicesInCurrency().filter((item) => !fromKey || item.issueDate.slice(0, 7) >= fromKey);
  });

  readonly totals = computed(() => this.sum(this.rangeInvoices()));

  readonly marginPct = computed(() => {
    const totals = this.totals();
    return totals.billed ? (totals.profit / totals.billed) * 100 : 0;
  });

  /** Expected monthly profit from the active recurrences (projection). */
  readonly recurringMonthly = computed(() =>
    this.recurrencesService
      .items()
      .filter((item) => item.currency === this.currency())
      .reduce(
        (acc, item) => {
          const charge = Number(item.chargeTotal ?? 0);
          const cost = Number(item.costTotal ?? 0);
          return { billed: acc.billed + charge, profit: acc.profit + (charge - cost) };
        },
        { billed: 0, profit: 0 },
      ),
  );

  /** Last 12 months, always, so the trend is comparable whatever range is selected. */
  readonly months = computed<MonthBar[]>(() => {
    const today = new Date();
    const keys: string[] = [];
    for (let offset = 11; offset >= 0; offset--) {
      const date = new Date(today.getFullYear(), today.getMonth() - offset, 1);
      keys.push(`${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`);
    }

    const byMonth = new Map<string, GeneratedInvoice[]>();
    for (const item of this.invoicesInCurrency()) {
      const key = item.issueDate.slice(0, 7);
      byMonth.set(key, [...(byMonth.get(key) ?? []), item]);
    }

    const bars = keys.map((key) => {
      const [year, month] = key.split('-').map(Number);
      return {
        key,
        label: `${MONTHS[month - 1]}${month === 1 ? ` ${String(year).slice(2)}` : ''}`,
        heightPct: 0,
        ...this.sum(byMonth.get(key) ?? []),
      };
    });

    const max = Math.max(...bars.map((bar) => bar.profit), 0);
    return bars.map((bar) => ({
      ...bar,
      heightPct: max > 0 ? Math.max(0, (bar.profit / max) * 100) : 0,
    }));
  });

  readonly chartMax = computed(() => Math.max(...this.months().map((bar) => bar.profit), 0));
  readonly bestMonth = computed(() =>
    this.months().reduce<MonthBar | null>(
      (best, bar) => (bar.profit > 0 && (!best || bar.profit > best.profit) ? bar : best),
      null,
    ),
  );
  readonly readout = computed(() => this.hovered() ?? this.months()[this.months().length - 1]);

  readonly clients = computed<ClientRow[]>(() => {
    const grouped = new Map<string, ClientRow>();
    for (const item of this.rangeInvoices()) {
      const key = item.clientId || item.clientName;
      const row = grouped.get(key) ?? { clientName: item.clientName, billed: 0, profit: 0, marginPct: 0, count: 0 };
      row.billed += this.charge(item);
      row.profit += this.profit(item);
      row.count += 1;
      grouped.set(key, row);
    }

    return [...grouped.values()]
      .map((row) => ({ ...row, marginPct: row.billed ? (row.profit / row.billed) * 100 : 0 }))
      .sort((left, right) => right.profit - left.profit);
  });

  readonly topClientProfit = computed(() => Math.max(...this.clients().map((row) => row.profit), 0));

  symbol() {
    return this.currency() === 'USD' ? '$' : 'C$';
  }

  setCurrency(value: CurrencyCode) {
    this.selectedCurrency.set(value);
    this.hovered.set(null);
  }

  setRange(value: RangeKey) {
    this.range.set(value);
  }

  shareOf(value: number, total: number) {
    return total > 0 ? Math.max(0, Math.min(100, (value / total) * 100)) : 0;
  }

  private rangeStartKey(range: RangeKey) {
    if (range === 'all') {
      return '';
    }

    const today = new Date();
    const monthsBack = { month: 0, '3m': 2, '6m': 5, '12m': 11, year: today.getMonth() }[range];
    const start = new Date(today.getFullYear(), today.getMonth() - monthsBack, 1);
    return `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}`;
  }

  private sum(items: GeneratedInvoice[]): Totals {
    return items.reduce<Totals>(
      (acc, item) => {
        const charge = this.charge(item);
        const profit = this.profit(item);
        const paid = item.status === 'Pagada';
        return {
          billed: acc.billed + charge,
          cost: acc.cost + (charge - profit),
          profit: acc.profit + profit,
          collected: acc.collected + (paid ? charge : 0),
          receivable: acc.receivable + (paid ? 0 : charge),
          profitCollected: acc.profitCollected + (paid ? profit : 0),
          count: acc.count + 1,
        };
      },
      { billed: 0, cost: 0, profit: 0, collected: 0, receivable: 0, profitCollected: 0, count: 0 },
    );
  }

  private charge(item: GeneratedInvoice) {
    return typeof item.chargeTotal === 'number' ? item.chargeTotal : 0;
  }

  private profit(item: GeneratedInvoice) {
    if (typeof item.margin === 'number') {
      return item.margin;
    }
    return this.charge(item) - (typeof item.costTotal === 'number' ? item.costTotal : 0);
  }
}
