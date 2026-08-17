import {
  Controller,
  Post,
  Get,
  Put,
  Delete,
  Param,
  Body,
} from '@nestjs/common';
import {
  ApiBody,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { Activity } from '../activity-log/activity.decorator';

import { CategoryService } from './category.service';
import { CreateCategoryDto } from './dto/create-category.dto';

// Define o prefixo da rota como 'categories'
@ApiTags('Categorias')
@Controller('categories')
export class CategoryController {
  constructor(private readonly categoryService: CategoryService) {}

  // POST /categories - Cria uma nova categoria
  @Post()
  @Activity({ category: 'create', action: 'Criou uma categoria', entity: 'category' })
  @ApiOperation({ summary: 'Cria uma nova categoria' })
  @ApiBody({ type: CreateCategoryDto })
  create(@Body() createDto: CreateCategoryDto) {
    return this.categoryService.create(createDto);
  }

  // GET /categories - Lista todas as categorias
  @Get()
  @ApiOperation({ summary: 'Lista todas as categorias' })
  findAll() {
    return this.categoryService.findAll();
  }

  // GET /categories/:id - Busca uma categoria específica pelo ID
  @Get(':id')
  @ApiOperation({ summary: 'Busca categoria por ID' })
  @ApiParam({ name: 'id', type: String, format: 'uuid' })
  findOne(@Param('id') id: string) {
    return this.categoryService.findOne(id);
  }

  // PUT /categories/:id - Atualiza uma categoria existente
  @Put(':id')
  @ApiOperation({ summary: 'Atualiza categoria por ID' })
  @ApiParam({ name: 'id', type: String, format: 'uuid' })
  @ApiBody({ type: CreateCategoryDto })
  update(@Param('id') id: string, @Body() updateData: Partial<CreateCategoryDto>) {
    return this.categoryService.update(id, updateData);
  }

  // DELETE /categories/:id - Remove uma categoria
  @Delete(':id')
  @ApiOperation({ summary: 'Remove categoria por ID' })
  @ApiParam({ name: 'id', type: String, format: 'uuid' })
  remove(@Param('id') id: string) {
    return this.categoryService.remove(id);
  }
}
