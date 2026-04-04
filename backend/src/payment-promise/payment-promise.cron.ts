import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Company } from '../companies/entities/companies';
import { Invoice } from '../invoices/entities/invoices';
import { PaymentPromise } from './entities/payment-promise.entity';
import { Templates } from '../templates/entities/templatesMeta';
import { MessageQueuePayload } from '../message-queue/entities/message-queue.entity';
import { MessageQueueService } from '../message-queue/message-queue.service';

type PromiseReminderTiming = 'day_before' | 'same_day' | 'both';

type PromiseAutomationSettings = {
  reminderEnabled: boolean;
  reminderTiming: PromiseReminderTiming;
  autoBreakEnabled: boolean;
  checkPaymentBeforeBreak: boolean;
  reminderTemplateId: string | null;
  reminderTemplateName: string | null;
};

@Injectable()
export class PaymentPromiseCron {
  private readonly logger = new Logger(PaymentPromiseCron.name);

  constructor(
    @InjectRepository(Company)
    private readonly companyRepository: Repository<Company>,
    @InjectRepository(PaymentPromise)
    private readonly paymentPromiseRepository: Repository<PaymentPromise>,
    @InjectRepository(Invoice)
    private readonly invoiceRepository: Repository<Invoice>,
    @InjectRepository(Templates)
    private readonly templateRepository: Repository<Templates>,
    private readonly messageQueueService: MessageQueueService,
  ) {}

  @Cron('0 0 * * * *', { timeZone: 'America/Sao_Paulo' })
  async processPromiseAutomation() {
    const companies = await this.companyRepository.find({
      where: { active: true },
      select: { id: true, name: true, config: true },
    });

    for (const company of companies) {
      const settings = this.normalizePromiseAutomationSettings(company.config);
      const shouldProcess = settings.reminderEnabled || settings.autoBreakEnabled;

      if (!shouldProcess) {
        continue;
      }

      try {
        await this.processCompany(company.id, company.name, settings);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        this.logger.error(
          `[PromiseAutomation] Falha ao processar empresa ${company.id}: ${message}`,
        );
      }
    }
  }

