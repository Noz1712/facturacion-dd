import { DecimalPipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { FormArray, FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatNativeDateModule } from '@angular/material/core';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSelectModule } from '@angular/material/select';
import { MatTableModule } from '@angular/material/table';
import { startWith } from 'rxjs';

import { CurrencyCode, Invoice } from '../../core/models/invoice.model';
import { Auth } from '../../core/services/auth';
import { Clients } from '../../core/services/clients';
import { Invoices } from '../../core/services/invoices';

@Component({
  selector: 'app-invoices-page',
  imports: [
    DecimalPipe,
    MatButtonModule,
    MatCardModule,
    MatDatepickerModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatNativeDateModule,
    MatProgressSpinnerModule,
    MatSelectModule,
    MatTableModule,
    ReactiveFormsModule,
  ],
  templateUrl: './invoices.html',
  styleUrl: './invoices.scss',
})
export class InvoicesPage {
  private readonly formBuilder = inject(FormBuilder);
  private readonly auth = inject(Auth);
  private readonly clientsService = inject(Clients);
  private readonly invoicesService = inject(Invoices);

  readonly invoices = this.invoicesService.items;
  readonly clients = this.clientsService.items;
  readonly loading = this.invoicesService.loading;
  readonly displayedColumns = ['number', 'clientName', 'recurringDay', 'currency', 'chargeTotal', 'costTotal', 'margin', 'actions'];
  readonly editingRecurrenceId = signal<string | null>(null);
  readonly isEditing = computed(() => this.editingRecurrenceId() !== null);
  readonly nioTotal = computed(() => this.totalByCurrency('NIO'));
  readonly usdTotal = computed(() => this.totalByCurrency('USD'));
  readonly draftChargeTotal = signal(0);
  readonly draftCostTotal = signal(0);
  readonly draftMargin = computed(() => this.draftChargeTotal() - this.draftCostTotal());

  readonly form = this.formBuilder.nonNullable.group({
    clientId: ['', [Validators.required]],
    currency: ['NIO' as CurrencyCode, [Validators.required]],
    issueDate: [new Date(), [Validators.required]],
    recurringDay: [1, [Validators.required, Validators.min(1), Validators.max(31)]],
    items: this.formBuilder.array([this.createItemGroup()]),
    notes: [''],
  });

  constructor() {
    const user = this.auth.user();
    if (user) {
      this.clientsService.watchByUser(user.uid);
    }

    this.items.valueChanges
      .pipe(startWith(this.items.getRawValue()))
      .subscribe((items) => {
        const chargeTotal = (items as Array<{ charge: number | string }>).reduce(
          (sum: number, item) => sum + Number(item.charge || 0),
          0,
        );
        const costTotal = (items as Array<{ cost: number | string }>).reduce(
          (sum: number, item) => sum + Number(item.cost || 0),
          0,
        );

        this.draftChargeTotal.set(chargeTotal);
        this.draftCostTotal.set(costTotal);
      });
  }

  get items() {
    return this.form.controls.items as FormArray;
  }

  addItem() {
    this.items.push(this.createItemGroup());
  }

  removeItem(index: number) {
    if (this.items.length === 1) {
      return;
    }

    this.items.removeAt(index);
  }

  async saveInvoice() {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const user = this.auth.user();
    if (!user) {
      return;
    }

    const formValue = this.form.getRawValue();
    const selectedClient = this.clients().find((client) => client.id === formValue.clientId);
    const issueDate = this.dateToIso(formValue.issueDate);
    const items = formValue.items
      .map((item) => ({
        name: item.name.trim(),
        charge: Number(item.charge),
        cost: Number(item.cost),
      }))
      .filter((item) => item.name && item.charge > 0 && item.cost >= 0);

    if (!selectedClient || !issueDate || !items.length) {
      return;
    }

    const payload = {
      clientId: selectedClient.id,
      clientName: selectedClient.name,
      clientCode: selectedClient.clientCode?.trim() || this.fallbackClientCode(selectedClient.id),
      currency: formValue.currency,
      issueDate,
      recurringDay: Number(formValue.recurringDay),
      items,
      chargeTotal: items.reduce((sum, item) => sum + item.charge, 0),
      costTotal: items.reduce((sum, item) => sum + item.cost, 0),
      margin: items.reduce((sum, item) => sum + (item.charge - item.cost), 0),
      notes: formValue.notes.trim(),
    };

    if (this.editingRecurrenceId()) {
      await this.invoicesService.update(this.editingRecurrenceId()!, payload);
    } else {
      await this.invoicesService.create({
        userId: user.uid,
        ...payload,
      });
    }

    this.resetForm();
  }

