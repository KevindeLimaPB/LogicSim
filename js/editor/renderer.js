import { getInputCount } from './gates.js';

const SVG_GATES = {
    AND: {
        viewBox: { width: 160, height: 100 },
        inputs: [
            { x: 15, y: 35 },
            { x: 15, y: 65 }
        ],
        output: { x: 145, y: 50 }
    },
    OR: {
        viewBox: { width: 200, height: 120 },
        inputs: [
            { x: 15, y: 40 },
            { x: 15, y: 80 }
        ],
        output: { x: 185, y: 60 }
    },
    NOT: {
        viewBox: { width: 100, height: 60 },
        inputs: [{ x: 20, y: 30 }],
        output: { x: 100, y: 30 }
    },
    NAND: {
        viewBox: { width: 300, height: 200 },
        inputs: [
            { x: 50, y: 70 },
            { x: 50, y: 130 }
        ],
        output: { x: 270, y: 100 }
    },
    NOR: {
        viewBox: { width: 300, height: 200 },
        inputs: [
            { x: 50, y: 70 },
            { x: 50, y: 130 }
        ],
        output: { x: 270, y: 100 }
    },
    XOR: {
        viewBox: { width: 300, height: 200 },
        inputs: [
            { x: 50, y: 70 },
            { x: 50, y: 130 }
        ],
        output: { x: 270, y: 100 }
    },
    XNOR: {
        viewBox: { width: 300, height: 200 },
        inputs: [
            { x: 50, y: 70 },
            { x: 50, y: 130 }
        ],
        output: { x: 270, y: 100 }
    }
};

const SVG_NS = 'http://www.w3.org/2000/svg';

function createSvgElement(tag, attributes = {}) {
    const element = document.createElementNS(SVG_NS, tag);
    Object.entries(attributes).forEach(([key, value]) => {
        element.setAttribute(key, String(value));
    });
    return element;
}

function appendGateLine(group, x1, y1, x2, y2) {
    group.appendChild(createSvgElement('line', { x1, y1, x2, y2 }));
}

function appendGatePath(group, d) {
    group.appendChild(createSvgElement('path', { d }));
}

function appendInversionBubble(group, cx, cy, outputEndX) {
    group.appendChild(createSvgElement('circle', { cx, cy, r: 10 }));
    appendGateLine(group, cx + 10, cy, outputEndX, cy);
}

function createLogicGateSvg(type, viewBox, inputCount) {
    const svg = createSvgElement('svg', {
        class: `logic-gate-svg logic-gate-svg--${type.toLowerCase()}`,
        viewBox: `0 0 ${viewBox.width} ${viewBox.height}`,
        'aria-hidden': 'true',
        focusable: 'false'
    });

    const group = createSvgElement('g', { class: 'logic-gate-shape' });
    svg.appendChild(group);

    const addInputLines = (startX, endX) => {
        const spacing = viewBox.height / (inputCount + 1);
        for (let i = 0; i < inputCount; i += 1) {
            const y = spacing * (i + 1);
            appendGateLine(group, startX, y, endX, y);
        }
    };

    if (type === 'AND' || type === 'NAND') {
        const large = viewBox.width > 200;
        addInputLines(large ? 50 : 15, large ? 100 : 50);
        appendGatePath(group, large
            ? 'M 100 50 L 160 50 A 50 50 0 0 1 160 150 L 100 150 Z'
            : 'M 50 20 L 50 80 L 75 80 A 30 30 0 0 0 75 20 Z');

        if (type === 'NAND') {
            appendInversionBubble(group, 220, viewBox.height / 2, 270);
        } else {
            appendGateLine(group, large ? 210 : 105, viewBox.height / 2, large ? 270 : 145, viewBox.height / 2);
        }
    } else if (type === 'OR' || type === 'NOR' || type === 'XOR' || type === 'XNOR') {
        const large = viewBox.width > 200;
        addInputLines(large ? 50 : 15, large ? 100 : 68);

        if (type === 'XOR' || type === 'XNOR') {
            appendGatePath(group, large ? 'M 85 50 A 120 120 0 0 1 85 150' : 'M 48 20 Q 63 60 48 100');
        }

        appendGatePath(group, large
            ? 'M 100 50 A 120 120 0 0 1 100 150 Q 180 150, 200 100 Q 180 50, 100 50 Z'
            : 'M 60 20 Q 75 60 60 100 Q 105 100 135 77 C 148 67 155 64 155 60 C 155 56 148 53 135 43 Q 105 20 60 20 Z');

        if (type === 'NOR' || type === 'XNOR') {
            appendInversionBubble(group, large ? 215 : 165, viewBox.height / 2, large ? 270 : 185);
        } else {
            appendGateLine(group, large ? 200 : 155, viewBox.height / 2, large ? 270 : 185, viewBox.height / 2);
        }
    } else if (type === 'NOT') {
        appendGateLine(group, 0, 30, 20, 30);
        appendGatePath(group, 'M 20 10 L 60 30 L 20 50 Z');
        appendInversionBubble(group, 70, 30, 100);
    }

    return svg;
}