  private async processCompany(
    companyId: string,
    companyName: string,
    settings: PromiseAutomationSettings,
  ) {
    const pendingPromises = await this.paymentPromiseRepository.find({
      where: { company_id: companyId, status: 'pending' },
      order: { promised_payment_date: 'ASC', created_at: 'ASC' },
    });

    if (!pendingPromises.length) {
      return;
    }

    const today = this.startOfDay(new Date());
    const tomorrow = this.addDays(today, 1);

    // Load template once for the whole batch (avoids N+1 template queries)
    let template: (Templates & { company?: { name?: string | null; cnpj?: string | null } }) | null = null;
    if (settings.reminderEnabled && settings.reminderTemplateId) {
      template = await this.templateRepository.findOne({
        where: { id: settings.reminderTemplateId, company: { id: companyId } },
        relations: ['company'],
        select: {
          id: true,
          name: true,
          meta_status: true,
          variables: true,
          components: true,
          active: true,
          isEnabled: true,
          company: { id: true, name: true, cnpj: true },
        },
      });

      if (!template) {
        this.logger.warn(
          `[PromiseAutomation] Template ${settings.reminderTemplateId} nao encontrado para empresa ${companyId}.`,
        );
      } else if (!template.active || !template.isEnabled) {
        this.logger.warn(
          `[PromiseAutomation] Template ${template.name} esta desativado para lembrete automatico.`,
        );
        template = null;
      } else if (String(template.meta_status).toUpperCase() !== 'APPROVED') {
        this.logger.warn(
          `[PromiseAutomation] Template ${template.name} nao esta aprovado para lembrete automatico.`,
        );
        template = null;
      }
    }

    const clientIds = [...new Set(pendingPromises.map((p) => p.client_id))];

    // Batch load primary invoices for all clients (avoids N+1 invoice queries)
    const primaryInvoiceByClient = await this.findPrimaryInvoicesBatch(clientIds, companyId);

    // Batch check which clients still have overdue invoices (avoids N+1 overdue queries)
    const clientsNeedingBreakCheck = settings.autoBreakEnabled && settings.checkPaymentBeforeBreak
      ? pendingPromises
          .filter((p) => this.parseDateOnly(p.promised_payment_date) < today)
          .map((p) => p.client_id)
      : [];

    const overdueClientIds = clientsNeedingBreakCheck.length
      ? await this.getClientsWithOverdueInvoicesBatch(clientsNeedingBreakCheck, companyId, today)
      : new Set<string>();

    let reminderCount = 0;
    let brokenCount = 0;
    let keptCount = 0;
    const toSave: PaymentPromise[] = [];

    for (const promise of pendingPromises) {
      const promiseDate = this.parseDateOnly(promise.promised_payment_date);
      let modified = false;

      // Reminder
      if (settings.reminderEnabled && template && settings.reminderTemplateId) {
        const reminderMoment = this.resolveReminderMoment(
          settings.reminderTiming,
          promiseDate,
          today,
          tomorrow,
          promise.reminder_sent_at ?? null,
        );

        if (reminderMoment) {
          const phone = String(promise.phone ?? '').replace(/\D/g, '').trim();
          if (!phone) {
            this.logger.warn(
              `[PromiseAutomation] Promessa ${promise.id} sem telefone valido para envio de lembrete.`,
            );
          } else {
            const invoice = primaryInvoiceByClient.get(promise.client_id) ?? null;
            const queued = await this.enqueueReminderWithTemplate(promise, companyId, template, invoice);
            if (queued) {
              promise.reminder_sent = true;
              promise.reminder_sent_at = new Date();
              modified = true;
              reminderCount += 1;
            }
          }
        }
      }

      // Auto-break
      if (settings.autoBreakEnabled && promiseDate < today) {
        const hasOverdueInvoices = settings.checkPaymentBeforeBreak
          ? overdueClientIds.has(promise.client_id)
          : true;

        promise.status = hasOverdueInvoices ? 'broken' : 'kept';
        modified = true;

        if (hasOverdueInvoices) {
          brokenCount += 1;
        } else {
          keptCount += 1;
        }
      }

      if (modified) toSave.push(promise);
    }

    // Batch save all modified promises (avoids N individual UPDATEs)
    if (toSave.length) {
      await this.paymentPromiseRepository.save(toSave);
    }

    if (reminderCount || brokenCount || keptCount) {
      this.logger.log(
        `[PromiseAutomation] ${companyName}: ${reminderCount} lembrete(s), ${brokenCount} quebrada(s), ${keptCount} cumprida(s) automaticamente.`,
      );
    }
  }

  private async findPrimaryInvoicesBatch(
    clientIds: string[],
    companyId: string,
  ): Promise<Map<string, Invoice>> {
    if (!clientIds.length) return new Map();

    const invoices = await this.invoiceRepository
      .createQueryBuilder('invoice')
      .innerJoinAndSelect('invoice.client', 'client')
      .innerJoin('invoice.company', 'company')
      .where('client.id IN (:...clientIds)', { clientIds })
      .andWhere('company.id = :companyId', { companyId })
      .andWhere("LOWER(TRIM(invoice.status)) = 'a receber'")
      .orderBy("TO_DATE(invoice.expiration, 'YYYY-MM-DD')", 'ASC')
      .getMany();

    const primaryByClient = new Map<string, Invoice>();
    for (const invoice of invoices) {
      if (!primaryByClient.has(invoice.client.id)) {
        primaryByClient.set(invoice.client.id, invoice);
      }
    }
    return primaryByClient;
  }

  private async getClientsWithOverdueInvoicesBatch(
    clientIds: string[],
    companyId: string,
    today: Date,
  ): Promise<Set<string>> {
    if (!clientIds.length) return new Set();

    const rows = await this.invoiceRepository
      .createQueryBuilder('invoice')
      .innerJoin('invoice.client', 'client')
      .innerJoin('invoice.company', 'company')
      .where('client.id IN (:...clientIds)', { clientIds })
      .andWhere('company.id = :companyId', { companyId })
      .andWhere("LOWER(TRIM(invoice.status)) = 'a receber'")
      .andWhere("TO_DATE(invoice.expiration, 'YYYY-MM-DD') < :today", {
        today: this.toDateOnly(today),
      })
      .select('client.id', 'clientId')
      .distinct(true)
      .getRawMany<{ clientId: string }>();

    return new Set(rows.map((r) => r.clientId));
  }

