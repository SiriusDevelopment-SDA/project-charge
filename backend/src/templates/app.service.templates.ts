import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { FindOptionsWhere, ILike, Repository } from 'typeorm';

import { Templates } from './entities/templatesMeta';
import {
  SearchRequestDtoRelatories,
  SearchRequestDtoTemplates,
  SendTemplateDto,
} from './dto/search.request.dto.templates';
import { RelatoryDispatchTemplate } from './entities/relatory.entity';
import { DeleteTemplateDto } from './dto/delete.request.dto.templates';
import { CreateTemplateDTO } from './dto/create.request.dto.template';
import { Company } from '../companies/entities/companies';
import { CampaignMetricsGateway } from '../realtime/campaigns-metrics.gateway';

type ProviderDispatchEntry = {
  id?: string;
  status?: string;
  message?: string;
  error?: string;
};

type DispatchTemplateResult = {
  number: string;
  ok: boolean;
  status: RelatoryDispatchTemplate['status_sent'];
  relatoryId?: string;
  externalMessageId?: string | null;
  error?: string | null;
};

@Injectable()
export class AppServiceTemplate {
  private readonly baseUrl = 'https://api.notificame.com.br/v2';

  constructor(
    @InjectRepository(Templates)
    private templateRepository: Repository<Templates>,

    @InjectRepository(RelatoryDispatchTemplate)
    private readonly relatoryDispatchRepository: Repository<RelatoryDispatchTemplate>,

    @InjectRepository(Company)
    private readonly companyRepository: Repository<Company>,

    private readonly campaignMetricsGateway: CampaignMetricsGateway,
  ) {}

  async getTemplates(dto: SearchRequestDtoTemplates) {
    const { account, page, limit, sortorder, query } = dto;
    const safeLimit = limit > 0 ? limit : 10;
    const safePage = page > 0 ? page : 1;
    const skip = (safePage - 1) * safeLimit;

    const order = sortorder?.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';
    const where: FindOptionsWhere<Templates> = {
      company: {
        account_chatwoot: String(account),
      },
    };

    if (query) where.name = ILike(`%${query}%`);

    const [data, total] = await this.templateRepository.findAndCount({
      where,
      relations: {
        company: true,
      },
      select: {
        company: {
          id: true,
          account_chatwoot: true,
          name: true,
        },
      },
      skip,
      take: safeLimit,
      order: {
        createdAt: order,
      },
    });

    return {
      page: safePage,
      total,
      data,
    };
  }

