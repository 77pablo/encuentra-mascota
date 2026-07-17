import { createClient } from 'jsr:@supabase/supabase-js@2';

// Rate limiting en memoria: máx 10 solicitudes por IP por minuto.
const WINDOW_MS = 60_000;
const MAX = 10;
const hits = new Map<string, number[]>();

function rateLimited(ip: string): boolean {
  const now = Date.now();
  const prev = (hits.get(ip) ?? []).filter((t) => now - t < WINDOW_MS);
  prev.push(now);
  hits.set(ip, prev);
  return prev.length > MAX;
}

Deno.serve(async (req: Request) => {
  const ip = req.headers.get('x-forwarded-for') ?? 'desconocida';
  if (rateLimited(ip)) {
    console.warn(`rate limit excedido para IP ${ip}`);
    return new Response(JSON.stringify({ error: 'Demasiadas solicitudes' }), {
      status: 429,
      headers: { 'Content-Type': 'application/json', 'X-Content-Type-Options': 'nosniff' },
    });
  }

  try {
    const { toUserId, title, body } = await req.json();
    if (!toUserId || !title) {
      return new Response(JSON.stringify({ error: 'Faltan datos' }), { status: 400 });
    }

    // service_role SOLO existe aquí (variables de entorno de la función), nunca en la app.
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const { data: tokens } = await supabase
      .from('push_tokens')
      .select('token')
      .eq('user_id', toUserId);

    const messages = (tokens ?? []).map((t) => ({ to: t.token, title, body: body ?? '' }));
    if (messages.length > 0) {
      await fetch('https://exp.host/--/api/v2/push/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(messages),
      });
    }

    return new Response(JSON.stringify({ ok: true, enviados: messages.length }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', 'X-Content-Type-Options': 'nosniff' },
    });
  } catch (e) {
    console.error('error en send-push', e);
    return new Response(JSON.stringify({ error: 'Error interno' }), { status: 500 });
  }
});
