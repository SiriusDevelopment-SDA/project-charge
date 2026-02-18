import {
  Controller,
  Post,
  Get,
  Put,
  Delete,
  Param,
  Body,
} from '@nestjs/common';

import { CategoryService } from './category.service';
import { CreateCategoryDto } from './dto/create-category.dto';

// Define o prefixo da rota como 'categories'
@Controller('categories')
export class CategoryController {
  constructor(private readonly categoryService: CategoryService) {}

  // POST /categories - Cria uma nova categoria
  @Post()
  create(@Body() createDto: CreateCategoryDto) {
    return this.categoryService.create(createDto);
  }

  // GET /categories - Lista todas as categorias
  @Get()
  findAll() {
    return this.categoryService.findAll();
  }

  // GET /categories/:id - Busca uma categoria específica pelo ID
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.categoryService.findOne(id);
  }

  // PUT /categories/:id - Atualiza uma categoria existente
  @Put(':id')
  update(@Param('id') id: string, @Body() updateData: Partial<CreateCategoryDto>) {
    return this.categoryService.update(id, updateData);
  }

  // DELETE /categories/:id - Remove uma categoria
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.categoryService.remove(id);
  }
}
