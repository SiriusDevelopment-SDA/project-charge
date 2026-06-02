import { Controller, Get, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { SuperAdminGuard } from '../auth/guards/super-admin.guard';
import { CompaniesService } from './companies.service';

@ApiTags('Companies')
@ApiBearerAuth()
@Controller('companies')
export class CompaniesController {
  constructor(private readonly companiesService: CompaniesService) {}

  @Get()
  @UseGuards(SuperAdminGuard)
  @ApiOperation({
    summary:
      'Lista todas as empresas ativas. Restrito a super administradores.',
    description:
      'Retorna a lista global de empresas com active=true. Endpoint exclusivo para super_admin — nao retorna tokens sensiveis.',
  })
  @ApiOkResponse({
    description: 'Lista de empresas ativas.',
    schema: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          name: { type: 'string' },
          account_chatwoot: { type: 'string' },
          label: { type: 'string' },
          active: { type: 'boolean' },
        },
      },
    },
  })
  @ApiUnauthorizedResponse({ description: 'Token nao informado ou invalido.' })
  @ApiForbiddenResponse({ description: 'Apenas super administradores.' })
  listAll() {
    return this.companiesService.listAll();
  }
}
