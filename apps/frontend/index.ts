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

async function getOrCreateSession(): Promise<Session> {
  const raw = localStorage.getItem(SESSION_KEY);
  if (raw) return JSON.parse(raw) as Session;

  const res = await fetch('/api/v1/users', { method: 'POST' });
  const data = (await res.json()) as { id: string; username: string; secret: string };
  const session: Session = { id: data.id, secret: data.secret };
  localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  return session;
}

function initials(username: string): string {
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
          ${initials(u.username)}
        </div>
        <div>
          <div class="font-medium">${u.username}</div>
          ${u.displayName ? `<div class="text-sm text-text-secondary">${u.displayName}</div>` : ''}
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
    const { users } = (await res.json()) as { users: LobbyUser[] };
    lobbyEl.innerHTML = renderLobby(users);
  } catch {
    lobbyEl.textContent = 'Failed to load lobby.';
  }
});