  async sendTemplate(data: SendTemplateDto) {
    const { templateId, account, to, campaignId } = data;
    const results: DispatchTemplateResult[] = [];

    const template = await this.templateRepository.findOne({
      where: {
        id: templateId,
        company: {
          account_chatwoot: String(account),
        },
      },
      relations: {
        company: true,
      },
      select: {
        id: true,
        name: true,
        language: true,
        variables: true,
        components: true,
        company: {
          id: true,
          canalId_notificameHub: true,
          token_notificameHub: true,
        },
      },
    });

    if (!template) {
      throw new NotFoundException('Template nao encontrado');
    }

    if (
      !template.company?.canalId_notificameHub ||
      !template.company?.token_notificameHub
    ) {
      throw new BadRequestException(
        'Empresa nao possui integracao ativa com a NotificaMe.',
      );
    }

    for (const recipient of to) {
      const expected = Object.keys(template.variables || {}).length;
      const safeComponents = Array.isArray(recipient.components)
        ? recipient.components
        : [];
      const bodyComponent = safeComponents.find((component) => component.type === 'BODY');
      const parametersLength = bodyComponent?.parameters?.length ?? 0;

      if (expected !== parametersLength) {
        throw new NotFoundException(
          `Template exige ${expected} variaveis, recebido ${parametersLength}`,
        );
      }

      const templatePayload = {
        name: template.name,
        language: { code: template.language },
        components:
          expected > 0 && parametersLength > 0
            ? safeComponents
            : [{ type: 'BODY', parameters: [] }],
      };

      const content = {
        from: template.company.canalId_notificameHub,
        to: recipient.number,
        contents: [
          {
            type: 'template',
            template: templatePayload,
          },
        ],
        message_activity_sharing: true,
        message_send_ttl_seconds: 3600,
      };

      try {
        const providerResponse = await fetch(
          `${this.baseUrl}/channels/whatsapp/messages`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-Api-Token': template.company.token_notificameHub,
            },
            body: JSON.stringify(content),
          },
        );

        const responseData = await this.readJsonResponse(providerResponse);
        const providerEntry = this.extractProviderEntry(responseData);
        const externalMessageId = this.getProviderExternalMessageId(
          providerEntry,
          responseData,
        );
        const status = this.normalizeDispatchStatus(
          providerEntry.status,
          providerResponse.ok,
        );
        const message = this.getProviderMessage(
          providerEntry,
          responseData,
          providerResponse,
        );

        const relatory = await this.relatoryDispatchRepository.save({
          date_dispatch: new Date(),
          external_message_id: externalMessageId ?? undefined,
          status_sent: status,
          template: { id: template.id },
          name: recipient.name ?? recipient.number,
          number: recipient.number,
          components_maped: {
            components: safeComponents,
            providerResponse: providerEntry,
          },
          company: { id: template.company.id },
          campaign: campaignId ? { id: campaignId } : null,
          message,
        });

        results.push({
          number: recipient.number,
          ok: status !== 'failed',
          status,
          relatoryId: relatory.id,
          externalMessageId,
        });
      } catch (error: any) {
        const errorMessage = `Dispatch error: ${error?.message ?? 'unknown error'}`;

        const relatory = await this.relatoryDispatchRepository.save({
          date_dispatch: new Date(),
          status_sent: 'failed',
          template: { id: template.id },
          name: recipient.name ?? recipient.number,
          number: recipient.number,
          components_maped: { components: safeComponents },
          company: { id: template.company.id },
          campaign: campaignId ? { id: campaignId } : null,
          message: errorMessage,
        });

        results.push({
          number: recipient.number,
          ok: false,
          status: 'failed',
          relatoryId: relatory.id,
          error: errorMessage,
        });
      }
    }

    const successCount = results.filter((result) => result.ok).length;
    const failedCount = results.length - successCount;

    this.campaignMetricsGateway.emitCampaignsSync(String(account));

    return {
      success: failedCount === 0,
      total: results.length,
      successCount,
      failedCount,
      status: failedCount === 0 ? 'sent' : 'partial',
      messages: results,
    };
  }

  async getRelatoriesDispatchTemplate(dto: SearchRequestDtoRelatories) {
    const { account, page, limit, sortorder, query } = dto;
    const safeLimit = limit > 0 ? limit : 10;
    const safePage = page > 0 ? page : 1;
    const skip = (safePage - 1) * safeLimit;

    const order = sortorder?.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';
    const where: FindOptionsWhere<RelatoryDispatchTemplate>[] = [
      {
        company: {
          account_chatwoot: String(account),
        },
        name: ILike(`%${query}%`),
      },
      {
        company: {
          account_chatwoot: String(account),
        },
        number: ILike(`%${query}%`),
      },
    ];

    const [data, total] = await this.relatoryDispatchRepository.findAndCount({
      where,
      relations: {
        template: true,
      },
      select: {
        template: {
          id: true,
          category: true,
          variables: true,
        },
      },
      skip,
      take: safeLimit,
      order: {
        createdAt: order,
      },
    });

    return {
      page: safePage,
      total,
      data,
    };
  }

  async disableTemplate(templateId: string) {
    const template = await this.templateRepository.findOne({
      where: {
        id: templateId,
        isEnabled: true,
      },
    });

    if (!template) {
      throw new HttpException(
        'Template nao encontrado ou ja desativado',
        HttpStatus.NOT_FOUND,
      );
    }

    template.isEnabled = false;
    await this.templateRepository.save(template);

    return {
      statusCode: 204,
      message: 'Template desativado!',
    };
  }

  async createTemplate(companyId: string, dto: CreateTemplateDTO) {
    const company = await this.companyRepository.findOne({
      where: { id: companyId },
      select: {
        id: true,
        canalId_notificameHub: true,
        token_notificameHub: true,
      },
    });

    if (!company) {
      throw new NotFoundException('Empresa nao encontrada!');
    }

    if (!company.canalId_notificameHub || !company.token_notificameHub) {
      throw new BadRequestException(
        'Empresa nao possui integracao ativa com a NotificaMe.',
      );
    }

    const payload = {
      from: company.canalId_notificameHub,
      contents: [
        {
          template: {
            name: dto.name,
            language: dto.language,
            category: dto.category,
            components: dto.components,
          },
        },
      ],
    };

    const response = await fetch(`${this.baseUrl}/templates`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Api-Token': company.token_notificameHub,
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new BadRequestException(`Erro ao criar template no meta: ${error}`);
    }

    const responseData = await response.json();

    await this.templateRepository.save([
      {
        active: true,
        isEnabled: true,
        language: dto.language,
        message:
          dto.components
            .filter((component) => component.type.toUpperCase() === 'BODY')
            .map((component) => component.text)[0] ?? '',
        meta_id: responseData.id,
        meta_status: responseData.status,
        variables: dto.variables,
        components: dto.components,
        company: { id: dto.companyId },
        name: dto.name,
      },
    ]);

    return responseData;
  }

  async getTemplateOrFail(templateId: string) {
    const template = await this.templateRepository.findOne({
      where: {
        id: templateId,
        isEnabled: true,
      },
    });

    if (!template) {
      throw new NotFoundException({
        code: 'TEMPLATE_NOT_FOUND',
        message: 'Template nao encontrado',
        field: 'templateId',
      });
    }

    return template;
  }

  extractRequiredTemplateVars(template: Templates): string[] {
    try {
      const vars =
        typeof template.variables === 'string'
          ? JSON.parse(template.variables)
          : template.variables || {};

      return Object.values(vars) as string[];
    } catch {
      throw new UnprocessableEntityException({
        code: 'TEMPLATE_VARIABLES_INVALID',
        message: 'Variaveis do template estao invalidas',
      });
    }
  }

  private async readJsonResponse(response: Response): Promise<unknown> {
    try {
      return await response.json();
    } catch {
      return null;
    }
  }

  private extractProviderEntry(responseData: unknown): ProviderDispatchEntry {
    if (Array.isArray(responseData)) {
      return (responseData[0] as ProviderDispatchEntry | undefined) ?? {};
    }

    if (responseData && typeof responseData === 'object') {
      return responseData as ProviderDispatchEntry;
    }

    return {};
  }

  private getProviderExternalMessageId(
    providerEntry: ProviderDispatchEntry,
    responseData: unknown,
  ) {
    const rawId =
      providerEntry.id ??
      (responseData &&
      typeof responseData === 'object' &&
      !Array.isArray(responseData)
        ? (responseData as ProviderDispatchEntry).id
        : undefined);

    return String(rawId ?? '').trim() || null;
  }

  private getProviderMessage(
    providerEntry: ProviderDispatchEntry,
    responseData: unknown,
    response: Response,
  ) {
    const responseObject =
      responseData && typeof responseData === 'object' && !Array.isArray(responseData)
        ? (responseData as ProviderDispatchEntry)
        : undefined;

    const rawMessage =
      providerEntry.message ??
      providerEntry.error ??
      responseObject?.message ??
      responseObject?.error ??
      (response.ok ? '' : `HTTP ${response.status}`);

    return String(rawMessage ?? '').trim() || null;
  }

  private normalizeDispatchStatus(
    rawStatus: unknown,
    isSuccess: boolean,
  ): RelatoryDispatchTemplate['status_sent'] {
    const normalized = String(rawStatus ?? '').trim().toLowerCase();

    if (normalized === 'queued' || normalized === 'queue') return 'queued';
    if (
      normalized === 'sent' ||
      normalized === 'accepted' ||
      normalized === 'submitted' ||
      normalized === 'dispatched'
    ) {
      return 'sent';
    }
    if (normalized === 'delivered') return 'delivered';
    if (normalized === 'read') return 'read';
    if (normalized === 'pending') return 'pending';
    if (
      normalized === 'failed' ||
      normalized === 'error' ||
      normalized.startsWith('error_')
    ) {
      return 'failed';
    }

    return isSuccess ? 'pending' : 'failed';
  }
}
