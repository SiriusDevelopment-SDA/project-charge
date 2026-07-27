import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiBody,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { SuperAdminGuard } from '../auth/guards/super-admin.guard';
import { CompaniesService } from './companies.service';
import { CreateCompanyDto } from './dto/create-company.dto';
import { listErps } from '../integrations/erp/erp.registry';

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

  @Get('erps')
  @UseGuards(SuperAdminGuard)
  @ApiOperation({
    summary: 'Lista os ERPs integrados e a capacidade de cada um.',
    description:
      'Fonte para o dropdown do cadastro. Cada ERP declara o que o sistema REALMENTE faz por ele hoje (sincronizacao de clientes, de faturas, PIX, disparo), quais credenciais exige, e uma ressalva quando ha buraco de capacidade — o Hubsoft, por exemplo, nao sincroniza nada.',
  })
  @ApiOkResponse({ description: 'Registro de ERPs.' })
  @ApiUnauthorizedResponse({ description: 'Token nao informado ou invalido.' })
  @ApiForbiddenResponse({ description: 'Apenas super administradores.' })
  listErps() {
    return { success: true, erps: listErps() };
  }

  @Post()
  @UseGuards(SuperAdminGuard)
  @ApiOperation({
    summary: 'Cadastra uma empresa, validando a credencial do ERP antes de gravar.',
    description:
      'Substitui o cadastro manual via SQL. O `config` e montado pelo backend a partir de campos nomeados — nao e possivel injeta-lo, o que impede uma empresa de nascer com marcadores de sincronizacao herdados de outra. Se o ERP recusar a credencial, a empresa e criada INATIVA com o motivo registrado, em vez de falhar a requisicao.',
  })
  @ApiBody({ type: CreateCompanyDto })
  @ApiCreatedResponse({
    description:
      'Empresa cadastrada. Verifique `preflight.status` e `company.active`: `falhou` significa que a empresa foi criada inativa.',
  })
  @ApiBadRequestResponse({
    description:
      'Payload invalido, ERP desconhecido ou credenciais obrigatorias faltando.',
  })
  @ApiConflictResponse({
    description: 'Ja existe empresa com o account_chatwoot informado.',
  })
  @ApiUnauthorizedResponse({ description: 'Token nao informado ou invalido.' })
  @ApiForbiddenResponse({ description: 'Apenas super administradores.' })
  create(@Body() dto: CreateCompanyDto) {
    return this.companiesService.create(dto);
  }
}
