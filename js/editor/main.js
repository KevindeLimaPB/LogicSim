import { createGate } from './gates.js';
import { createWire } from './wires.js';
import { renderGate, updateGatePosition, updateGateValues, updateWirePath, getPinCenter } from './renderer.js';
import { recompute } from './simulator.js';
import { pauseElectricalView, updateElectricalView } from '../electrical/main.js';
import { buildLogicTrees } from '../electrical/parser.js';
import { convertLogicToElectrical } from '../electrical/converter.js';
import { simplifyLogicTree } from '../electrical/simplifier.js';

const workspace = document.getElementById('workspace');
const simulatorShell = document.getElementById('simulator-workspace');
const editorToolbar = document.querySelector('.editor-toolbar');
const componentsSection = simulatorShell?.querySelector('.toolbar-section--components');
const nodeLayer = document.getElementById('node-layer');
const wireLayer = document.getElementById('wire-layer');
const handleLayer = document.getElementById('wire-handles');
const expressionCards = document.querySelector('.toolbar-expression-cards');
const expressionLabel = document.getElementById('expression-label');
const simplifiedExpressionCard = document.getElementById('simplified-expression-card');
const simplifiedExpressionLabel = document.getElementById('simplified-expression-label');
const expressionExpandBtn = document.querySelector('[data-action="toggle-expression-list"]');
const simplifiedExpressionExpandBtn = document.querySelector('[data-action="toggle-simplified-expression-list"]');
const savedCircuitsDropdownWrap = document.getElementById('saved-circuits-dropdown-wrap');
const savedCircuitsDropdown = document.getElementById('saved-circuits-dropdown');
const savedCircuitsList = document.getElementById('saved-circuits-list');
const saveCircuitModal = document.getElementById('save-circuit-modal');
const saveCircuitForm = document.getElementById('save-circuit-form');
const saveCircuitNameInput = document.getElementById('save-circuit-name');
const renameCircuitModal = document.getElementById('rename-circuit-modal');
const renameCircuitForm = document.getElementById('rename-circuit-form');
const renameCircuitNameInput = document.getElementById('rename-circuit-name');
const deleteToggleBtn = document.querySelector('[data-action="toggle-delete"]');
const expandToggleBtn = document.querySelector('[data-action="toggle-expand"]');
const tutorialStartBtns = document.querySelectorAll('[data-action="start-tutorial"]');
const switchingTabBtn = document.getElementById('tab-switching');
const zoomLabel = document.getElementById('zoom-label');
const expressionCopyBtn = document.querySelector('[data-action="copy-expression"]');
const simplifiedExpressionCopyBtn = document.querySelector('[data-action="copy-simplified-expression"]');
const openSavedCircuitsBtn = document.querySelector('[data-action="open-saved-circuits"]');

const state = {
    gates: [],
    wires: [],
    nodes: new Map()
};

const zoomConfig = {
    min: 0.6,
    max: 1.6,
    step: 0.1
};

let dragTarget = null;
let dragOffset = { x: 0, y: 0 };
let panDrag = null;
let wiring = null;
let previewPath = null;
let deleteMode = false;
let zoomLevel = 1;
const panOffset = { x: 0, y: 0 };
const mobileLayoutQuery = window.matchMedia('(max-width: 899px)');

const tutorialState = {
    active: false,
    index: 0,
    steps: [],
    overlay: null,
    highlight: null,
    panel: null,
    title: null,
    text: null,
    progress: null,
    prevBtn: null,
    nextBtn: null,
    closeBtn: null,
    skipBtn: null,
    arrowLine: null,
    startedFromAuto: false,
    deleteModeBeforeStart: false,
    rafId: 0,
    stepUnlockTimeoutId: 0
};

const tutorialStorageKey = 'logicsim:tutorial:v1';
const savedCircuitsStorageKey = 'logicsim:saved-circuits:v1';
const switchingGlowInactivityMs = 2600;
const exampleLoadedTipVisibleMs = 2800;
const exampleLoadedTipExitMs = 260;
let switchingGlowTimeoutId = 0;
let exampleLoadedTipShowTimeoutId = 0;
let exampleLoadedTipHideTimeoutId = 0;
let truthTableCircuitIndex = 0;
let openedFromExample = false;
let selectedExpressionIndex = 0;
let expressionEntries = [];
let simplifiedExpressionEntries = [];
let currentOutputGateIds = [];
let circuitFlashTimeoutId = 0;
let isSimulatorViewVisible = true;
let simulatorViewDirty = false;
let isSwitchingViewVisible = false;
let switchingViewDirty = true;
let circuitIdBeingRenamed = null;

// Exibe o glow do botão de comutação por um período após alterações do circuito.
function signalCircuitChange() {
    if (!switchingTabBtn) {
        return;
    }

    switchingTabBtn.classList.add('tab-circuit-dirty');
    if (switchingGlowTimeoutId) {
        clearTimeout(switchingGlowTimeoutId);
    }

    switchingGlowTimeoutId = window.setTimeout(() => {
        switchingTabBtn.classList.remove('tab-circuit-dirty');
        switchingGlowTimeoutId = 0;
    }, switchingGlowInactivityMs);
}

// Mostra uma mensagem curta no canto da tela.
function showExampleLoadedTip(message = 'Exemplo carregado') {
    const tip = document.querySelector('.example-loaded-tip');
    if (!tip) {
        return;
    }

    const text = tip.querySelector('.example-loaded-tip__text');
    const progressBar = tip.querySelector('.example-loaded-tip__progress-bar');

    if (exampleLoadedTipShowTimeoutId) {
        clearTimeout(exampleLoadedTipShowTimeoutId);
        exampleLoadedTipShowTimeoutId = 0;
    }

    if (exampleLoadedTipHideTimeoutId) {
        clearTimeout(exampleLoadedTipHideTimeoutId);
        exampleLoadedTipHideTimeoutId = 0;
    }

    if (text) {
        text.textContent = message;
    }

    tip.setAttribute('aria-hidden', 'false');
    tip.classList.add('is-visible');

    if (progressBar) {
        progressBar.style.setProperty('transition', 'none', 'important');
        progressBar.style.setProperty('transform', 'scaleX(1)', 'important');
        progressBar.offsetWidth;
        requestAnimationFrame(() => {
            progressBar.style.setProperty('transition', `transform ${exampleLoadedTipVisibleMs}ms linear`, 'important');
            progressBar.style.setProperty('transform', 'scaleX(0)', 'important');
        });
    }

    exampleLoadedTipShowTimeoutId = window.setTimeout(() => {
        tip.classList.remove('is-visible');
        tip.setAttribute('aria-hidden', 'true');
        exampleLoadedTipHideTimeoutId = window.setTimeout(() => {
            if (progressBar) {
                progressBar.style.removeProperty('transition');
                progressBar.style.removeProperty('transform');
            }
            exampleLoadedTipHideTimeoutId = 0;
        }, exampleLoadedTipExitMs);
        exampleLoadedTipShowTimeoutId = 0;
    }, exampleLoadedTipVisibleMs);
}

// Rola a página até a área principal do simulador.
function scrollToSimulatorWorkspace() {
    const simulatorWorkspace = document.getElementById('simulator-workspace');
    if (!simulatorWorkspace) {
        return;
    }

    simulatorWorkspace.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function syncElectricalView() {
    switchingViewDirty = true;

    if (!isSwitchingViewVisible) {
        return;
    }

    updateElectricalView(state);
    switchingViewDirty = false;
}

function pauseSimulatorView() {
    clearCircuitFlash();
    state.wires.forEach((wire) => {
        wire.energyDots?.classList.remove('active');
    });
}

function readSavedCircuits() {
    try {
        const parsed = JSON.parse(localStorage.getItem(savedCircuitsStorageKey) || '[]');
        return Array.isArray(parsed) ? parsed : [];
    } catch (error) {
        return [];
    }
}

function writeSavedCircuits(circuits) {
    localStorage.setItem(savedCircuitsStorageKey, JSON.stringify(circuits));
}

function serializeCircuit(name) {
    return {
        id: crypto.randomUUID(),
        name,
        savedAt: new Date().toISOString(),
        viewport: {
            zoom: zoomLevel,
            panX: panOffset.x,
            panY: panOffset.y
        },
        gates: state.gates.map((gate) => ({
            id: gate.id,
            type: gate.type,
            x: gate.x,
            y: gate.y,
            inputs: Array.from(gate.inputs || []),
            output: gate.output,
            label: gate.label || ''
        })),
        wires: state.wires.map((wire) => ({
            fromId: wire.fromId,
            toId: wire.toId,
            inputIndex: wire.inputIndex
        }))
    };
}

function saveCurrentCircuit(name) {
    if (!name) {
        return;
    }

    const circuits = readSavedCircuits();
    const existingIndex = circuits.findIndex((circuit) => circuit.name.toLowerCase() === name.toLowerCase());
    const savedCircuit = serializeCircuit(name);

    if (existingIndex >= 0) {
        circuits[existingIndex] = { ...savedCircuit, id: circuits[existingIndex].id };
    } else {
        circuits.push(savedCircuit);
    }

    try {
        writeSavedCircuits(circuits);
        if (savedCircuitsDropdown && !savedCircuitsDropdown.hidden) {
            renderSavedCircuitsList();
        }
        showExampleLoadedTip('Circuito salvo no navegador');
    } catch (error) {
        showExampleLoadedTip('Não foi possível salvar o circuito');
    }
}

function openSaveCircuitModal() {
    if (!saveCircuitModal || !saveCircuitNameInput) {
        saveCurrentCircuit(`Circuito ${readSavedCircuits().length + 1}`);
        return;
    }

    saveCircuitNameInput.value = `Circuito ${readSavedCircuits().length + 1}`;
    saveCircuitModal.classList.add('is-open');
    saveCircuitModal.setAttribute('aria-hidden', 'false');
    requestAnimationFrame(() => {
        saveCircuitNameInput.focus();
        saveCircuitNameInput.select();
    });
}

function closeSaveCircuitModal() {
    if (saveCircuitModal) {
        saveCircuitModal.classList.remove('is-open');
        saveCircuitModal.setAttribute('aria-hidden', 'true');
    }
}

function submitSaveCircuitName(event) {
    event.preventDefault();
    const name = saveCircuitNameInput?.value.trim();
    if (!name) {
        saveCircuitNameInput?.focus();
        return;
    }

    saveCurrentCircuit(name);
    closeSaveCircuitModal();
}

function formatSavedDate(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
        return 'Data indisponível';
    }

    return date.toLocaleString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        year: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
    });
}

