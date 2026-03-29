import { getOrCreateSession } from "./_core/services/session";

interface PanelElement extends HTMLElement {
  selectRoom(id: string): void;
}

document.addEventListener("DOMContentLoaded", async () => {
  // Pre-warm session so the panel's own getOrCreateSession call returns instantly.
  // Errors are swallowed here — the panel handles its own session failure gracefully.
  try {
    await getOrCreateSession();
  } catch {
    // ignore
  }

  const globe = document.getElementById("globe");
  const panel = document.getElementById("panel") as PanelElement | null;
  if (!globe || !panel) return;

  // Beacon clicked on globe → highlight matching row in panel
  globe.addEventListener("room-select", (e) => {
    const { roomId } = (e as CustomEvent<{ roomId: string }>).detail;
    globe.setAttribute("selected-room", roomId);
    panel.selectRoom(roomId);
  });

  // Row clicked in panel → highlight matching beacon on globe
  panel.addEventListener("room-select", (e) => {
    const { roomId } = (e as CustomEvent<{ roomId: string }>).detail;
    globe.setAttribute("selected-room", roomId);
  });
});
