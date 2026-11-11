/*
  Envío por la API transaccional de Brevo (un destinatario por llamada, para
  tener un message-id por envío y casar luego los eventos del webhook).
  Docs: POST https://api.brevo.com/v3/smtp/email
*/
export type BrevoMail = {
  sender: { name: string; email: string };
  to: { email: string; name?: string };
  subject: string;
  html: string;
  replyTo?: string | null;
  unsubscribeUrl?: string | null;
  tags?: string[];
};

export async function sendBrevo(apiKey: string, m: BrevoMail): Promise<{ messageId: string }> {
  const headers: Record<string, string> = {};
  if (m.unsubscribeUrl) {
    headers["List-Unsubscribe"] = `<${m.unsubscribeUrl}>`;
    headers["List-Unsubscribe-Post"] = "List-Unsubscribe=One-Click";
  }
  const res = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: { "api-key": apiKey, "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      sender: m.sender,
      to: [m.to.name ? { email: m.to.email, name: m.to.name } : { email: m.to.email }],
      subject: m.subject,
      htmlContent: m.html,
      ...(m.replyTo ? { replyTo: { email: m.replyTo } } : {}),
      ...(Object.keys(headers).length ? { headers } : {}),
      ...(m.tags?.length ? { tags: m.tags } : {}),
    }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Brevo ${res.status}: ${body?.message || body?.code || "error"}`);
  return { messageId: body.messageId || "" };
}

/* Ejecuta tareas con concurrencia limitada. */
export async function pool<T>(items: T[], size: number, fn: (x: T) => Promise<void>) {
  let i = 0;
  const workers = Array.from({ length: Math.min(size, items.length) }, async () => {
    while (i < items.length) await fn(items[i++]);
  });
  await Promise.all(workers);
}