function renderSavedCircuitsList() {
    if (!savedCircuitsList) {
        return;
    }

    const circuits = readSavedCircuits().sort((a, b) => new Date(b.savedAt) - new Date(a.savedAt));
    if (!circuits.length) {
        savedCircuitsList.innerHTML = '<div class="saved-circuits-empty">Nenhum circuito salvo.</div>';
        return;
    }

    savedCircuitsList.innerHTML = circuits.map((circuit) => {
        const gateCount = Array.isArray(circuit.gates) ? circuit.gates.length : 0;
        const wireCount = Array.isArray(circuit.wires) ? circuit.wires.length : 0;
        return `<article class="saved-circuit-item" data-saved-circuit-id="${escapeHtml(circuit.id)}">`
            + `<div>`
            + `<div class="saved-circuit-item__name">${escapeHtml(circuit.name || 'Circuito sem nome')}</div>`
            + `<div class="saved-circuit-item__meta">${gateCount} componentes · ${wireCount} fios · ${escapeHtml(formatSavedDate(circuit.savedAt))}</div>`
            + `</div>`
            + `<div class="saved-circuit-item__actions">`
            + `<button class="saved-circuit-action" data-action="load-saved-circuit" type="button" aria-label="Carregar circuito" title="Carregar circuito">`
            + `<i class="fa-solid fa-arrow-right" aria-hidden="true"></i>`
            + `</button>`
            + `<button class="saved-circuit-action" data-action="rename-saved-circuit" type="button" aria-label="Renomear circuito" title="Renomear circuito">`
            + `<i class="fa-solid fa-pencil" aria-hidden="true"></i>`
            + `</button>`
            + `<button class="saved-circuit-action saved-circuit-action--delete" data-action="delete-saved-circuit" type="button" aria-label="Excluir circuito" title="Excluir circuito">`
            + `<i class="fa-solid fa-trash-can" aria-hidden="true"></i>`
            + `</button>`
            + `</div>`
            + `</article>`;
    }).join('');
}

function openSavedCircuitsDropdown() {
    renderSavedCircuitsList();
    if (savedCircuitsDropdown) {
        savedCircuitsDropdown.hidden = false;
        savedCircuitsDropdownWrap?.querySelector('[data-action="open-saved-circuits"]')?.setAttribute('aria-expanded', 'true');
    }
}

function closeSavedCircuitsDropdown() {
    if (savedCircuitsDropdown) {
        savedCircuitsDropdown.hidden = true;
        savedCircuitsDropdownWrap?.querySelector('[data-action="open-saved-circuits"]')?.setAttribute('aria-expanded', 'false');
    }
}

function toggleSavedCircuitsDropdown() {
    if (!savedCircuitsDropdown || savedCircuitsDropdown.hidden) {
        openSavedCircuitsDropdown();
    } else {
        closeSavedCircuitsDropdown();
    }
}

function openRenameCircuitModal(circuitId) {
    const circuit = readSavedCircuits().find((item) => item.id === circuitId);
    if (!circuit || !renameCircuitModal || !renameCircuitNameInput) {
        return;
    }

    circuitIdBeingRenamed = circuitId;
    renameCircuitNameInput.value = circuit.name || 'Circuito sem nome';
    renameCircuitModal.classList.add('is-open');
    renameCircuitModal.setAttribute('aria-hidden', 'false');
    requestAnimationFrame(() => {
        renameCircuitNameInput.focus();
        renameCircuitNameInput.select();
    });
}

function closeRenameCircuitModal() {
    circuitIdBeingRenamed = null;
    if (renameCircuitModal) {
        renameCircuitModal.classList.remove('is-open');
        renameCircuitModal.setAttribute('aria-hidden', 'true');
    }
}

function submitRenameCircuit(event) {
    event.preventDefault();
    const name = renameCircuitNameInput?.value.trim();
    if (!name || !circuitIdBeingRenamed) {
        renameCircuitNameInput?.focus();
        return;
    }

    const circuits = readSavedCircuits();
    const circuitIndex = circuits.findIndex((circuit) => circuit.id === circuitIdBeingRenamed);
    if (circuitIndex < 0) {
        closeRenameCircuitModal();
        showExampleLoadedTip('Circuito salvo não encontrado');
        return;
    }

    circuits[circuitIndex] = {
        ...circuits[circuitIndex],
        name,
        renamedAt: new Date().toISOString()
    };

    try {
        writeSavedCircuits(circuits);
        renderSavedCircuitsList();
        closeRenameCircuitModal();
        showExampleLoadedTip('Circuito renomeado');
    } catch (error) {
        showExampleLoadedTip('Não foi possível renomear');
    }
}

// Copia a expressão booleana exibida no toolbar.
async function copyExpressionFrom(labelElement, buttonElement) {
    if (!labelElement || !buttonElement) {
        return;
    }

    const expressionText = labelElement.innerText.trim();
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

    buttonElement.classList.add('is-copied');
    window.setTimeout(() => buttonElement.classList.remove('is-copied'), 900);
}

async function copyExpression() {
    copyExpressionFrom(expressionLabel, expressionCopyBtn);
}

async function copySimplifiedExpression() {
    copyExpressionFrom(simplifiedExpressionLabel, simplifiedExpressionCopyBtn);
}

async function copyExpressionRow(buttonElement) {
    if (!buttonElement) {
        return;
    }

    const expressionText = buttonElement.dataset.copyText || '';
    if (!expressionText) {
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

    buttonElement.classList.add('is-copied');
    window.setTimeout(() => buttonElement.classList.remove('is-copied'), 900);
}

// Dispara a cópia dos botões individuais das expressões renderizadas dinamicamente.
function handleExpressionRowCopyClick(event) {
    const buttonElement = event.target.closest('[data-action="copy-expression-row"]');
    if (!buttonElement) {
        return;
    }

    copyExpressionRow(buttonElement);
}

function syncExpressionExpandButton(buttonElement, cardElement, lineCount) {
    if (!buttonElement || !cardElement) {
        return;
    }

    const canExpand = lineCount > 1;
    buttonElement.hidden = !canExpand;
    buttonElement.setAttribute('aria-expanded', 'false');
    buttonElement.title = canExpand ? 'Mostrar todas as expressões' : '';
    cardElement.classList.remove('is-expanded');
}

// Converte a posição do mouse para as coordenadas do simulador.
function setExpressionCardsExpanded(expanded) {
    const normalCard = expressionLabel?.closest('.toolbar-expression');
    const simplifiedCard = simplifiedExpressionLabel?.closest('.toolbar-expression');

    [normalCard, simplifiedCard].forEach((card) => {
        card?.classList.toggle('is-expanded', expanded);
    });

    [expressionExpandBtn, simplifiedExpressionExpandBtn].forEach((button) => {
        if (!button || button.hidden) {
            return;
        }
        button.setAttribute('aria-expanded', String(expanded));
        button.title = expanded ? 'Recolher expressões' : 'Mostrar todas as expressões';
    });
}

function toggleExpressionCards(buttonElement) {
    if (!buttonElement || buttonElement.hidden) {
        return;
    }

    const normalCard = expressionLabel?.closest('.toolbar-expression');
    const simplifiedCard = simplifiedExpressionLabel?.closest('.toolbar-expression');
    const expanded = !(normalCard?.classList.contains('is-expanded') || simplifiedCard?.classList.contains('is-expanded'));
    setExpressionCardsExpanded(expanded);
}

function screenToWorld(event) {
    const workspaceRect = workspace.getBoundingClientRect();

    return {
        x: (event.clientX - workspaceRect.left - panOffset.x) / zoomLevel,
        y: (event.clientY - workspaceRect.top - panOffset.y) / zoomLevel
    };
}

// Aplica zoom e pan na área de trabalho e atualiza os fios.
function applyViewport() {
    const transform = `translate(${panOffset.x}px, ${panOffset.y}px) scale(${zoomLevel})`;
    wireLayer.style.transform = transform;
    nodeLayer.style.transform = transform;
    handleLayer.style.transform = transform;

    workspace.style.setProperty('--pan-x', `${panOffset.x}px`);
    workspace.style.setProperty('--pan-y', `${panOffset.y}px`);

    if (zoomLabel) {
        zoomLabel.textContent = `${Math.round(zoomLevel * 100)}%`;
    }

    updateAllWires();
}

// Ajusta o nível de zoom respeitando os limites configurados.
function changeZoom(direction) {
    const nextZoom = zoomLevel + direction * zoomConfig.step;
    zoomLevel = Math.max(zoomConfig.min, Math.min(zoomConfig.max, Number(nextZoom.toFixed(2))));
    applyViewport();
}

// Liga ou desliga o modo de remoção de elementos.
function setDeleteMode(enabled) {
    deleteMode = enabled;
    workspace.classList.toggle('delete-mode', deleteMode);
    if (deleteToggleBtn) {
        deleteToggleBtn.classList.toggle('is-active', deleteMode);
    }
}

// Retorna o elemento alvo de um passo do tutorial.
function resolveTutorialTarget(step) {
    if (!step) {
        return null;
    }

    if (typeof step.getTarget === 'function') {
        return step.getTarget();
    }

    if (step.selector) {
        return document.querySelector(step.selector);
    }

    return null;
}

// Mantém um valor dentro dos limites mínimo e máximo.
function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}

// Posiciona a caixa de destaque e o cartão do tutorial.
function positionTutorialElements() {
    if (!tutorialState.active || !tutorialState.overlay) {
        return;
    }

    const step = tutorialState.steps[tutorialState.index];
    if (!step) {
        return;
    }

    const fallbackRect = {
        left: window.innerWidth * 0.2,
        top: window.innerHeight * 0.25,
        width: window.innerWidth * 0.6,
        height: window.innerHeight * 0.4
    };
    const target = resolveTutorialTarget(step);
    const targetRect = target ? target.getBoundingClientRect() : fallbackRect;

    const pad = 8;
    const hLeft = clamp(targetRect.left - pad, 6, window.innerWidth - 40);
    const hTop = clamp(targetRect.top - pad, 6, window.innerHeight - 40);
    const hWidth = clamp(targetRect.width + pad * 2, 28, window.innerWidth - hLeft - 6);
    const hHeight = clamp(targetRect.height + pad * 2, 28, window.innerHeight - hTop - 6);

    tutorialState.highlight.style.left = `${hLeft}px`;
    tutorialState.highlight.style.top = `${hTop}px`;
    tutorialState.highlight.style.width = `${hWidth}px`;
    tutorialState.highlight.style.height = `${hHeight}px`;
    tutorialState.overlay.style.setProperty('--tutorial-cut-left', `${hLeft}px`);
    tutorialState.overlay.style.setProperty('--tutorial-cut-top', `${hTop}px`);
    tutorialState.overlay.style.setProperty('--tutorial-cut-width', `${hWidth}px`);
    tutorialState.overlay.style.setProperty('--tutorial-cut-height', `${hHeight}px`);

    const panel = tutorialState.panel;
    panel.style.left = '12px';
    panel.style.top = '12px';

    const panelRect = panel.getBoundingClientRect();
    const targetCenterX = targetRect.left + targetRect.width / 2;
    const targetCenterY = targetRect.top + targetRect.height / 2;
    const wantsRight = targetCenterX < window.innerWidth / 2;
    const panelX = wantsRight
        ? targetRect.right + 20
        : targetRect.left - panelRect.width - 20;
    const panelY = targetCenterY - panelRect.height / 2;

    const finalX = clamp(panelX, 12, window.innerWidth - panelRect.width - 12);
    const finalY = clamp(panelY, 12, window.innerHeight - panelRect.height - 12);
    panel.style.left = `${finalX}px`;
    panel.style.top = `${finalY}px`;
}

