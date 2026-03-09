import { Test, TestingModule } from '@nestjs/testing';
import { CategoryController } from './category.controller';
import { CategoryService } from './category.service';

describe('CategoryController', () => {
  let controller: CategoryController;
  const categoryService = {
    create: jest.fn(),
    findAll: jest.fn(),
    findOne: jest.fn(),
    update: jest.fn(),
    remove: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [CategoryController],
      providers: [{ provide: CategoryService, useValue: categoryService }],
    }).compile();

    controller = module.get<CategoryController>(CategoryController);
    jest.clearAllMocks();
  });

  it('POST /categories chama create', async () => {
    const dto = { name: 'Cobranca' };
    const expected = { id: 'cat1', ...dto };
    categoryService.create.mockResolvedValue(expected);

    const result = await controller.create(dto as any);

    expect(categoryService.create).toHaveBeenCalledWith(dto);
    expect(result).toEqual(expected);
  });

  it('GET /categories chama findAll', async () => {
    const expected = [{ id: 'cat1' }];
    categoryService.findAll.mockResolvedValue(expected);

    const result = await controller.findAll();

    expect(categoryService.findAll).toHaveBeenCalled();
    expect(result).toEqual(expected);
  });

  it('GET /categories/:id chama findOne', async () => {
    const expected = { id: 'cat1' };
    categoryService.findOne.mockResolvedValue(expected);

    const result = await controller.findOne('cat1');

    expect(categoryService.findOne).toHaveBeenCalledWith('cat1');
    expect(result).toEqual(expected);
  });

  it('PUT /categories/:id chama update', async () => {
    const dto = { name: 'Novo nome' };
    const expected = { id: 'cat1', ...dto };
    categoryService.update.mockResolvedValue(expected);

    const result = await controller.update('cat1', dto);

    expect(categoryService.update).toHaveBeenCalledWith('cat1', dto);
    expect(result).toEqual(expected);
  });

  it('DELETE /categories/:id chama remove', async () => {
    categoryService.remove.mockResolvedValue(undefined);

    const result = await controller.remove('cat1');

    expect(categoryService.remove).toHaveBeenCalledWith('cat1');
    expect(result).toBeUndefined();
  });
});