  editRecurrence(invoice: Invoice & { amount?: number }) {
    this.editingRecurrenceId.set(invoice.id);

    const issueDate = this.isoToDate(invoice.issueDate);
    const rawDetail = (invoice.items?.length ? invoice.items : [{ name: '', charge: 0, cost: 0 }]).map(
      (item: Invoice['items'][number]) => ({
        name: item.name?.trim() ?? '',
        charge: typeof item.charge === 'number' ? item.charge : (item as { amount?: number }).amount ?? 0,
        cost: typeof item.cost === 'number' ? item.cost : 0,
      }),
    );
    const detail = rawDetail.filter(
      (item) =>
        (item.name && !this.isPlaceholderItemName(item.name)) ||
        item.charge > 0 ||
        item.cost > 0,
    );
    const safeDetail = detail.length ? detail : [{ name: '', charge: 0, cost: 0 }];

    while (this.items.length > 1) {
      this.items.removeAt(this.items.length - 1);
    }

    this.items.at(0).patchValue(safeDetail[0]);

    safeDetail
      .slice(1)
      .forEach((item: { name: string; charge: number; cost: number }) => this.items.push(this.createItemGroup(item)));

    this.form.patchValue({
      clientId: invoice.clientId,
      currency: invoice.currency,
      issueDate,
      recurringDay: invoice.recurringDay,
      notes: invoice.notes ?? '',
    });
  }

  cancelEdit() {
    this.resetForm();
  }

  async deleteRecurrence(invoiceId: string) {
    await this.invoicesService.remove(invoiceId);

    if (this.editingRecurrenceId() === invoiceId) {
      this.resetForm();
    }
  }

  currencySymbol(currency: CurrencyCode) {
    return currency === 'USD' ? '$' : 'C$';
  }

  invoiceChargeTotal(invoice: { chargeTotal?: number; amount?: number }) {
    if (typeof invoice.chargeTotal === 'number') {
      return invoice.chargeTotal;
    }

    return typeof invoice.amount === 'number' ? invoice.amount : 0;
  }

  invoiceCostTotal(invoice: { costTotal?: number }) {
    return typeof invoice.costTotal === 'number' ? invoice.costTotal : 0;
  }

  invoiceMargin(invoice: { margin?: number; chargeTotal?: number; costTotal?: number; amount?: number }) {
    if (typeof invoice.margin === 'number') {
      return invoice.margin;
    }

    return this.invoiceChargeTotal(invoice) - this.invoiceCostTotal(invoice);
  }

  private totalByCurrency(currency: CurrencyCode) {
    return this.invoices()
      .filter((invoice) => invoice.currency === currency)
      .reduce((sum, invoice) => sum + this.invoiceChargeTotal(invoice), 0);
  }

  private createItemGroup(item?: { name?: string; charge?: number; cost?: number }) {
    return this.formBuilder.nonNullable.group({
      name: [item?.name ?? '', [Validators.required]],
      charge: [item?.charge ?? 0, [Validators.required, Validators.min(0.01)]],
      cost: [item?.cost ?? 0, [Validators.required, Validators.min(0)]],
    });
  }

  private resetForm() {
    this.editingRecurrenceId.set(null);
    this.form.reset({
      clientId: '',
      currency: 'NIO',
      issueDate: new Date(),
      recurringDay: 1,
      notes: '',
    });

    while (this.items.length > 1) {
      this.items.removeAt(this.items.length - 1);
    }

    this.items.at(0).reset({
      name: '',
      charge: 0,
      cost: 0,
    });
  }

  private isoToDate(value: string) {
    const [year, month, day] = value.split('-').map(Number);
    return new Date(year, month - 1, day);
  }

  private dateToIso(value: Date) {
    const year = value.getFullYear();
    const month = String(value.getMonth() + 1).padStart(2, '0');
    const day = String(value.getDate()).padStart(2, '0');

    return `${year}-${month}-${day}`;
  }

  private isPlaceholderItemName(name: string) {
    const normalized = name.trim().toLowerCase();
    return normalized === 'nombre';
  }

  private fallbackClientCode(clientId: string) {
    const normalized = clientId.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
    return normalized.slice(0, 6) || 'CLIENT';
  }
}
