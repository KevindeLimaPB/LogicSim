import { createGate } from './gates.js';
import { createWire } from './wires.js';
import { renderGate, updateGatePosition, updateGateValues, updateWirePath, getPinCenter } from './renderer.js';
import { recompute } from './simulator.js';

const workspace = document.getElementById('workspace');
const nodeLayer = document.getElementById('node-layer');
const wireLayer = document.getElementById('wire-layer');
const handleLayer = document.getElementById('wire-handles');
const expressionLabel = document.getElementById('expression-label');
const deleteToggleBtn = document.querySelector('[data-action="toggle-delete"]');
const zoomLabel = document.getElementById('zoom-label');

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

function screenToWorld(event) {
    const workspaceRect = workspace.getBoundingClientRect();

    return {
        x: (event.clientX - workspaceRect.left - panOffset.x) / zoomLevel,
        y: (event.clientY - workspaceRect.top - panOffset.y) / zoomLevel
    };
}

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

function changeZoom(direction) {
    const nextZoom = zoomLevel + direction * zoomConfig.step;
    zoomLevel = Math.max(zoomConfig.min, Math.min(zoomConfig.max, Number(nextZoom.toFixed(2))));
    applyViewport();
}

function setDeleteMode(enabled) {
    deleteMode = enabled;
    workspace.classList.toggle('delete-mode', deleteMode);
    if (deleteToggleBtn) {
        deleteToggleBtn.classList.toggle('is-active', deleteMode);
    }
}

function addGate(type, x = 120, y = 120, options = {}) {
    const gate = createGate(type, x, y);
    if (options.label) {
        gate.label = options.label;
    }
    state.gates.push(gate);
    const node = renderGate(gate, nodeLayer);
    state.nodes.set(gate.id, node);
    updateGateValues(gate, node);
    updateAllWires();
    return gate;
}

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

function clearSimulator() {
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

function updateSimulation() {
    recompute(state);
    state.gates.forEach((gate) => {
        const node = state.nodes.get(gate.id);
        if (node) {
            updateGateValues(gate, node);
        }
    });
    updateAllWires();
    computeExpression();
}

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
}

function handleDeleteToggle(event) {
    const btn = event.target.closest('[data-action="toggle-delete"]');
    if (!btn) {
        return;
    }

    setDeleteMode(!deleteMode);
}

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
        const inputPin = event.target.closest('.pin.input');
        if (inputPin) {
            const toId = inputPin.dataset.gateId;
            const inputIndex = Number(inputPin.dataset.pinIndex);
            addWire(wiring.fromId, toId, inputIndex);
        }
        previewPath.remove();
        previewPath = null;
        wiring = null;
        updateSimulation();
    }
}

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
}

function handleNodeClick(event) {
    const deleteBtn = event.target.closest('[data-action="delete-node"]');
    if (deleteBtn) {
        removeGate(deleteBtn.dataset.gateId);
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
}

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
}

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

function handleNodeControls(event) {
    const inc = event.target.closest('[data-action="inc-inputs"]');
    if (inc) {
        const gateId = inc.dataset.gateId;
        const gate = state.gates.find((g) => g.id === gateId);
        if (gate) changeInputCount(gateId, gate.inputs.length + 1);
        return;
    }

    const dec = event.target.closest('[data-action="dec-inputs"]');
    if (dec) {
        const gateId = dec.dataset.gateId;
        const gate = state.gates.find((g) => g.id === gateId);
        if (gate) changeInputCount(gateId, gate.inputs.length - 1);
        return;
    }
}

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

function isSimple(expr) {
    return /^[A-Z0-9?]+$/i.test(expr);
}

function wrap(expr) {
    return isSimple(expr) ? expr : `(${expr})`;
}

