import {
  Injectable,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';

import { Campaign } from './entities/campanhas.entity';
import { CreateCampaignDto } from './dto/create-campanhas.dto';
import { UpdateCampaignDto } from './dto/update-campanhas.dto';
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

  async remove(id: string): Promise<void> {
    const campaign = await this.findOne(id);
    await this.campaignRepository.remove(campaign);
  }

  async update(id: string, updateDto: UpdateCampaignDto): Promise<Campaign> {
    const campaign = await this.findOne(id);

    if (updateDto.name) campaign.name = updateDto.name;
    if (updateDto.startDate) campaign.startDate = new Date(updateDto.startDate);
    if (updateDto.endDate) campaign.endDate = new Date(updateDto.endDate);
    if (updateDto.dispatchStartTime) campaign.dispatchStartTime = updateDto.dispatchStartTime;
    if (updateDto.dispatchEndTime) campaign.dispatchEndTime = updateDto.dispatchEndTime;
    if (updateDto.timezone) campaign.timezone = updateDto.timezone;
    if (updateDto.recurring !== undefined) campaign.recurring = updateDto.recurring;
    if (updateDto.templateId) campaign.template = { id: updateDto.templateId } as any;
    if (updateDto.categoryId) campaign.category = { id: updateDto.categoryId } as any;

    if (updateDto.client && updateDto.client.length > 0) {
      const clients = await this.clientRepository.find({
        where: { id: In(updateDto.client) },
      });
      if (clients.length !== updateDto.client.length) {
        throw new BadRequestException('Um ou mais clientes não foram encontrados.');
      }
      campaign.client = clients;
    }

    return await this.campaignRepository.save(campaign);
  }

  async toggleStatus(id: string): Promise<Campaign> {
    const campaign = await this.findOne(id);
    campaign.isEnabled = !campaign.isEnabled;
    return await this.campaignRepository.save(campaign);
  }
}
