import { generateUsername, generateUsernameWithSuffix } from "./username";

export type User = {
  id: string;
  username: string;
  displayName: string | null;
  secret: string;
  isPublic: boolean;
  createdAt: string;
};

export type PublicUser = Pick<User, "id" | "username" | "displayName" | "isPublic">;

export type LobbyUser = Pick<User, "id" | "username" | "displayName">;

function userKey(id: string): string {
  return `user:${id}`;
}

const LOBBY_KEY = "lobby:users";

export async function getUser(
  kv: KVNamespace,
  id: string,
): Promise<User | null> {
  const raw = await kv.get(userKey(id));
  if (!raw) return null;
  return JSON.parse(raw) as User;
}

export async function createUser(kv: KVNamespace): Promise<User> {
  const id = crypto.randomUUID();
  const secret = crypto.randomUUID();

  // Try plain username first, fall back to suffixed on collision
  let username = generateUsername();
  const existing = await kv.get(`username:${username}`);
  if (existing) {
    username = generateUsernameWithSuffix();
  }

  const user: User = {
    id,
    username,
    displayName: null,
    secret,
    isPublic: false,
    createdAt: new Date().toISOString(),
  };

  await kv.put(userKey(id), JSON.stringify(user));
  await kv.put(`username:${username}`, id);

  return user;
}

export async function updateUser(
  kv: KVNamespace,
  user: User,
  patch: { displayName?: string | null; isPublic?: boolean },
): Promise<User> {
  const wasPublic = user.isPublic;
  const updated: User = {
    ...user,
    ...(patch.displayName !== undefined && { displayName: patch.displayName }),
    ...(patch.isPublic !== undefined && { isPublic: patch.isPublic }),
  };

  await kv.put(userKey(updated.id), JSON.stringify(updated));

  // Update lobby index if isPublic changed
  if (patch.isPublic !== undefined && patch.isPublic !== wasPublic) {
    const raw = await kv.get(LOBBY_KEY);
    const index: string[] = raw ? (JSON.parse(raw) as string[]) : [];

    const newIndex = patch.isPublic
      ? [...index, updated.id]
      : index.filter((uid) => uid !== updated.id);

    await kv.put(LOBBY_KEY, JSON.stringify(newIndex));
  }

  return updated;
}

export async function getLobbyUsers(kv: KVNamespace): Promise<LobbyUser[]> {
  const raw = await kv.get(LOBBY_KEY);
  if (!raw) return [];

  const ids = JSON.parse(raw) as string[];
  const users = await Promise.all(ids.map((id) => getUser(kv, id)));

  return users
    .filter((u): u is User => u !== null)
    .map(({ id, username, displayName }) => ({ id, username, displayName }));
}

export function toPublicProfile(
  user: User,
): Pick<User, "id" | "username" | "displayName" | "isPublic"> {
  return {
    id: user.id,
    username: user.username,
    displayName: user.displayName,
    isPublic: user.isPublic,
  };
}
