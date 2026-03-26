const ICONS = {
  globby: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21.54 15H17a2 2 0 0 0-2 2v4.54"/><path d="M7 3.34V5a3 3 0 0 0 3 3a2 2 0 0 1 2 2c0 1.1.9 2 2 2a2 2 0 0 0 2-2c0-1.1.9-2 2-2h3.17"/><path d="M11 21.95V18a2 2 0 0 0-2-2a2 2 0 0 1-2-2v-1a2 2 0 0 0-2-2H2.05"/><circle cx="12" cy="12" r="10"/></svg>`,
  chat: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 17a2 2 0 0 1-2 2H6.828a2 2 0 0 0-1.414.586l-2.202 2.202A.71.71 0 0 1 2 21.286V5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2z"/><path d="M7 11h10"/><path d="M7 15h6"/><path d="M7 7h8"/></svg>`,
  settings: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9.671 4.136a2.34 2.34 0 0 1 4.659 0 2.34 2.34 0 0 0 3.319 1.915 2.34 2.34 0 0 1 2.33 4.033 2.34 2.34 0 0 0 0 3.831 2.34 2.34 0 0 1-2.33 4.033 2.34 2.34 0 0 0-3.319 1.915 2.34 2.34 0 0 1-4.659 0 2.34 2.34 0 0 0-3.32-1.915 2.34 2.34 0 0 1-2.33-4.033 2.34 2.34 0 0 0 0-3.831A2.34 2.34 0 0 1 6.35 6.051a2.34 2.34 0 0 0 3.319-1.915"/><circle cx="12" cy="12" r="3"/></svg>`,
};

class Nav extends HTMLElement {
  connectedCallback() {
    this.render();
  }

  render() {
    this.innerHTML = `
      <nav class="flex items-center gap-4 rounded-full border-border border bg-foreground p-2 my-4">
        <a
          href="#"
          class="tooltip flex items-center gap-2 p-2 text-primary size-10 rounded-full hover:bg-surface transition-colors duration-400"
          data-tooltip="Globby"
          data-tooltip-position="top"
        >
          ${ICONS.globby}
        </a>
        <a
          href="#"
          class="tooltip flex items-center gap-2 p-2 text-text-secondary size-10 rounded-full hover:bg-surface transition-colors duration-400"
          data-tooltip="Chat"
          data-tooltip-position="top"
        >
          ${ICONS.chat}
        </a>
        <a
          href="#"
          class="tooltip flex items-center gap-2 p-2 text-text-secondary size-10 rounded-full hover:bg-surface transition-colors duration-400"
          data-tooltip="Settings"
          data-tooltip-position="top"
        >
          ${ICONS.settings}
        </a>
      </nav>
    `;
  }
}

customElements.define('app-nav', Nav);
