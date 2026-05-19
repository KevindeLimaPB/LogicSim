const SVG_NS = 'http://www.w3.org/2000/svg';

const LAYOUT = {
    switchWidth: 90,
    switchHeight: 36,
    seriesGap: 36,
    parallelGap: 26,
    invertGap: 24
};

// Cria um elemento SVG com os atributos informados.
function createSvgElement(tag, attrs = {}) {
    const el = document.createElementNS(SVG_NS, tag);
    Object.entries(attrs).forEach(([key, value]) => {
        el.setAttribute(key, String(value));
    });
    return el;
}

// Marca recursivamente quais ramos conduzem energia.
function annotateConduct(node) {
    if (!node) {
        return false;
    }

    switch (node.type) {
        case 'SWITCH': {
            const value = node.inverted ? !node.state : !!node.state;
            node._conduct = value;
            return value;
        }
        case 'SERIES': {
            const children = node.children || [];
            const allClosed = children.every((child) => annotateConduct(child));
            node._conduct = allClosed;
            return allClosed;
        }
        case 'PARALLEL': {
            const children = node.children || [];
            const anyClosed = children.some((child) => annotateConduct(child));
            node._conduct = anyClosed;
            return anyClosed;
        }
        case 'INVERT': {
            const childClosed = annotateConduct(node.child);
            node._conduct = !childClosed;
            node._inputConduct = childClosed;
            return node._conduct;
        }
        case 'OUTPUT': {
            const childClosed = annotateConduct(node.child);
            node._conduct = childClosed;
            return childClosed;
        }
        default:
            node._conduct = false;
            return false;
    }
}

// Calcula a posição e o tamanho de cada nó do circuito.
function layoutNode(node) {
    if (!node) {
        return {
            type: 'MISSING',
            node,
            width: LAYOUT.switchWidth,
            height: LAYOUT.switchHeight,
            in: { x: 0, y: LAYOUT.switchHeight / 2 },
            out: { x: LAYOUT.switchWidth, y: LAYOUT.switchHeight / 2 }
        };
    }

    if (node.type === 'SWITCH') {
        return {
            type: 'SWITCH',
            node,
            width: LAYOUT.switchWidth,
            height: LAYOUT.switchHeight,
            in: { x: 0, y: LAYOUT.switchHeight / 2 },
            out: { x: LAYOUT.switchWidth, y: LAYOUT.switchHeight / 2 }
        };
    }

    if (node.type === 'INVERT') {
        const child = layoutNode(node.child);
        const height = Math.max(child.height, LAYOUT.switchHeight);
        return {
            type: 'INVERT',
            node,
            child,
            width: child.width + LAYOUT.invertGap + LAYOUT.switchWidth,
            height,
            in: { x: 0, y: height / 2 },
            out: { x: child.width + LAYOUT.invertGap + LAYOUT.switchWidth, y: height / 2 }
        };
    }

    if (node.type === 'SERIES') {
        const children = (node.children || []).map(layoutNode);
        const width = children.reduce((sum, child) => sum + child.width, 0)
            + LAYOUT.seriesGap * Math.max(children.length - 1, 0);
        const height = children.reduce((max, child) => Math.max(max, child.height), 0) || LAYOUT.switchHeight;

        let offsetX = 0;
        const placed = children.map((child) => {
            const placedChild = { ...child, x: offsetX, y: (height - child.height) / 2 };
            offsetX += child.width + LAYOUT.seriesGap;
            return placedChild;
        });

        return {
            type: 'SERIES',
            node,
            children: placed,
            width,
            height,
            in: { x: 0, y: height / 2 },
            out: { x: width, y: height / 2 }
        };
    }

    if (node.type === 'PARALLEL') {
        const children = (node.children || []).map(layoutNode);
        const width = children.reduce((max, child) => Math.max(max, child.width), 0) || LAYOUT.switchWidth;
        const height = children.reduce((sum, child) => sum + child.height, 0)
            + LAYOUT.parallelGap * Math.max(children.length - 1, 0);

        let offsetY = 0;
        const placed = children.map((child) => {
            const placedChild = { ...child, x: 0, y: offsetY };
            offsetY += child.height + LAYOUT.parallelGap;
            return placedChild;
        });

        return {
            type: 'PARALLEL',
            node,
            children: placed,
            width,
            height,
            in: { x: 0, y: height / 2 },
            out: { x: width, y: height / 2 }
        };
    }

    if (node.type === 'OUTPUT') {
        const child = layoutNode(node.child);
        return {
            type: 'OUTPUT',
            node,
            child,
            width: child.width,
            height: child.height,
            in: { x: 0, y: child.in.y },
            out: { x: child.out.x, y: child.out.y }
        };
    }

    return layoutNode({ type: 'SWITCH', name: '?', state: 0, inverted: false });
}

