import { BadRequestException } from '@nestjs/common';

import { CategoryService } from './category.service';

describe('CategoryService', () => {
  let service: CategoryService;

  const categoryRepository = {
    create: jest.fn(),
    save: jest.fn(),
    find: jest.fn(),
    findOne: jest.fn(),
    remove: jest.fn(),
  };

  beforeEach(() => {
    service = new CategoryService(categoryRepository as any);
    jest.clearAllMocks();
  });

  it('deve criar categoria', async () => {
    const createDto = { name: 'Cobrança', companyId: 'company-1' };
    const category = { id: 'cat-1', ...createDto };

    categoryRepository.create.mockReturnValue(category);
    categoryRepository.save.mockResolvedValue(category);

    const result = await service.create(createDto);

    expect(categoryRepository.create).toHaveBeenCalledWith({ name: 'Cobrança' });
    expect(categoryRepository.save).toHaveBeenCalledWith(category);
    expect(result).toEqual(category);
  });

  it('deve lançar erro ao buscar categoria inexistente', async () => {
    categoryRepository.findOne.mockResolvedValue(null);

    await expect(service.findOne('missing-id')).rejects.toThrow(
      BadRequestException,
    );
  });

  it('deve atualizar categoria existente', async () => {
    const current = { id: 'cat-1', name: 'Cobrança' };
    const updated = { id: 'cat-1', name: 'Financeiro' };

    categoryRepository.findOne.mockResolvedValue(current);
    categoryRepository.save.mockResolvedValue(updated);

    const result = await service.update('cat-1', { name: 'Financeiro' });

    expect(categoryRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'cat-1', name: 'Financeiro' }),
    );
    expect(result).toEqual(updated);
  });

  it('deve remover categoria existente', async () => {
    const category = { id: 'cat-1', name: 'Cobrança' };
    categoryRepository.findOne.mockResolvedValue(category);
    categoryRepository.remove.mockResolvedValue(undefined);

    await service.remove('cat-1');

    expect(categoryRepository.remove).toHaveBeenCalledWith(category);
  });
});
