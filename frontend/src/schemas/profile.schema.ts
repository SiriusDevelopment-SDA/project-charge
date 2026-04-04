import { z } from "zod";

const agentRoleSchema = z.enum(["admin", "operator"]);

export const profileFormSchema = z
  .object({
    name: z.string().trim().min(1, "Informe o nome do usuario."),
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

export const teamAgentFormSchema = z.object({
  name: z.string().trim().min(1, "Preencha o nome do agente."),
  email: z.string().trim().email("Informe um email valido."),
  password: z
    .string()
    .trim()
    .min(6, "A senha do novo agente precisa ter pelo menos 6 caracteres."),
  role: agentRoleSchema,
});

export type ProfileFormValues = z.infer<typeof profileFormSchema>;
export type TeamAgentFormValues = z.infer<typeof teamAgentFormSchema>;
export type AgentRoleValue = z.infer<typeof agentRoleSchema>;
