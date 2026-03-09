import { Test, TestingModule } from '@nestjs/testing';
import { ControllerTemplates } from './app.controllers.templates';
import { AppServiceTemplate } from './app.service.templates';

describe('ControllerTemplates', () => {
  let controller: ControllerTemplates;
  const appService = {
    getTemplates: jest.fn(),
    sendTemplate: jest.fn(),
    getRelatoriesDispatchTemplate: jest.fn(),
    disableTemplate: jest.fn(),
    createTemplate: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ControllerTemplates],
      providers: [{ provide: AppServiceTemplate, useValue: appService }],
    }).compile();

    controller = module.get<ControllerTemplates>(ControllerTemplates);
    jest.clearAllMocks();
  });

  it('POST /template/search chama getTemplates', async () => {
    const dto = { account: '1', query: 't' };
    const expected = { page: 1, total: 1, data: [{ id: 't1' }] };
    appService.getTemplates.mockResolvedValue(expected);

    const result = await controller.getTemplates(dto as any);

    expect(appService.getTemplates).toHaveBeenCalledWith(dto);
    expect(result).toEqual(expected);
  });

  it('POST /template/send chama sendTemplate', async () => {
    const dto = { templateId: 't1', account: '1', to: [] };
    const expected = { success: true };
    appService.sendTemplate.mockResolvedValue(expected);

    const result = await controller.sendTemplate(dto as any);

    expect(appService.sendTemplate).toHaveBeenCalledWith(dto);
    expect(result).toEqual(expected);
  });

  it('POST /template/relatories/search chama getRelatoriesDispatchTemplate', async () => {
    const dto = { account: '1', page: 1, limit: 10 };
    const expected = { page: 1, total: 0, data: [] };
    appService.getRelatoriesDispatchTemplate.mockResolvedValue(expected);

    const result = await controller.getRelatoriesDispatchTemplates(dto as any);

    expect(appService.getRelatoriesDispatchTemplate).toHaveBeenCalledWith(dto);
    expect(result).toEqual(expected);
  });

  it('POST /template/delete chama disableTemplate com templateId', async () => {
    const dto = { templateId: 't1' };
    const expected = { success: true };
    appService.disableTemplate.mockResolvedValue(expected);

    const result = await controller.disableTemplate(dto as any);

    expect(appService.disableTemplate).toHaveBeenCalledWith('t1');
    expect(result).toEqual(expected);
  });

  it('POST /template/create chama createTemplate com companyId e dto', async () => {
    const dto = { companyId: 'c1', name: 'novo' };
    const expected = { id: 't1' };
    appService.createTemplate.mockResolvedValue(expected);

    const result = await controller.createTemplate(dto as any);

    expect(appService.createTemplate).toHaveBeenCalledWith('c1', dto);
    expect(result).toEqual(expected);
  });
});
