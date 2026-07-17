import { createClient } from 'jsr:@supabase/supabase-js@2';

// Rate limiting en memoria: máx 10 solicitudes por IP por minuto.
const WINDOW_MS = 60_000;
const MAX = 10;
const hits = new Map<string, number[]>();

// Headers de seguridad compartidos: se usan en TODAS las respuestas (200/400/401/403/429/500).
const HEADERS = { 'Content-Type': 'application/json', 'X-Content-Type-Options': 'nosniff' };

function rateLimited(ip: string): boolean {
  const now = Date.now();
  const prev = (hits.get(ip) ?? []).filter((t) => now - t < WINDOW_MS);
  prev.push(now);
  hits.set(ip, prev);
  return prev.length > MAX;
}

Deno.serve(async (req: Request) => {
  const ip = req.headers.get('x-forwarded-for') ?? 'desconocida';

  // Autorización: el llamador debe traer su JWT (lo agrega automáticamente
  // supabase.functions.invoke() cuando hay sesión activa en la app).
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) {
    return new Response(JSON.stringify({ error: 'Falta autenticación' }), {
      status: 401,
      headers: HEADERS,
    });
  }

  // Cliente "anon + JWT del llamador": solo sirve para averiguar quién llama
  // y para leer datos que la RLS ya le permite ver a ese usuario (sus propios mensajes).
  // NUNCA se usa para leer push_tokens ajenos.
  const callerClient = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } } },
  );

  const { data: userData, error: userError } = await callerClient.auth.getUser();
  if (userError || !userData?.user) {
    return new Response(JSON.stringify({ error: 'Falta autenticación' }), {
      status: 401,
      headers: HEADERS,
    });
  }
  const caller = userData.user;

  if (rateLimited(ip)) {
    console.warn(`rate limit excedido para IP ${ip}`);
    return new Response(JSON.stringify({ error: 'Demasiadas solicitudes' }), {
      status: 429,
      headers: HEADERS,
    });
  }

  try {
    const { toUserId, title, body } = await req.json();
    if (!toUserId || !title) {
      return new Response(JSON.stringify({ error: 'Faltan datos' }), {
        status: 400,
        headers: HEADERS,
      });
    }

    // service_role SOLO existe aquí (variables de entorno de la función), nunca en la app.
    // Se usa exclusivamente para leer push_tokens del destinatario (requiere saltarse RLS);
    // todo lo demás (identidad del llamador, relación con el destinatario) se resuelve
    // con el cliente "anon + JWT" de arriba.
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // Relación: el llamador solo puede pedir un push a alguien con quien ya tiene
    // una conversación (al menos un mensaje enviado por él hacia ese destinatario).
    // Esto evita spam de push arbitrario hacia cualquier usuario.
    const { data: existingMessage, error: relationError } = await callerClient
      .from('messages')
      .select('id')
      .eq('from_user', caller.id)
      .eq('to_user', toUserId)
      .limit(1);

    if (relationError || !existingMessage || existingMessage.length === 0) {
      return new Response(JSON.stringify({ error: 'Sin conversación con ese usuario' }), {
        status: 403,
        headers: HEADERS,
      });
    }

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
      headers: HEADERS,
    });
  } catch (e) {
    console.error('error en send-push', e);
    return new Response(JSON.stringify({ error: 'Error interno' }), {
      status: 500,
      headers: HEADERS,
    });
  }
});
