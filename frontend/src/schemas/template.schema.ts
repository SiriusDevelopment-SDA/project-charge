import { z } from "zod";
import { hasTemplateVariableAtTextEdge } from "../utils/templateVariableTokens";

export const templateCreateSchema = z.object({
  templateName: z
    .string()
    .trim()
    .min(1, "Informe o nome do template.")
    .max(512, "O nome do template pode ter no maximo 512 caracteres."),
  categoryId: z.string().min(1, "Selecione uma categoria."),
  header: z
    .string()
    .max(60, "O cabecalho pode ter no maximo 60 caracteres."),
  body: z
    .string()
    .trim()
    .min(1, "Preencha o corpo do template.")
    .max(1024, "O corpo do template pode ter no maximo 1024 caracteres.")
    .refine(
      (value) => !hasTemplateVariableAtTextEdge(value),
      "A Meta exige texto real antes e depois da variavel. Ponto, espaco ou emoji sozinho no inicio/fim nao contam.",
    ),
  footer: z
    .string()
    .max(60, "O rodape pode ter no maximo 60 caracteres."),
  ctaIds: z
    .array(z.enum(["pay_now", "copy_code"]))
    .max(1, "Escolha apenas um botao para o template."),
  variablesMap: z.object({}).catchall(z.string()),
}).superRefine((data, ctx) => {
  if (
    data.ctaIds.includes("pay_now") &&
    !String(data.variablesMap.link_boleto_pdf ?? "").trim()
  ) {
    ctx.addIssue({
      code: "custom",
      path: ["variablesMap", "link_boleto_pdf"],
      message: "Preencha a amostra do link do boleto para o botao Pagar agora.",
    });
  }
});

export type TemplateCreateFormValues = z.infer<typeof templateCreateSchema>;