// Reposiciona o tutorial no próximo frame para evitar jitter visual.
function queueTutorialReposition() {
    if (!tutorialState.active) {
        return;
    }

    if (tutorialState.rafId) {
        cancelAnimationFrame(tutorialState.rafId);
    }

    tutorialState.rafId = requestAnimationFrame(() => {
        tutorialState.rafId = 0;
        positionTutorialElements();
    });
}

// Reinicia timers do contador entre passos do tutorial.
function clearTutorialStepTimers() {
    if (tutorialState.stepUnlockTimeoutId) {
        clearTimeout(tutorialState.stepUnlockTimeoutId);
        tutorialState.stepUnlockTimeoutId = 0;
    }
    // reset visual progress when timers cleared
    try { resetProgressBar(); } catch (e) { /* ignore */ }
}

// Bloqueia o botão de avanço por alguns segundos para incentivar leitura.
function startTutorialStepCountdown(seconds = 2) {
    if (!tutorialState.nextBtn) return;

    clearTutorialStepTimers();

    const baseLabel = tutorialState.index === tutorialState.steps.length - 1 ? 'Concluir' : 'Proximo';
    tutorialState.nextBtn.disabled = true;
    tutorialState.nextBtn.textContent = baseLabel;

    // inicia barra de progresso visual
    startProgressBar(seconds);

    tutorialState.stepUnlockTimeoutId = window.setTimeout(() => {
        clearTutorialStepTimers();
        if (!tutorialState.active || !tutorialState.nextBtn) return;
        tutorialState.nextBtn.disabled = false;
        tutorialState.nextBtn.textContent = baseLabel;
        resetProgressBar();
    }, seconds * 1000);
}

function startProgressBar(seconds = 2) {
    if (!tutorialState.progressFill) return;
    const fill = tutorialState.progressFill;
    fill.style.transition = 'none';
    fill.style.width = '0%';
    // forçar reflow
    void fill.offsetWidth;
    fill.style.transition = `width ${seconds}s linear`;
    fill.style.width = '100%';
}

function resetProgressBar() {
    if (!tutorialState.progressFill) return;
    const fill = tutorialState.progressFill;
    fill.style.transition = 'none';
    fill.style.width = '0%';
}

// Fecha o tutorial e restaura estado da interface quando necessário.
function closeTutorial(markAsSeen = true) {
    if (!tutorialState.active) {
        return;
    }

    tutorialState.active = false;
    if (tutorialState.overlay) {
        tutorialState.overlay.remove();
    }
    tutorialState.overlay = null;
    tutorialState.highlight = null;
    tutorialState.panel = null;
    tutorialState.title = null;
    tutorialState.text = null;
    tutorialState.progress = null;
    tutorialState.prevBtn = null;
    tutorialState.nextBtn = null;
    tutorialState.closeBtn = null;
    tutorialState.skipBtn = null;
    tutorialState.arrowLine = null;
    clearTutorialStepTimers();

    if (tutorialState.startedFromAuto) {
        try {
            localStorage.setItem(tutorialStorageKey, 'seen');
        } catch (error) {
            // Ignora falha de armazenamento.
        }
    } else if (markAsSeen) {
        try {
            localStorage.setItem(tutorialStorageKey, 'seen');
        } catch (error) {
            // Ignora falha de armazenamento.
        }
    }

    if (!tutorialState.deleteModeBeforeStart) {
        setDeleteMode(false);
    }

    window.removeEventListener('resize', queueTutorialReposition);
    window.removeEventListener('scroll', queueTutorialReposition, true);
}

// Centraliza o alvo do passo atual para melhorar a leitura do tutorial.
function scrollTutorialTargetIntoView(step) {
    const target = resolveTutorialTarget(step);
    if (!target || typeof target.scrollIntoView !== 'function') {
        return;
    }

    target.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
        inline: 'center'
    });
}

// Atualiza conteúdo e destino visual do passo corrente.
function renderTutorialStep(shouldScroll = false) {
    const step = tutorialState.steps[tutorialState.index];
    if (!step) {
        closeTutorial(true);
        return;
    }

    if (typeof step.beforeStep === 'function') {
        step.beforeStep();
    }

    tutorialState.title.textContent = step.title;
    tutorialState.text.textContent = step.description;
    tutorialState.progress.textContent = `Missao ${tutorialState.index + 1}/${tutorialState.steps.length}`;
    tutorialState.prevBtn.disabled = tutorialState.index === 0;
    startTutorialStepCountdown(2);

    // show media GIF if step defines one
    const mediaPath = step.media;
    if (mediaPath) {
        showTutorialMedia(mediaPath);
    } else {
        hideTutorialMedia();
    }

    if (shouldScroll) {
        requestAnimationFrame(() => {
            scrollTutorialTargetIntoView(step);
            requestAnimationFrame(() => {
                queueTutorialReposition();
            });
        });
        return;
    }

    queueTutorialReposition();
}

// Cria e exibe um elemento de mídia (gif) dentro do painel do tutorial.
function showTutorialMedia(src) {
    if (!tutorialState.panel) return;
    let container = tutorialState.panel.querySelector('.logic-tutorial__media');
    if (!container) {
        container = document.createElement('div');
        container.className = 'logic-tutorial__media';
        tutorialState.panel.appendChild(container);
    }

    // sempre garante que o container esteja visível
    container.style.display = '';
    const existing = container.querySelector('img');
    if (existing) {
        if (existing.getAttribute('src') !== src) {
            existing.removeAttribute('loading');
            existing.src = src;
        }
        return;
    }

    container.innerHTML = '';
    const img = document.createElement('img');
    img.src = src;
    img.alt = 'Demonstração';
    img.removeAttribute('loading');
    img.style.maxWidth = '280px';
    img.style.width = '100%';
    img.style.height = 'auto';
    img.style.borderRadius = '12px';
    img.style.cursor = 'pointer';
    img.addEventListener('click', () => openTutorialMediaModal(src));
    // show image once it starts loading to avoid flicker
    img.addEventListener('load', () => {
        img.style.opacity = '';
    });
    container.appendChild(img);
}

function hideTutorialMedia() {
    if (!tutorialState.panel) return;
    const container = tutorialState.panel.querySelector('.logic-tutorial__media');
    if (container) {
        container.style.display = 'none';
    }
}

// Modal para exibir GIF em tamanho maior
function openTutorialMediaModal(src) {
    let modal = document.querySelector('.tutorial-media-modal');
    if (!modal) {
        modal = document.createElement('div');
        modal.className = 'tutorial-media-modal';

        const backdrop = document.createElement('div');
        backdrop.className = 'tutorial-media-modal__backdrop';
        modal.appendChild(backdrop);

        const content = document.createElement('div');
        content.className = 'tutorial-media-modal__content';
        modal.appendChild(content);

        const img = document.createElement('img');
        img.className = 'tutorial-media-modal__img';
        content.appendChild(img);

        backdrop.addEventListener('click', closeTutorialMediaModal);
        modal.addEventListener('click', (e) => {
            if (e.target === modal) closeTutorialMediaModal();
        });

        document.body.appendChild(modal);

        window.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') closeTutorialMediaModal();
        });
    }

    const modalImg = modal.querySelector('.tutorial-media-modal__img');
    modalImg.src = src;
    modal.classList.add('is-open');
}

function closeTutorialMediaModal() {
    const modal = document.querySelector('.tutorial-media-modal');
    if (!modal) return;
    modal.classList.remove('is-open');
}

// Avança ou retrocede no fluxo do tutorial.
function changeTutorialStep(direction) {
    if (!tutorialState.active) {
        return;
    }

    const next = tutorialState.index + direction;
    if (next < 0) {
        return;
    }

    if (next >= tutorialState.steps.length) {
        closeTutorial(true);
        return;
    }

    tutorialState.index = next;
    renderTutorialStep(direction > 0);
}

// Define os passos com foco nas ações principais do simulador.
function buildTutorialSteps() {
    return [
        {
            title: 'Mapa da fase',
            description: 'Aqui e a tela principal. Monte o circuito no editor e navegue nas abas para ver tabela verdade e comutacao.',
            selector: '.page-tabs',
            beforeStep: () => tabSim?.click()
        },
        {
            title: 'Spawn de portas',
            description: 'Use esses botoes para adicionar portas. Comece com Input, Input e uma porta logica como AND.',
            selector: '.simulator-shell [data-add="AND"]',
            beforeStep: () => tabSim?.click()
        },
        {
            title: 'Arena de montagem',
            description: 'Arraste as portas para organizar. Clique e arraste no fundo para mover a camera quando o circuito crescer.',
            selector: '#workspace',
            beforeStep: () => tabSim?.click(),
            media: 'img/gifs/simulador.gif'
        },
        {
            title: 'Ligando os fios',
            description: 'Clique no pino de saida de uma porta e arraste ate o pino de entrada da proxima para criar a conexao.',
            selector: '#workspace .pin.output',
            beforeStep: () => tabSim?.click()
        },
        {
            title: 'Tabela verdade',
            description: 'Quando o circuito estiver montado, abra esta aba para gerar automaticamente todas as combinacoes de entrada e saida.',
            selector: '#tab-truthtable'
        },
        {
            title: 'Circuito de comutacao',
            description: 'Nesta aba voce ve a representacao eletrica equivalente, com trilhas de energia animadas em tempo real.',
            selector: '#tab-switching',
            media: 'img/gifs/circuito.gif'
        },
        {
            title: 'Modo deletar',
            description: 'Ative o modo Deletar para remover conexoes e portas com rapidez durante os ajustes do circuito.',
            selector: '[data-action="toggle-delete"]',
            beforeStep: () => {
                tabSim?.click();
                setDeleteMode(true);
            }
        },
        {
            title: 'Apagar fio ou porta',
            description: 'Com o modo deletar ativo, clique no x do fio ou no x da porta. Use Limpar para resetar tudo de uma vez.',
            selector: '#workspace .wire-delete, #workspace .node-delete',
            beforeStep: () => {
                tabSim?.click();
                setDeleteMode(true);
            }
        }
    ];
}

