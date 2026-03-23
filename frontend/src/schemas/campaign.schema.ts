import { z } from "zod";

export const campaignSchema = z
  .object({
    name: z.string().min(1, "Nome da campanha é obrigatório!"),
    templateId: z.string().min(1, "Template é obrigatório!"),
    categoryId: z.string().min(1, "Categoria é obrigatória!"),
    recurringType: z.enum(["single", "range", "monthly_days"]),
    startDate: z.coerce.date({ message: "Escolha um dia na agenda." }).optional(),
    endDate: z.coerce
      .date({ message: "Escolha um dia para finalizar a campanha!" })
      .optional(),
    recurringDays: z
      .array(z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data recorrente inválida"))
      .optional(),
    dispatchTime: z
      .string()
      .regex(/^([0-1]\d|2[0-3]):([0-5]\d)$/, "Horário inválido"),
    clientIds: z.array(z.string()).min(1, "Selecione pelo menos um cliente"),
  })
  .superRefine((data, ctx) => {
    const now = new Date();
    now.setSeconds(0, 0);

    if (data.recurringType === "monthly_days") {
      if (!data.recurringDays || data.recurringDays.length === 0) {
        ctx.addIssue({
          code: "custom",
          path: ["recurringDays"],
          message: "Selecione pelo menos uma data para o disparo.",
        });
        return;
      }

      if (data.recurringDays.length > 1) {
        ctx.addIssue({
          code: "custom",
          path: ["recurringDays"],
          message: "Selecione apenas uma data para o disparo.",
        });
        return;
      }

      if (!data.startDate || !data.endDate) {
        ctx.addIssue({
          code: "custom",
          path: ["recurringDays"],
          message: "Selecione ao menos uma data para o disparo.",
        });
        return;
      }

      if (data.endDate < data.startDate) {
        ctx.addIssue({
          code: "custom",
          path: ["endDate"],
          message: "A última data precisa ser igual ou maior que a primeira data selecionada.",
        });
      }

      return;
    }

    if (!data.startDate) {
      ctx.addIssue({
        code: "custom",
        path: ["startDate"],
        message: "Escolha um dia na agenda.",
      });
      return;
    }

    const today = new Date(now);
    today.setHours(0, 0, 0, 0);
    const startDay = new Date(data.startDate);
    startDay.setHours(0, 0, 0, 0);

    if (startDay < today) {
      ctx.addIssue({
        code: "custom",
        path: ["startDate"],
        message: "Defina uma data maior que a data atual!",
      });
    }

    if (data.recurringType === "range") {
      if (!data.endDate) {
        ctx.addIssue({
          code: "custom",
          path: ["endDate"],
          message: "Escolha uma data final para campanha recorrente.",
        });
      } else if (data.endDate <= data.startDate) {
        ctx.addIssue({
          code: "custom",
          path: ["endDate"],
          message: "A data final precisa ser maior que a data inicial.",
        });
      }
    }

    const [hour, minute] = data.dispatchTime.split(":").map(Number);
    const dispatchDate = new Date(data.startDate);
    dispatchDate.setHours(hour, minute, 0, 0);

    if (dispatchDate.getTime() - now.getTime() < 59 * 60 * 1000) {
      ctx.addIssue({
        code: "custom",
        path: ["dispatchTime"],
        message:
          "O horário de disparo deve conter o mínimo 1 hora a frente do horário atual.",
      });
    }
  });

export const campaignFormSchema = z
  .object({
    isRecurring: z.boolean(),
    dispatchDate: z.string().min(10, "Data é obrigatória para alteração!"),
    endDate: z
      .string()
      .min(10, "Data de finalização da campanha é obrigatória para alteração!"),
    dispatchTime: z
      .string()
      .min(4, "Horário de disparo é obrigatório para alteração!"),
    note: z.string().optional(),
  })
  .refine(
    (data) => {
      if (!data.dispatchDate || !data.endDate) return true;
      const [d1, m1, y1] = data.dispatchDate.split("/");
      const [d2, m2, y2] = data.endDate.split("/");
      return new Date(+y2, +m2 - 1, +d2) >= new Date(+y1, +m1 - 1, +d1);
    },
    {
      message:
        "Data de finalização deve ser igual ou maior que a data de início!",
      path: ["endDate"],
    },
  );

export type CampaignFormValues = z.infer<typeof campaignFormSchema>;

export const mapVarsSchema = z.object({
  nome_cliente: z.string().min(1, "Nome do cliente é obrigatório"),
  whatsapp: z.string().min(1, "Whatsapp do cliente é obrigatório"),
  cnpj_cpf: z.string().min(1, "CNPJ/CPF é obrigatório"),
  numero_contrato: z.string().min(1, "Número do contrato é obrigatório"),
  valor_fatura: z.string().min(1, "Valor da fatura é obrigatório"),
  linha_digitavel_boleto: z.string().min(1, "Linha digitável é obrigatória"),
  link_boleto_pdf: z.string().min(1, "Link do boleto é obrigatório"),
});
