document.addEventListener('DOMContentLoaded', () => {
  const els = document.querySelectorAll('img, a');

  els.forEach((e) => {
    e.setAttribute('draggable', 'false');
  });
});
