import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { FindOptionsWhere, ILike, Repository } from 'typeorm';
import { Templates } from './entities/templatesMeta';
import { SearchRequestDtoTemplates, SendTemplateDto } from './dto/search.request.dto.templates';

@Injectable()
export class AppServiceTemplate {
  private readonly baseUrl = 'https://api.notificame.com.br/v1';
  constructor(
    @InjectRepository(Templates)
    private templateRepository: Repository<Templates>,
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
    const { templateId, account, to, components } = data;
    const where: FindOptionsWhere<Templates> = {
      id: templateId,
      company: {
        account_chatwoot: String(account),
      },
    };
    const [template,] = await this.templateRepository.findAndCount({
      where,
      relations: {
        company: true,
      },
      select: {
        company: {
          id: true,
          account_chatwoot: true,
          canalId_notificameHub: true,
          token_notificameHub: true
        },
      },
    });
    if (!template)throw new NotFoundException('Template não encontrado');
    if (template.length === 0)throw new NotFoundException('Template não encontrado');
    const expected = Object.keys(template[0].variables || {}).length

    const safeComponents = Array.isArray(components) ? components : []

    const templatePayload: any = {
      name: template[0].name,
      language: { code: 'pt_BR' },
      components: expected > 0 ? safeComponents : [
        { type: "BODY", parameters: [] }
      ]
    }

    const content = {
      from: template[0].company.canalId_notificameHub,
      to: to,
      contents: [
        {
          type: "template",
          template: templatePayload
        }
      ]
    }
    
    console.log("content", content)
    console.log("templatePayload", templatePayload)
    const dispatchNotificameHub = await fetch(`${this.baseUrl}/channels/whatsapp/messages`, {
      method: 'POST',
      body: JSON.stringify(content),
      headers: {
        'Content-Type': 'application/json',
        'X-Api-Token': template[0].company.token_notificameHub
      },
    })
    return {
      data: dispatchNotificameHub,
    };
  }
}