import { buildLogicTrees } from './parser.js';
import { convertLogicToElectrical } from './converter.js';
import { renderElectrical } from './renderer.js';

const svg = document.getElementById('switching-svg');
const canvas = document.querySelector('.switching-canvas');
const emptyState = document.getElementById('switching-empty');
const status = document.getElementById('switching-status');
const circuitSelectWrap = document.getElementById('switching-circuit-select-wrap');
const circuitButton = document.getElementById('switching-circuit-button');
const circuitButtonLabel = document.getElementById('switching-circuit-button-label');
const circuitMenu = document.getElementById('switching-circuit-menu');
const zoomLabel = document.getElementById('switching-zoom-label');

let currentState = null;
let selectedCircuitId = null;
let zoomLevel = 1.75;
const panOffset = { x: 0, y: 0 };
let panDrag = null;

const zoomConfig = {
    min: 0.7,
    max: 2.2,
    step: 0.15
};

function applySwitchingZoom() {
    if (!svg) {
        return;
    }

    const viewBox = svg.viewBox.baseVal;
    if (viewBox.width > 0 && viewBox.height > 0) {
        svg.style.setProperty('--switching-svg-width', `${viewBox.width * zoomLevel}px`);
        svg.style.setProperty('--switching-svg-height', `${viewBox.height * zoomLevel}px`);
    }

    if (zoomLabel) {
        zoomLabel.textContent = `${Math.round(zoomLevel * 100)}%`;
    }
}

function applySwitchingPan() {
    if (!svg) {
        return;
    }

    svg.style.setProperty('--switching-pan-x', `${panOffset.x}px`);
    svg.style.setProperty('--switching-pan-y', `${panOffset.y}px`);
}

function changeSwitchingZoom(direction) {
    const nextZoom = zoomLevel + direction * zoomConfig.step;
    zoomLevel = Math.max(zoomConfig.min, Math.min(zoomConfig.max, Number(nextZoom.toFixed(2))));
    applySwitchingZoom();
}

function handleCanvasWheel(event) {
    if (!canvas || !panDrag || !canvas.contains(event.target)) {
        return;
    }

    event.preventDefault();
    changeSwitchingZoom(event.deltaY < 0 ? 1 : -1);
}

function handleCanvasPointerDown(event) {
    if (!canvas || event.target.closest?.('button, [role="button"]')) {
        return;
    }

    if (event.button !== 0) {
        return;
    }

    panDrag = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        originX: panOffset.x,
        originY: panOffset.y
    };

    canvas.classList.add('is-panning');
    canvas.setPointerCapture?.(event.pointerId);
    event.preventDefault();
}

function handleCanvasPointerMove(event) {
    if (!canvas || !panDrag || panDrag.pointerId !== event.pointerId) {
        return;
    }

    panOffset.x = panDrag.originX + event.clientX - panDrag.startX;
    panOffset.y = panDrag.originY + event.clientY - panDrag.startY;
    applySwitchingPan();
}

function stopCanvasPan(event) {
    if (!canvas || !panDrag || (event && panDrag.pointerId !== event.pointerId)) {
        return;
    }

    canvas.releasePointerCapture?.(panDrag.pointerId);
    panDrag = null;
    canvas.classList.remove('is-panning');
}

// Atualiza o texto e as opções do seletor de circuitos.
function syncCircuitSelector(roots) {
    if (!circuitButton || !circuitButtonLabel || !circuitMenu) {
        return;
    }

    circuitMenu.innerHTML = '';

    if (roots.length === 0) {
        selectedCircuitId = null;
        circuitButton.disabled = true;
        circuitButtonLabel.textContent = 'Nenhum circuito disponível';
        circuitMenu.hidden = true;
        circuitButton.setAttribute('aria-expanded', 'false');
        return;
    }

    if (!roots.some((root) => root.gateId === selectedCircuitId)) {
        selectedCircuitId = roots[0].gateId;
    }

    circuitButton.disabled = false;

    roots.forEach((root, index) => {
        const option = document.createElement('button');
        option.type = 'button';
        option.className = 'truth-table-select__option';
        option.setAttribute('role', 'option');
        option.dataset.circuitId = root.gateId;
        option.textContent = root.name || `Circuito ${index + 1}`;
        if (root.gateId === selectedCircuitId) {
            option.classList.add('is-selected');
            option.setAttribute('aria-selected', 'true');
        } else {
            option.setAttribute('aria-selected', 'false');
        }
        circuitMenu.appendChild(option);
    });

    const selectedRoot = roots.find((root) => root.gateId === selectedCircuitId) || roots[0];
    selectedCircuitId = selectedRoot.gateId;
    circuitButtonLabel.textContent = selectedRoot.name || 'Circuito 1';
    circuitMenu.hidden = true;
    circuitButton.setAttribute('aria-expanded', 'false');
    if (circuitSelectWrap) {
        circuitSelectWrap.classList.remove('is-open');
    }
}

