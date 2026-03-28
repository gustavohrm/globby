const SESSION_KEY = 'globby_session';

interface Session {
  id: string;
  secret: string;
}

interface UserProfile {
  id: string;
  username: string;
  displayName: string | null;
  isPublic: boolean;
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

function getInputValue(id: string): string {
  const el = document.getElementById(id);
  // Read from inner <input> for current value (attribute may lag behind if user hasn't blurred)
  return el?.querySelector('input')?.value ?? el?.getAttribute('value') ?? '';
}

function setInputValue(id: string, value: string) {
  document.getElementById(id)?.setAttribute('value', value);
}

function getToggleChecked(id: string): boolean {
  return document.getElementById(id)?.getAttribute('checked') === 'true';
}

function setToggleChecked(id: string, value: boolean) {
  document.getElementById(id)?.setAttribute('checked', String(value));
}

document.addEventListener('DOMContentLoaded', async () => {
  const session = await getOrCreateSession();

  const profileRes = await fetch(`/api/v1/users/${session.id}`);
  let original = (await profileRes.json()) as UserProfile;

  // Username is set once and made readonly — never updated again so re-render won't occur
  setInputValue('username-input', original.username);
  document
    .getElementById('username-input')
    ?.querySelector('input')
    ?.setAttribute('readonly', '');

  function populateEditable(profile: UserProfile) {
    setInputValue('display-name-input', profile.displayName ?? '');
    setToggleChecked('public-toggle', profile.isPublic);
  }

  populateEditable(original);

  document.getElementById('cancel-btn')?.addEventListener('click', () => {
    populateEditable(original);
  });

  document.getElementById('save-btn')?.addEventListener('click', async () => {
    const saveBtn = document.getElementById('save-btn');
    saveBtn?.classList.add('loading');

    const displayName = getInputValue('display-name-input') || null;
    const isPublic = getToggleChecked('public-toggle');

    try {
      const res = await fetch(`/api/v1/users/${session.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.secret}`,
        },
        body: JSON.stringify({ displayName, isPublic }),
      });

      if (res.ok) {
        original = (await res.json()) as UserProfile;
        populateEditable(original);
      }
    } finally {
      saveBtn?.classList.remove('loading');
    }
  });
});
