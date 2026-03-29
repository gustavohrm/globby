import { createStore } from "../../modules/store";

export interface Session {
  id: string;
  secret: string;
}

const store = createStore<Session>("globby_session", { id: "", secret: "" });

export async function getOrCreateSession(): Promise<Session> {
  const stored = store.get();
  if (stored.id && stored.secret) return stored;

  const res = await fetch("/api/v1/users", { method: "POST" });
  const data = (await res.json()) as { id: string; username: string; secret: string };
  const session: Session = { id: data.id, secret: data.secret };
  store.set(session);
  return session;
}
