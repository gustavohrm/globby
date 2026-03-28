const SESSION_KEY = 'globby_session';

interface Session {
  id: string;
  secret: string;
}

interface LobbyUser {
  id: string;
  username: string;
  displayName: string | null;
}

function escapeHtml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

async function getOrCreateSession(): Promise<Session> {
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

function avatarText(username: string): string {
  return username.slice(0, 2).toUpperCase();
}

function renderLobby(users: LobbyUser[]): string {
  if (users.length === 0) {
    return '<p class="text-text-secondary">No one in the lobby yet.</p>';
  }
  const rows = users
    .map(
      (u) => `
      <li class="flex items-center gap-3 rounded-lg bg-foreground p-3">
        <div class="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-contrast">
          ${escapeHtml(avatarText(u.username))}
        </div>
        <div>
          <div class="font-medium">${escapeHtml(u.username)}</div>
          ${u.displayName ? `<div class="text-sm text-text-secondary">${escapeHtml(u.displayName)}</div>` : ''}
        </div>
      </li>`,
    )
    .join('');
  return `<ul class="flex flex-col gap-2">${rows}</ul>`;
}

document.addEventListener('DOMContentLoaded', async () => {
  await getOrCreateSession();

  const lobbyEl = document.getElementById('lobby');
  if (!lobbyEl) return;

  try {
    const res = await fetch('/api/v1/lobby/users');
    if (!res.ok) throw new Error(`Lobby fetch failed: ${res.status}`);
    const { users } = (await res.json()) as { users: LobbyUser[] };
    lobbyEl.innerHTML = renderLobby(users);
  } catch {
    lobbyEl.textContent = 'Failed to load lobby.';
  }
});
