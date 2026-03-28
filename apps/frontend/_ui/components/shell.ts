class Shell extends HTMLElement {
  connectedCallback() {
    this.render();
  }

  render() {
    const html = this.innerHTML;
    this.classList = 'flex flex-1 size-full';
    this.innerHTML = `
      <div class="flex flex-col items-center size-full">
        <main class="flex flex-col size-full flex-1 pb-22">${html}</main>
        <app-nav></app-nav>
      </div>
    `;
  }
}

customElements.define('app-shell', Shell);
