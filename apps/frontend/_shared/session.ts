export const SESSION_KEY = 'globby_session';

export interface Session {
  id: string;
  secret: string;
}

export async function getOrCreateSession(): Promise<Session> {
  const raw = localStorage.getItem(SESSION_KEY);
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as Session;
      if (parsed.id && parsed.secret) return parsed;
    } catch {
      // corrupted storage — fall through to create new session
    }
  }

  const res = await fetch('/api/v1/users', { method: 'POST' });
  const data = (await res.json()) as { id: string; username: string; secret: string };
  const session: Session = { id: data.id, secret: data.secret };
  localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  return session;
}
