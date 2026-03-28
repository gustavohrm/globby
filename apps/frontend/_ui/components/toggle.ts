class Toggle extends HTMLElement {
  private handleClick = () => {
    const isChecked = this.getAttribute('checked') === 'true';
    this.setAttribute('checked', String(!isChecked));
    this.dispatchEvent(new Event('change', { bubbles: true }));
  };

  static get observedAttributes() {
    return ['checked'];
  }

  connectedCallback() {
    this.render();
    this.addEventListener('click', this.handleClick);
  }

  disconnectedCallback() {
    this.removeEventListener('click', this.handleClick);
  }

  attributeChangedCallback(name: string, oldValue: string | null, newValue: string | null) {
    if (name === 'checked' && oldValue !== newValue) {
      const checkbox = this.querySelector('input[type="checkbox"]') as HTMLInputElement | null;
      if (checkbox) {
        checkbox.checked = newValue === 'true';
      }
    }
  }

  get checked(): boolean {
    return this.getAttribute('checked') === 'true';
  }

  set checked(value: boolean) {
    this.setAttribute('checked', String(value));
  }

  private render() {
    const isChecked = this.getAttribute('checked') === 'true';

    this.style.display = 'flex';
    this.innerHTML = `
      <div class="relative inline-flex items-center cursor-pointer">
        <input type="checkbox" value="" class="sr-only peer" ${isChecked ? 'checked' : ''}>
        <div class="w-11 h-6 bg-surface peer-focus:outline-none rounded-full transition-colors duration-400 peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-text after:rounded-full after:size-5 after:transition-transform peer-checked:bg-primary"></div>
      </div>
    `;
  }
}

customElements.define('app-toggle', Toggle);