  private async enqueueReminderWithTemplate(
    promise: PaymentPromise,
    companyId: string,
    template: Templates & { company?: { name?: string | null; cnpj?: string | null } },
    invoice: Invoice | null,
  ): Promise<boolean> {
    const phone = String(promise.phone ?? '').replace(/\D/g, '').trim();
    if (!phone) return false;

    const payload = this.buildReminderPayload(promise, template, invoice);
    if (!payload) {
      this.logger.warn(
        `[PromiseAutomation] Nao foi possivel montar payload de lembrete para promessa ${promise.id}.`,
      );
      return false;
    }

    await this.messageQueueService.enqueueBatch({
      companyId,
      templateId: template.id,
      recipients: [payload],
      scope: 'manual',
      disableDailyDedup: true,
    });

    return true;
  }

  private resolveReminderMoment(
    reminderTiming: PromiseReminderTiming,
    promiseDate: Date,
    today: Date,
    tomorrow: Date,
    reminderSentAt: Date | null,
  ) {
    const lastReminderDate = reminderSentAt
      ? this.startOfDay(new Date(reminderSentAt))
      : null;
    const alreadySentToday =
      !!lastReminderDate && lastReminderDate.getTime() === today.getTime();

    if (reminderTiming === 'same_day') {
      return promiseDate.getTime() === today.getTime() && !alreadySentToday
        ? 'same_day'
        : null;
    }

    if (reminderTiming === 'both') {
      if (promiseDate.getTime() === tomorrow.getTime() && !alreadySentToday) {
        return 'day_before';
      }

      if (promiseDate.getTime() === today.getTime() && !alreadySentToday) {
        return 'same_day';
      }

      return null;
    }

    return promiseDate.getTime() === tomorrow.getTime() && !alreadySentToday
      ? 'day_before'
      : null;
  }

  private buildReminderPayload(
    promise: PaymentPromise,
    template: Templates & { company?: { name?: string | null; cnpj?: string | null } },
    invoice: Invoice | null,
  ): MessageQueuePayload | null {
    const templateVariables = this.normalizeTemplateVariables(template.variables);
    const orderedVariableKeys = Object.keys(templateVariables)
      .sort((a, b) => Number(a) - Number(b))
      .map((key) => String(templateVariables[key] ?? '').trim())
      .filter(Boolean);

    const values = this.buildReminderVariableValues(promise, template, invoice);
    const components = this.normalizeTemplateComponents(template.components);

    const bodyParameters = orderedVariableKeys.map((key) => ({
      type: 'text',
      text: String(values[key] ?? '').trim(),
    }));

    const builtComponents: MessageQueuePayload['components'] = [];

    if (bodyParameters.length) {
      builtComponents.push({
        type: 'BODY',
        parameters: bodyParameters,
      });
    }

    for (const component of components) {
      const type = String(component?.type ?? '').toUpperCase();
      if (type !== 'BUTTON' && type !== 'BUTTONS') {
        continue;
      }

      const buttons = Array.isArray(component?.buttons)
        ? component.buttons
        : component?.sub_type
          ? [{ type: component.sub_type, index: component.index }]
          : [];

      for (const [index, button] of buttons.entries()) {
        const builtButton = this.buildReminderButton(button, index, values);
        if (builtButton) {
          builtComponents.push(builtButton);
        }
      }
    }

    return {
      number: String(promise.phone ?? '').trim(),
      name: String(promise.client_name ?? '').trim() || 'Cliente',
      components: builtComponents,
    };
  }

