export async function sendWhatsAppText(to: string, body: string) {
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const token = process.env.WHATSAPP_ACCESS_TOKEN;

  if (!phoneNumberId || !token) {
    console.error('[WA] Missing credentials');
    return;
  }

  const fetchFn = (globalThis as any).fetch as any;
  if (!fetchFn) {
    console.error('[WA] fetch is not available in this runtime');
    return;
  }

  const url = `https://graph.facebook.com/v19.0/${phoneNumberId}/messages`;

  const res = await fetchFn(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to,
      type: 'text',
      text: { body },
    }),
  });

  if (!res.ok) {
    const t = await res.text().catch(() => '');
    console.error('[WA] Send failed', res.status, t);
  }
}
