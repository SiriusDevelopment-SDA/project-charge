import { Test, TestingModule } from '@nestjs/testing';
import { ControllerClients } from './app.controllers.clients';
import { AppServiceClient } from './app.service.clients';

describe('ControllerClients', () => {
  let controller: ControllerClients;
  const appService = {
    getClients: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ControllerClients],
      providers: [{ provide: AppServiceClient, useValue: appService }],
    }).compile();

    controller = module.get<ControllerClients>(ControllerClients);
    jest.clearAllMocks();
  });

  it('POST /clients/search delega para o service', async () => {
    const dto = { query: 'maria', account: '1', page: 1, limit: 10 };
    const expected = { total: 1, data: [{ id: 'c1' }] };
    appService.getClients.mockResolvedValue(expected);

    const result = await controller.getClients(dto as any);

    expect(appService.getClients).toHaveBeenCalledWith(dto);
    expect(result).toEqual(expected);
  });
});