  private buildReminderVariableValues(
    promise: PaymentPromise,
    template: Templates & { company?: { name?: string | null; cnpj?: string | null } },
    invoice: Invoice | null,
  ) {
    const companyName = String(template.company?.name ?? '').trim();
    const promiseDate = this.formatDateBr(promise.promised_payment_date);
    const invoiceDate = invoice?.expiration
      ? this.formatDateBr(invoice.expiration)
      : '';
    const invoiceAmount = invoice?.value ? this.normalizeCurrency(invoice.value) : '';
    const promisedAmount = promise.promised_amount != null
      ? this.normalizeCurrency(String(promise.promised_amount))
      : '';
    const totalDebt = promise.total_debt != null
      ? this.normalizeCurrency(String(promise.total_debt))
      : '';
    const pixCode = String(invoice?.pixCode ?? '').trim();
    const ticketPdfLink = String(invoice?.ticketPdfLink ?? '').trim();
    const ticketDigitableLine = String(invoice?.ticketDigitableLine ?? '').trim();
    const contractNumber = String(invoice?.contractId ?? '').trim();
    const orderReferenceId = contractNumber || promise.client_id;

    return {
      nome_cliente: String(promise.client_name ?? '').trim().toLowerCase(),
      whatsapp: String(promise.phone ?? '').trim(),
      nome_empresa: companyName.toLowerCase(),
      data_promessa_pagamento: promiseDate,
      promised_payment_date: promiseDate,
      valor_promessa: promisedAmount,
      valor_total_divida: totalDebt,
      quantidade_faturas_abertas: String(promise.open_invoices_count ?? 0),
      numero_contrato: contractNumber,
      data_vencimento_fatura: invoiceDate,
      valor_fatura: invoiceAmount,
      linha_digitavel_boleto: ticketDigitableLine,
      link_boleto_pdf: ticketPdfLink,
      code_pix: pixCode,
      codigo_qr: pixCode,
      codigo_qr_code: pixCode,
      codigo_pix: pixCode,
      order_reference_id: orderReferenceId,
      order_item_name: 'Fatura',
      order_item_description: 'Lembrete de promessa de pagamento',
      order_pix_merchant_name: companyName,
      order_pix_key: String(template.company?.cnpj ?? '').trim(),
      order_pix_key_type: template.company?.cnpj ? 'CNPJ' : '',
    } as Record<string, string>;
  }

  private buildReminderButton(
    button: Record<string, unknown>,
    index: number,
    values: Record<string, string>,
  ) {
    const buttonType = String(button?.type ?? '').toUpperCase();
    const buttonIndex = Number(button?.index ?? index);

    if (buttonType === 'URL') {
      const link = String(values.link_boleto_pdf ?? '').trim();
      if (!link) return null;
      return {
        type: 'button',
        sub_type: 'url',
        index: buttonIndex,
        parameters: [{ type: 'text', text: link }],
      };
    }

    if (buttonType === 'COPY_CODE') {
      const code = String(
        values.code_pix ||
        values.codigo_qr_code ||
        values.codigo_qr ||
        values.codigo_pix ||
        values.linha_digitavel_boleto ||
        '',
      ).trim();
      if (!code) return null;
      return {
        type: 'button',
        sub_type: 'copy_code',
        index: buttonIndex,
        parameters: [{ type: 'text', text: code }],
      };
    }

    if (buttonType === 'ORDER_DETAILS') {
      const code = String(values.code_pix ?? '').trim();
      const referenceId = String(values.order_reference_id ?? '').trim();
      const merchantName = String(values.order_pix_merchant_name ?? '').trim();
      const amount = this.parseAmountToCents(values.valor_fatura);

      if (!code || !referenceId || !merchantName || amount <= 0) {
        return null;
      }

      return {
        type: 'button',
        sub_type: 'order_details',
        index: buttonIndex,
        parameters: [
          {
            type: 'action',
            action: {
              order_details: {
                reference_id: referenceId,
                type: 'digital-goods',
                payment_type: 'br',
                payment_settings: [
                  {
                    type: 'pix_dynamic_code',
                    pix_dynamic_code: {
                      code,
                      merchant_name: merchantName,
                      ...(values.order_pix_key
                        ? {
                            key: values.order_pix_key,
                            key_type: values.order_pix_key_type || 'CNPJ',
                          }
                        : {}),
                    },
                  },
                ],
                currency: 'BRL',
                total_amount: { value: amount, offset: 100 },
                order: {
                  status: 'pending',
                  items: [
                    {
                      retailer_id: referenceId,
                      name: values.order_item_name || 'Fatura',
                      description: values.order_item_description || '',
                      quantity: 1,
                      amount: { value: amount, offset: 100 },
                    },
                  ],
                  subtotal: { value: amount, offset: 100 },
                },
              },
            },
          },
        ],
      };
    }

    return null;
  }

