/* ============================================================
   GRAVY BOAT — progressive enhancement only.
   Every section of the page is usable with this file absent:
   the nav is a plain list, the menu shows every dish, and the
   form falls back to native validation.
   ============================================================ */

/* ---------- mobile navigation ---------- */

function initNav() {
  const toggle = document.querySelector('.nav-toggle');
  const nav = document.getElementById('site-nav');
  if (!toggle || !nav) return;

  const setOpen = (open) => {
    toggle.setAttribute('aria-expanded', String(open));
    nav.dataset.open = String(open);
  };

  setOpen(false);

  toggle.addEventListener('click', () => {
    setOpen(toggle.getAttribute('aria-expanded') !== 'true');
  });

  // Escape closes the menu and returns focus to the control that opened it.
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && toggle.getAttribute('aria-expanded') === 'true') {
      setOpen(false);
      toggle.focus();
    }
  });

  // Following a link should close the panel behind you.
  nav.addEventListener('click', (e) => {
    if (e.target.closest('a')) setOpen(false);
  });
}

/* ---------- gravy slider drives the artwork ---------- */

const GRAVY_LEVELS = [
  { label: 'Dry — we do not serve this', text: 'No gravy' },
  { label: 'Light — a rumour of gravy', text: 'Light gravy' },
  { label: 'Classic — the way it comes', text: 'Classic gravy' },
  { label: 'Drowned — you asked for it', text: 'Extra gravy' },
];

function initGravy() {
  const slider = document.getElementById('gravy');
  const note = document.getElementById('gravy-note');
  const scene = document.getElementById('scene');
  if (!slider || !note || !scene) return;

  const apply = () => {
    const level = GRAVY_LEVELS[Number(slider.value)] ?? GRAVY_LEVELS[2];
    scene.dataset.gravy = slider.value;
    note.textContent = level.label;
    // Screen readers announce the value, so give them words not a number.
    slider.setAttribute('aria-valuetext', level.text);
  };

  slider.addEventListener('input', apply);
  apply();
}

/* ---------- menu filtering ---------- */

function initMenu() {
  const chips = [...document.querySelectorAll('.chip[data-filter]')];
  const grid = document.getElementById('menu-grid');
  const status = document.querySelector('.filter-status');
  const empty = document.querySelector('.menu-empty');
  const reset = document.querySelector('.linkish[data-filter]');
  if (!chips.length || !grid || !status) return;

  const dishes = [...grid.querySelectorAll('.dish')];

  const applyFilter = (filter) => {
    let shown = 0;

    for (const dish of dishes) {
      const tags = (dish.dataset.tags || '').split(/\s+/);
      const match = filter === 'all' || tags.includes(filter);
      dish.hidden = !match;
      if (match) shown += 1;
    }

    for (const chip of chips) {
      chip.setAttribute('aria-pressed', String(chip.dataset.filter === filter));
    }

    if (shown === 0) {
      status.textContent = 'No poutines match that filter.';
    } else if (filter === 'all') {
      status.textContent = `Showing all ${shown} poutines.`;
    } else {
      const kind = chips.find((c) => c.dataset.filter === filter).textContent.toLowerCase();
      status.textContent = `Showing ${shown} ${kind} ${shown === 1 ? 'poutine' : 'poutines'}.`;
    }

    if (empty) empty.hidden = shown !== 0;
  };

  for (const chip of chips) {
    chip.addEventListener('click', () => applyFilter(chip.dataset.filter));
  }
  if (reset) reset.addEventListener('click', () => applyFilter('all'));

  applyFilter('all');
}

/* ---------- newsletter form ---------- */

function initSignup() {
  const form = document.querySelector('.signup');
  if (!form) return;

  const input = form.querySelector('#email');
  const error = form.querySelector('#email-error');
  const status = form.querySelector('.form-status');

  // Take over validation only now that we can actually do it. Without this
  // script the browser's native validation stays in charge.
  form.setAttribute('novalidate', '');

  const showError = (message) => {
    error.textContent = message;
    error.hidden = false;
    input.setAttribute('aria-invalid', 'true');
    input.focus();
  };

  const clearError = () => {
    error.textContent = '';
    error.hidden = true;
    input.removeAttribute('aria-invalid');
  };

  input.addEventListener('input', () => {
    if (input.getAttribute('aria-invalid') === 'true') clearError();
  });

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    status.textContent = '';

    const value = input.value.trim();
    if (!value) return showError('Please enter your email address.');
    if (!input.checkValidity()) {
      return showError('That does not look like an email address — check for a typo.');
    }

    clearError();
    // Nothing is sent anywhere: this is a demo restaurant.
    status.textContent = "You're on the list. Look for us Tuesday morning.";
    form.reset();
  });
}

initNav();
initGravy();
initMenu();
initSignup();
