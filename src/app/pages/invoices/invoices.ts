import { DecimalPipe } from '@angular/common';
import { Component, computed, inject } from '@angular/core';
import { FormArray, FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSelectModule } from '@angular/material/select';
import { MatTableModule } from '@angular/material/table';

import { CurrencyCode } from '../../core/models/invoice.model';
import { Auth } from '../../core/services/auth';
import { Clients } from '../../core/services/clients';
import { Invoices } from '../../core/services/invoices';

@Component({
  selector: 'app-invoices-page',
  imports: [
    DecimalPipe,
    MatButtonModule,
    MatCardModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
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
  readonly displayedColumns = ['number', 'clientName', 'recurringDay', 'currency', 'amount'];
  readonly nioTotal = computed(() => this.totalByCurrency('NIO'));
  readonly usdTotal = computed(() => this.totalByCurrency('USD'));

  readonly form = this.formBuilder.nonNullable.group({
    clientId: ['', [Validators.required]],
    currency: ['NIO' as CurrencyCode, [Validators.required]],
    issueDateDisplay: [this.formatDateForDisplay(new Date().toISOString().slice(0, 10)), [Validators.required]],
    recurringDay: [1, [Validators.required, Validators.min(1), Validators.max(31)]],
    items: this.formBuilder.array([this.createItemGroup()]),
    notes: [''],
  });
  readonly draftAmount = computed(() =>
    this.items.getRawValue().reduce((sum, item) => sum + Number(item.amount || 0), 0),
  );

  constructor() {
    const user = this.auth.user();
    if (user) {
      this.clientsService.watchByUser(user.uid);
    }
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
    const issueDate = this.parseDisplayDate(formValue.issueDateDisplay);
    const items = formValue.items
      .map((item) => ({
        name: item.name.trim(),
        amount: Number(item.amount),
      }))
      .filter((item) => item.name && item.amount > 0);

    if (!selectedClient || !issueDate || !items.length) {
      return;
    }

    await this.invoicesService.create({
      userId: user.uid,
      clientId: selectedClient.id,
      clientName: selectedClient.name,
      currency: formValue.currency,
      issueDate,
      recurringDay: Number(formValue.recurringDay),
      items,
      amount: items.reduce((sum, item) => sum + item.amount, 0),
      notes: formValue.notes.trim(),
    });

    this.resetForm();
  }

  currencySymbol(currency: CurrencyCode) {
    return currency === 'USD' ? '$' : 'C$';
  }

  private totalByCurrency(currency: CurrencyCode) {
    return this.invoices()
      .filter((invoice) => invoice.currency === currency)
      .reduce((sum, invoice) => sum + invoice.amount, 0);
  }

  private createItemGroup() {
    return this.formBuilder.nonNullable.group({
      name: ['', [Validators.required]],
      amount: [0, [Validators.required, Validators.min(0.01)]],
    });
  }

  private resetForm() {
    this.form.reset({
      clientId: '',
      currency: 'NIO',
      issueDateDisplay: this.formatDateForDisplay(new Date().toISOString().slice(0, 10)),
      recurringDay: 1,
      notes: '',
    });

    while (this.items.length > 1) {
      this.items.removeAt(this.items.length - 1);
    }

    this.items.at(0).reset({
      name: '',
      amount: 0,
    });
  }

  private parseDisplayDate(value: string) {
    const match = value.trim().match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (!match) {
      return '';
    }

    const [, day, month, year] = match;
    const parsed = new Date(Number(year), Number(month) - 1, Number(day));

    if (
      parsed.getFullYear() !== Number(year) ||
      parsed.getMonth() !== Number(month) - 1 ||
      parsed.getDate() !== Number(day)
    ) {
      return '';
    }

    return `${year}-${month}-${day}`;
  }

  private formatDateForDisplay(value: string) {
    const [year, month, day] = value.split('-');
    return `${day}/${month}/${year}`;
  }
}
