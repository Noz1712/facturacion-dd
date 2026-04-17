import { DatePipe, DecimalPipe } from '@angular/common';
import { Component, TemplateRef, ViewChild, computed, inject, signal } from '@angular/core';
import { FormArray, FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatDialog, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatNativeDateModule } from '@angular/material/core';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSelectModule } from '@angular/material/select';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

import { GeneratedInvoice } from '../../core/models/generated-invoice.model';
import { CurrencyCode, Invoice } from '../../core/models/invoice.model';
import { Auth } from '../../core/services/auth';
import { Clients } from '../../core/services/clients';
import { CompanyProfileService } from '../../core/services/company-profile';
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
    MatDatepickerModule,
    MatDialogModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatNativeDateModule,
    MatProgressSpinnerModule,
    MatSelectModule,
    ReactiveFormsModule,
  ],
  templateUrl: './movements.html',
  styleUrl: './movements.scss',
})
export class MovementsPage {
  @ViewChild('paymentDialogTemplate') paymentDialogTemplate?: TemplateRef<unknown>;
  @ViewChild('manualInvoiceDialogTemplate') manualInvoiceDialogTemplate?: TemplateRef<unknown>;

  private readonly auth = inject(Auth);
  private readonly formBuilder = inject(FormBuilder);
  private readonly clientsService = inject(Clients);
  private readonly companyProfileService = inject(CompanyProfileService);
  private readonly dialog = inject(MatDialog);
  private readonly recurrencesService = inject(Invoices);
  private readonly generatedInvoicesService = inject(GeneratedInvoices);
  private paymentDialogRef?: MatDialogRef<unknown>;
  private manualDialogRef?: MatDialogRef<unknown>;

