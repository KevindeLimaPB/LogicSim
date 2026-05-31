import { buildLogicTrees } from './parser.js';
import { convertLogicToElectrical } from './converter.js';
import { renderElectrical } from './renderer.js';
import { simplifyLogicTree } from './simplifier.js';

const svg = document.getElementById('switching-svg');
const canvas = document.querySelector('.switching-canvas');
const emptyState = document.getElementById('switching-empty');
const circuitSelectWrap = document.getElementById('switching-circuit-select-wrap');
const circuitButton = document.getElementById('switching-circuit-button');
const circuitButtonLabel = document.getElementById('switching-circuit-button-label');
const circuitMenu = document.getElementById('switching-circuit-menu');
const zoomLabel = document.getElementById('switching-zoom-label');
const simplifyWrap = document.getElementById('switching-simplify-wrap');
const simplifyButton = document.getElementById('switching-simplify-toggle');
const switchingExpressionLabel = document.getElementById('switching-expression-label');
const switchingExpressionCopyBtn = document.querySelector('[data-action="copy-switching-expression"]');

let currentState = null;
let selectedCircuitId = null;
let isSimplifiedView = false;
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

function syncSimplifyButton(canSimplify) {
    if (!simplifyButton) {
        return;
    }

    if (simplifyWrap) {
        simplifyWrap.hidden = !canSimplify;
    }

    simplifyButton.hidden = false;
    simplifyButton.disabled = !canSimplify;
    simplifyButton.classList.toggle('is-active', isSimplifiedView && canSimplify);
    simplifyButton.setAttribute('aria-pressed', String(isSimplifiedView && canSimplify));
}

function countElectricalSwitches(node) {
    if (!node) {
        return 0;
    }

    switch (node.type) {
        case 'SWITCH':
            return 1;
        case 'OUTPUT':
            return countElectricalSwitches(node.child);
        case 'INVERT':
            return 1 + countElectricalSwitches(node.child);
        case 'SERIES':
        case 'PARALLEL':
            return (node.children || []).reduce((sum, child) => sum + countElectricalSwitches(child), 0);
        default:
            return 0;
    }
}

function isSimpleExpression(expr) {
    return /^[A-Z0-9?]+$/i.test(expr);
}

function wrapExpression(expr) {
    return isSimpleExpression(expr) ? expr : `(${expr})`;
}

function wrapProductExpression(expr) {
    return expr.includes(' + ') || expr.includes(' ⊕ ') || expr.includes(' ⊙ ')
        ? wrapExpression(expr)
        : expr;
}

function getLogicExpression(node) {
    if (!node) {
        return '?';
    }

    const children = node.inputs || [];

    switch (node.type) {
        case 'OUTPUT':
            return getLogicExpression(node.input || node.child);
        case 'INPUT':
            return node.name || 'A';
        case 'CONST':
            return node.value ? '1' : '0';
        case 'NOT':
            return `¬${wrapExpression(getLogicExpression(children[0]))}`;
        case 'AND':
            return children.map((child) => wrapProductExpression(getLogicExpression(child))).join(' · ');
        case 'OR':
            return children.map((child) => getLogicExpression(child)).join(' + ');
        case 'NAND':
            return `¬(${children.map((child) => wrapProductExpression(getLogicExpression(child))).join(' · ')})`;
        case 'NOR':
            return `¬(${children.map((child) => getLogicExpression(child)).join(' + ')})`;
        case 'XOR':
            return children.map((child) => getLogicExpression(child)).join(' ⊕ ');
        case 'XNOR':
            return children.map((child) => getLogicExpression(child)).join(' ⊙ ');
        default:
            return '?';
    }
}

function escapeHtml(value) {
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function syncSwitchingExpression(root) {
    if (!switchingExpressionLabel) {
        return;
    }

    if (!root) {
        switchingExpressionLabel.textContent = '-';
        return;
    }

    const expression = getLogicExpression(root) || '-';
    switchingExpressionLabel.innerHTML = `<div class="expression-item">${escapeHtml(root.name || 'Y')} = ${escapeHtml(expression)}</div>`;
}

async function copySwitchingExpression() {
    if (!switchingExpressionLabel || !switchingExpressionCopyBtn) {
        return;
    }

    const expressionText = switchingExpressionLabel.innerText.trim();
    if (!expressionText || expressionText === '-') {
        return;
    }

    try {
        await navigator.clipboard.writeText(expressionText);
    } catch (error) {
        const textarea = document.createElement('textarea');
        textarea.value = expressionText;
        textarea.setAttribute('readonly', '');
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        textarea.remove();
    }

    switchingExpressionCopyBtn.classList.add('is-copied');
    window.setTimeout(() => switchingExpressionCopyBtn.classList.remove('is-copied'), 900);
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
        isSimplifiedView = false;
        syncSimplifyButton(false);
        syncSwitchingExpression(null);
        syncCircuitSelector([]);
        setEmpty('Monte um circuito com saida para visualizar a conversao eletrica.');
        return;
    }

    syncCircuitSelector(roots);

    const selectedRoot = roots.find((root) => root.gateId === selectedCircuitId) || roots[0];
    selectedCircuitId = selectedRoot.gateId;

    const normalElectrical = convertLogicToElectrical(selectedRoot, inputs);
    const simplifiedRoot = simplifyLogicTree(selectedRoot, inputs);
    const simplifiedElectrical = convertLogicToElectrical(simplifiedRoot, inputs);
    const canSimplify = countElectricalSwitches(simplifiedElectrical) < countElectricalSwitches(normalElectrical);

    if (!canSimplify) {
        isSimplifiedView = false;
    }

    syncSimplifyButton(canSimplify);
    const renderedRoot = isSimplifiedView ? simplifiedRoot : selectedRoot;
    const renderedElectrical = isSimplifiedView ? simplifiedElectrical : normalElectrical;
    syncSwitchingExpression(renderedRoot);

    if (emptyState) {
        emptyState.style.display = 'none';
    }

    renderElectrical(svg, renderedElectrical);
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

export function pauseElectricalView() {
    if (svg?.__energyAnimFrame) {
        cancelAnimationFrame(svg.__energyAnimFrame);
        svg.__energyAnimFrame = null;
    }
}

document.addEventListener('click', (event) => {
    const copyExpression = event.target.closest('[data-action="copy-switching-expression"]');
    if (copyExpression) {
        copySwitchingExpression();
        return;
    }

    const simplifyToggle = event.target.closest('[data-action="switching-toggle-simplified"]');
    if (simplifyToggle) {
        if (simplifyToggle.disabled) {
            return;
        }

        isSimplifiedView = !isSimplifiedView;
        syncSimplifyButton(true);

        if (currentState) {
            const { roots, inputs } = buildLogicTrees(currentState);
            renderSelectedCircuit(roots, inputs);
        }
        return;
    }

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
