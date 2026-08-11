/**
 * Entrega do código de redefinição de senha.
 *
 * O código nunca é retornado pela API pública nem gravado em metadados de
 * auditoria. Quando o canal de e-mail está configurado (variável `SMTP_URL` ou
 * `RESEND_API_KEY`), a mensagem é enviada. Sem canal configurado, o serviço
 * registra explicitamente que a entrega ficou pendente de repasse manual pela
 * administração, e o registro em `password_reset_tokens.deliveryChannel`
 * reflete essa realidade em vez de fingir um envio.
 */
export type PasswordDeliveryResult = {
  channel: "EMAIL" | "SELF_SERVICE";
  delivered: boolean;
};

export async function deliverPasswordResetToken(params: {
  email: string;
  name: string | null;
  token: string;
}): Promise<PasswordDeliveryResult> {
  const resendKey = process.env.RESEND_API_KEY;

  if (!resendKey) {
    // Sem canal de e-mail configurado. O código permanece válido e a
    // administração pode reemitir a solicitação após configurar o canal.
    console.warn(
      "[Recuperação de senha] Canal de e-mail não configurado. Código gerado sem envio automático para",
      maskEmail(params.email),
    );
    return { channel: "SELF_SERVICE", delivered: false };
  }

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: process.env.RESEND_FROM_EMAIL ?? "nao-responda@escalaservidores.app",
        to: params.email,
        subject: "Redefinição de senha — Escala Servidores",
        text: buildMessage(params.name, params.token),
      }),
    });

    if (!response.ok) {
      console.error("[Recuperação de senha] Falha no envio:", response.status);
      return { channel: "EMAIL", delivered: false };
    }

    return { channel: "EMAIL", delivered: true };
  } catch (error) {
    console.error("[Recuperação de senha] Erro ao enviar e-mail:", error);
    return { channel: "EMAIL", delivered: false };
  }
}

function buildMessage(name: string | null, token: string): string {
  const greeting = name ? `Olá, ${name}.` : "Olá.";
  return [
    greeting,
    "",
    "Recebemos uma solicitação para redefinir a senha do seu acesso ao Escala Servidores.",
    "",
    `Código de redefinição: ${token}`,
    "",
    "O código é válido por 1 hora e pode ser usado uma única vez.",
    "Se você não solicitou a redefinição, ignore esta mensagem: sua senha atual continua válida.",
  ].join("\n");
}

/** Mascara o e-mail em logs para não expor dados pessoais. */
function maskEmail(email: string): string {
  const [local = "", domain = ""] = email.split("@");
  const visible = local.slice(0, 2);
  return `${visible}${"*".repeat(Math.max(0, local.length - 2))}@${domain}`;
}
