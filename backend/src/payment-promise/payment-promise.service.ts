import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PaymentPromise } from './entities/payment-promise.entity';
import { CreatePaymentPromiseDto } from './dto/create-payment-promise.dto';

@Injectable()
export class PaymentPromiseService {
  constructor(
    @InjectRepository(PaymentPromise)
    private readonly repo: Repository<PaymentPromise>,
  ) {}

  async findByClient(client_id: string): Promise<PaymentPromise[]> {
    return this.repo.find({
      where: { client_id },
      order: { created_at: 'DESC' },
    });
  }

  async findLatestByClient(client_id: string): Promise<PaymentPromise | null> {
    return this.repo.findOne({
      where: { client_id },
      order: { created_at: 'DESC' },
    });
  }

  async findLatestBatch(client_ids: string[]): Promise<PaymentPromise[]> {
    if (!client_ids.length) return [];
    return this.repo
      .createQueryBuilder('pp')
      .where('pp.client_id IN (:...client_ids)', { client_ids })
      .distinctOn(['pp.client_id'])
      .orderBy('pp.client_id', 'ASC')
      .addOrderBy('pp.created_at', 'DESC')
      .getMany();
  }

  async findByCompany(company_id: string): Promise<PaymentPromise[]> {
    return this.repo.find({
      where: { company_id },
      order: { created_at: 'DESC' },
    });
  }

  async create(dto: CreatePaymentPromiseDto): Promise<PaymentPromise> {
    const promise = this.repo.create({
      client_id: dto.client_id,
      total_debt: dto.total_debt,
      open_invoices_count: dto.open_invoices_count,
      promised_payment_date: dto.promised_payment_date,
      promised_amount: dto.promised_amount,
      company_id: dto.company_id,
      phone: dto.phone,
      client_name: dto.client_name,
      service_report: dto.service_report,
      status: 'pending',
    });
    return this.repo.save(promise);
  }

  async updateStatus(
    id: string,
    status: 'pending' | 'kept' | 'broken' | 'cancelled',
  ): Promise<PaymentPromise> {
    const result = await this.repo.update({ id }, { status });
    if (!result.affected) throw new NotFoundException('Payment promise not found');
    return this.repo.findOne({ where: { id } }) as Promise<PaymentPromise>;
  }
}