// Inicia o overlay do tutorial com navegação por etapas.
function startTutorial(isAuto = false) {
    if (tutorialState.active) {
        return;
    }

    tutorialState.active = true;
    tutorialState.index = 0;
    tutorialState.startedFromAuto = isAuto;
    tutorialState.deleteModeBeforeStart = deleteMode;
    tutorialState.steps = buildTutorialSteps();

    const overlay = document.createElement('div');
    overlay.className = 'logic-tutorial';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.tabIndex = -1;

    const backdrop = document.createElement('div');
    backdrop.className = 'logic-tutorial__backdrop';

    const highlight = document.createElement('div');
    highlight.className = 'logic-tutorial__highlight';

    const panel = document.createElement('section');
    panel.className = 'logic-tutorial__panel';

    const progress = document.createElement('p');
    progress.className = 'logic-tutorial__progress';

    const title = document.createElement('h3');
    title.className = 'logic-tutorial__title';

    const text = document.createElement('p');
    text.className = 'logic-tutorial__text';

    const controls = document.createElement('div');
    controls.className = 'logic-tutorial__controls';

    const prevBtn = document.createElement('button');
    prevBtn.type = 'button';
    prevBtn.className = 'logic-tutorial__btn';
    prevBtn.textContent = 'Voltar';

    const nextBtn = document.createElement('button');
    nextBtn.type = 'button';
    nextBtn.className = 'logic-tutorial__btn logic-tutorial__btn--primary';
    nextBtn.textContent = 'Proximo';

    const skipBtn = document.createElement('button');
    skipBtn.type = 'button';
    skipBtn.className = 'logic-tutorial__btn logic-tutorial__btn--ghost';
    skipBtn.textContent = 'Finalizar';

    const closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'logic-tutorial__close';
    closeBtn.setAttribute('aria-label', 'Fechar tutorial');
    closeBtn.textContent = 'x';

    prevBtn.addEventListener('click', () => changeTutorialStep(-1));
    nextBtn.addEventListener('click', () => changeTutorialStep(1));
    skipBtn.addEventListener('click', () => closeTutorial(true));
    closeBtn.addEventListener('click', () => closeTutorial(true));
    backdrop.addEventListener('click', () => closeTutorial(true));

    overlay.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') {
            closeTutorial(true);
        } else if (event.key === 'ArrowRight' || event.key === 'Enter') {
            if (tutorialState.nextBtn?.disabled) {
                return;
            }
            event.preventDefault();
            changeTutorialStep(1);
        } else if (event.key === 'ArrowLeft') {
            event.preventDefault();
            changeTutorialStep(-1);
        }
    });

    controls.appendChild(prevBtn);
    controls.appendChild(nextBtn);
    controls.appendChild(skipBtn);

    // progress bar container (visual countdown until next step unlock)
    const progressBar = document.createElement('div');
    progressBar.className = 'logic-tutorial__progressbar';
    const progressFill = document.createElement('div');
    progressFill.className = 'logic-tutorial__progressbar__fill';
    progressBar.appendChild(progressFill);

    panel.appendChild(closeBtn);
    panel.appendChild(progress);
    panel.appendChild(title);
    panel.appendChild(text);
    panel.appendChild(controls);
    panel.appendChild(progressBar);

    overlay.appendChild(backdrop);
    overlay.appendChild(highlight);
    overlay.appendChild(panel);
    document.body.appendChild(overlay);

    tutorialState.overlay = overlay;
    tutorialState.highlight = highlight;
    tutorialState.panel = panel;
    tutorialState.title = title;
    tutorialState.text = text;
    tutorialState.progress = progress;
    tutorialState.prevBtn = prevBtn;
    tutorialState.nextBtn = nextBtn;
    tutorialState.closeBtn = closeBtn;
    tutorialState.skipBtn = skipBtn;
    tutorialState.arrowLine = null;
    tutorialState.progressBar = progressBar;
    tutorialState.progressFill = progressFill;

    window.addEventListener('resize', queueTutorialReposition);
    window.addEventListener('scroll', queueTutorialReposition, true);

    renderTutorialStep();
    queueTutorialReposition();
    overlay.focus();
}

// Cria e renderiza uma nova porta no editor.
function addGate(type, x = 120, y = 120, options = {}) {
    const gate = createGate(type, x, y);
    if (options.label) {
        gate.label = options.label;
    } else if (type === 'INPUT') {
        gate.label = getNextInputLabel();
    }
    state.gates.push(gate);
    const node = renderGate(gate, nodeLayer);
    state.nodes.set(gate.id, node);
    updateGateValues(gate, node);
    updateAllWires();
    return gate;
}

function getNextInputLabel() {
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    const usedLabels = new Set(
        state.gates
            .filter((gate) => gate.type === 'INPUT' && gate.label)
            .map((gate) => gate.label.toUpperCase())
    );

    const nextLabel = alphabet.split('').find((letter) => !usedLabels.has(letter));
    return nextLabel || `I${usedLabels.size + 1}`;
}

// Remove uma porta e apaga os fios ligados a ela.
function removeGate(gateId) {
    const node = state.nodes.get(gateId);
    if (node) {
        node.remove();
    }

    state.nodes.delete(gateId);
    state.gates = state.gates.filter((gate) => gate.id !== gateId);

    const remainingWires = [];
    state.wires.forEach((wire) => {
        if (wire.fromId === gateId || wire.toId === gateId) {
            wire.path?.remove();
            wire.energyDots?.remove();
            wire.deleteHandle?.remove();
            return;
        }
        remainingWires.push(wire);
    });
    state.wires = remainingWires;
    updateSimulation();
}

// Limpa todo o circuito e reinicia a área do editor.
function resetCircuitEditor() {
    dragTarget = null;
    panDrag = null;
    wiring = null;
    if (previewPath) {
        previewPath.remove();
        previewPath = null;
    }

    state.wires.forEach((wire) => {
        wire.path?.remove();
        wire.energyDots?.remove();
        wire.deleteHandle?.remove();
    });

    state.gates.forEach((gate) => {
        state.nodes.get(gate.id)?.remove();
    });

    state.gates = [];
    state.wires = [];
    state.nodes.clear();
    expressionLabel.textContent = '-';
}

function clearSimulator() {
    resetCircuitEditor();
    syncElectricalView();
}

// Cria um fio visual e registra a conexão entre portas.
function loadSavedCircuit(circuitId) {
    const circuit = readSavedCircuits().find((item) => item.id === circuitId);
    if (!circuit || !Array.isArray(circuit.gates)) {
        showExampleLoadedTip('Circuito salvo não encontrado');
        renderSavedCircuitsList();
        return;
    }

    resetCircuitEditor();

    const restoredIds = new Set();
    circuit.gates.forEach((savedGate) => {
        if (!savedGate?.type) {
            return;
        }

        const gate = createGate(savedGate.type, Number(savedGate.x) || 120, Number(savedGate.y) || 120);
        gate.id = savedGate.id || crypto.randomUUID();
        gate.inputs = Array.isArray(savedGate.inputs) ? savedGate.inputs.map((value) => value ? 1 : 0) : gate.inputs;
        gate.output = savedGate.output ? 1 : 0;
        gate.label = savedGate.label || gate.label;
        state.gates.push(gate);

        const node = renderGate(gate, nodeLayer);
        state.nodes.set(gate.id, node);
        restoredIds.add(gate.id);
    });

    (circuit.wires || []).forEach((wire) => {
        if (!restoredIds.has(wire.fromId) || !restoredIds.has(wire.toId)) {
            return;
        }
        addWire(wire.fromId, wire.toId, Number(wire.inputIndex) || 0);
    });

    if (circuit.viewport) {
        zoomLevel = Math.max(zoomConfig.min, Math.min(zoomConfig.max, Number(circuit.viewport.zoom) || 1));
        panOffset.x = Number(circuit.viewport.panX) || 0;
        panOffset.y = Number(circuit.viewport.panY) || 0;
        applyViewport();
    }

    setDeleteMode(false);
    selectedExpressionIndex = 0;
    updateSimulation();
    closeSavedCircuitsDropdown();
    showExampleLoadedTip('Circuito carregado');
}

function deleteSavedCircuit(circuitId) {
    const nextCircuits = readSavedCircuits().filter((circuit) => circuit.id !== circuitId);
    try {
        writeSavedCircuits(nextCircuits);
        renderSavedCircuitsList();
        showExampleLoadedTip('Circuito excluído');
    } catch (error) {
        showExampleLoadedTip('Não foi possível excluir');
    }
}

function addWire(fromId, toId, inputIndex) {
    const wire = createWire(fromId, toId, inputIndex);
    wire.path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    wire.path.classList.add('wire');
    wire.path.dataset.wireId = wire.id;
    wire.path.id = `wire-path-${wire.id}`;
    wireLayer.appendChild(wire.path);

    wire.energyDots = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    wire.energyDots.classList.add('wire-energy-dots');
    wire.energyDots.dataset.wireId = wire.id;

    [0, -0.28, -0.56].forEach((delay) => {
        const dot = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        dot.setAttribute('r', '4');

        const motion = document.createElementNS('http://www.w3.org/2000/svg', 'animateMotion');
        motion.setAttribute('dur', '0.95s');
        motion.setAttribute('begin', `${delay}s`);
        motion.setAttribute('repeatCount', 'indefinite');

        const motionPath = document.createElementNS('http://www.w3.org/2000/svg', 'mpath');
        motionPath.setAttribute('href', `#${wire.path.id}`);
        motion.appendChild(motionPath);

        dot.appendChild(motion);
        wire.energyDots.appendChild(dot);
    });

    wireLayer.appendChild(wire.energyDots);

    wire.deleteHandle = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    wire.deleteHandle.classList.add('wire-delete');
    wire.deleteHandle.dataset.wireId = wire.id;

    const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    circle.setAttribute('r', '10');
    wire.deleteHandle.appendChild(circle);

    const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    text.setAttribute('y', '3');
    text.textContent = 'x';
    wire.deleteHandle.appendChild(text);

    handleLayer.appendChild(wire.deleteHandle);
    state.wires.push(wire);
    return wire;
}

