import { getOrCreateSession, type Session } from '../_core/services/session';
import { showAlert } from '../_ui/scripts/alert';

interface UserProfile {
  id: string;
  username: string;
  displayName: string | null;
  isPublic: boolean;
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
  let session: Session;
  try {
    session = await getOrCreateSession();
  } catch {
    showAlert({ type: 'error', message: 'Could not initialise session. Please reload.', autoDismiss: false, isDismissable: true });
    return;
  }

  let original: UserProfile;
  try {
    const profileRes = await fetch(`/api/v1/users/${session.id}`);
    if (!profileRes.ok) throw new Error(`Failed to load profile: ${profileRes.status}`);
    original = (await profileRes.json()) as UserProfile;
  } catch {
    showAlert({ type: 'error', message: 'Could not load profile. Please reload.', autoDismiss: false, isDismissable: true });
    return;
  }

  function populateEditable(profile: UserProfile) {
    setInputValue('username-input', profile.username);
    setInputValue('display-name-input', profile.displayName ?? '');
    setToggleChecked('public-toggle', profile.isPublic);
  }

  populateEditable(original);

  document.getElementById('cancel-btn')?.addEventListener('click', () => {
    populateEditable(original);
  });

  const saveBtn = document.getElementById('save-btn');
  saveBtn?.addEventListener('click', async () => {
    saveBtn.classList.add('loading');

    const username = getInputValue('username-input');
    const displayName = getInputValue('display-name-input') || null;
    const isPublic = getToggleChecked('public-toggle');

    const patchBody: Record<string, unknown> = { displayName, isPublic };
    if (username !== original.username) {
      patchBody.username = username;
    }

    try {
      const res = await fetch(`/api/v1/users/${session.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.secret}`,
        },
        body: JSON.stringify(patchBody),
      });

      if (res.ok) {
        original = (await res.json()) as UserProfile;
        populateEditable(original);
        showAlert({ type: 'success', message: 'Settings saved.' });
      } else if (res.status === 409) {
        showAlert({ type: 'error', message: 'Username already taken.' });
      } else {
        showAlert({ type: 'error', message: 'Save failed. Please try again.' });
      }
    } finally {
      saveBtn.classList.remove('loading');
    }
  });
});

export {};