  private normalizeTemplateVariables(variables: Templates['variables']) {
    if (typeof variables === 'string') {
      try {
        return JSON.parse(variables) as Record<string, string>;
      } catch {
        return {};
      }
    }

    return (variables ?? {}) as Record<string, string>;
  }

  private normalizeTemplateComponents(components: Templates['components']): Record<string, unknown>[] {
    if (Array.isArray(components)) {
      return components as Record<string, unknown>[];
    }

    if (typeof components === 'string') {
      try {
        return this.normalizeTemplateComponents(
          JSON.parse(components) as Templates['components'],
        );
      } catch {
        return [];
      }
    }

    if (
      components &&
      typeof components === 'object' &&
      Array.isArray((components as { components?: Record<string, unknown>[] }).components)
    ) {
      return (components as { components?: Record<string, unknown>[] }).components ?? [];
    }

    return [];
  }

  private formatDateBr(value?: string | null) {
    const safe = String(value ?? '').trim();
    if (!safe) return '';
    const [year, month, day] = safe.split('-');
    if (!year || !month || !day) return safe;
    return `${day}/${month}/${year}`;
  }

  private normalizeCurrency(value?: string | null) {
    const safe = String(value ?? '').trim();
    if (!safe) return '';
    const numeric = Number(safe.replace(/\./g, '').replace(',', '.'));
    if (Number.isNaN(numeric)) return safe;
    return numeric.toFixed(2).replace('.', ',');
  }

  private parseAmountToCents(value?: string | null) {
    const safe = String(value ?? '').trim();
    if (!safe) return 0;
    const normalized = safe.includes(',')
      ? safe.replace(/\./g, '').replace(',', '.')
      : safe;
    const parsed = Number(normalized);
    return Number.isNaN(parsed) ? 0 : Math.round(parsed * 100);
  }

  private normalizePromiseAutomationSettings(
    config: Company['config'] | string | null | undefined,
  ): PromiseAutomationSettings {
    const parsedConfig = this.parseCompanyConfig(config);
    const rawSettings = parsedConfig.promiseAutomation as
      | Partial<PromiseAutomationSettings>
      | undefined;

    const reminderTiming =
      rawSettings?.reminderTiming === 'same_day' ||
      rawSettings?.reminderTiming === 'both'
        ? rawSettings.reminderTiming
        : 'day_before';

    return {
      reminderEnabled: Boolean(rawSettings?.reminderEnabled ?? false),
      reminderTiming,
      autoBreakEnabled: Boolean(rawSettings?.autoBreakEnabled ?? false),
      checkPaymentBeforeBreak: Boolean(
        rawSettings?.checkPaymentBeforeBreak ?? true,
      ),
      reminderTemplateId:
        typeof rawSettings?.reminderTemplateId === 'string' &&
        rawSettings.reminderTemplateId.trim()
          ? rawSettings.reminderTemplateId.trim()
          : null,
      reminderTemplateName:
        typeof rawSettings?.reminderTemplateName === 'string' &&
        rawSettings.reminderTemplateName.trim()
          ? rawSettings.reminderTemplateName.trim()
          : null,
    };
  }

  private parseCompanyConfig(config: Company['config'] | string | null | undefined) {
    if (!config) return {};
    if (typeof config === 'string') {
      try {
        return JSON.parse(config) as Record<string, unknown>;
      } catch {
        return {};
      }
    }

    return config;
  }

  private parseDateOnly(value: string) {
    const [year, month, day] = String(value).split('-').map(Number);
    return new Date(year, (month ?? 1) - 1, day ?? 1);
  }

  private startOfDay(value: Date) {
    return new Date(value.getFullYear(), value.getMonth(), value.getDate());
  }

  private addDays(value: Date, days: number) {
    const next = new Date(value);
    next.setDate(next.getDate() + days);
    return this.startOfDay(next);
  }

  private toDateOnly(value: Date) {
    const year = value.getFullYear();
    const month = String(value.getMonth() + 1).padStart(2, '0');
    const day = String(value.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
}
