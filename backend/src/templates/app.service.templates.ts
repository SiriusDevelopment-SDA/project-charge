import { BadRequestException, ConflictException, HttpException, HttpStatus, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { FindOptionsWhere, ILike, Repository } from 'typeorm';
import { Templates } from './entities/templatesMeta';
import { SearchRequestDtoRelatories, SearchRequestDtoTemplates, SendTemplateDto } from './dto/search.request.dto.templates';
import { RelatoryDispatchTemplate } from './entities/relatory.entity';
import { DeleteTemplateDto } from './dto/delete.request.dto.templates';
import { CreateTemplateDTO } from './dto/create.request.dto.template';
import { Company } from '../companies/entities/companies';

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
  ) { }

  async getTemplates(dto: SearchRequestDtoTemplates) {
    const { account, page, limit, sortorder, query } = dto;
    const safeLimit = limit > 0 ? limit : 10;
    const safePage = page > 0 ? page : 1;
    const skip = (safePage - 1) * safeLimit;

    const order =
      sortorder?.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';
    const where: FindOptionsWhere<Templates> = {
      company: {
        account_chatwoot: String(account),
      },
    };

    if (query) where.name = ILike(`%${query}%`);

    const [data,] = await this.templateRepository.findAndCount({
      where,
      relations: {
        company: true
      },
      select: {
        company: {
          id: true,
          account_chatwoot: true,
          name: true
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
      total: data.length,
      data
    };
  }

  async sendTemplate(data: SendTemplateDto) {
    const { templateId, account, to } = data;
    const results = [];
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
        company: {
          id: true,
          canalId_notificameHub: true,
          token_notificameHub: true,
        },
      },
    });

    if (!template) throw new NotFoundException('Template não encontrado');


    for (const recipient of to) {
      const expected = Object.keys(template.variables || {}).length;
      const safeComponents = Array.isArray(recipient.components) ? recipient.components : [];
      const bodyComponent = safeComponents.find(c => c.type === 'BODY');
      const parametersLength = bodyComponent?.parameters?.length ?? 0;
      if (expected !== parametersLength) throw new NotFoundException(`Template exige ${expected} variáveis, recebido ${parametersLength}`);

      const templatePayload = {
        name: template.name,
        language: { code: template.language },
        components: expected > 0 && parametersLength > 0
          ? safeComponents
          : [{ type: 'BODY', parameters: [] }],
      };

      const content = {
        from: template.company.canalId_notificameHub,
        to: recipient.number, // 👈 agora é UM número
        contents: [
          {
            type: 'template',
            template: templatePayload,
          },
        ],
        message_activity_sharing: true,
        message_send_ttl_seconds: 3600,
      };

      const response = await fetch(
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

      const responseData = await response.json();

      await this.relatoryDispatchRepository.insert({
        external_message_id: responseData.id,
        status_sent: responseData.status,
        date_dispatch: new Date(),
        template: { id: template.id },
        name: recipient.name ?? recipient.number,
        number: recipient.number,
        components_maped: { components: safeComponents },
        company: { id: template.company.id }
      });
      results.push(responseData);
    }
    return {
      success: true,
      total: results.length,
      status: 'DISPATCHED',
      messages: results
    };

  }

  async getRelatoriesDispatchTemplate(dto: SearchRequestDtoRelatories) {
    const { account, page, limit, sortorder, query } = dto;
    const safeLimit = limit > 0 ? limit : 10;
    const safePage = page > 0 ? page : 1;
    const skip = (safePage - 1) * safeLimit;

    const order =
      sortorder?.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';
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


    const [data,] = await this.relatoryDispatchRepository.findAndCount({
      where,
      relations: {
        template: true
      },
      select: {
        template: {
          id: true,
          category: true,
          variables: true
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
      total: data.length,
      data
    };
  }

  async disableTemplate(templateId: string) {
    const template = await this.templateRepository.findOne({
      where: {
        id: templateId,
        isEnabled: true
      }
    });

    if (!template) {
      throw new HttpException('Template não encontrado ou já desativado', HttpStatus.NOT_FOUND)
    }

    template.isEnabled = false;

    await this.templateRepository.save(template)

    return {
      'statusCode': 204,
      'message': 'Template desativado!'
    }
  }

  async createTemplate(companyId: string, dto: CreateTemplateDTO) {
    // Busca empresa e valida integração
    const company = await this.companyRepository.findOne({
      where: { id: companyId },
      select: {
        id: true,
        canalId_notificameHub: true,
        token_notificameHub: true,
      },
    });

    if (!company) throw new NotFoundException('Empresa não encontrada!')

    if (!company.canalId_notificameHub || !company.token_notificameHub) throw new BadRequestException('Empresa não possui integração ativa com a NotificaMe.')

    //Payload Contents
    const contents = [{
      template: {
        name: dto.name,
        language: dto.language,
        category: dto.category,
        components: dto.components
      }
    }]

    const payload = {
      from: company.canalId_notificameHub,
      contents: contents
    };

    console.log('📦 PAYLOAD ENVIADO PARA NOTIFICAME', JSON.stringify(payload, null, 2));

    // Envio para NotificaMe
    const response = await fetch(
      `${this.baseUrl}/templates`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Api-Token': company.token_notificameHub,
        },
        body: JSON.stringify(payload),
      },
    );

    if (!response.ok) {
      const error = await response.text();
      throw new BadRequestException(
        `Erro ao criar template na NotificaMe: ${error}`,
      );
    }

    const responseData = await response.json();

    //Salva o template no banco 
    await this.templateRepository.save([
      {
        active: true,
        isEnabled: true,
        language: dto.language,
        message: dto.components.filter(
          m => m.type.toUpperCase() === "BODY"
        ).map(m => m.text)[0],
        meta_id: responseData.id,
        meta_status: responseData.status,
        variables: dto.variables,
        company: { id: dto.companyId },
        name: dto.name,
      },
    ]);

    // Retorno final
    return responseData
  }
}