// Recalcula o caminho e o estado visual de todos os fios.
function updateAllWires() {
    const gateMap = new Map(state.gates.map((gate) => [gate.id, gate]));

    state.wires.forEach((wire) => {
        const fromGate = gateMap.get(wire.fromId);
        const toGate = gateMap.get(wire.toId);
        const path = wire.path;
        const deleteHandle = wire.deleteHandle;
        if (!fromGate || !toGate || !path) {
            wire.energyDots?.classList.remove('active');
            return;
        }

        const fromNode = state.nodes.get(fromGate.id);
        const toNode = state.nodes.get(toGate.id);
        if (!fromNode || !toNode) {
            wire.energyDots?.classList.remove('active');
            return;
        }

        const fromPin = fromNode.querySelector('.pin.output');
        const toPin = toNode.querySelector(`.pin.input[data-pin-index="${wire.inputIndex}"]`);
        if (!fromPin || !toPin) {
            wire.energyDots?.classList.remove('active');
            return;
        }

        const from = getPinCenter(fromPin, workspace, zoomLevel, panOffset);
        const to = getPinCenter(toPin, workspace, zoomLevel, panOffset);
        updateWirePath(path, from, to);
        const isActive = fromGate.output === 1;
        path.classList.toggle('active', isActive);
        wire.energyDots?.classList.toggle('active', isActive);
        if (deleteHandle) {
            const midX = (from.x + to.x) / 2;
            const midY = (from.y + to.y) / 2;
            deleteHandle.setAttribute('transform', `translate(${midX}, ${midY})`);
        }
    });
}

function syncOutputLabels() {
    state.gates
        .filter((gate) => gate.type === 'OUTPUT')
        .forEach((gate, index) => {
            gate.label = `Y${index + 1}`;
        });
}

function syncSimulatorVisuals() {
    state.gates.forEach((gate) => {
        const node = state.nodes.get(gate.id);
        if (node) {
            updateGateValues(gate, node);
        }
    });
    updateAllWires();
    computeExpression();
    simulatorViewDirty = false;
}

// Reavalia o circuito e sincroniza a interface com os novos valores.
function updateSimulation() {
    recompute(state);
    syncOutputLabels();

    if (isSimulatorViewVisible) {
        syncSimulatorVisuals();
    } else {
        simulatorViewDirty = true;
    }

    syncElectricalView();
}

// Trata o clique nos botões que adicionam novas portas.
function handleAddClick(event) {
    const btn = event.target.closest('[data-add]');
    if (!btn) {
        return;
    }
    if (btn.closest('.logic-drawer')) {
        alert('Falta fazer oq vai acontecer quando clicar aqui');
        return;
    }
    const type = btn.dataset.add;
    addGate(type, 140 + Math.random() * 180, 140 + Math.random() * 120);
    updateSimulation();
    signalCircuitChange();
}

// Alterna o modo de exclusão ao clicar no botão correspondente.
function handleDeleteToggle(event) {
    const btn = event.target.closest('[data-action="toggle-delete"]');
    if (!btn) {
        return;
    }

    setDeleteMode(!deleteMode);
}

// Confirma e executa a limpeza completa do simulador.
function handleClearSimulator(event) {
    const btn = event.target.closest('[data-action="clear-simulator"]');
    if (!btn) {
        return;
    }

    const shouldClear = window.confirm('Tem certeza que deseja limpar o simulador?');
    if (!shouldClear) {
        return;
    }

    clearSimulator();
    signalCircuitChange();
}

// Inicia arraste, pan ou criação de fio conforme o alvo clicado.
function handleSavedCircuitActions(event) {
    const saveButton = event.target.closest('[data-action="save-circuit"]');
    if (saveButton) {
        openSaveCircuitModal();
        return;
    }

    const openButton = event.target.closest('[data-action="open-saved-circuits"]');
    if (openButton) {
        toggleSavedCircuitsDropdown();
        return;
    }

    if (event.target.closest('[data-action="close-saved-circuits"]')) {
        closeSavedCircuitsDropdown();
        return;
    }

    if (event.target.closest('[data-action="close-save-circuit"]')) {
        closeSaveCircuitModal();
        return;
    }

    if (event.target.closest('[data-action="close-rename-circuit"]')) {
        closeRenameCircuitModal();
        return;
    }

    if (savedCircuitsDropdown && !savedCircuitsDropdown.hidden && event.target instanceof Node
        && !savedCircuitsDropdownWrap?.contains(event.target)) {
        closeSavedCircuitsDropdown();
    }

    const item = event.target.closest('.saved-circuit-item[data-saved-circuit-id]');
    if (!item) {
        return;
    }

    const circuitId = item.dataset.savedCircuitId;
    if (event.target.closest('[data-action="load-saved-circuit"]')) {
        loadSavedCircuit(circuitId);
        signalCircuitChange();
        return;
    }

    if (event.target.closest('[data-action="rename-saved-circuit"]')) {
        openRenameCircuitModal(circuitId);
        return;
    }

    if (event.target.closest('[data-action="delete-saved-circuit"]')) {
        deleteSavedCircuit(circuitId);
    }
}

function handleWorkspacePointerDown(event) {
    if (event.target.closest('[data-action="delete-node"], [data-action="inc-inputs"], [data-action="dec-inputs"], [data-action="toggle-input"], [data-action="set-label"]')) {
        return;
    }

    const pin = event.target.closest('.pin');
    if (pin && pin.dataset.pinType === 'output') {
        const gateId = pin.dataset.gateId;
        wiring = { fromId: gateId };
        previewPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        previewPath.classList.add('wire', 'preview');
        wireLayer.appendChild(previewPath);
        return;
    }

    const node = event.target.closest('.node');
    if (!node) {
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
        workspace.classList.add('panning');
        workspace.setPointerCapture?.(event.pointerId);
        event.preventDefault();
        return;
    }

    dragTarget = node;
    dragTarget.classList.add('dragging');
    const gate = state.gates.find((item) => item.id === node.dataset.gateId);
    if (!gate) {
        return;
    }

    const rect = node.getBoundingClientRect();
    dragOffset = {
        x: (event.clientX - rect.left) / zoomLevel,
        y: (event.clientY - rect.top) / zoomLevel
    };
}

// Atualiza arraste, pan e pré-visualização dos fios enquanto o ponteiro move.
function handleWorkspacePointerMove(event) {
    if (panDrag) {
        panOffset.x = panDrag.originX + event.clientX - panDrag.startX;
        panOffset.y = panDrag.originY + event.clientY - panDrag.startY;
        applyViewport();
        return;
    }

    if (dragTarget) {
        const gate = state.gates.find((item) => item.id === dragTarget.dataset.gateId);
        if (!gate) {
            return;
        }

        const pointer = screenToWorld(event);
        gate.x = pointer.x - dragOffset.x;
        gate.y = pointer.y - dragOffset.y;
        updateGatePosition(dragTarget, gate);
        updateAllWires();
        signalCircuitChange();
    }

    if (previewPath && wiring) {
        const fromGate = state.gates.find((item) => item.id === wiring.fromId);
        const fromNode = state.nodes.get(fromGate.id);
        const fromPin = fromNode.querySelector('.pin.output');
        const from = getPinCenter(fromPin, workspace, zoomLevel, panOffset);
        const to = screenToWorld(event);
        updateWirePath(previewPath, from, to);
    }
}

// Finaliza interações de arraste, pan ou ligação de fios.
function handleWorkspacePointerUp(event) {
    if (panDrag) {
        workspace.releasePointerCapture?.(panDrag.pointerId);
        workspace.classList.remove('panning');
        panDrag = null;
    }

    if (dragTarget) {
        dragTarget.classList.remove('dragging');
        dragTarget = null;
    }

    if (previewPath && wiring) {
        const hitTarget = document.elementFromPoint(event.clientX, event.clientY);
        const inputPin = hitTarget?.closest('.pin.input');
        if (inputPin) {
            const toId = inputPin.dataset.gateId;
            const inputIndex = Number(inputPin.dataset.pinIndex);
            addWire(wiring.fromId, toId, inputIndex);
            signalCircuitChange();
        }
        previewPath.remove();
        previewPath = null;
        wiring = null;
        updateSimulation();
    }
}

// Remove um fio quando ele é clicado no modo de exclusão.
function handleWireClick(event) {
    const target = event.target;
    const handle = target.closest?.('.wire-delete')
        || target.parentElement?.closest?.('.wire-delete')
        || target.parentNode?.closest?.('.wire-delete');
    if (!handle) {
        return;
    }

    event.preventDefault();
    event.stopPropagation();

    const wireId = handle.dataset.wireId;
    if (!wireId) {
        return;
    }

    const wireIndex = state.wires.findIndex((wire) => wire.id === wireId);
    if (wireIndex !== -1) {
        state.wires.splice(wireIndex, 1);
    }
    handle.remove();
    wireLayer.querySelector(`.wire[data-wire-id="${wireId}"]`)?.remove();
    wireLayer.querySelector(`.wire-energy-dots[data-wire-id="${wireId}"]`)?.remove();
    updateSimulation();
    signalCircuitChange();
}

// Processa o clique em um nó para selecionar, editar ou alternar estado.
function handleNodeClick(event) {
    const deleteBtn = event.target.closest('[data-action="delete-node"]');
    if (deleteBtn) {
        removeGate(deleteBtn.dataset.gateId);
        signalCircuitChange();
        return;
    }

    const toggle = event.target.closest('[data-action="toggle-input"]');
    if (!toggle) {
        return;
    }

    const node = toggle.closest('.node');
    const gate = state.gates.find((item) => item.id === node.dataset.gateId);
    if (!gate) {
        return;
    }

    gate.output = gate.output === 1 ? 0 : 1;
    updateSimulation();
    signalCircuitChange();
}

// Atualiza o rótulo da porta quando o seletor do nó muda.
function handleNodeChange(event) {
    const labelSelect = event.target.closest('[data-action="set-label"]');
    if (!labelSelect) {
        return;
    }

    const gate = state.gates.find((item) => item.id === labelSelect.dataset.gateId);
    if (!gate) {
        return;
    }

    gate.label = labelSelect.value;
    computeExpression();
    signalCircuitChange();
}

// Ajusta a quantidade de entradas de uma porta e limpa conexões inválidas.
function changeInputCount(gateId, newCount) {
    const gate = state.gates.find((g) => g.id === gateId);
    if (!gate) return;
    if (['INPUT', 'OUTPUT', 'NOT'].includes(gate.type)) return;

    const clamped = Math.max(2, Math.min(4, newCount));
    if (clamped === gate.inputs.length) return;

    // remove wires that reference now-invalid input indices
    const removed = [];
    state.wires = state.wires.filter((wire) => {
        if (wire.toId === gateId && wire.inputIndex >= clamped) {
            // remove visuals
            wire.path?.remove();
            wire.deleteHandle?.remove();
            removed.push(wire);
            return false;
        }
        return true;
    });

    // resize gate.inputs
    if (clamped > gate.inputs.length) {
        while (gate.inputs.length < clamped) gate.inputs.push(0);
    } else {
        gate.inputs.length = clamped;
    }

    // re-render node
    const oldNode = state.nodes.get(gateId);
    const wasControlVisible = oldNode?.classList.contains('show-input-control');
    oldNode?.remove();
    const newNode = renderGate(gate, nodeLayer);
    if (wasControlVisible) {
        newNode.classList.add('show-input-control');
    }
    state.nodes.set(gateId, newNode);
    updateGateValues(gate, newNode);
    updateAllWires();
    updateSimulation();
}