function createPin({ x, y }, viewBox, type, gateId, index) {
    const pin = document.createElement('div');
    pin.className = `pin ${type}`;
    pin.dataset.pinType = type;
    pin.dataset.gateId = gateId;
    pin.dataset.pinIndex = String(index);
    pin.style.left = `${(x / viewBox.width) * 100}%`;
    pin.style.top = `${(y / viewBox.height) * 100}%`;
    return pin;
}

function addDeleteButton(node, gateId) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'node-delete';
    button.dataset.action = 'delete-node';
    button.dataset.gateId = gateId;
    button.textContent = 'x';
    node.appendChild(button);
}

export function renderGate(gate, nodeLayer) {
    const node = document.createElement('div');
    node.className = 'node';
    node.dataset.gateId = gate.id;
    node.style.left = `${gate.x}px`;
    node.style.top = `${gate.y}px`;

    if (gate.type === 'INPUT') {
        node.classList.add('node-input');
    } else if (gate.type === 'OUTPUT') {
        node.classList.add('node-output');
    }

    const svgGate = SVG_GATES[gate.type];
    if (svgGate) {
        node.classList.add('node-svg');

        const graphic = document.createElement('div');
        graphic.className = 'node-graphic';
        const aspect = svgGate.viewBox.height / svgGate.viewBox.width;
        const width = 140;
        const height = Math.round(width * aspect);
        graphic.style.width = `${width}px`;
        graphic.style.height = `${height}px`;

        const inputCount = gate.inputs?.length ?? getInputCount(gate.type);
        graphic.appendChild(createLogicGateSvg(gate.type, svgGate.viewBox, inputCount));
        const leftX = svgGate.inputs && svgGate.inputs[0] ? svgGate.inputs[0].x : 15;
        
        for (let i = 0; i < inputCount; i += 1) {
            const spacing = svgGate.viewBox.height / (inputCount + 1);
            const point = { x: leftX, y: spacing * (i + 1) };
            const pin = createPin(point, svgGate.viewBox, 'input', gate.id, i);
            graphic.appendChild(pin);
        }

        const outputPin = createPin(svgGate.output, svgGate.viewBox, 'output', gate.id, 0);
        graphic.appendChild(outputPin);

        node.appendChild(graphic);
        addDeleteButton(node, gate.id);
    
        if (!['INPUT', 'OUTPUT', 'NOT'].includes(gate.type)) {
            const ctrl = document.createElement('div');
            ctrl.className = 'input-count-control';
            ctrl.innerHTML = `
                <button type="button" class="small-btn" data-action="dec-inputs" data-gate-id="${gate.id}">-</button>
                <span class="input-count" data-gate-id="${gate.id}">${gate.inputs?.length ?? getInputCount(gate.type)}</span>
                <button type="button" class="small-btn" data-action="inc-inputs" data-gate-id="${gate.id}">+</button>
            `;
            node.appendChild(ctrl);
        }
        nodeLayer.appendChild(node);
        return node;
    }

    //input
    const body = document.createElement('div');
    body.className = 'node-body';

    if (gate.type === 'INPUT') {
        const row = document.createElement('div');
        row.className = 'pin-row';

        const label = document.createElement('select');
        label.className = 'input-label';
        label.dataset.action = 'set-label';
        label.dataset.gateId = gate.id;
        for (let code = 65; code <= 90; code += 1) {
            const option = document.createElement('option');
            option.value = String.fromCharCode(code);
            option.textContent = String.fromCharCode(code);
            label.appendChild(option);
        }
        label.value = gate.label || 'A';

        const toggle = document.createElement('button');
        toggle.type = 'button';
        toggle.className = 'input-toggle';
        toggle.textContent = gate.output ? '1' : '0';
        toggle.dataset.action = 'toggle-input';

        const outputPin = document.createElement('div');
        outputPin.className = 'pin output';
        outputPin.dataset.pinType = 'output';
        outputPin.dataset.gateId = gate.id;
        outputPin.dataset.pinIndex = '0';

        row.appendChild(label);
        row.appendChild(toggle);
        row.appendChild(outputPin);
        body.appendChild(row);
    } else if (gate.type === 'OUTPUT') {
        const row = document.createElement('div');
        row.className = 'pin-row';

        const inputPin = document.createElement('div');
        inputPin.className = 'pin input';
        inputPin.dataset.pinType = 'input';
        inputPin.dataset.gateId = gate.id;
        inputPin.dataset.pinIndex = '0';

        const label = document.createElement('span');
        label.textContent = 'OUT';

        const value = document.createElement('div');
        value.className = 'node-value';
        value.dataset.role = 'output-value';
        value.textContent = '0';

        row.appendChild(inputPin);
        row.appendChild(label);
        body.appendChild(row);
        body.appendChild(value);
    } else {
        const inputCount = gate.inputs?.length ?? getInputCount(gate.type);
        for (let i = 0; i < inputCount; i += 1) {
            const row = document.createElement('div');
            row.className = 'pin-row';

            const label = document.createElement('span');
            label.textContent = `IN ${i + 1}`;

            const inputPin = document.createElement('div');
            inputPin.className = 'pin input';
            inputPin.dataset.pinType = 'input';
            inputPin.dataset.gateId = gate.id;
            inputPin.dataset.pinIndex = String(i);

            row.appendChild(label);
            row.appendChild(inputPin);
            body.appendChild(row);
        }

        const outRow = document.createElement('div');
        outRow.className = 'pin-row';

        const outLabel = document.createElement('span');
        outLabel.textContent = 'OUT';

        const outputPin = document.createElement('div');
        outputPin.className = 'pin output';
        outputPin.dataset.pinType = 'output';
        outputPin.dataset.gateId = gate.id;
        outputPin.dataset.pinIndex = '0';

        outRow.appendChild(outLabel);
        outRow.appendChild(outputPin);
        body.appendChild(outRow);
    }

    node.appendChild(body);
    addDeleteButton(node, gate.id);
    if (!['INPUT', 'OUTPUT', 'NOT'].includes(gate.type)) {
        const ctrl = document.createElement('div');
        ctrl.className = 'input-count-control';
        ctrl.innerHTML = `
            <button type="button" class="small-btn" data-action="dec-inputs" data-gate-id="${gate.id}">-</button>
            <span class="input-count" data-gate-id="${gate.id}">${gate.inputs?.length ?? getInputCount(gate.type)}</span>
            <button type="button" class="small-btn" data-action="inc-inputs" data-gate-id="${gate.id}">+</button>
        `;
        node.appendChild(ctrl);
    }
    nodeLayer.appendChild(node);

    return node;
}

