import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Company } from './entities/companies';

export type CompanyListItem = {
  id: string;
  name: string;
  account_chatwoot: string;
  label: string;
  active: boolean;
};

@Injectable()
export class CompaniesService {
  private readonly logger = new Logger(CompaniesService.name);

  constructor(
    @InjectRepository(Company)
    private readonly companyRepository: Repository<Company>,
  ) {}

  /**
   * Lista todas as empresas ativas que possuem ERP configurado. Endpoint
   * restrito a super_admin (ver SuperAdminGuard) — e a unica leitura que
   * ignora o filtro padrao de companyId aplicado no restante do sistema.
   *
   * Filtro de ERP: empresas sem ERP (coluna `erp` nula, vazia ou apenas
   * espacos — ex.: a "Empresa Local" account_chatwoot '1') sao empresas de
   * teste sem dados reais e NAO devem aparecer no switch de empresa.
   * Por isso filtramos `erp IS NOT NULL AND TRIM(erp) <> ''` direto no banco.
   * Este filtro e EXCLUSIVO da listagem: findActiveById e
   * findActiveByChatwootAccount continuam encontrando qualquer empresa ativa.
   *
   * Importante: NUNCA retornar tokens sensiveis daqui
   * (token_system_coraxy, token_notificameHub, acess_token_agentbot_chatwoot,
   *  autorization, config).
   */
  async listAll(): Promise<CompanyListItem[]> {
    const companies = await this.companyRepository
      .createQueryBuilder('company')
      .select([
        'company.id',
        'company.name',
        'company.account_chatwoot',
        'company.label',
        'company.active',
      ])
      .where('company.active = :active', { active: true })
      .andWhere('company.erp IS NOT NULL')
      .andWhere("TRIM(company.erp) <> ''")
      .orderBy('company.name', 'ASC')
      .getMany();

    this.logger.log(
      `[listAll] retornadas ${companies.length} empresa(s) ativa(s) com ERP.`,
    );

    return companies.map((company) => ({
      id: company.id,
      name: company.name,
      account_chatwoot: company.account_chatwoot,
      label: company.label,
      active: company.active,
    }));
  }

  /**
   * Busca uma empresa ativa pelo id. Retorna null se nao encontrada ou
   * inativa. Selecionar somente os campos seguros (sem tokens sensiveis)
   * — usado pelo switch-company no AuthService.
   */
  async findActiveById(id: string): Promise<CompanyListItem | null> {
    const company = await this.companyRepository.findOne({
      where: { id, active: true },
      select: {
        id: true,
        name: true,
        account_chatwoot: true,
        label: true,
        active: true,
      },
    });

    if (!company) {
      return null;
    }

    return {
      id: company.id,
      name: company.name,
      account_chatwoot: company.account_chatwoot,
      label: company.label,
      active: company.active,
    };
  }

  /**
   * Busca a Company completa (entidade) por account_chatwoot, somente se
   * estiver ativa. Diferente de findActiveById, NAO sanitiza — retorna a
   * entidade Company crua porque o login (buildAuthResponse) precisa dos
   * campos `config` (para extractPagePermissions) e `account_chatwoot`.
   *
   * Usado pelo AuthService para resolver a empresa default do super_admin
   * (Fibras do Rio = account_chatwoot '4') no primeiro acesso.
   */
  async findActiveByChatwootAccount(
    accountChatwoot: string,
  ): Promise<Company | null> {
    const normalized = String(accountChatwoot ?? '').trim();
    if (!normalized) {
      return null;
    }

    const company = await this.companyRepository.findOne({
      where: { account_chatwoot: normalized, active: true },
      select: {
        id: true,
        name: true,
        account_chatwoot: true,
        active: true,
        config: true,
      },
    });

    return company ?? null;
  }
}