// substitua a função drawWire existente por este código
// Desenha um fio entre dois pontos e indica se ele está ativo.
function drawWire(svg, from, to, isActive) {
    if (!svg.__wireCounter) svg.__wireCounter = 0;
    const pathId = `switching-path-${Date.now()}-${svg.__wireCounter++}`;
    const path = createSvgElement('path', {
        id: pathId,
        d: `M ${from.x} ${from.y} L ${to.x} ${to.y}`,
        class: `switching-wire${isActive ? ' is-active' : ''}`
    });
    svg.appendChild(path);
}


// Desenha a fonte de energia do circuito.
function drawSource(svg, x, y) {
    const group = createSvgElement('g', { class: 'switching-source' });

    const body = createSvgElement('circle', { cx: x, cy: y, r: 16 });
    const plusV = createSvgElement('line', { x1: x, y1: y - 8, x2: x, y2: y + 8 });
    const plusH = createSvgElement('line', { x1: x - 6, y1: y, x2: x + 6, y2: y });

    group.appendChild(body);
    group.appendChild(plusV);
    group.appendChild(plusH);
    svg.appendChild(group);
}

// Desenha a lâmpada com estado ligado ou desligado.
function drawLamp(svg, x, y, isOn, label) {
    const group = createSvgElement('g', { class: 'switching-lamp' });
    const glow = createSvgElement('circle', {
        cx: x,
        cy: y,
        r: 26,
        class: `switching-lamp-glow${isOn ? ' is-on' : ''}`
    });
    const circle = createSvgElement('circle', {
        cx: x,
        cy: y,
        r: 18,
        class: `switching-lamp${isOn ? ' is-on' : ''}`
    });
    const filament = createSvgElement('path', {
        d: `M ${x - 8} ${y} Q ${x} ${y + 6} ${x + 8} ${y}`
    });

    group.appendChild(glow);
    group.appendChild(circle);
    group.appendChild(filament);
    svg.appendChild(group);

    if (label) {
        const text = createSvgElement('text', {
            x: x,
            y: y - 28,
            class: 'switching-label',
            'text-anchor': 'middle'
        });
        text.textContent = label;
        svg.appendChild(text);
    }
}

// Desenha a chave elétrica com base no estado de entrada.
function drawSwitch(svg, x, y, node, activeIn) {
    const width = LAYOUT.switchWidth;
    const height = LAYOUT.switchHeight;
    const midY = y + height / 2;
    const startX = x;
    const endX = x + width;
    const isClosed = node.inverted ? !node.state : !!node.state;
    const isActive = activeIn && node._conduct;

    const contactLeft = createSvgElement('circle', {
        cx: startX + 4,
        cy: midY,
        r: 4,
        class: 'switching-contact'
    });

    const contactRight = createSvgElement('circle', {
        cx: endX - 4,
        cy: midY,
        r: 4,
        class: 'switching-contact'
    });

    const armEndX = isClosed ? endX - 6 : startX + width * 0.62;
    const armEndY = isClosed ? midY : midY - 10;
    const arm = createSvgElement('line', {
        x1: startX + 6,
        y1: midY,
        x2: armEndX,
        y2: armEndY,
        class: `switching-switch ${isClosed ? 'is-closed' : 'is-open'}`
    });

    const label = createSvgElement('text', {
        x: x + width / 2,
        y: y - 8,
        class: 'switching-label',
        'text-anchor': 'middle'
    });
    label.textContent = node.name || '?';

    svg.appendChild(contactLeft);
    svg.appendChild(contactRight);
    svg.appendChild(arm);
    svg.appendChild(label);

    // Inverted contacts are represented by the switch position only.

    if (isActive) {
        drawWire(svg, { x: startX + 8, y: midY }, { x: endX - 8, y: midY }, true);
    }
}

