class Input extends HTMLElement {
  handleChange = (event: Event) => {
    const target = event.target as HTMLInputElement;
    this.setAttribute('value', target.value);
    this.dispatchEvent(new Event('change', { bubbles: true }));
  };

  static get observedAttributes() {
    return ['value', 'placeholder', 'type', 'label'];
  }

  attributeChangedCallback() {
    this.render();
  }

  connectedCallback() {
    this.render();
    this.querySelector('input')?.addEventListener('change', this.handleChange);
  }

  disconnectedCallback() {
    this.querySelector('input')?.removeEventListener('change', this.handleChange);
  }

  render() {
    const id = crypto.randomUUID();
    this.innerHTML = `
      <div class="flex flex-col gap-2">
        ${this.getAttribute('label') ? `<label for="${id}" class="font-medium">${this.getAttribute('label')}</label>` : ''}
        <input
          id="${id}"
          placeholder="${this.getAttribute('placeholder') || ''}"
          value="${this.getAttribute('value') || ''}"
          type="${this.getAttribute('type') || 'text'}"
          class="ipt"
        />
      </div>
    `;
  }
}

customElements.define('app-input', Input);
