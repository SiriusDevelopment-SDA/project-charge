import { z } from "zod";

const agentRoleSchema = z.enum(["admin", "operator", "super_admin"]);

export const profileFormSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(1, "Informe o nome do usuario.")
      .max(30, "O nome deve ter no máximo 30 caracteres."),
    email: z.string().trim().email("Email invalido."),
    currentPassword: z.string().optional().default(""),
    newPassword: z.string().optional().default(""),
    confirmPassword: z.string().optional().default(""),
  })
  .superRefine((data, ctx) => {
    const currentPassword = data.currentPassword.trim();
    const newPassword = data.newPassword.trim();
    const confirmPassword = data.confirmPassword.trim();
    const hasPasswordChange = Boolean(currentPassword || newPassword || confirmPassword);

    if (!hasPasswordChange) {
      return;
    }

    if (!currentPassword) {
      ctx.addIssue({
        code: "custom",
        path: ["currentPassword"],
        message: "Informe a senha atual.",
      });
    }

    if (!newPassword) {
      ctx.addIssue({
        code: "custom",
        path: ["newPassword"],
        message: "Informe a nova senha.",
      });
    }

    if (newPassword && newPassword.length < 6) {
      ctx.addIssue({
        code: "custom",
        path: ["newPassword"],
        message: "A nova senha precisa ter pelo menos 6 caracteres.",
      });
    }

    if (newPassword !== confirmPassword) {
      ctx.addIssue({
        code: "custom",
        path: ["confirmPassword"],
        message: "A confirmacao da nova senha nao confere.",
      });
    }
  });

// Regras de senha do Chatwoot (aplicadas onde a senha é enviada a ele — criar
// agente e redefinir senha): mínimo 6, 1 maiúscula, 1 minúscula e 1 caractere
// especial. Validar aqui evita o usuário só descobrir no erro 422 do chat.
const chatwootPasswordSchema = z
  .string()
  .trim()
  .min(6, "A senha precisa ter pelo menos 6 caracteres.")
  .regex(/[A-Z]/, "Inclua pelo menos 1 letra maiuscula (A-Z).")
  .regex(/[a-z]/, "Inclua pelo menos 1 letra minuscula (a-z).")
  .regex(/[^A-Za-z0-9\s]/, "Inclua pelo menos 1 caractere especial (ex.: !@#$%).");

export const teamAgentFormSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(1, "Preencha o nome do agente.")
      .max(30, "O nome deve ter no máximo 30 caracteres."),
    email: z.string().trim().email("Informe um email valido."),
    password: chatwootPasswordSchema,
    confirmPassword: z.string().trim().min(1, "Repita a senha."),
    role: agentRoleSchema,
  })
  .superRefine((data, ctx) => {
    if (data.password !== data.confirmPassword) {
      ctx.addIssue({
        code: "custom",
        path: ["confirmPassword"],
        message: "A confirmacao da senha nao confere.",
      });
    }
  });

export const resetAgentPasswordFormSchema = z
  .object({
    newPassword: chatwootPasswordSchema,
    confirmPassword: z.string().trim().min(1, "Repita a nova senha."),
  })
  .superRefine((data, ctx) => {
    if (data.newPassword !== data.confirmPassword) {
      ctx.addIssue({
        code: "custom",
        path: ["confirmPassword"],
        message: "A confirmacao da nova senha nao confere.",
      });
    }
  });

export const chatwootConfigFormSchema = z.object({
  chatwootAdminToken: z.string().trim().default(""),
  teamChargeId: z.string().trim().default(""),
});

export type ProfileFormValues = z.infer<typeof profileFormSchema>;
export type ResetAgentPasswordFormValues = z.infer<typeof resetAgentPasswordFormSchema>;
export type TeamAgentFormValues = z.infer<typeof teamAgentFormSchema>;
export type AgentRoleValue = z.infer<typeof agentRoleSchema>;
export type ChatwootConfigFormValues = z.infer<typeof chatwootConfigFormSchema>;
