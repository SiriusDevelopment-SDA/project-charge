import {
  Injectable,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';

import { Campaign } from './entities/campanhas.entity';
import { CreateCampaignDto } from './dto/create-campanhas.dto';
import { Client } from '../clients/entities.ts/clients';

@Injectable()
export class CampaignsService {
  constructor(
    @InjectRepository(Campaign)
    private readonly campaignRepository: Repository<Campaign>,

    @InjectRepository(Client)
    private readonly clientRepository: Repository<Client>,
  ) { }

  async create(createDto: CreateCampaignDto) {
    if (createDto.dispatchStartTime >= createDto.dispatchEndTime) {
      throw new BadRequestException(
        'O horário inicial deve ser menor que o horário final.'
      );
    }

    if (new Date(createDto.startDate) > new Date(createDto.endDate)) {
      throw new BadRequestException(
        'Data inicial não pode ser maior que data final.'
      );
    }

    
    const clients = await this.clientRepository.find({
      where: { id: In(createDto.client) },
    });
    if (clients.length !== createDto.client.length) {
      throw new BadRequestException('Um ou mais clientes não foram encontrados.');
    }
    const campaign = this.campaignRepository.create({
      ...createDto,
      company: { id: createDto.company },
      template: { id: createDto.templateId },
      category: { id: createDto.categoryId },
      status: 'pending',
      client: clients,
    });


    await this.campaignRepository.save(campaign);
    console.log('Campanha criada:', campaign);
    //return campaign;
  }

  async findAll(): Promise<Campaign[]> {
    return await this.campaignRepository.find({
      relations: ['template', 'category'],
      order: { createdAt: 'DESC' },
    });
  }

  async findOne(id: string): Promise<Campaign> {
    const campaign = await this.campaignRepository.findOne({
      where: { id },
      relations: ['template', 'category'],
    });

    if (!campaign) {
      throw new BadRequestException('Campanha não encontrada.');
    }

    return campaign;
  }

  async findByAccount(account: string): Promise<Campaign[]> {
    return await this.campaignRepository.find({
      where: { company: { account_chatwoot: String(account) } },
      relations: ['template', 'category'],
      order: { createdAt: 'DESC' },
    });
  }
}
