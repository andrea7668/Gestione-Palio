import { createClient } from '@supabase/supabase-js';

export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export async function chiama(body: object) {
  const { data } = await supabase.auth.getSession();
  try {
    const r = await fetch('/api/partite', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ...body, access_token: data.session?.access_token }),
    });
    const j = await r.json().catch(() => ({}));
    return { ok: r.ok, ...j, error: r.ok ? undefined : (j.error ?? 'Errore del server (' + r.status + ')') };
  } catch {
    return { ok: false, error: 'Connessione assente, riprova.' };
  }
}
