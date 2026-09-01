import { applyDecorators } from '@nestjs/common';
import { Transform, TransformFnParams } from 'class-transformer';
import { IsOptional } from 'class-validator';

/**
 * AUSENCIA DISFARCADA DE VALOR, num lugar so.
 *
 * Um chamador de maquina nao omite campo: ele manda o registro inteiro e
 * preenche com o que tem. O que ele nao tem viaja como `null` — ou, dependendo
 * de quem serializou, como `""`. Os dois querem dizer a MESMA coisa que omitir:
 * "nao estou pedindo alteracao neste campo".
 *
 * O `@IsOptional()` do class-validator pula a validacao para `null` e para
 * `undefined`. Ele NAO converte um no outro: o `null` atravessa o DTO intacto e
 * chega ao service, que decide campo a campo com `if (dto.campo !== undefined)`.
 * Como `null !== undefined` e verdadeiro, o `if` entra e o metodo de string
 * estoura:
 *
 *   TypeError: Cannot read properties of null (reading 'trim')
 *
 * Isso e HTTP 500 — erro NOSSO — para um payload que nao pedia nada. E os
 * desfechos calados eram piores que o 500: `url: null` normalizava para `""` e
 * apagava o host do ERP; `plano: null` gravava plano nulo e devolvia a empresa
 * ao modelo legado, onde a AUSENCIA LIBERA — dashboard, clientes vencidos e
 * chat sem ninguem ter vendido, com 200 na resposta.
 *
 * POR QUE NORMALIZAR NO DTO, E NAO NO SERVICE NEM GLOBALMENTE
 *
 * No DTO porque e a fronteira: depois dela o resto do backend continua podendo
 * ler `undefined` como "nao veio", que e a convencao que ja existia. Espalhar
 * `!= null` pelos `if` do service resolveria o mesmo caso em varios lugares, e
 * cada campo novo nasceria com a chance de esquecer um.
 *
 * NAO globalmente (um pipe que remove `null` do body de toda a API) porque
 * `null` e valor LEGITIMO em outros lugares — apagar um campo, encerrar uma
 * data, desassociar um registro. Uma limpeza global mudaria o significado de
 * endpoints que ninguem revisou, e o sintoma seria "o campo nao limpa mais",
 * sem erro nenhum apontando para a causa.
 *
 * QUAL DOS DOIS USAR
 *
 * - `CampoOpcional()`: normaliza `null` e apara os espacos das pontas, mas NAO
 *   converte vazio em ausencia. Para campo onde `""` tem significado proprio a
 *   preservar — seja "limpa" (`teamChargeId`), seja "400" (`name`, `url`,
 *   `token_system_coraxy`, `crm_company_id`). E o `trim` que faz `"   "` chegar
 *   ao `@IsNotEmpty()` como vazio, em vez de passar por ele.
 * - `TextoOpcional()`: normaliza `null` E `""`. Para campo de texto onde limpar
 *   nao e uma operacao valida — `cnpj` e `token_notificameHub` (colunas NOT
 *   NULL) e as chaves PIX (`order_pix_key` e o tipo dela) —, logo um vazio so
 *   pode ser ruido do chamador.
 * - `textoAparado` solto, em campo OBRIGATORIO: apara e deixa o vazio para o
 *   `@IsNotEmpty()` do proprio campo recusar. Nao ha o que compor ali, porque
 *   campo obrigatorio nao leva `@IsOptional()`.
 *
 * O QUE NENHUM DOS DOIS FAZ
 *
 * Afrouxar validacao de valor COM conteudo. Depois do transform o campo esta
 * `undefined` — e a validacao nem roda —, vazio (e ai quem decide e o
 * `@IsNotEmpty()` do proprio campo), ou com conteudo, e nesse caso todos os
 * decorators seguintes valem igual: CNPJ com digito verificador errado continua
 * 400, plano fora da lista continua 400.
 *
 * O unico efeito do `trim` sobre valor com conteudo e deixar de recusar por
 * causa dos espacos: `plano: " cobranca "` passa a ser aceito como
 * `"cobranca"`, que e o que quem enviou quis dizer. E a mesma normalizacao que
 * o service ja fazia depois (`dto.name.trim()`), agora antes da validacao em
 * vez de depois dela.
 *
 * E nao servem para campo OBRIGATORIO. La `null` precisa ser 400 nomeando o
 * campo: ignorar um obrigatorio trocaria um 500 visivel por empresa criada pela
 * metade em silencio, que e pior. Campo obrigatorio nao leva `@IsOptional()`,
 * entao ja recusa `null` pelo proprio `@IsString()`/`@IsIn()`.
 */

/** `null` vira `undefined`. Qualquer outro valor passa intacto. */
export function nuloComoAusente({ value }: TransformFnParams): unknown {
  return value === null ? undefined : value;
}

/**
 * `null` vira `undefined`, e texto perde os espacos das pontas. `"   "` vira
 * `""` — de proposito, para que o `@IsNotEmpty()` do campo o RECUSE.
 *
 * O `@IsNotEmpty()` do class-validator so reprova `""`, `null` e `undefined`:
 * `"   "` passava inteiro por ele, e o service gravava o resultado do `.trim()`
 * — nome de empresa vazio, host de ERP vazio, token vazio, tudo com 200 na
 * resposta. Aparar ANTES da validacao transforma o espaco em branco naquilo que
 * ele sempre foi: campo vazio.
 *
 * Serve solto (`@Transform(textoAparado)`) em campo OBRIGATORIO, onde nao ha
 * `@IsOptional()` para compor, e como base dos dois decorators abaixo.
 */
export function textoAparado(params: TransformFnParams): unknown {
  const valor = nuloComoAusente(params);
  return typeof valor === 'string' ? valor.trim() : valor;
}

/**
 * `null`, `""` e `"   "` viram `undefined`; texto com conteudo volta sem os
 * espacos das pontas.
 *
 * Passa pelo `nuloComoAusente` de proposito: o tratamento de `null` e um so no
 * projeto inteiro, e nao dois caminhos que podem divergir.
 *
 * ORDEM: o `@Transform` roda em `plainToInstance`, que o ValidationPipe executa
 * ANTES de `validateSync`. O validador nunca chega a ver a string vazia — sem
 * isso, `CnpjValidoConstraint` reprovaria com "encontrei 0 digitos".
 */
export function vazioComoAusente(params: TransformFnParams): unknown {
  const valor = textoAparado(params);
  return valor === '' ? undefined : valor;
}

/**
 * Campo opcional em que `null` vale como CAMPO NAO ENVIADO.
 *
 * `@IsOptional()` e o `@Transform` precisam andar juntos: sozinho, o
 * `@IsOptional()` deixa o `null` passar para o service, e sozinho o
 * `@Transform` faria o campo ser validado como `undefined`. Compor os dois num
 * decorator so e o que impede que um campo novo receba metade da regra.
 */
export function CampoOpcional() {
  return applyDecorators(IsOptional(), Transform(textoAparado));
}

/**
 * Campo de TEXTO opcional em que `null` e vazio valem como CAMPO NAO ENVIADO.
 *
 * Use somente onde limpar o campo nunca foi um resultado alcancavel — do
 * contrario o `""` de quem queria limpar seria engolido em silencio.
 */
export function TextoOpcional() {
  return applyDecorators(IsOptional(), Transform(vazioComoAusente));
}
