const body = document.body;

const drawerToggle = document.getElementById('logic-drawer-toggle');
const drawer = document.getElementById('logic-drawer');
const drawerOverlay = document.getElementById('logic-overlay');
const drawerClose = document.getElementById('logic-drawer-close');

const headerMenu = document.getElementById('header-menu');
const headerBtn = document.getElementById('header-btn');
const headerNav = document.getElementById('header-nav');
const headerDescBG = document.getElementById('header-descBG');

// Inicializa o menu lateral moderno com overlay e atalhos de fechamento.
function initModernDrawer() {
    if (!drawerToggle || !drawer || !drawerOverlay) {
        return false;
    }

    let isOpen = false;

    // Sincroniza classes, atributos e rolagem com o estado do drawer.
    const syncState = () => {
        drawer.classList.toggle('is-open', isOpen);
        drawerOverlay.classList.toggle('is-open', isOpen);
        drawer.setAttribute('aria-hidden', String(!isOpen));
        drawerToggle.setAttribute('aria-expanded', String(isOpen));
        body.style.overflow = isOpen ? 'hidden' : '';

        
    };

    // Abre o drawer moderno.
    const openDrawer = () => {
        isOpen = true;
        
        syncState();
    };

    // Fecha o drawer moderno.
    const closeDrawer = () => {
        isOpen = false;
        syncState();
    };

    drawerToggle.addEventListener('click', (event) => {
        event.stopPropagation();
        isOpen ? closeDrawer() : openDrawer();
    });

    drawerClose?.addEventListener('click', closeDrawer);
    drawerOverlay.addEventListener('click', closeDrawer);

    drawer.addEventListener('click', (event) => {
        if (event.target.closest('[data-add]') || event.target.closest('a')) {
            closeDrawer();
        }
    });

    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape' && isOpen) {
            closeDrawer();
        }
    });

    syncState();
    return true;
}

// Inicializa o menu antigo como alternativa quando o drawer moderno não existe.
function initLegacyHeader() {
    if (!headerMenu || !headerBtn || !headerNav || !headerDescBG) {
        return;
    }

    let menuAberto = false;

    // Move o botão do menu para a área correta conforme o estado atual.
    function mudarDePosicao() {
        if (menuAberto) {
            headerNav.appendChild(headerBtn);
            headerBtn.classList.add('active');
        } else {
            headerMenu.appendChild(headerBtn);
            headerBtn.classList.remove('active');
            headerMenu.insertBefore(headerBtn, headerMenu.firstChild);
        }
    }

    // Abre o menu legado e bloqueia a rolagem da página.
    function abrirMenu() {
        headerNav.classList.add('active');
        headerDescBG.classList.add('active');
        body.style.overflow = 'hidden';
    }

    // Fecha o menu legado e restaura o estado da interface.
    function fecharMenu() {
        headerNav.classList.remove('active');
        headerDescBG.classList.remove('active');
        body.style.overflow = '';
        menuAberto = false;
        mudarDePosicao();
    }

    // Alterna entre abrir e fechar o menu legado.
    function toggleMenu() {
        menuAberto = !menuAberto;
        if (menuAberto) {
            abrirMenu();
        } else {
            fecharMenu();
        }
    }

    headerBtn.addEventListener('click', (event) => {
        event.stopPropagation();
        toggleMenu();
    });

    headerDescBG.addEventListener('click', fecharMenu);

    headerNav.addEventListener('click', (event) => {
        if (event.target === headerNav) {
            fecharMenu();
        }
    });

    headerBtn.addEventListener('click', mudarDePosicao);
}

if (!initModernDrawer()) {
    initLegacyHeader();
}