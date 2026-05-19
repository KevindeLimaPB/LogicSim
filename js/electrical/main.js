import { buildLogicTrees } from './parser.js';
import { convertLogicToElectrical } from './converter.js';
import { renderElectrical } from './renderer.js';

const svg = document.getElementById('switching-svg');
const emptyState = document.getElementById('switching-empty');
const status = document.getElementById('switching-status');
const circuitSelect = document.getElementById('switching-circuit-select');
const circuitSelector = circuitSelect?.closest('.switching-selector');

let currentState = null;
let selectedCircuitId = null;

// Atualiza o texto e as opções do seletor de circuitos.
function syncCircuitSelector(roots) {
    if (!circuitSelect) {
        return;
    }

    circuitSelect.innerHTML = '';

    if (roots.length <= 1) {
        if (circuitSelector) {
            circuitSelector.hidden = true;
        }
        selectedCircuitId = roots[0]?.gateId || null;
        return;
    }

    const hasSelection = roots.some((root) => root.gateId === selectedCircuitId);
    if (!hasSelection) {
        selectedCircuitId = null;
    }

    const placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.textContent = 'Clique aqui para selecionar';
    placeholder.disabled = true;
    placeholder.selected = !selectedCircuitId;
    circuitSelect.appendChild(placeholder);

    roots.forEach((root, index) => {
        const option = document.createElement('option');
        option.value = root.gateId;
        option.textContent = `${root.name || `Y${index + 1}`} (${index + 1}/${roots.length})`;
        if (root.gateId === selectedCircuitId) {
            option.selected = true;
        }
        circuitSelect.appendChild(option);
    });

    if (circuitSelector) {
        circuitSelector.hidden = false;
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

    if (roots.length > 1 && !selectedCircuitId) {
        if (status) {
            status.textContent = 'Selecione um circuito';
        }
        setEmpty('Clique aqui para selecionar um circuito.');
        return;
    }

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

if (circuitSelect) {
    circuitSelect.addEventListener('change', () => {
        selectedCircuitId = circuitSelect.value || null;

        if (!currentState) {
            return;
        }

        const { roots, inputs } = buildLogicTrees(currentState);
        renderSelectedCircuit(roots, inputs);
    });
}
