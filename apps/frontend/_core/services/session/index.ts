import { createStore } from "../../modules/store";

export interface Session {
  id: string;
  secret: string;
}

// empty strings are falsy — the guard below relies on this
const store = createStore<Session>("globby_session", { id: "", secret: "" });

export async function getOrCreateSession(): Promise<Session> {
  const stored = store.get();
  if (stored.id && stored.secret) return stored;

  const res = await fetch("/api/v1/users", { method: "POST" });
  if (!res.ok) throw new Error(`Failed to create user: ${res.status}`);
  const data = (await res.json()) as { id: string; username: string; secret: string };
  // username is not stored — it can change and is fetched fresh when needed
  const session: Session = { id: data.id, secret: data.secret };
  store.set(session);
  return session;
}