// Trata ações dos controles internos do nó, como troca de tipo ou valor.
function handleNodeControls(event) {
    const inc = event.target.closest('[data-action="inc-inputs"]');
    if (inc) {
        const gateId = inc.dataset.gateId;
        const gate = state.gates.find((g) => g.id === gateId);
        if (gate) {
            changeInputCount(gateId, gate.inputs.length + 1);
            signalCircuitChange();
        }
        return;
    }

    const dec = event.target.closest('[data-action="dec-inputs"]');
    if (dec) {
        const gateId = dec.dataset.gateId;
        const gate = state.gates.find((g) => g.id === gateId);
        if (gate) {
            changeInputCount(gateId, gate.inputs.length - 1);
            signalCircuitChange();
        }
        return;
    }
}

// Abre o modo de edição rápida ao dar duplo clique em uma porta.
function handleNodeDoubleClick(event) {
    const node = event.target.closest('.node');
    if (!node) {
        return;
    }

    const gate = state.gates.find((item) => item.id === node.dataset.gateId);
    if (!gate || ['INPUT', 'OUTPUT', 'NOT'].includes(gate.type)) {
        return;
    }

    node.classList.toggle('show-input-control');
}

// Processa os botões de zoom da interface.
function handleZoomClick(event) {
    const zoomIn = event.target.closest('[data-action="zoom-in"]');
    if (zoomIn) {
        changeZoom(1);
        return;
    }

    const zoomOut = event.target.closest('[data-action="zoom-out"]');
    if (zoomOut) {
        changeZoom(-1);
    }
}

function handleWorkspaceWheel(event) {
    if (!panDrag || !workspace.contains(event.target)) {
        return;
    }

    event.preventDefault();
    changeZoom(event.deltaY < 0 ? 1 : -1);
}

function setExpandedMode(isExpanded) {
    if (!simulatorShell || !expandToggleBtn) {
        return;
    }

    simulatorShell.classList.toggle('is-expanded', isExpanded);
    expandToggleBtn.setAttribute('aria-pressed', String(isExpanded));
    expandToggleBtn.classList.toggle('is-active', isExpanded);

    const label = expandToggleBtn.querySelector('span');
    if (label) {
        label.textContent = isExpanded ? 'Normal' : 'Expandir';
    }

    requestAnimationFrame(() => {
        updateAllWires();
    });
}

function handleExpandToggle(event) {
    const btn = event.target.closest('[data-action="toggle-expand"]');
    if (!btn) {
        return;
    }

    setExpandedMode(!simulatorShell?.classList.contains('is-expanded'));
}

function syncComponentsPlacement() {
    if (!simulatorShell || !editorToolbar || !componentsSection) {
        return;
    }

    if (mobileLayoutQuery.matches) {
        if (componentsSection.parentElement !== editorToolbar) {
            editorToolbar.insertBefore(componentsSection, editorToolbar.firstElementChild);
        }
        setExpandedMode(false);
        return;
    }

    if (componentsSection.parentElement !== simulatorShell) {
        simulatorShell.insertBefore(componentsSection, editorToolbar);
    }
}

// Indica se a expressão é simples o bastante para exibição direta.
function isSimple(expr) {
    return /^[A-Z0-9?]+$/i.test(expr);
}

// Envolve a expressão com parênteses quando necessário.
function wrap(expr) {
    return isSimple(expr) ? expr : `(${expr})`;
}

// Em uma multiplicação lógica, somas precisam de parênteses para preservar a árvore.
function wrapProductPart(expr) {
    return expr.includes(' + ') || expr.includes(' ⊕ ') || expr.includes(' ⊙ ')
        ? wrap(expr)
        : expr;
}

