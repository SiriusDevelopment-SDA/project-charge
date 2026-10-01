import {
  ValidationArguments,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';

/**
 * Validacao de CNPJ para o cadastro de empresa.
 *
 * POR QUE ISTO EXISTE
 *
 * A coluna `cnpj` nao e enfeite cadastral: e a origem historica da chave PIX de
 * recebimento (`resolverChavePix`, em `companies/config.contract.ts`). Empresa
 * sem `order_pix_key` configurada cobra no proprio CNPJ, com `keyType: 'CNPJ'`.
 *
 * Isso define o modo de falha de um CNPJ errado, e ele e o pior possivel: o
 * NotificaMe aceita o disparo e devolve `status: queued` com HTTP 200; quem
 * recusa e a Meta ou o PSP, depois, sem retorno para o operador. A mensagem
 * simplesmente nunca chega, ou chega com um codigo PIX que nao paga ninguem.
 * Um digito trocado no cadastro so aparece semanas depois, como cobranca que
 * "sumiu".
 *
 * POR QUE OS DIGITOS VERIFICADORES SAO CONFERIDOS
 *
 * Contar 14 digitos pega "123" e "abc", mas nao pega o erro que de fato
 * acontece: dois digitos trocados de lugar por quem digita. O DV pega, e custa
 * uma funcao pura. As 5 empresas que ja tem CNPJ no banco passam todas — a
 * conferencia foi rodada contra os dados reais antes de ser adotada, entao ela
 * nao rejeita nada que ja esteja cadastrado.
 *
 * A sequencia repetida (`00000000000000`, `11111111111111`, ...) e recusada a
 * parte porque ela PASSA no calculo do DV — a soma ponderada de 14 zeros da
 * zero, e o DV esperado tambem. Sem essa recusa, o placeholder mais provavel de
 * todos entraria como CNPJ valido, que e exatamente o que este campo
 * obrigatorio existe para impedir.
 *
 * ONDE A VALIDACAO RODA
 *
 * Sobre o valor CRU, normalizando por dentro apenas para conferir. Nao ha
 * `@Transform` limpando o campo antes: se houvesse, "abc" chegaria aqui como
 * string vazia e seria indistinguivel de campo ausente — o operador que digitou
 * letra receberia "cnpj e obrigatorio" e nao entenderia. Quem grava o valor
 * limpo continua sendo `companies.service.ts`, que ja fazia `replace(/\D/g,'')`
 * antes desta mudanca. Por isso "11.222.333/0001-81" e ACEITO: a pontuacao e
 * ignorada aqui e removida la.
 *
 * LIMITE CONHECIDO
 *
 * So aceita CNPJ NUMERICO. O CNPJ alfanumerico (12 posicoes com letras + 2
 * digitos verificadores) tem outro calculo de DV, baseado no valor ASCII do
 * caractere. Quando a primeira empresa com CNPJ alfanumerico aparecer, este
 * arquivo precisa mudar junto — o contrato de hoje, em `CreateCompanyDto`, e
 * "exatamente 14 digitos".
 */

/** Deixa so os digitos. Nao-string vira string vazia. */
export function digitosCnpj(valor: unknown): string {
  return typeof valor === 'string' ? valor.replace(/\D/g, '') : '';
}

/**
 * 14 digitos, nao todos iguais, com os dois digitos verificadores conferindo.
 * Aceita o valor com ou sem pontuacao — normaliza antes de conferir.
 */
export function cnpjValido(valor: unknown): boolean {
  const digitos = digitosCnpj(valor);

  if (!/^\d{14}$/.test(digitos)) return false;
  if (/^(\d)\1{13}$/.test(digitos)) return false;

  const dv = (base: string, pesoInicial: number): number => {
    let peso = pesoInicial;
    let soma = 0;
    for (const caractere of base) {
      soma += Number(caractere) * peso;
      peso = peso === 2 ? 9 : peso - 1;
    }
    const resto = soma % 11;
    return resto < 2 ? 0 : 11 - resto;
  };

  const primeiro = dv(digitos.slice(0, 12), 5);
  const segundo = dv(digitos.slice(0, 12) + primeiro, 6);

  return digitos.slice(12) === `${primeiro}${segundo}`;
}

/**
 * Constraint usada com `@Validate(CnpjValidoConstraint)`.
 *
 * A mensagem diz qual dos quatro problemas ocorreu, porque "cnpj invalido" nao
 * ajuda ninguem a corrigir: quem cadastra precisa saber se faltou digito, se
 * mandou letra ou se errou o numero. Nenhuma mensagem devolve o valor recebido
 * de volta — so a contagem de digitos.
 */
@ValidatorConstraint({ name: 'cnpjValido', async: false })
export class CnpjValidoConstraint implements ValidatorConstraintInterface {
  validate(valor: unknown): boolean {
    return cnpjValido(valor);
  }

  defaultMessage(args: ValidationArguments): string {
    const campo = args.property;
    const valor: unknown = args.value;

    if (valor === undefined || valor === null) {
      return `${campo} e obrigatorio: informe os 14 digitos do CNPJ da empresa. E a chave PIX usada na cobranca quando nenhuma outra e configurada.`;
    }

    if (typeof valor !== 'string') {
      return `${campo} deve ser enviado como texto entre aspas — numero perde o zero a esquerda.`;
    }

    if (valor.trim() === '') {
      return `${campo} e obrigatorio: informe os 14 digitos do CNPJ da empresa. E a chave PIX usada na cobranca quando nenhuma outra e configurada.`;
    }

    const digitos = digitosCnpj(valor);
    if (digitos.length !== 14) {
      return `${campo} deve ter exatamente 14 digitos; encontrei ${digitos.length}. Pontuacao e aceita e removida ("11.222.333/0001-81"); letra nao conta como digito.`;
    }

    return `${campo} invalido: os digitos verificadores nao conferem. Confira o numero — CNPJ errado vira chave PIX errada e a cobranca nao chega.`;
  }
}