// Renderiza um nó do circuito e seus filhos de forma recursiva.
function renderNode(svg, layout, originX, originY, activeIn) {
    if (!layout) {
        return;
    }

    if (layout.type === 'OUTPUT') {
        renderNode(svg, layout.child, originX, originY, activeIn);
        return;
    }

    if (layout.type === 'SWITCH') {
        drawSwitch(svg, originX, originY, layout.node, activeIn);
        return;
    }

    if (layout.type === 'INVERT') {
        const childOriginX = originX;
        const childOriginY = originY + (layout.height - layout.child.height) / 2;
        renderNode(svg, layout.child, childOriginX, childOriginY, activeIn);

        const childExit = {
            x: childOriginX + layout.child.out.x,
            y: childOriginY + layout.child.out.y
        };

        const switchOriginX = originX + layout.child.width + LAYOUT.invertGap;
        const switchOriginY = originY + (layout.height - LAYOUT.switchHeight) / 2;

        const outputActive = activeIn && layout.node._conduct;
        const inputActive = activeIn && layout.node._inputConduct;

        drawWire(svg, childExit, { x: switchOriginX, y: originY + layout.in.y }, inputActive);
        drawSwitch(svg, switchOriginX, switchOriginY, {
            name: 'NOT',
            state: layout.node._inputConduct ? 1 : 0,
            inverted: true,
            _conduct: layout.node._conduct
        }, inputActive);
        drawWire(
            svg,
            { x: switchOriginX + LAYOUT.switchWidth, y: originY + layout.in.y },
            { x: originX + layout.width, y: originY + layout.out.y },
            outputActive
        );
        return;
    }

    if (layout.type === 'SERIES') {
        const seriesActive = activeIn && layout.node._conduct;

        layout.children.forEach((child, index) => {
            const childOriginX = originX + child.x;
            const childOriginY = originY + child.y;
            renderNode(svg, child, childOriginX, childOriginY, seriesActive);

            if (index < layout.children.length - 1) {
                const next = layout.children[index + 1];
                const from = {
                    x: childOriginX + child.out.x,
                    y: childOriginY + child.out.y
                };
                const to = {
                    x: originX + next.x + next.in.x,
                    y: originY + next.y + next.in.y
                };
                drawWire(svg, from, to, seriesActive);
            }
        });
        return;
    }

    if (layout.type === 'PARALLEL') {
        const busActive = activeIn && layout.node._conduct;
        const busXIn = originX + layout.in.x;
        const busXOut = originX + layout.out.x;
        const connectorYs = layout.children.map((child) => originY + child.y + child.in.y);
        const busTop = connectorYs.length ? Math.min(...connectorYs) : originY;
        const busBottom = connectorYs.length ? Math.max(...connectorYs) : originY + layout.height;

        drawWire(svg, { x: busXIn, y: busTop }, { x: busXIn, y: busBottom }, busActive);
        drawWire(svg, { x: busXOut, y: busTop }, { x: busXOut, y: busBottom }, busActive);

        layout.children.forEach((child) => {
            const childOriginX = originX + child.x;
            const childOriginY = originY + child.y;
            const branchActive = activeIn && child.node._conduct;

            const entry = {
                x: childOriginX + child.in.x,
                y: childOriginY + child.in.y
            };
            const exit = {
                x: childOriginX + child.out.x,
                y: childOriginY + child.out.y
            };

            drawWire(svg, { x: busXIn, y: entry.y }, entry, branchActive);
            drawWire(svg, exit, { x: busXOut, y: exit.y }, branchActive);

            renderNode(svg, child, childOriginX, childOriginY, branchActive);
        });
        return;
    }
}

// Renderiza o circuito elétrico completo dentro do SVG informado.
export function renderElectrical(svg, tree) {
    if (!svg) {
        return;
    }

    svg.innerHTML = '';

    if (!tree) {
        return;
    }

    annotateConduct(tree);
    const layout = layoutNode(tree);

    const padX = 90;
    const padY = 40;
    const circuitActive = Boolean(tree._conduct);

    const baseWidth = layout.width + padX * 2 + 200;
    const baseHeight = Math.max(layout.height + padY * 2, 240);

    svg.setAttribute('viewBox', `0 0 ${baseWidth} ${baseHeight}`);

    const originX = padX + 40;
    const originY = (baseHeight - layout.height) / 2;

    const entry = { x: originX + layout.in.x, y: originY + layout.in.y };
    const exit = { x: originX + layout.out.x, y: originY + layout.out.y };

    drawSource(svg, padX - 10, entry.y);
    drawWire(svg, { x: padX + 8, y: entry.y }, entry, circuitActive);

    renderNode(svg, layout, originX, originY, circuitActive);

    const lampX = exit.x + 90;
    drawWire(svg, exit, { x: lampX - 24, y: exit.y }, circuitActive);
    drawLamp(svg, lampX, exit.y, circuitActive, tree.name || 'OUT');

    const returnY = exit.y + 90;
    drawWire(svg, { x: lampX + 24, y: exit.y }, { x: lampX + 24, y: returnY }, circuitActive);
    drawWire(svg, { x: lampX + 24, y: returnY }, { x: padX - 10, y: returnY }, circuitActive);
    drawWire(svg, { x: padX - 10, y: returnY }, { x: padX - 10, y: entry.y + 18 }, circuitActive);
}
