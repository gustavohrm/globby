import { getOrCreateSession, type Session } from "../../_core/services/session";

type Room = { id: string; code: string; name: string; creatorId: string; createdAt: string };

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

class RoomsPanel extends HTMLElement {
  private session: Session | null = null;
  private rooms: Room[] = [];
  private onlineCount = 0;
  private isOpen = true;
  private showForm = false;

  connectedCallback() {
    this.isOpen = this.hasAttribute("open");
    this.style.cssText = "display:flex;align-items:stretch;pointer-events:none;";
    this.render();
    void this.init();
  }

  private async init() {
    try {
      this.session = await getOrCreateSession();
    } catch {
      // continue without session — create/delete won't work
    }
    await this.fetchData();
  }

  private async fetchData() {
    try {
      const [roomsRes, usersRes] = await Promise.all([fetch("/api/v1/rooms"), fetch("/api/v1/lobby/users")]);
      if (roomsRes.ok) {
        const { rooms } = (await roomsRes.json()) as { rooms: Room[] };
        this.rooms = rooms;
      }
      if (usersRes.ok) {
        const { users } = (await usersRes.json()) as { users: unknown[] };
        this.onlineCount = users.length;
      }
    } catch {
      // ignore — stale data shown
    }
    this.render();
  }

  /** Called by index.ts when a beacon is clicked on the globe. */
  selectRoom(id: string) {
    if (!this.isOpen) {
      this.isOpen = true;
      this.render();
    }
    requestAnimationFrame(() => {
      const el = this.querySelector(`[data-room-id="${CSS.escape(id)}"]`);
      if (!el) return;
      el.scrollIntoView({ behavior: "smooth", block: "nearest" });
      el.classList.add("ring-2", "ring-fuchsia-500");
      setTimeout(() => el.classList.remove("ring-2", "ring-fuchsia-500"), 1500);
    });
  }

  private render() {
    const inputVal = (this.querySelector(".room-name-input") as HTMLInputElement | null)?.value ?? "";
    const chevron = this.isOpen ? "›" : "‹";

    this.innerHTML = `
      <button class="panel-toggle pointer-events-auto flex items-center justify-center w-6 self-stretch bg-slate-800 border-l border-t border-b border-slate-700 rounded-l-lg cursor-pointer hover:bg-slate-700 transition-colors z-10">
        <span class="text-fuchsia-400 font-bold text-sm select-none">${chevron}</span>
      </button>
      <div class="pointer-events-auto flex flex-col bg-slate-900 border-l border-slate-700 overflow-hidden transition-all duration-300 ${this.isOpen ? "w-72" : "w-0"}">
        <div class="px-4 py-3 border-b border-slate-700 shrink-0">
          <p class="text-xs text-slate-400">${this.rooms.length} rooms · ${this.onlineCount} online</p>
        </div>
        <ul class="flex-1 overflow-y-auto divide-y divide-slate-800">
          ${
            this.rooms.length === 0
              ? '<li class="px-4 py-6 text-sm text-slate-500 text-center">No rooms yet</li>'
              : this.rooms
                  .map(
                    (r) => `
            <li data-room-id="${esc(r.id)}" class="flex items-center gap-2 px-4 py-3 hover:bg-slate-800 cursor-pointer group transition-colors">
              <div class="flex-1 min-w-0">
                <p class="text-sm font-medium text-slate-100 truncate">${esc(r.name)}</p>
                <p class="text-xs text-slate-500 font-mono">${esc(r.code)}</p>
              </div>
              ${
                this.session && r.creatorId === this.session.id
                  ? `<button data-delete="${esc(r.id)}" class="opacity-0 group-hover:opacity-100 text-slate-500 hover:text-rose-400 transition-all p-1 shrink-0" title="Delete room">
                      <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                        <path stroke-linecap="round" stroke-linejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6M1 7h22M8 7V5a2 2 0 012-2h4a2 2 0 012 2v2"/>
                      </svg>
                    </button>`
                  : ""
              }
            </li>`,
                  )
                  .join("")
          }
        </ul>
        <div class="px-4 py-3 border-t border-slate-700 shrink-0">
          ${
            this.showForm
              ? `<form class="create-form flex flex-col gap-2">
                  <input class="room-name-input w-full bg-slate-800 border border-slate-600 focus:border-fuchsia-500 text-slate-100 text-sm rounded-lg px-3 py-2 outline-none" placeholder="Room name" maxlength="64" value="${esc(inputVal)}" />
                  <div class="flex gap-2">
                    <button type="submit" class="flex-1 bg-fuchsia-700 hover:bg-fuchsia-600 text-white text-sm rounded-lg py-1.5 transition-colors">Create</button>
                    <button type="button" class="cancel-btn flex-1 bg-slate-700 hover:bg-slate-600 text-slate-300 text-sm rounded-lg py-1.5 transition-colors">Cancel</button>
                  </div>
                </form>`
              : `<button class="new-room-btn w-full text-sm text-fuchsia-400 hover:text-fuchsia-300 border border-fuchsia-800 hover:border-fuchsia-600 rounded-lg py-2 transition-colors">+ New Room</button>`
          }
        </div>
      </div>
    `;

    this.bindEvents();

    if (this.showForm) {
      (this.querySelector(".room-name-input") as HTMLInputElement | null)?.focus();
    }
  }

  private bindEvents() {
    this.querySelector(".panel-toggle")!.addEventListener("click", () => {
      this.isOpen = !this.isOpen;
      this.render();
    });

    this.querySelectorAll("[data-room-id]").forEach((el) => {
      el.addEventListener("click", (e) => {
        if ((e.target as HTMLElement).closest("[data-delete]")) return;
        const roomId = (el as HTMLElement).dataset.roomId!;
        this.dispatchEvent(new CustomEvent("room-select", { bubbles: true, detail: { roomId } }));
      });
    });

    this.querySelectorAll("[data-delete]").forEach((btn) => {
      btn.addEventListener("click", async (e) => {
        e.stopPropagation();
        await this.deleteRoom((btn as HTMLElement).dataset.delete!);
      });
    });

    this.querySelector(".new-room-btn")?.addEventListener("click", () => {
      this.showForm = true;
      this.render();
    });

    this.querySelector(".create-form")?.addEventListener("submit", async (e) => {
      e.preventDefault();
      const name = (this.querySelector(".room-name-input") as HTMLInputElement).value.trim();
      if (name) await this.createRoom(name);
    });

    this.querySelector(".cancel-btn")?.addEventListener("click", () => {
      this.showForm = false;
      this.render();
    });
  }

  private async createRoom(name: string) {
    if (!this.session) return;
    try {
      const res = await fetch("/api/v1/rooms", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${this.session.secret}` },
        body: JSON.stringify({ name, creatorId: this.session.id }),
      });
      if (!res.ok) return;
      this.showForm = false;
      await this.fetchData();
      document.dispatchEvent(new CustomEvent("rooms-changed"));
    } catch {
      // ignore
    }
  }

  private async deleteRoom(roomId: string) {
    if (!this.session) return;
    try {
      const res = await fetch(`/api/v1/rooms/${roomId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${this.session.secret}`, "X-User-Id": this.session.id },
      });
      if (!res.ok) return;
      await this.fetchData();
      document.dispatchEvent(new CustomEvent("rooms-changed"));
    } catch {
      // ignore
    }
  }
}

customElements.define("rooms-panel", RoomsPanel);
