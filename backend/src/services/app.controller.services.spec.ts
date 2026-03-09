import { Test, TestingModule } from '@nestjs/testing';
import { ControllerServices } from './app.controller.services';
import { AppServiceServices } from './app.service.services';

describe('ControllerServices', () => {
  let controller: ControllerServices;
  const appService = {
    getServices: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ControllerServices],
      providers: [{ provide: AppServiceServices, useValue: appService }],
    }).compile();

    controller = module.get<ControllerServices>(ControllerServices);
    jest.clearAllMocks();
  });

  it('POST /services delega para getServices', async () => {
    const dto = { companyId: 'co1' };
    const expected = [{ id: 's1', name: 'Internet' }];
    appService.getServices.mockResolvedValue(expected);

    const result = await controller.getServices(dto as any);

    expect(appService.getServices).toHaveBeenCalledWith('co1', dto);
    expect(result).toEqual(expected);
  });
});
