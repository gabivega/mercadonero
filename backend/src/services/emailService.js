const RESEND_API = 'https://api.resend.com/emails';

async function sendRegistrationEmail(toEmail) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.warn('RESEND_API_KEY not set; skipping registration email');
    return null;
  }

  const payload = {
    from: process.env.RESEND_FROM_EMAIL || 'no-reply@nero.app',
    to: toEmail,
    subject: 'Bienvenido a Nero',
    html: `<p>Hola, bienvenido a Nero. Tu cuenta ha sido creada correctamente.</p>`,
  };

  const res = await fetch(RESEND_API, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Resend API error: ${res.status} ${text}`);
  }

  const data = await res.json();
  return data;
}

export { sendRegistrationEmail };
