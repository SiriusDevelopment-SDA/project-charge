import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ClientInteraction } from './entities/client-interaction.entity';
import { CreateClientInteractionDto } from './dto/create-client-interaction.dto';
import { RelatoryDispatchTemplate } from '../templates/entities/relatory.entity';

@Injectable()
export class ClientInteractionService {
  constructor(
    @InjectRepository(ClientInteraction)
    private readonly repo: Repository<ClientInteraction>,
    @InjectRepository(RelatoryDispatchTemplate)
    private readonly relatoryRepo: Repository<RelatoryDispatchTemplate>,
  ) {}

  async findByClient(client_id: string): Promise<ClientInteraction[]> {
    return this.repo.find({
      where: { client_id },
      relations: { agent: true },
      order: { created_at: 'DESC' },
    });
  }

  async create(dto: CreateClientInteractionDto): Promise<ClientInteraction> {
    const interaction = this.repo.create({
      client_id: dto.client_id,
      company_id: dto.company_id,
      agent_id: dto.agent_id ?? null,
      type: dto.type ?? null,
      description: dto.description ?? null,
      outcome: dto.outcome ?? null,
      scheduled_at: dto.scheduled_at ? new Date(dto.scheduled_at) : null,
      payment_promise_id: dto.payment_promise_id ?? null,
    });
    return this.repo.save(interaction);
  }

  async countDispatchesByPhone(phone: string, company_id: string): Promise<number> {
    const normalized = phone.replace(/\D/g, '');
    return this.relatoryRepo
      .createQueryBuilder('r')
      .innerJoin('r.company', 'c')
      .where(`regexp_replace(r.number, '\\D', '', 'g') = :phone`, { phone: normalized })
      .andWhere('c.id = :company_id', { company_id })
      .getCount();
  }

  async getDispatchSummaryByPhone(
    phone: string,
    company_id: string,
  ): Promise<{ total: number; last_sent_at: Date | null }> {
    const normalized = phone.replace(/\D/g, '');
    const result = await this.relatoryRepo
      .createQueryBuilder('r')
      .innerJoin('r.company', 'c')
      .select('COUNT(r.id)', 'total')
      .addSelect('MAX(r.date_dispatch)', 'last_sent_at')
      .where(`regexp_replace(r.number, '\\D', '', 'g') = :phone`, { phone: normalized })
      .andWhere('c.id = :company_id', { company_id })
      .getRawOne<{ total: string; last_sent_at: Date | null }>();

    return {
      total: Number(result?.total ?? 0),
      last_sent_at: result?.last_sent_at ?? null,
    };
  }

  async getDispatchSummaryBatch(
    phones: string[],
    company_id: string,
  ): Promise<Record<string, { total: number; last_sent_at: Date | null }>> {
    if (!phones.length) return {};

    const normalized = phones.map((p) => p.replace(/\D/g, '')).filter(Boolean);
    if (!normalized.length) return {};

    const rows = await this.relatoryRepo
      .createQueryBuilder('r')
      .innerJoin('r.company', 'c')
      .select(`regexp_replace(r.number, '\\D', '', 'g')`, 'phone')
      .addSelect('COUNT(r.id)', 'total')
      .addSelect('MAX(r.date_dispatch)', 'last_sent_at')
      .where('c.id = :company_id', { company_id })
      .andWhere(
        `regexp_replace(r.number, '\\D', '', 'g') IN (:...phones)`,
        { phones: normalized },
      )
      .groupBy(`regexp_replace(r.number, '\\D', '', 'g')`)
      .getRawMany<{ phone: string; total: string; last_sent_at: Date | null }>();

    const result: Record<string, { total: number; last_sent_at: Date | null }> = {};
    for (const row of rows) {
      result[row.phone] = { total: Number(row.total), last_sent_at: row.last_sent_at };
    }
    return result;
  }
}
