import { buildLogicTrees } from './parser.js';
import { convertLogicToElectrical } from './converter.js';
import { renderElectrical } from './renderer.js';

const svg = document.getElementById('switching-svg');
const emptyState = document.getElementById('switching-empty');
const status = document.getElementById('switching-status');
const circuitSelectWrap = document.getElementById('switching-circuit-select-wrap');
const circuitButton = document.getElementById('switching-circuit-button');
const circuitButtonLabel = document.getElementById('switching-circuit-button-label');
const circuitMenu = document.getElementById('switching-circuit-menu');

let currentState = null;
let selectedCircuitId = null;

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
