import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { FindOptionsWhere, ILike, Repository } from 'typeorm';
import { Templates } from './entities/templatesMeta';
import { SearchRequestDtoTemplates, SendTemplateDto } from './dto/search.request.dto.templates';
import { RelatoryDispatchTemplate } from './entities/relatory.entity';

@Injectable()
export class AppServiceTemplate {
  private readonly baseUrl = 'https://api.notificame.com.br/v2';
  constructor(
    @InjectRepository(Templates)
    private templateRepository: Repository<Templates>,
    
    @InjectRepository(RelatoryDispatchTemplate)
    private readonly relatoryDispatchRepository: Repository<RelatoryDispatchTemplate>,
  ) {}

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

    if (query)where.name = ILike(`%${query}%`);

    const [data,] = await this.templateRepository.findAndCount({
      where,
      relations: {
        company: true
        },
        select: {
          company: {
            id: true,
            account_chatwoot: true,
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
  
    if (!template)throw new NotFoundException('Template não encontrado');
  
    const expected = Object.keys(template.variables || {}).length;

    for (const recipient of to) {
      const safeComponents = Array.isArray(recipient.components) ? recipient.components : [];
      const templatePayload = {
        name: template.name,
        language: { code: template.language },
        components: expected > 0
          ? safeComponents
          : [{ type: 'BODY', parameters: [] }],
      };

      const bodyComponent = safeComponents.find(c => c.type === 'BODY');
      const parametersLength = bodyComponent?.parameters?.length ?? 0;
    
      if (expected !== parametersLength)throw new NotFoundException('Todas as variáveis não foram mapeadas!');

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
      });
      return responseData
    }
  }
}