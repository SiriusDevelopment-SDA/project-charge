import { BadRequestException } from '@nestjs/common';
import { In } from 'typeorm';

import { CampaignsService } from './campanhas.service';

describe('CampaignsService', () => {
  let service: CampaignsService;

  const campaignRepository = {
    create: jest.fn(),
    save: jest.fn(),
    find: jest.fn(),
    findOne: jest.fn(),
    remove: jest.fn(),
  };

  const clientRepository = {
    find: jest.fn(),
  };

  const baseCreateDto = {
    name: 'Campanha teste',
    company: 'company-1',
    templateId: 'f7cf0d35-8a88-4f7c-b57a-5a754f3feabf',
    categoryId: 'ef45fe9d-a2d1-4fb6-b31e-1e15cb5f6d52',
    startDate: '2026-03-01',
    endDate: '2026-03-31',
    dispatchStartTime: '08:00',
    dispatchEndTime: '18:00',
    timezone: 'America/Sao_Paulo',
    recurring: false,
    client: ['client-1', 'client-2'],
  };

  beforeEach(() => {
    service = new CampaignsService(
      campaignRepository as any,
      clientRepository as any,
    );
    jest.clearAllMocks();
  });

  it('deve rejeitar criação quando horário inicial é maior ou igual ao final', async () => {
    await expect(
      service.create({
        ...baseCreateDto,
        dispatchStartTime: '19:00',
        dispatchEndTime: '18:00',
      } as any),
    ).rejects.toThrow(BadRequestException);

    expect(clientRepository.find).not.toHaveBeenCalled();
  });

  it('deve rejeitar criação quando data inicial é maior que a final', async () => {
    await expect(
      service.create({
        ...baseCreateDto,
        startDate: '2026-04-01',
        endDate: '2026-03-01',
      } as any),
    ).rejects.toThrow(BadRequestException);

    expect(clientRepository.find).not.toHaveBeenCalled();
  });

  it('deve rejeitar criação quando algum cliente não existe', async () => {
    clientRepository.find.mockResolvedValue([{ id: 'client-1' }]);

    await expect(service.create(baseCreateDto as any)).rejects.toThrow(
      BadRequestException,
    );

    expect(clientRepository.find).toHaveBeenCalledWith({
      where: { id: In(baseCreateDto.client) },
    });
    expect(campaignRepository.save).not.toHaveBeenCalled();
  });

  it('deve criar campanha com relacionamentos e status default', async () => {
    const foundClients = [{ id: 'client-1' }, { id: 'client-2' }];
    const campaignEntity = { id: 'campaign-1' };

    clientRepository.find.mockResolvedValue(foundClients);
    campaignRepository.create.mockReturnValue(campaignEntity);
    campaignRepository.save.mockResolvedValue(campaignEntity);

    const result = await service.create(baseCreateDto as any);

    expect(campaignRepository.create).toHaveBeenCalledWith({
      ...baseCreateDto,
      company: { id: baseCreateDto.company },
      template: { id: baseCreateDto.templateId },
      category: { id: baseCreateDto.categoryId },
      status: 'pending',
      client: foundClients,
    });
    expect(campaignRepository.save).toHaveBeenCalledWith(campaignEntity);
    expect(result).toBeUndefined();
  });

  it('deve alternar isEnabled em toggleStatus', async () => {
    campaignRepository.findOne.mockResolvedValue({
      id: 'campaign-1',
      isEnabled: true,
    });
    campaignRepository.save.mockImplementation(async (campaign: any) => campaign);

    const result = await service.toggleStatus('campaign-1');

    expect(campaignRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'campaign-1', isEnabled: false }),
    );
    expect(result.isEnabled).toBe(false);
  });
});