// Junta partes simbólicas de uma expressão em uma forma legível.
function combine(symbolic) {
    return symbolic;
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

function escapeHtml(value) {
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function buildTreeExpression(node) {
    if (!node) {
        return '?';
    }

    const children = node.inputs || [];

    switch (node.type) {
        case 'OUTPUT':
            return buildTreeExpression(node.input || node.child);
        case 'INPUT':
            return node.name || 'A';
        case 'CONST':
            return node.value ? '1' : '0';
        case 'NOT':
            return `¬${wrap(buildTreeExpression(children[0]))}`;
        case 'AND':
            return children.map((child) => wrapProductPart(buildTreeExpression(child))).join(' · ');
        case 'OR':
            return children.map((child) => buildTreeExpression(child)).join(' + ');
        case 'NAND':
            return `¬(${children.map((child) => wrapProductPart(buildTreeExpression(child))).join(' · ')})`;
        case 'NOR':
            return `¬(${children.map((child) => buildTreeExpression(child)).join(' + ')})`;
        case 'XOR':
            return children.map((child) => buildTreeExpression(child)).join(' ⊕ ');
        case 'XNOR':
            return children.map((child) => buildTreeExpression(child)).join(' ⊙ ');
        default:
            return '?';
    }
}

function getSimplifiedExpression(root, inputValues, normalExpr) {
    if (!root) {
        return null;
    }

    const normalElectrical = convertLogicToElectrical(root, inputValues);
    const simplifiedRoot = simplifyLogicTree(root, inputValues);
    const simplifiedElectrical = convertLogicToElectrical(simplifiedRoot, inputValues);
    const canSimplify = countElectricalSwitches(simplifiedElectrical) < countElectricalSwitches(normalElectrical);

    if (!canSimplify) {
        return null;
    }

    const simplifiedExpr = buildTreeExpression(simplifiedRoot);
    return simplifiedExpr && simplifiedExpr !== normalExpr ? simplifiedExpr : null;
}

// Monta uma linha de expressão booleana correspondente ao circuito atual.
function buildExpressionLine(outputLabel, expression, outputIndex, isSelected = false) {
    const copyText = `${outputLabel} = ${expression}`;
    return `<div class="expression-item expression-item--output${isSelected ? ' is-selected' : ''}" data-expression-index="${outputIndex}" aria-selected="${isSelected ? 'true' : 'false'}">`
        + `<span class="expression-output-name">${escapeHtml(outputLabel)}</span>`
        + `<span class="expression-output-equals">=</span>`
        + `<span class="expression-output-value">${escapeHtml(expression)}</span>`
        + `<button class="expression-copy-btn expression-copy-btn--line" data-action="copy-expression-row" data-copy-text="${escapeHtml(copyText)}" type="button" aria-label="Copiar ${escapeHtml(outputLabel)}" title="Copiar ${escapeHtml(outputLabel)}">`
        + `<i class="fa-regular fa-copy" aria-hidden="true"></i>`
        + `</button>`
        + `</div>`;
}

function buildUnavailableExpressionLine(expression) {
    return `<div class="expression-item expression-item--output expression-item--status">`
        + `<span class="expression-output-name" aria-hidden="true"></span>`
        + `<span class="expression-output-equals" aria-hidden="true"></span>`
        + `<span class="expression-output-value">${escapeHtml(expression)}</span>`
        + `</div>`;
}

function renderExpressionList(labelElement, entries, selectedIndex) {
    if (!labelElement) {
        return [];
    }

    const availableEntries = entries.filter(Boolean);
    if (availableEntries.length === 0) {
        labelElement.textContent = '-';
        return [];
    }

    const currentIndex = Number.isInteger(selectedIndex) && entries[selectedIndex] ? selectedIndex : availableEntries[0].index;
    const selectedEntry = entries[currentIndex] || availableEntries[0];
    const orderedEntries = [selectedEntry, ...availableEntries.filter((entry) => entry.index !== selectedEntry.index)];

    labelElement.innerHTML = orderedEntries
        .map((entry) => buildExpressionLine(entry.outputLabel, entry.expression, entry.index, entry.index === currentIndex))
        .join('');

    return orderedEntries;
}

function setSelectedExpressionIndex(index) {
    if (!Number.isInteger(index) || index < 0) {
        return;
    }

    selectedExpressionIndex = index;
    setExpressionCardsExpanded(false);
    renderExpressionCards();
    flashCircuitForExpression(index);
}

function handleExpressionSelectionClick(event) {
    const expressionItem = event.target.closest('.expression-item--output[data-expression-index]');
    if (!expressionItem || event.target.closest('.expression-copy-btn')) {
        return;
    }

    const index = Number.parseInt(expressionItem.dataset.expressionIndex, 10);
    if (Number.isNaN(index)) {
        return;
    }

    setSelectedExpressionIndex(index);
    showExampleLoadedTip('O circuito foi testacado no simulador');
}

function clearCircuitFlash() {
    if (circuitFlashTimeoutId) {
        clearTimeout(circuitFlashTimeoutId);
        circuitFlashTimeoutId = 0;
    }

    nodeLayer?.querySelectorAll('.circuit-flash').forEach((element) => {
        element.classList.remove('circuit-flash');
    });
    wireLayer?.querySelectorAll('.circuit-flash').forEach((element) => {
        element.classList.remove('circuit-flash');
    });
}

function getRelatedGateIds(outputGateId) {
    const relatedGateIds = new Set();
    const incomingWires = new Map();

    state.wires.forEach((wire) => {
        if (!incomingWires.has(wire.toId)) {
            incomingWires.set(wire.toId, []);
        }
        incomingWires.get(wire.toId).push(wire);
    });

    const visit = (gateId) => {
        if (!gateId || relatedGateIds.has(gateId)) {
            return;
        }

        relatedGateIds.add(gateId);
        (incomingWires.get(gateId) || []).forEach((wire) => visit(wire.fromId));
    };

    visit(outputGateId);
    return relatedGateIds;
}

function flashCircuitForExpression(index) {
    const outputGateId = currentOutputGateIds[index];
    if (!outputGateId) {
        return;
    }

    clearCircuitFlash();

    const relatedGateIds = getRelatedGateIds(outputGateId);

    state.nodes.forEach((node, gateId) => {
        node.classList.toggle('circuit-flash', relatedGateIds.has(gateId));
    });

    state.wires.forEach((wire) => {
        const isRelated = relatedGateIds.has(wire.fromId) && relatedGateIds.has(wire.toId);
        wire.path?.classList.toggle('circuit-flash', isRelated);
        wire.energyDots?.classList.toggle('circuit-flash', isRelated);
    });

    circuitFlashTimeoutId = window.setTimeout(clearCircuitFlash, 1100);
}

function renderExpressionCards() {
    if (!expressionLabel) {
        return;
    }

    const normalEntries = renderExpressionList(expressionLabel, expressionEntries, selectedExpressionIndex);
    const simplifiedEntries = simplifiedExpressionEntries.filter(Boolean);

    if (simplifiedExpressionLabel) {
        if (simplifiedExpressionCard) {
            simplifiedExpressionCard.hidden = false;
        }
        if (expressionCards) {
            expressionCards.classList.add('has-simplified-expression');
        }

        if (simplifiedEntries.length > 0) {
            renderExpressionList(simplifiedExpressionLabel, simplifiedExpressionEntries, selectedExpressionIndex);
            syncExpressionExpandButton(simplifiedExpressionExpandBtn, simplifiedExpressionLabel?.closest('.toolbar-expression'), simplifiedEntries.length);
        } else {
            simplifiedExpressionLabel.innerHTML = buildUnavailableExpressionLine('Não possui');
            syncExpressionExpandButton(simplifiedExpressionExpandBtn, simplifiedExpressionLabel?.closest('.toolbar-expression'), 0);
        }
    }

    syncExpressionExpandButton(expressionExpandBtn, expressionLabel?.closest('.toolbar-expression'), normalEntries.length);
}

function computeExpression() {
    if (!expressionLabel) {
        return;
    }

    const gateMap = new Map(state.gates.map((gate) => [gate.id, gate]));
    const wireMap = new Map();
    state.wires.forEach((wire) => {
        wireMap.set(`${wire.toId}:${wire.inputIndex}`, wire);
    });

    const outputGates = state.gates.filter((gate) => gate.type === 'OUTPUT');
    currentOutputGateIds = outputGates.map((gate) => gate.id);
    if (outputGates.length === 0) {
        expressionLabel.textContent = '-';
        if (simplifiedExpressionLabel) {
            simplifiedExpressionLabel.textContent = '-';
        }
        if (simplifiedExpressionCard) {
            simplifiedExpressionCard.hidden = true;
        }
        if (expressionCards) {
            expressionCards.classList.remove('has-simplified-expression');
        }
        clearCircuitFlash();
        syncExpressionExpandButton(expressionExpandBtn, expressionLabel?.closest('.toolbar-expression'), 0);
        syncExpressionExpandButton(simplifiedExpressionExpandBtn, simplifiedExpressionLabel?.closest('.toolbar-expression'), 0);
        return;
    }

    // Monta recursivamente a expressão de uma porta e detecta ciclos.
    // Monta recursivamente a expressão de uma porta e detecta ciclos.
    const buildExpr = (gateId, visiting = new Set()) => {
        const gate = gateMap.get(gateId);
        if (!gate) {
            return '?';
        }

        if (visiting.has(gateId)) {
            return '⟳';
        }

        visiting.add(gateId);

        // Lê a expressão de uma entrada específica da porta.
        // Lê a expressão de uma entrada específica da porta.
        const inputExpr = (index) => {
            const wire = wireMap.get(`${gate.id}:${index}`);
            if (!wire) {
                return '?';
            }
            return buildExpr(wire.fromId, visiting);
        };

        let expr = '?';
        switch (gate.type) {
            case 'INPUT':
                expr = gate.label || 'A';
                break;
            case 'OUTPUT': {
                const a = inputExpr(0);
                expr = a;
                break;
            }
            case 'NOT': {
                const a = inputExpr(0);
                expr = combine(`¬${wrap(a)}`, `NOT ${a}`);
                break;
            }
            case 'AND': {
                const andParts = [];
                const gateAnd = gateMap.get(gateId);
                for (let i = 0; i < (gateAnd.inputs?.length || 2); i += 1) {
                    andParts.push(wrapProductPart(inputExpr(i)));
                }
                expr = combine(andParts.join(' · '), andParts.join(' AND '));
                break;
            }
            case 'OR': {
                const orParts = [];
                const gateOr = gateMap.get(gateId);
                for (let i = 0; i < (gateOr.inputs?.length || 2); i += 1) {
                    orParts.push(inputExpr(i));
                }
                expr = combine(orParts.join(' + '), orParts.join(' OR '));
                break;
            }
            case 'NAND': {
                const nandParts = [];
                const gateNand = gateMap.get(gateId);
                for (let i = 0; i < (gateNand.inputs?.length || 2); i += 1) {
                    nandParts.push(wrapProductPart(inputExpr(i)));
                }
                expr = combine(`¬(${nandParts.join(' · ')})`, nandParts.join(' NAND '));
                break;
            }
            case 'NOR': {
                const norParts = [];
                const gateNor = gateMap.get(gateId);
                for (let i = 0; i < (gateNor.inputs?.length || 2); i += 1) {
                    norParts.push(inputExpr(i));
                }
                expr = combine(`¬(${norParts.join(' + ')})`, norParts.join(' NOR '));
                break;
            }
            case 'XOR': {
                const xorParts = [];
                const gateXor = gateMap.get(gateId);
                for (let i = 0; i < (gateXor.inputs?.length || 2); i += 1) {
                    xorParts.push(inputExpr(i));
                }
                expr = combine(xorParts.join(' ⊕ '), xorParts.join(' XOR '));
                break;
            }
            case 'XNOR': {
                const xnorParts = [];
                const gateXnor = gateMap.get(gateId);
                for (let i = 0; i < (gateXnor.inputs?.length || 2); i += 1) {
                    xnorParts.push(inputExpr(i));
                }
                expr = combine(xnorParts.join(' ⊙ '), xnorParts.join(' XNOR '));
                break;
            }
            default:
                expr = '?';
        }

        visiting.delete(gateId);
        return expr;
    };

    const { roots, inputs } = buildLogicTrees(state);
    expressionEntries = outputGates.map((gate, index) => {
        const expr = buildExpr(gate.id) || '-';
        const outputLabel = `Y${index + 1}`;
        return { index, outputLabel, expression: expr };
    });

    simplifiedExpressionEntries = outputGates.map((gate, index) => {
        const expr = buildExpr(gate.id) || '-';
        const root = roots.find((item) => item.gateId === gate.id) || roots[index];
        const simplifiedExpr = getSimplifiedExpression(root, inputs, expr);
        const outputLabel = `Y${index + 1}`;

        if (!simplifiedExpr) {
            return null;
        }

        return { index, outputLabel, expression: simplifiedExpr };
    });

    if (selectedExpressionIndex >= expressionEntries.length) {
        selectedExpressionIndex = 0;
    }

    renderExpressionCards();
}

// Carrega um circuito pronto no editor.
function setupPreset() {
    let selectedGate = null;
    let forcedInputCount = null;
    let forceThirdInput = false;

    const params = new URLSearchParams(window.location.search);
    const preset = (params.get('preset') || '').toLowerCase();
    openedFromExample = Boolean(preset);
    if (preset) {
        const presetMap = {
            and: 'AND',
            or: 'OR',
            not: 'NOT',
            nand: 'NAND',
            nor: 'NOR',
            xor: 'XOR',
            xnor: 'XNOR',
            xnor3: 'XNOR',
            'xnor-3': 'XNOR',
        };

        selectedGate = presetMap[preset] || null;
        if (preset === 'xnor3' || preset === 'xnor-3') {
            forcedInputCount = 3;
            forceThirdInput = true;
        }
    }

    if (!selectedGate) {
        try {
            selectedGate = sessionStorage.getItem('selectedGate');
        } catch (error) {
            selectedGate = null;
        }

        if (!selectedGate) {
            try {
                selectedGate = localStorage.getItem('selectedGate');
            } catch (error) {
                selectedGate = null;
            }
        }
    }

    try {
        sessionStorage.removeItem('selectedGate');
    } catch (error) {
        // Ignore storage errors.
    }

    try {
        localStorage.removeItem('selectedGate');
    } catch (error) {
        // Ignore storage errors.
    }

    const rawGateType = selectedGate || 'AND';
    const normalizedGate = rawGateType.toUpperCase();
    let gateType = normalizedGate;
    if (normalizedGate === 'XNOR3' || normalizedGate === 'XNOR_3') {
        gateType = 'XNOR';
        forcedInputCount = 3;
        forceThirdInput = true;
    }

    const inputStartY = 150;
    const inputStepY = 90;
    const inputCount = forceThirdInput ? 3 : (gateType === 'NOT' ? 1 : 2);
    const midY = inputStartY + (inputStepY * (inputCount - 1)) / 2;
    const logicGateY = Math.round(midY - 10);
    const outputGateY = Math.round(midY + 20);

    const inputA = addGate('INPUT', 140, inputStartY, { label: 'A' });
    const inputB = gateType !== 'NOT'
        ? addGate('INPUT', 140, inputStartY + inputStepY, { label: 'B' })
        : null;
    const inputC = forceThirdInput
        ? addGate('INPUT', 140, inputStartY + inputStepY * 2, { label: 'C' })
        : null;

    const initialInputValues = (() => {
        switch (gateType) {
            case 'AND':
                return [1, 1, 1];
            case 'OR':
                return [1, 0, 0];
            case 'NOT':
                return [0];
            default:
                return new Array(inputCount).fill(0);
        }
    })();

    inputA.output = initialInputValues[0] ?? 0;
    if (inputB) {
        inputB.output = initialInputValues[1] ?? 0;
    }
    if (inputC) {
        inputC.output = initialInputValues[2] ?? 0;
    }

    const logicGate = addGate(gateType, 360, logicGateY);
    if (forcedInputCount) {
        changeInputCount(logicGate.id, forcedInputCount);
    }
    const outputGate = addGate('OUTPUT', 600, outputGateY);

    addWire(inputA.id, logicGate.id, 0);
    if (inputB) {
        addWire(inputB.id, logicGate.id, 1);
    }
    if (inputC && gateType !== 'NOT') {
        addWire(inputC.id, logicGate.id, 2);
    }
    addWire(logicGate.id, outputGate.id, 0);
}

// Inicializa os eventos e o estado inicial do editor.
function init() {
    syncComponentsPlacement();
    mobileLayoutQuery.addEventListener('change', syncComponentsPlacement);

    document.querySelectorAll('[data-add]').forEach((btn) => {
        btn.addEventListener('click', handleAddClick);
    });
    if (deleteToggleBtn) {
        deleteToggleBtn.addEventListener('click', handleDeleteToggle);
    }
    tutorialStartBtns.forEach((btn) => {
        btn.addEventListener('click', () => startTutorial(false));
    });
    if (expressionCopyBtn) {
        expressionCopyBtn.addEventListener('click', copyExpression);
    }
    if (simplifiedExpressionCopyBtn) {
        simplifiedExpressionCopyBtn.addEventListener('click', copySimplifiedExpression);
    }
    document.addEventListener('click', handleExpressionSelectionClick);
    if (expressionExpandBtn) {
        expressionExpandBtn.addEventListener('click', () => {
            toggleExpressionCards(expressionExpandBtn);
        });
    }
    if (simplifiedExpressionExpandBtn) {
        simplifiedExpressionExpandBtn.addEventListener('click', () => {
            toggleExpressionCards(simplifiedExpressionExpandBtn);
        });
    }
    if (saveCircuitForm) {
        saveCircuitForm.addEventListener('submit', submitSaveCircuitName);
    }
    if (renameCircuitForm) {
        renameCircuitForm.addEventListener('submit', submitRenameCircuit);
    }
    if (openSavedCircuitsBtn) {
        openSavedCircuitsBtn.addEventListener('click', (event) => {
            event.stopPropagation();
            toggleSavedCircuitsDropdown();
        });
    }
    document.addEventListener('click', handleClearSimulator);
    document.addEventListener('click', handleSavedCircuitActions);
    document.addEventListener('click', handleZoomClick);
    document.addEventListener('click', handleExpandToggle);
    document.addEventListener('click', handleExpressionRowCopyClick);

    workspace.addEventListener('pointerdown', handleWorkspacePointerDown);
    workspace.addEventListener('click', handleWireClick);
    workspace.addEventListener('wheel', handleWorkspaceWheel, { passive: false });
    window.addEventListener('pointermove', handleWorkspacePointerMove);
    window.addEventListener('pointerup', handleWorkspacePointerUp);
    nodeLayer.addEventListener('click', handleNodeClick);
    handleLayer.addEventListener('pointerdown', handleWireClick);
    nodeLayer.addEventListener('click', handleNodeControls);
    nodeLayer.addEventListener('dblclick', handleNodeDoubleClick);
    nodeLayer.addEventListener('change', handleNodeChange);

    setupPreset();
    updateSimulation();
    applyViewport();
    setDeleteMode(false);

    if (openedFromExample) {
        requestAnimationFrame(() => {
            scrollToSimulatorWorkspace();
            showExampleLoadedTip();
        });
    }

    let shouldAutoStartTutorial = false;
    try {
        shouldAutoStartTutorial = !localStorage.getItem(tutorialStorageKey);
    } catch (error) {
        shouldAutoStartTutorial = true;
    }

    if (shouldAutoStartTutorial) {
        const startWhenIdle = () => startTutorial(true);
        if ('requestIdleCallback' in window) {
            window.requestIdleCallback(startWhenIdle, { timeout: 1800 });
        } else {
            window.setTimeout(startWhenIdle, 900);
        }
    }
}

init();

/* --- Tabs: Truth Table view --- */
// Cria uma cópia leve do estado para cálculos temporários.
function cloneStateForCompute() {
    const gates = state.gates.map((g) => ({ id: g.id, type: g.type, inputs: Array.from(g.inputs), output: g.output, label: g.label }));
    const wires = state.wires.map((w) => ({ id: w.id, fromId: w.fromId, toId: w.toId, inputIndex: w.inputIndex }));
    return { gates, wires };
}

// Gera a tabela verdade para um circuito específico.
function collectCircuitInputs(node, collected = [], visited = new Set()) {
    if (!node) {
        return collected;
    }

    if (node.type === 'INPUT' && node.id && !visited.has(node.id)) {
        visited.add(node.id);
        collected.push(node);
        return collected;
    }

    if (node.input) {
        collectCircuitInputs(node.input, collected, visited);
    }

    if (Array.isArray(node.inputs)) {
        node.inputs.forEach((child) => {
            collectCircuitInputs(child, collected, visited);
        });
    }

    return collected;
}

// Gera a tabela verdade para um circuito específico.
function renderTruthTableCircuit(root, inputs, container, circuitLabel) {
    if (!root || !container) {
        return;
    }

    if (inputs.length === 0) {
        container.innerHTML = '<div>Nenhuma entrada presente no circuito.</div>';
        return;
    }

    if (inputs.length > 12) {
        container.innerHTML = '<div>Muitos inputs (>12) — não é possível gerar tabela grande.</div>';
        return;
    }

    const headerCols = inputs.map((input) => input.name || input.label || 'A').concat([circuitLabel]);
    const rows = [];
    const combos = 1 << inputs.length;

    for (let mask = 0; mask < combos; mask += 1) {
        const temp = cloneStateForCompute();

        inputs.forEach((input, index) => {
            const value = (mask >> (inputs.length - 1 - index)) & 1;
            const targetGate = temp.gates.find((gate) => gate.id === input.id);
            if (targetGate) {
                targetGate.output = value;
            }
        });

        temp.gates.forEach((gate) => {
            if (gate.type !== 'INPUT') {
                gate.output = 0;
            }
        });

        recompute(temp);

        const outGate = temp.gates.find((gate) => gate.id === root.gateId);
        const outVal = outGate ? outGate.output : 0;
        const inVals = inputs.map((input, index) => ((mask >> (inputs.length - 1 - index)) & 1));
        rows.push({ inVals, outVal });
    }

    let html = '<table class="truth-table"><thead><tr>';
    headerCols.forEach((header) => {
        html += `<th>${header}</th>`;
    });
    html += '</tr></thead><tbody>';

    rows.forEach((row) => {
        html += '<tr>';
        row.inVals.forEach((value) => {
            html += `<td>${value}</td>`;
        });
        html += `<td>${row.outVal}</td>`;
        html += '</tr>';
    });

    html += '</tbody></table>';
    container.innerHTML = html;
}

// Atualiza o dropdown com os circuitos disponíveis.
function syncTruthTableCircuitSelect(roots, selectElement) {
    if (!selectElement) {
        return;
    }

    selectElement.innerHTML = '';

    roots.forEach((root, index) => {
        const option = document.createElement('button');
        option.type = 'button';
        option.className = 'truth-table-select__option';
        option.setAttribute('role', 'option');
        option.dataset.index = String(index);
        option.textContent = root.name || `Circuito ${index + 1}`;
        if (index === truthTableCircuitIndex) {
            option.classList.add('is-selected');
            option.setAttribute('aria-selected', 'true');
        } else {
            option.setAttribute('aria-selected', 'false');
        }
        selectElement.appendChild(option);
    });
}

// Atualiza o circuito exibido na tabela verdade.
function generateTruthTable() {
    const { roots } = buildLogicTrees(state);
    const container = document.getElementById('truth-table-placeholder');
    const label = document.getElementById('truth-table-circuit-label');
    const buttonElement = document.getElementById('truth-table-circuit-button');
    const buttonLabelElement = document.getElementById('truth-table-circuit-button-label');
    const menuElement = document.getElementById('truth-table-circuit-menu');

    if (!container || !label || !buttonElement || !buttonLabelElement || !menuElement) {
        return;
    }

    if (roots.length === 0) {
        label.textContent = 'Nenhum circuito disponível';
        buttonElement.disabled = true;
        buttonLabelElement.textContent = 'Nenhum circuito disponível';
        menuElement.innerHTML = '';
        menuElement.hidden = true;
        buttonElement.setAttribute('aria-expanded', 'false');
        container.innerHTML = '<div>Nenhuma entrada ou saída presente no circuito.</div>';
        return;
    }

    if (truthTableCircuitIndex >= roots.length) {
        truthTableCircuitIndex = 0;
    }

    buttonElement.disabled = false;
    syncTruthTableCircuitSelect(roots, menuElement);

    const selectedRoot = roots[truthTableCircuitIndex];
    const circuitInputs = collectCircuitInputs(selectedRoot.input || selectedRoot);
    label.textContent = roots.length > 1
        ? `${selectedRoot.name || 'OUT'} (${truthTableCircuitIndex + 1} de ${roots.length})`
        : `${selectedRoot.name || 'OUT'}`;
    buttonLabelElement.textContent = selectedRoot.name || `Circuito ${truthTableCircuitIndex + 1}`;

    if (circuitInputs.length === 0) {
        container.innerHTML = '<div>Nenhuma entrada conectada a este circuito.</div>';
        return;
    }

    renderTruthTableCircuit(selectedRoot, circuitInputs, container, selectedRoot.name || 'OUT');
}

// Tab toggles
const tabSim = document.getElementById('tab-simulator');
const tabTT = document.getElementById('tab-truthtable');
const tabSwitch = document.getElementById('tab-switching');
const simSection = document.getElementById('simulator-workspace');
const ttSection = document.getElementById('truth-table-view');
const switchingSection = document.getElementById('switching-shell');
    const truthTableSelectWrap = document.getElementById('truth-table-circuit-select-wrap');
    const truthTableCircuitButton = document.getElementById('truth-table-circuit-button');
    const truthTableCircuitMenu = document.getElementById('truth-table-circuit-menu');
if (tabSim && tabTT && tabSwitch && simSection && ttSection && switchingSection) {
    // Oculta as três áreas principais antes de mostrar a selecionada.
    const hideAll = () => {
        simSection.style.display = 'none';
        ttSection.style.display = 'none';
        switchingSection.style.display = 'none';
        isSimulatorViewVisible = false;
        isSwitchingViewVisible = false;
        pauseSimulatorView();
        pauseElectricalView();
        tabSim.classList.remove('active');
        tabTT.classList.remove('active');
        tabSwitch.classList.remove('active');
    };

    tabSim.addEventListener('click', () => {
        hideAll();
        tabSim.classList.add('active');
        simSection.style.display = '';
        isSimulatorViewVisible = true;
        syncSimulatorVisuals();
    });

    tabTT.addEventListener('click', () => {
        hideAll();
        tabTT.classList.add('active');
        ttSection.style.display = '';
        generateTruthTable();
    });

    if (truthTableSelectWrap && truthTableCircuitButton && truthTableCircuitMenu) {
        truthTableCircuitButton.addEventListener('click', () => {
            if (truthTableCircuitButton.disabled) {
                return;
            }

            const willOpen = truthTableCircuitMenu.hidden;
            truthTableCircuitMenu.hidden = !willOpen;
            truthTableSelectWrap.classList.toggle('is-open', willOpen);
            truthTableCircuitButton.setAttribute('aria-expanded', String(willOpen));
        });

        truthTableCircuitMenu.addEventListener('click', (event) => {
            const target = event.target;
            if (!(target instanceof HTMLElement)) {
                return;
            }

            const option = target.closest('.truth-table-select__option');
            if (!option) {
                return;
            }

            truthTableCircuitIndex = Number.parseInt(option.dataset.index || '0', 10) || 0;
            truthTableCircuitMenu.hidden = true;
            truthTableSelectWrap.classList.remove('is-open');
            truthTableCircuitButton.setAttribute('aria-expanded', 'false');
            generateTruthTable();
        });

        document.addEventListener('click', (event) => {
            if (!(event.target instanceof Node)) {
                return;
            }

            if (!truthTableSelectWrap.contains(event.target)) {
                truthTableCircuitMenu.hidden = true;
                truthTableSelectWrap.classList.remove('is-open');
                truthTableCircuitButton.setAttribute('aria-expanded', 'false');
            }
        });
    }

    tabSwitch.addEventListener('click', () => {
        hideAll();
        tabSwitch.classList.add('active');
        switchingSection.style.display = '';
        isSwitchingViewVisible = true;
        updateElectricalView(state);
        switchingViewDirty = false;
    });
}