export function updateGatePosition(node, gate) {
    node.style.left = `${gate.x}px`;
    node.style.top = `${gate.y}px`;
}

export function updateGateValues(gate, node) {
    const outputPin = node.querySelector('.pin.output');
    if (outputPin) {
        const isOn = gate.output === 1;
        outputPin.classList.toggle('active', isOn);
        outputPin.classList.toggle('inactive', !isOn);
    }

    const value = node.querySelector('[data-role="output-value"]');
    if (value) {
        const isOn = gate.inputs[0] ? '1' : '0';
        value.textContent = isOn;
        value.classList.toggle('is-on', isOn === '1');
        value.classList.toggle('is-off', isOn !== '1');
    }

    const toggle = node.querySelector('[data-action="toggle-input"]');
    if (toggle) {
        const isOn = gate.output ? '1' : '0';
        toggle.textContent = isOn;
        toggle.classList.toggle('active', isOn === '1');
        toggle.classList.toggle('is-on', isOn === '1');
        toggle.classList.toggle('is-off', isOn !== '1');
    }

    const label = node.querySelector('[data-action="set-label"]');
    if (label && gate.label) {
        label.value = gate.label;
    }
}

export function updateWirePath(path, from, to) {
    const dx = Math.max(40, Math.abs(to.x - from.x) * 0.4);
    const c1x = from.x + dx;
    const c2x = to.x - dx;
    path.setAttribute('d', `M ${from.x} ${from.y} C ${c1x} ${from.y}, ${c2x} ${to.y}, ${to.x} ${to.y}`);
}

export function getPinCenter(pin, workspace, zoomLevel = 1, panOffset = { x: 0, y: 0 }) {
    const pinRect = pin.getBoundingClientRect();
    const workspaceRect = workspace.getBoundingClientRect();

    return {
        x: (pinRect.left - workspaceRect.left + pinRect.width / 2 - panOffset.x) / zoomLevel,
        y: (pinRect.top - workspaceRect.top + pinRect.height / 2 - panOffset.y) / zoomLevel
    };
}