// Mostra uma mensagem simples quando não há circuito para exibir.
function setEmpty(message) {
    if (emptyState) {
        emptyState.textContent = message;
        emptyState.style.display = 'flex';
    }
    if (svg) {
        svg.innerHTML = '';
    }
}

// Desenha o circuito atualmente selecionado.
function renderSelectedCircuit(roots, inputs) {
    if (!roots.length) {
        if (status) {
            status.textContent = 'Sem saida';
        }
        syncCircuitSelector([]);
        setEmpty('Monte um circuito com saida para visualizar a conversao eletrica.');
        return;
    }

    syncCircuitSelector(roots);

    const selectedRoot = roots.find((root) => root.gateId === selectedCircuitId) || roots[0];
    selectedCircuitId = selectedRoot.gateId;

    if (status) {
        status.textContent = roots.length > 1
            ? `${selectedRoot.name || 'OUT'} (${roots.findIndex((root) => root.gateId === selectedRoot.gateId) + 1} de ${roots.length})`
            : `${selectedRoot.name || 'OUT'}`;
    }

    if (emptyState) {
        emptyState.style.display = 'none';
    }

    renderElectrical(svg, convertLogicToElectrical(selectedRoot, inputs));
    applySwitchingZoom();
}

// Atualiza a visualização elétrica a partir do estado do editor.
export function updateElectricalView(state) {
    currentState = state;

    if (!svg) {
        return;
    }

    const { roots, inputs } = buildLogicTrees(state);
    renderSelectedCircuit(roots, inputs);
}

document.addEventListener('click', (event) => {
    const zoomIn = event.target.closest('[data-action="switching-zoom-in"]');
    if (zoomIn) {
        changeSwitchingZoom(1);
        return;
    }

    const zoomOut = event.target.closest('[data-action="switching-zoom-out"]');
    if (zoomOut) {
        changeSwitchingZoom(-1);
    }
});

if (canvas) {
    canvas.addEventListener('pointerdown', handleCanvasPointerDown);
    canvas.addEventListener('wheel', handleCanvasWheel, { passive: false });
    canvas.addEventListener('pointercancel', stopCanvasPan);
    canvas.addEventListener('lostpointercapture', stopCanvasPan);
    window.addEventListener('pointermove', handleCanvasPointerMove);
    window.addEventListener('pointerup', stopCanvasPan);
}

applySwitchingZoom();
applySwitchingPan();

if (circuitButton && circuitMenu && circuitSelectWrap) {
    circuitButton.addEventListener('click', () => {
        if (circuitButton.disabled) {
            return;
        }

        const willOpen = circuitMenu.hidden;
        circuitMenu.hidden = !willOpen;
        circuitSelectWrap.classList.toggle('is-open', willOpen);
        circuitButton.setAttribute('aria-expanded', String(willOpen));
    });

    circuitMenu.addEventListener('click', (event) => {
        const target = event.target;
        if (!(target instanceof HTMLElement)) {
            return;
        }

        const option = target.closest('.truth-table-select__option');
        if (!option) {
            return;
        }

        selectedCircuitId = option.dataset.circuitId || null;
        circuitMenu.hidden = true;
        circuitSelectWrap.classList.remove('is-open');
        circuitButton.setAttribute('aria-expanded', 'false');

        if (!currentState) {
            return;
        }

        const { roots, inputs } = buildLogicTrees(currentState);
        renderSelectedCircuit(roots, inputs);
    });

    document.addEventListener('click', (event) => {
        if (!(event.target instanceof Node)) {
            return;
        }

        if (!circuitSelectWrap.contains(event.target)) {
            circuitMenu.hidden = true;
            circuitSelectWrap.classList.remove('is-open');
            circuitButton.setAttribute('aria-expanded', 'false');
        }
    });
}
