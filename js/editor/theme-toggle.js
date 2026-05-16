const STORAGE_KEY = 'logicSimTheme';

function getInitialTheme() {
    try {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved === 'light' || saved === 'dark') return saved;
    } catch {
        // ignore
    }

    const prefersDark = window.matchMedia?.('(prefers-color-scheme: dark)')?.matches;
    return prefersDark ? 'dark' : 'light';
}

function applyTheme(theme) {
    const body = document.body;
    if (!body) return;

    body.classList.toggle('theme-light', theme === 'light');
    body.classList.toggle('theme-dark', theme === 'dark');

    body.dataset.theme = theme;

    try {
        localStorage.setItem(STORAGE_KEY, theme);
    } catch {
       
    }

    const toggleBtn = document.getElementById('theme-toggle');
    const isLight = theme === 'light';
    if (toggleBtn) {
        toggleBtn.setAttribute('aria-pressed', String(isLight));
        const sun = toggleBtn.querySelector('[data-theme-icon="sun"]');
        const moon = toggleBtn.querySelector('[data-theme-icon="moon"]');
        if (sun) sun.style.display = isLight ? '' : 'none';
        if (moon) moon.style.display = isLight ? 'none' : '';
    }

    const kicker = document.querySelector('.hero-kicker');
    if (kicker) {
        kicker.textContent = isLight
            ? 'Claro UI • SVG • Lógica combinacional'
            : 'Dark UI • SVG • Lógica combinacional';
    }
}

function initThemeToggle() {
    const toggleBtn = document.getElementById('theme-toggle');
    if (!toggleBtn) return;

    let current = getInitialTheme();
 
    applyTheme(current);

    toggleBtn.addEventListener('click', () => {
        current = current === 'dark' ? 'light' : 'dark';
        applyTheme(current);
    });
}

initThemeToggle();