function combine(symbolic) {
    return symbolic;
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
    if (outputGates.length === 0) {
        expressionLabel.textContent = '-';
        return;
    }

    const buildExpr = (gateId, visiting = new Set()) => {
        const gate = gateMap.get(gateId);
        if (!gate) {
            return '?';
        }

        if (visiting.has(gateId)) {
            return '⟳';
        }

        visiting.add(gateId);

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
                    andParts.push(inputExpr(i));
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
                    nandParts.push(inputExpr(i));
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

    const lines = outputGates.map((gate, index) => {
        const expr = buildExpr(gate.id) || '-';
        return `Y${index + 1} = ${expr}`;
    });

    expressionLabel.innerHTML = lines
        .map((line) => `<div class="expression-item">${line}</div>`)
        .join('');
}

function setupPreset() {
    let selectedGate = null;
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

    const gateType = selectedGate || 'AND';

    const inputA = addGate('INPUT', 140, 160, { label: 'A' });
    const inputB = addGate('INPUT', 140, 260, { label: 'B' });
    const logicGate = addGate(gateType, 360, 200);
    const outputGate = addGate('OUTPUT', 600, 220);

    addWire(inputA.id, logicGate.id, 0);
    if (gateType !== 'NOT') {
        addWire(inputB.id, logicGate.id, 1);
    }
    addWire(logicGate.id, outputGate.id, 0);
}

function init() {
    document.querySelectorAll('[data-add]').forEach((btn) => {
        btn.addEventListener('click', handleAddClick);
    });
    if (deleteToggleBtn) {
        deleteToggleBtn.addEventListener('click', handleDeleteToggle);
    }
    document.addEventListener('click', handleClearSimulator);
    document.addEventListener('click', handleZoomClick);

    workspace.addEventListener('pointerdown', handleWorkspacePointerDown);
    workspace.addEventListener('click', handleWireClick);
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
}

init();

/* --- Tabs: Truth Table view --- */
function cloneStateForCompute() {
    const gates = state.gates.map((g) => ({ id: g.id, type: g.type, inputs: Array.from(g.inputs), output: g.output, label: g.label }));
    const wires = state.wires.map((w) => ({ id: w.id, fromId: w.fromId, toId: w.toId, inputIndex: w.inputIndex }));
    return { gates, wires };
}

function generateTruthTable() {
    const inputs = state.gates.filter((g) => g.type === 'INPUT');
    const outputs = state.gates.filter((g) => g.type === 'OUTPUT');

    const container = document.getElementById('truth-table-placeholder');
    if (!container) return;

    if (inputs.length === 0 || outputs.length === 0) {
        container.innerHTML = '<div>Nenhuma entrada ou saída presente no circuito.</div>';
        return;
    }

    if (inputs.length > 12) {
        container.innerHTML = '<div>Muitos inputs (>12) — não é possível gerar tabela grande.</div>';
        return;
    }

    const headerCols = inputs.map((i) => i.label || 'IN').concat(outputs.map((o) => o.label || 'OUT'));

    const rows = [];
    const combos = 1 << inputs.length;
    for (let mask = 0; mask < combos; mask += 1) {
        const temp = cloneStateForCompute();
        // set input outputs
        inputs.forEach((inp, idx) => {
            const val = (mask >> (inputs.length - 1 - idx)) & 1;
            const tg = temp.gates.find((g) => g.id === inp.id);
            if (tg) tg.output = val;
        });
        // ensure outputs reset
        temp.gates.forEach((g) => { if (g.type !== 'INPUT') g.output = 0; });
        // recompute on temp
        try {
            const { recompute: recomputeLocal } = awaitImportSimulator();
            recomputeLocal(temp);
        } catch (e) {
            // fallback: call global recompute with temp by temporarily binding
            recompute(temp);
        }

        const outVals = outputs.map((o) => {
            const tg = temp.gates.find((g) => g.id === o.id);
            return tg ? tg.output : 0;
        });

        const inVals = inputs.map((i) => ((mask >> (inputs.length - 1 - inputs.indexOf(i))) & 1));
        rows.push({ inVals, outVals });
    }

    // build table HTML
    let html = '<table class="truth-table"><thead><tr>';
    headerCols.forEach((h) => { html += `<th>${h}</th>`; });
    html += '</tr></thead><tbody>';
    rows.forEach((r) => {
        html += '<tr>';
        r.inVals.forEach((v) => { html += `<td>${v}</td>`; });
        r.outVals.forEach((v) => { html += `<td>${v}</td>`; });
        html += '</tr>';
    });
    html += '</tbody></table>';
    container.innerHTML = html;
}

function awaitImportSimulator() {
    // utility to access recompute if imported differently; here we just return the existing recompute
    return { recompute };
}

// Tab toggles
const tabSim = document.getElementById('tab-simulator');
const tabTT = document.getElementById('tab-truthtable');
const simSection = document.getElementById('simulator-workspace');
const ttSection = document.getElementById('truth-table-view');
if (tabSim && tabTT && simSection && ttSection) {
    tabSim.addEventListener('click', () => {
        tabSim.classList.add('active');
        tabTT.classList.remove('active');
        simSection.style.display = '';
        ttSection.style.display = 'none';
    });
    tabTT.addEventListener('click', () => {
        tabTT.classList.add('active');
        tabSim.classList.remove('active');
        simSection.style.display = 'none';
        ttSection.style.display = '';
        generateTruthTable();
    });
}