  readonly recurrences = this.recurrencesService.items;
  readonly clients = this.clientsService.items;
  readonly generatedInvoices = this.generatedInvoicesService.items;
  readonly companyProfile = this.companyProfileService.item;
  readonly selectedInvoice = signal<GeneratedInvoice | null>(null);
  readonly loading = computed(
    () => this.recurrencesService.loading() || this.generatedInvoicesService.loading(),
  );
  readonly filters = signal({
    from: null as Date | null,
    to: null as Date | null,
  });
  readonly paymentDrafts = signal<Record<string, { status: GeneratedInvoice['status']; transactionNumber: string }>>({});
  readonly paymentForm = this.formBuilder.nonNullable.group({
    status: ['Pendiente' as GeneratedInvoice['status'], [Validators.required]],
    transactionNumber: [''],
  });
  readonly editingManualInvoiceId = signal<string | null>(null);
  readonly isEditingManual = computed(() => this.editingManualInvoiceId() !== null);
  readonly manualForm = this.formBuilder.nonNullable.group({
    clientId: ['', [Validators.required]],
    issueDate: [new Date(), [Validators.required]],
    currency: ['NIO' as CurrencyCode, [Validators.required]],
    items: this.formBuilder.array([this.createManualItemGroup()]),
    notes: [''],
  });
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
      .filter((item) => !item.alreadyGenerated)
      .filter((item) => this.matchesRange(item.nextGenerateDate))
      .sort((left, right) => left.nextGenerateDate.getTime() - right.nextGenerateDate.getTime())
      .slice(0, 8),
  );
  readonly recentGeneratedInvoices = computed(() =>
    this.generatedInvoices()
      .filter((invoice) => this.matchesRange(this.isoToDate(invoice.issueDate)))
      .slice(0, 10),
  );

  constructor() {
    const user = this.auth.user();
    if (user) {
      this.clientsService.watchByUser(user.uid);
      this.companyProfileService.watch(user.uid);
    }

    this.paymentForm.controls.status.valueChanges.subscribe((status) => {
      this.applyPaymentValidators(status, true);
    });
  }

  get manualItems() {
    return this.manualForm.controls.items as FormArray;
  }

  addManualItem() {
    this.manualItems.push(this.createManualItemGroup());
  }

  removeManualItem(index: number) {
    if (this.manualItems.length === 1) {
      return;
    }

    this.manualItems.removeAt(index);
  }

  async saveManualInvoice() {
    const headerControls = [
      this.manualForm.controls.clientId,
      this.manualForm.controls.issueDate,
      this.manualForm.controls.currency,
    ];

    const hasInvalidHeader = headerControls.some((control) => control.invalid);
    if (hasInvalidHeader) {
      this.manualForm.markAllAsTouched();
      return;
    }

    const user = this.auth.user();
    if (!user) {
      return;
    }

    const value = this.manualForm.getRawValue();
    const selectedClient = this.clients().find((client) => client.id === value.clientId);
    const issueDate = this.dateToIso(value.issueDate);
    const items = value.items
      .map((item) => ({
        name: item.name.trim(),
        charge: Number(item.charge),
        cost: Number(item.cost),
      }))
      .filter((item) => item.name && item.charge > 0 && item.cost >= 0);

    if (!selectedClient || !items.length) {
      this.manualItems.controls.forEach((group) => group.markAllAsTouched());
      return;
    }

    const payload = {
      clientId: selectedClient.id,
      clientName: selectedClient.name,
      clientCode: selectedClient.clientCode?.trim() || undefined,
      currency: value.currency,
      issueDate,
      dueDate: this.calculateDueDate(issueDate),
      items,
      notes: value.notes.trim(),
    };

    if (this.editingManualInvoiceId()) {
      await this.generatedInvoicesService.updateManual(this.editingManualInvoiceId()!, payload);
    } else {
      await this.generatedInvoicesService.createManual({
        userId: user.uid,
        ...payload,
      });
    }

    this.closeManualDialog();
  }

  editManualInvoice(invoice: GeneratedInvoice) {
    if (!this.isManualInvoice(invoice)) {
      return;
    }

    this.editingManualInvoiceId.set(invoice.id);

    while (this.manualItems.length > 1) {
      this.manualItems.removeAt(this.manualItems.length - 1);
    }

    const normalizedItems = invoice.items?.length
      ? invoice.items.map((line) => ({
          name: line.name?.trim() ?? '',
          charge: this.lineCharge(line),
          cost: this.lineCost(line),
        }))
      : [{ name: '', charge: 0, cost: 0 }];

    this.manualItems.at(0).patchValue(normalizedItems[0]);
    normalizedItems.slice(1).forEach((item) => this.manualItems.push(this.createManualItemGroup(item)));

    this.manualForm.patchValue({
      clientId: invoice.clientId,
      issueDate: this.isoToDate(invoice.issueDate),
      currency: invoice.currency,
      notes: invoice.notes ?? '',
    });

    this.openManualDialog();
  }

  cancelManualEdit() {
    this.closeManualDialog();
  }

  isManualInvoice(invoice: GeneratedInvoice) {
    return !!invoice.isManual || invoice.recurrenceId === 'manual';
  }

  openManualDialog() {
    if (!this.manualInvoiceDialogTemplate) {
      return;
    }

    this.manualDialogRef?.close();
    this.manualDialogRef = this.dialog.open(this.manualInvoiceDialogTemplate, {
      width: '1120px',
      maxWidth: '98vw',
      maxHeight: '94vh',
      panelClass: 'manual-dialog-panel',
    });

    this.manualDialogRef.afterClosed().subscribe(() => {
      this.manualDialogRef = undefined;
      this.resetManualForm();
    });
  }

  startManualCreate() {
    this.resetManualForm();
    this.openManualDialog();
  }

  closeManualDialog() {
    this.manualDialogRef?.close();
  }

  async generateNow(item: UpcomingRecurrence) {
    const selectedClient = this.clients().find((client) => client.id === item.recurrence.clientId);
    const recurrenceWithCatalogCode: Invoice = {
      ...item.recurrence,
      clientCode: selectedClient?.clientCode?.trim() || undefined,
    };

    await this.generatedInvoicesService.generateNow(
      recurrenceWithCatalogCode,
      item.nextGenerateDate,
      this.getPaymentTermDays(),
    );
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

  updateFilter(field: 'from' | 'to', value: Date | null) {
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

  openPaymentDialog(invoice: GeneratedInvoice) {
    if (!this.paymentDialogTemplate) {
      return;
    }

    this.selectedInvoice.set(invoice);
    const draft = this.getDraft(invoice);
    this.paymentForm.reset({
      status: draft.status,
      transactionNumber: draft.transactionNumber,
    });
    this.applyPaymentValidators(draft.status, false);
    this.paymentForm.markAsPristine();
    this.paymentForm.markAsUntouched();

    this.paymentDialogRef?.close();
    this.paymentDialogRef = this.dialog.open(this.paymentDialogTemplate, {
      width: '560px',
      maxWidth: '95vw',
      panelClass: 'payment-dialog-panel',
    });
    this.paymentDialogRef.afterClosed().subscribe(() => {
      this.paymentForm.reset({
        status: 'Pendiente',
        transactionNumber: '',
      });
      this.applyPaymentValidators('Pendiente', false);
      this.selectedInvoice.set(null);
      this.paymentDialogRef = undefined;
    });
  }

  closePaymentDialog() {
    this.paymentDialogRef?.close();
  }

  async saveSelectedPayment() {
    const invoice = this.selectedInvoice();
    if (!invoice) {
      return;
    }

    if (this.paymentForm.invalid) {
      this.paymentForm.markAllAsTouched();
      return;
    }

    const formValue = this.paymentForm.getRawValue();
    const transactionNumber = formValue.transactionNumber.trim();

    await this.generatedInvoicesService.updatePayment(
      invoice.id,
      formValue.status,
      transactionNumber,
    );

    this.paymentDrafts.update((drafts) => ({
      ...drafts,
      [invoice.id]: {
        status: formValue.status,
        transactionNumber,
      },
    }));

    this.closePaymentDialog();
  }

  isTransactionRequired() {
    return this.paymentForm.controls.status.value === 'Pagada';
  }

  private applyPaymentValidators(status: GeneratedInvoice['status'], clearOnPending: boolean) {
    const transactionControl = this.paymentForm.controls.transactionNumber;

    if (status === 'Pagada') {
      transactionControl.setValidators([Validators.required, Validators.minLength(3)]);
    } else {
      transactionControl.clearValidators();
      if (clearOnPending) {
        transactionControl.setValue('');
      }
    }

    transactionControl.updateValueAndValidity({ emitEvent: false });
  }

  downloadInvoicePdf(invoice: GeneratedInvoice) {
    const doc = new jsPDF({ unit: 'mm', format: 'a4' });
    const profile = this.companyProfile();
    const issuer = this.auth.user()?.displayName || this.auth.user()?.email || 'Facturacion DD';
    const chargeTotal = this.chargeTotal(invoice);
    const emittedInvoiceCode = invoice.invoiceCode || this.buildEmittedInvoiceCode(invoice);

    const tableStartY = this.drawDocumentHeader(
      doc,
      invoice,
      issuer,
      profile?.name || 'Facturacion DD',
      emittedInvoiceCode,
    );

    autoTable(doc, {
      startY: tableStartY,
      head: [['#', 'Descripcion', 'Cantidad', 'Precio unitario', 'Subtotal']],
      body: invoice.items.map((line, index) => {
        const lineCharge = this.lineCharge(line);

        return [
          String(index + 1),
          line.name,
          '1',
          this.currencyLabel(invoice.currency, lineCharge),
          this.currencyLabel(invoice.currency, lineCharge),
        ];
      }),
      theme: 'striped',
      headStyles: {
        fillColor: [76, 29, 149],
        textColor: [255, 255, 255],
        fontSize: 9,
        fontStyle: 'bold',
      },
      styles: {
        fontSize: 8.8,
        cellPadding: 2.5,
        textColor: [36, 21, 61],
        lineColor: [216, 180, 254],
        lineWidth: 0.2,
      },
      alternateRowStyles: {
        fillColor: [247, 241, 255],
      },
      columnStyles: {
        0: { halign: 'center', cellWidth: 10 },
        1: { cellWidth: 88 },
        2: { halign: 'center', cellWidth: 20 },
        3: { halign: 'right', cellWidth: 34 },
        4: { halign: 'right', cellWidth: 34 },
      },
    });

    const finalY = (doc as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? 70;

    const totalsEndY = this.drawTotalsCard(doc, invoice.currency, chargeTotal, finalY + 8);
    this.drawBankAccountsSection(doc, totalsEndY + 8);

    this.drawCompanyFooter(doc);

    const filename = `orden-servicio-${emittedInvoiceCode}.pdf`
      .replace(/\s+/g, '-')
      .replace(/[^a-zA-Z0-9\-_.]/g, '');

    doc.setProperties({
      title: filename,
    });

    const blobUrl = doc.output('bloburl');
    window.open(blobUrl, '_blank', 'noopener,noreferrer');
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

  lineCharge(line: { charge?: number; amount?: number }) {
    if (typeof line.charge === 'number') {
      return line.charge;
    }

    return typeof line.amount === 'number' ? line.amount : 0;
  }

  lineCost(line: { cost?: number }) {
    return typeof line.cost === 'number' ? line.cost : 0;
  }

  chargeTotal(record: { chargeTotal?: number; amount?: number }) {
    if (typeof record.chargeTotal === 'number') {
      return record.chargeTotal;
    }

    return typeof record.amount === 'number' ? record.amount : 0;
  }

  costTotal(record: { costTotal?: number }) {
    return typeof record.costTotal === 'number' ? record.costTotal : 0;
  }

  margin(record: { margin?: number; chargeTotal?: number; costTotal?: number; amount?: number }) {
    if (typeof record.margin === 'number') {
      return record.margin;
    }

    return this.chargeTotal(record) - this.costTotal(record);
  }

  manualChargeTotal() {
    return this.manualItems.getRawValue().reduce((sum, item) => sum + Number(item.charge || 0), 0);
  }

  manualCostTotal() {
    return this.manualItems.getRawValue().reduce((sum, item) => sum + Number(item.cost || 0), 0);
  }

  manualMarginTotal() {
    return this.manualChargeTotal() - this.manualCostTotal();
  }

  private currencyLabel(currency: CurrencyCode, value: number) {
    const symbol = this.currencySymbol(currency);
    const formatted = new Intl.NumberFormat('es-NI', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value);

    return `${symbol} ${formatted}`;
  }

  private drawDocumentHeader(
    doc: jsPDF,
    invoice: GeneratedInvoice,
    issuer: string,
    companyName: string,
    emittedInvoiceCode: string,
  ) {
    const client = this.clients().find((item) => item.id === invoice.clientId);
    const clientCode = client?.clientCode?.trim() || '-';
    const clientRuc = client?.ruc?.trim() || '';
    const clientPhone = client?.phone?.trim() || '-';
    const clientManager = client?.manager?.trim() || '-';

    const brand950: [number, number, number] = [49, 18, 94];
    const brand900: [number, number, number] = [76, 29, 149];
    const brand500: [number, number, number] = [124, 58, 237];
    const brand050: [number, number, number] = [247, 241, 255];
    const textStrong: [number, number, number] = [36, 21, 61];
    const textSoft: [number, number, number] = [91, 33, 182];

    doc.setFillColor(...brand050);
    doc.rect(0, 0, 210, 44, 'F');

    doc.setFillColor(...brand900);
    doc.rect(0, 0, 210, 10, 'F');

    doc.setFillColor(...brand500);
    doc.rect(0, 10, 210, 1.2, 'F');

    doc.setFontSize(11);
    doc.setTextColor(255, 255, 255);
    doc.text(companyName, 14, 6.8);

    doc.setFontSize(19);
    doc.setTextColor(...brand950);
    doc.text('ORDEN DE SERVICIO', 14, 24);

    doc.setFontSize(9.2);
    doc.setTextColor(...textSoft);
    doc.text('Documento formal de prestacion de servicios', 14, 30.5);

    doc.setFillColor(255, 255, 255);
    doc.setDrawColor(216, 180, 254);
    doc.roundedRect(122, 14, 74, 30, 2, 2, 'FD');
    doc.setFontSize(8.7);
    doc.setTextColor(...textSoft);
    doc.text('Numero', 126, 20);
    doc.text('Fecha de emision', 126, 26.5);
    doc.text('Fecha de vencimiento', 126, 33);
    doc.text('Estado', 126, 39.5);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(...textStrong);
    doc.text(emittedInvoiceCode, 194, 20, { align: 'right' });
    doc.setFontSize(9.5);
    doc.setFont('helvetica', 'normal');
    doc.text(this.formatDate(invoice.issueDate), 194, 26.5, { align: 'right' });
    doc.text(this.formatDate(invoice.dueDate || invoice.issueDate), 194, 33, { align: 'right' });
    doc.text(invoice.status, 194, 39.5, { align: 'right' });

    doc.setFillColor(255, 255, 255);
    doc.setDrawColor(221, 214, 254);
    doc.roundedRect(14, 47, 88, 30, 2, 2, 'FD');
    doc.roundedRect(108, 47, 88, 30, 2, 2, 'FD');

    doc.setFontSize(9);
    doc.setTextColor(...brand900);
    doc.text('EMISOR', 18, 53.5);
    doc.text('CLIENTE', 112, 53.5);

    doc.setFontSize(10);
    doc.setTextColor(...textStrong);
    doc.text(issuer, 18, 58.8, { maxWidth: 80 });
    doc.text(invoice.clientName, 112, 58.8, { maxWidth: 80 });

    doc.setFontSize(8.7);
    doc.setTextColor(...textSoft);
    doc.text(`Moneda: ${invoice.currency}`, 18, 64.8);
    doc.text(`Tel: ${this.companyProfile()?.phone?.trim() || '-'}`, 18, 70.2, { maxWidth: 80 });
    doc.text(`Codigo: ${clientCode}`, 112, 64.8, { maxWidth: 80 });
    doc.text(`Telefono: ${clientPhone}`, 112, 70.2, { maxWidth: 80 });

    doc.setFontSize(8.3);
    doc.text(`Contacto: ${clientManager}`, 112, 75, { maxWidth: 80 });
    if (clientRuc) {
      doc.text(`RUC: ${clientRuc}`, 18, 75, { maxWidth: 80 });
    }

    return 86;
  }

  private buildEmittedInvoiceCode(invoice: GeneratedInvoice) {
    const clientCode = this.getClientCode(invoice.clientId);
    const sequence = this.getClientSequence(invoice);
    return `${clientCode}${sequence}`;
  }

  private getClientCode(clientId: string) {
    const selectedClient = this.clients().find((client) => client.id === clientId);
    const normalized = (selectedClient?.clientCode?.trim() || '')
      .replace(/[^a-zA-Z0-9]/g, '')
      .toUpperCase();
    const shortCode = normalized.slice(0, 6);
    return shortCode || 'CLIENT';
  }

  private getClientSequence(invoice: GeneratedInvoice) {
    const matches = this.generatedInvoices()
      .filter((item) => item.clientId === invoice.clientId)
      .sort((left, right) => {
        const leftTime = left.createdAt ? Date.parse(left.createdAt) : 0;
        const rightTime = right.createdAt ? Date.parse(right.createdAt) : 0;
        if (leftTime !== rightTime) {
          return leftTime - rightTime;
        }
        return left.id.localeCompare(right.id);
      });

    const index = matches.findIndex((item) => item.id === invoice.id);
    const sequenceNumber = index >= 0 ? index + 1 : 1;
    return String(sequenceNumber).padStart(5, '0');
  }

  private drawTotalsCard(doc: jsPDF, currency: CurrencyCode, total: number, y: number) {
    const cardY = Math.max(y, 90);
    const cardX = 124;
    const cardW = 72;
    const amountInWords = this.amountToSpanishWords(total, currency);
    const amountLines = doc.splitTextToSize(amountInWords, cardW - 8);
    const cardH = Math.max(28, 18 + amountLines.length * 4.2);

    doc.setFillColor(247, 241, 255);
    doc.setDrawColor(124, 58, 237);
    doc.roundedRect(cardX, cardY, cardW, cardH, 2, 2, 'FD');

    doc.setFontSize(8.6);
    doc.setTextColor(91, 33, 182);
    doc.text('TOTAL A PAGAR', cardX + 4, cardY + 6.8);

    doc.setFontSize(14.2);
    doc.setTextColor(76, 29, 149);
    doc.text(this.currencyLabel(currency, total), cardX + cardW - 4, cardY + 13.6, { align: 'right' });

    doc.setFontSize(8.2);
    doc.setTextColor(59, 7, 100);
    doc.text(amountLines, cardX + 4, cardY + 19);

    return cardY + cardH;
  }

  private drawBankAccountsSection(doc: jsPDF, suggestedY: number) {
    const profile = this.companyProfile();
    const accounts = profile?.bankAccounts ?? [];

    if (!accounts.length) {
      return;
    }

    let y = Math.max(suggestedY, 118);
    const pageHeight = doc.internal.pageSize.getHeight();

    if (y > pageHeight - 56) {
      doc.addPage();
      y = 20;
    }

    doc.setFontSize(9.8);
    doc.setTextColor(76, 29, 149);
    doc.text('PAGAR A', 14, y);

    let lineY = y + 6;
    doc.setFontSize(8.6);
    doc.setTextColor(36, 21, 61);

    accounts.forEach((account) => {
      if (lineY > pageHeight - 30) {
        doc.addPage();
        lineY = 20;
      }

      const line = `- Banco: ${account.bank} | Cuenta: ${account.accountNumber || '-'} | Titular: ${account.holder} | Moneda: ${account.currency}`;
      const wrapped = doc.splitTextToSize(line, 182);
      doc.text(wrapped, 14, lineY);
      lineY += wrapped.length * 4.3;
    });
  }

  private createManualItemGroup(item?: { name?: string; charge?: number; cost?: number }) {
    return this.formBuilder.nonNullable.group({
      name: [item?.name ?? '', [Validators.required]],
      charge: [item?.charge ?? 0, [Validators.required, Validators.min(0.01)]],
      cost: [item?.cost ?? 0, [Validators.required, Validators.min(0)]],
    });
  }

  private resetManualForm() {
    this.editingManualInvoiceId.set(null);
    this.manualForm.reset({
      clientId: '',
      issueDate: new Date(),
      currency: 'NIO',
      notes: '',
    });

    while (this.manualItems.length > 1) {
      this.manualItems.removeAt(this.manualItems.length - 1);
    }

    this.manualItems.at(0).reset({
      name: '',
      charge: 0,
      cost: 0,
    });
  }

  private dateToIso(value: Date) {
    const year = value.getFullYear();
    const month = String(value.getMonth() + 1).padStart(2, '0');
    const day = String(value.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  private calculateDueDate(issueDate: string) {
    return this.addDaysToIso(issueDate, this.getPaymentTermDays());
  }

  private getPaymentTermDays() {
    const configuredDays = Number(this.companyProfile()?.paymentTermDays ?? 0);
    if (!Number.isFinite(configuredDays)) {
      return 0;
    }

    return Math.max(0, Math.floor(configuredDays));
  }

  private addDaysToIso(issueDate: string, days: number) {
    const parsed = this.isoToDate(issueDate);
    if (Number.isNaN(parsed.getTime())) {
      return issueDate;
    }

    const safeDays = Math.max(0, Math.floor(days));
    parsed.setDate(parsed.getDate() + safeDays);
    return this.dateToIso(parsed);
  }

  private drawCompanyFooter(doc: jsPDF) {
    const profile = this.companyProfile();
    const pageCount = doc.getNumberOfPages();

    for (let page = 1; page <= pageCount; page += 1) {
      doc.setPage(page);
      const pageHeight = doc.internal.pageSize.getHeight();
      const footerTop = pageHeight - 24;

      doc.setDrawColor(216, 180, 254);
      doc.line(14, footerTop, 196, footerTop);

      doc.setFontSize(8.6);
      doc.setTextColor(91, 33, 182);

      const leftText = [
        profile?.name || 'Facturacion DD',
        profile?.manager ? `Responsable: ${profile.manager}` : '',
        profile?.phone ? `Tel: ${profile.phone}` : '',
      ]
        .filter(Boolean)
        .join(' | ');
      const rightText = `Pagina ${page} de ${pageCount}`;

      doc.text(leftText, 14, footerTop + 6, { maxWidth: 130 });
      doc.text(rightText, 196, footerTop + 6, { align: 'right' });
    }
  }

  private formatDate(value: string) {
    const parsed = this.isoToDate(value);
    if (Number.isNaN(parsed.getTime())) {
      return value;
    }

    return new Intl.DateTimeFormat('es-NI', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    }).format(parsed);
  }

  private amountToSpanishWords(amount: number, currency: CurrencyCode) {
    const safeAmount = Number.isFinite(amount) ? Math.max(0, amount) : 0;
    const integerPart = Math.floor(safeAmount);
    const decimalPart = Math.round((safeAmount - integerPart) * 100);
    const integerWords = this.integerToSpanishWords(integerPart);
    const currencyWord = currency === 'USD' ? 'dolares' : 'cordobas';

    return `${integerWords} ${currencyWord} con ${String(decimalPart).padStart(2, '0')}/100`.toUpperCase();
  }

  private integerToSpanishWords(value: number): string {
    if (value === 0) {
      return 'cero';
    }

    const units = [
      '',
      'uno',
      'dos',
      'tres',
      'cuatro',
      'cinco',
      'seis',
      'siete',
      'ocho',
      'nueve',
    ];
    const teens = [
      'diez',
      'once',
      'doce',
      'trece',
      'catorce',
      'quince',
      'dieciseis',
      'diecisiete',
      'dieciocho',
      'diecinueve',
    ];
    const tens = [
      '',
      '',
      'veinte',
      'treinta',
      'cuarenta',
      'cincuenta',
      'sesenta',
      'setenta',
      'ochenta',
      'noventa',
    ];
    const hundreds = [
      '',
      'ciento',
      'doscientos',
      'trescientos',
      'cuatrocientos',
      'quinientos',
      'seiscientos',
      'setecientos',
      'ochocientos',
      'novecientos',
    ];

    const underOneThousand = (num: number): string => {
      if (num === 0) {
        return '';
      }

      if (num === 100) {
        return 'cien';
      }

      const hundred = Math.floor(num / 100);
      const tenUnit = num % 100;

      if (tenUnit < 10) {
        return `${hundreds[hundred]} ${units[tenUnit]}`.trim();
      }

      if (tenUnit < 20) {
        return `${hundreds[hundred]} ${teens[tenUnit - 10]}`.trim();
      }

      if (tenUnit < 30) {
        if (tenUnit === 20) {
          return `${hundreds[hundred]} veinte`.trim();
        }
        return `${hundreds[hundred]} veinti${units[tenUnit - 20]}`.trim();
      }

      const ten = Math.floor(tenUnit / 10);
      const unit = tenUnit % 10;
      const separator = unit ? ' y ' : '';
      return `${hundreds[hundred]} ${tens[ten]}${separator}${units[unit]}`.trim();
    };

    const millions = Math.floor(value / 1000000);
    const thousands = Math.floor((value % 1000000) / 1000);
    const remainder = value % 1000;

    const parts: string[] = [];

    if (millions) {
      if (millions === 1) {
        parts.push('un millon');
      } else {
        parts.push(`${underOneThousand(millions)} millones`.trim());
      }
    }

    if (thousands) {
      if (thousands === 1) {
        parts.push('mil');
      } else {
        parts.push(`${underOneThousand(thousands)} mil`.trim());
      }
    }

    if (remainder) {
      parts.push(underOneThousand(remainder));
    }

    return parts.join(' ').replace(/\s+/g, ' ').trim();
  }

  private matchesRange(date: Date) {
    const from = this.startOfDay(this.filters().from);
    const to = this.startOfDay(this.filters().to);
    const value = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();

    if (from && value < from.getTime()) {
      return false;
    }

    if (to && value > to.getTime()) {
      return false;
    }

    return true;
  }

  private startOfDay(value: Date | null) {
    if (!value) {
      return null;
    }

    return new Date(value.getFullYear(), value.getMonth(), value.getDate());
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
