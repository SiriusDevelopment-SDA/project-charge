import {
  Injectable,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { Category } from './entities/category.entity';
import { CreateCategoryDto } from './dto/create-category.dto';

@Injectable()
export class CategoryService {
  constructor(
    @InjectRepository(Category)
    private readonly categoryRepository: Repository<Category>,
  ) { }

  // Cria uma nova categoria
  async create(createDto: CreateCategoryDto): Promise<Category> {
    // Cria a instância da categoria com os dados fornecidos
    const category = this.categoryRepository.create({
      name: createDto.name,
    });

    // Salva a categoria no banco de dados
    return await this.categoryRepository.save(category);
  }

  // Busca todas as categorias ordenadas por data de criação (mais recente primeiro)
  async findAll(): Promise<Category[]> {
    return await this.categoryRepository.find({
      order: { createdAt: 'DESC' },
    });
  }

  // Busca uma categoria específica pelo ID
  async findOne(id: string): Promise<Category> {
    const category = await this.categoryRepository.findOne({
      where: { id },
    });

    // Lança exceção se a categoria não for encontrada
    if (!category) {
      throw new BadRequestException('Categoria não encontrada.');
    }

    return category;
  }

  // Atualiza os dados de uma categoria existente
  async update(id: string, updateData: Partial<CreateCategoryDto>): Promise<Category> {
    // Busca a categoria para garantir que ela existe
    const category = await this.findOne(id);

    // Atualiza os campos da categoria com os novos dados
    Object.assign(category, updateData);

    // Salva as alterações no banco de dados
    return await this.categoryRepository.save(category);
  }

  // Remove uma categoria do banco de dados
  async remove(id: string): Promise<void> {
    // Busca a categoria para garantir que ela existe
    const category = await this.findOne(id);
    // Remove a categoria
    await this.categoryRepository.remove(category);
  }
}
