import { Test, TestingModule } from '@nestjs/testing';
import { CampaignsController } from './campanhas.controller';
import { CampaignsService } from './campanhas.service';

describe('CampaignsController', () => {
  let controller: CampaignsController;
  const campaignsService = {
    create: jest.fn(),
    findAll: jest.fn(),
    findByAccount: jest.fn(),
    toggleStatus: jest.fn(),
    update: jest.fn(),
    findOne: jest.fn(),
    remove: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [CampaignsController],
      providers: [{ provide: CampaignsService, useValue: campaignsService }],
    }).compile();

    controller = module.get<CampaignsController>(CampaignsController);
    jest.clearAllMocks();
  });

  it('POST /campaigns chama create', async () => {
    const dto = { name: 'campanha 1' };
    const expected = { id: 'cp1' };
    campaignsService.create.mockResolvedValue(expected);

    const result = await controller.create(dto as any);

    expect(campaignsService.create).toHaveBeenCalledWith(dto);
    expect(result).toEqual(expected);
  });

  it('GET /campaigns sem account chama findAll', async () => {
    campaignsService.findAll.mockResolvedValue([{ id: 'cp1' }]);

    const result = await controller.findAll();

    expect(campaignsService.findAll).toHaveBeenCalled();
    expect(campaignsService.findByAccount).not.toHaveBeenCalled();
    expect(result).toEqual([{ id: 'cp1' }]);
  });

  it('GET /campaigns com account chama findByAccount', async () => {
    campaignsService.findByAccount.mockResolvedValue([{ id: 'cp2' }]);

    const result = await controller.findAll('4');

    expect(campaignsService.findByAccount).toHaveBeenCalledWith('4');
    expect(result).toEqual([{ id: 'cp2' }]);
  });

  it('PATCH /campaigns/:id/toggle-status chama toggleStatus', async () => {
    const expected = { id: 'cp1', isEnabled: false };
    campaignsService.toggleStatus.mockResolvedValue(expected);

    const result = await controller.toggleStatus('cp1');

    expect(campaignsService.toggleStatus).toHaveBeenCalledWith('cp1');
    expect(result).toEqual(expected);
  });

  it('PATCH /campaigns/:id chama update', async () => {
    const dto = { name: 'novo nome' };
    const expected = { id: 'cp1', ...dto };
    campaignsService.update.mockResolvedValue(expected);

    const result = await controller.update('cp1', dto as any);

    expect(campaignsService.update).toHaveBeenCalledWith('cp1', dto);
    expect(result).toEqual(expected);
  });

  it('GET /campaigns/:id chama findOne', async () => {
    const expected = { id: 'cp1' };
    campaignsService.findOne.mockResolvedValue(expected);

    const result = await controller.findOne('cp1');

    expect(campaignsService.findOne).toHaveBeenCalledWith('cp1');
    expect(result).toEqual(expected);
  });

  it('DELETE /campaigns/:id chama remove', async () => {
    campaignsService.remove.mockResolvedValue(undefined);

    const result = await controller.remove('cp1');

    expect(campaignsService.remove).toHaveBeenCalledWith('cp1');
    expect(result).toBeUndefined();
  });
});
