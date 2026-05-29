const SVG_NS = 'http://www.w3.org/2000/svg';

const LAYOUT = {
    switchWidth: 68,
    switchHeight: 36,
    seriesGap: 28,
    parallelGap: 26,
    invertGap: 18
};

// Cria um elemento SVG com os atributos informados.
function createSvgElement(tag, attrs = {}) {
    const el = document.createElementNS(SVG_NS, tag);
    Object.entries(attrs).forEach(([key, value]) => {
        el.setAttribute(key, String(value));
    });
    return el;
}

// Monta a trilha ativa diretamente a partir da árvore do circuito.
function renderActiveTrails(svg, layout, originX, originY, activeIn, leadingPoints = [], trailingPoints = []) {
    if (!layout || !activeIn) {
        return;
    }

    if (svg.__energyAnimFrame) {
        cancelAnimationFrame(svg.__energyAnimFrame);
        svg.__energyAnimFrame = null;
    }

    const appendPoint = (points, point) => {
        if (!point) {
            return;
        }

        const last = points[points.length - 1];
        if (!last || last.x !== point.x || last.y !== point.y) {
            points.push({ x: point.x, y: point.y });
        }
    };

    const appendPath = (points, path) => {
        path.forEach((point) => appendPoint(points, point));
    };

    const appendRoute = (points, from, to) => {
        if (!from || !to) {
            return;
        }

        appendPoint(points, from);

        if (from.x === to.x || from.y === to.y) {
            appendPoint(points, to);
            return;
        }

        appendPoint(points, { x: to.x, y: from.y });
        appendPoint(points, to);
    };

    const collectPaths = (nodeLayout, nodeOriginX, nodeOriginY) => {
        if (!nodeLayout) {
            return [];
        }

        if (nodeLayout.type === 'OUTPUT') {
            return collectPaths(nodeLayout.child, nodeOriginX, nodeOriginY);
        }

        if (nodeLayout.type === 'SWITCH') {
            return [[
                { x: nodeOriginX + nodeLayout.in.x, y: nodeOriginY + nodeLayout.in.y },
                { x: nodeOriginX + nodeLayout.out.x, y: nodeOriginY + nodeLayout.out.y }
            ]];
        }

        if (nodeLayout.type === 'SERIES') {
            let paths = [[]];
            nodeLayout.children.forEach((child, index) => {
                const childOriginX = nodeOriginX + child.x;
                const childOriginY = nodeOriginY + child.y;
                const childPaths = collectPaths(child, childOriginX, childOriginY);
                const nextPaths = [];

                paths.forEach((basePath) => {
                    childPaths.forEach((childPath) => {
                        if (!childPath.length) {
                            return;
                        }

                        const mergedPath = basePath.slice();
                        if (mergedPath.length === 0) {
                            appendPath(mergedPath, childPath);
                        } else {
                            appendRoute(mergedPath, mergedPath[mergedPath.length - 1], childPath[0]);
                            appendPath(mergedPath, childPath.slice(1));
                        }
                        nextPaths.push(mergedPath);
                    });
                });

                paths = nextPaths;

                if (index < nodeLayout.children.length - 1) {
                    const next = nodeLayout.children[index + 1];
                    const connectorStart = {
                        x: childOriginX + child.out.x,
                        y: childOriginY + child.out.y
                    };
                    const connectorEnd = {
                        x: nodeOriginX + next.x + next.in.x,
                        y: nodeOriginY + next.y + next.in.y
                    };

                    paths = paths.map((path) => {
                        const routed = path.slice();
                        appendRoute(routed, connectorStart, connectorEnd);
                        return routed;
                    });
                }
            });
            return paths;
        }

        if (nodeLayout.type === 'PARALLEL') {
            const activeChildren = nodeLayout.children.filter((child) => child.node && child.node._conduct);
            const branchChildren = activeChildren.length ? activeChildren : nodeLayout.children.slice(0, 1);

            if (!branchChildren.length) {
                return [];
            }

            return branchChildren.flatMap((activeChild) => {
                const childOriginX = nodeOriginX + activeChild.x;
                const childOriginY = nodeOriginY + activeChild.y;
                const entry = {
                    x: childOriginX + activeChild.in.x,
                    y: childOriginY + activeChild.in.y
                };
                const exit = {
                    x: childOriginX + activeChild.out.x,
                    y: childOriginY + activeChild.out.y
                };

                const childPaths = collectPaths(activeChild, childOriginX, childOriginY);
                return childPaths.map((childPath) => {
                    const points = [];
                    appendRoute(points, { x: nodeOriginX + nodeLayout.in.x, y: nodeOriginY + nodeLayout.in.y }, entry);
                    appendPath(points, childPath);
                    appendRoute(points, childPath[childPath.length - 1] || entry, exit);
                    appendRoute(points, exit, { x: nodeOriginX + nodeLayout.out.x, y: nodeOriginY + nodeLayout.out.y });
                    return points;
                });
            }).filter((path) => path.length >= 2);
        }

        if (nodeLayout.type === 'INVERT') {
            const childOriginX = nodeOriginX;
            const childOriginY = nodeOriginY + (nodeLayout.height - nodeLayout.child.height) / 2;
            const childPaths = collectPaths(nodeLayout.child, childOriginX, childOriginY);
            if (!childPaths.length) {
                return [];
            }

            const switchOriginX = nodeOriginX + nodeLayout.child.width + LAYOUT.invertGap;
            const switchOriginY = nodeOriginY + (nodeLayout.height - LAYOUT.switchHeight) / 2;
            return childPaths.map((childPath) => {
                const points = [];
                appendPath(points, childPath);
                appendRoute(points, childPath[childPath.length - 1], { x: switchOriginX, y: nodeOriginY + nodeLayout.in.y });
                appendRoute(points, { x: switchOriginX, y: nodeOriginY + nodeLayout.in.y }, { x: switchOriginX + LAYOUT.switchWidth, y: nodeOriginY + nodeLayout.out.y });
                return points;
            });
        }

        return [];
    };

    const trailVariants = collectPaths(layout, originX, originY)
        .map((points) => {
            const fullPath = [];
            appendPath(fullPath, leadingPoints);
            appendPath(fullPath, points);
            appendPath(fullPath, trailingPoints);
            return fullPath;
        })
        .filter((points) => points.length >= 2);

    if (!trailVariants.length) {
        return;
    }

    const getDistance = (from, to) => {
        const dx = to.x - from.x;
        const dy = to.y - from.y;
        return Math.hypot(dx, dy);
    };

    const getPathLength = (points) => {
        let total = 0;
        for (let i = 1; i < points.length; i += 1) {
            total += getDistance(points[i - 1], points[i]);
        }
        return total;
    };

    const samePoint = (a, b) => Boolean(a && b && a.x === b.x && a.y === b.y);

    const getCommonPrefixCount = (paths) => {
        const minLength = Math.min(...paths.map((path) => path.length));
        let count = 0;
        for (let i = 0; i < minLength; i += 1) {
            const point = paths[0][i];
            if (!paths.every((path) => samePoint(path[i], point))) {
                break;
            }
            count += 1;
        }
        return Math.max(1, count);
    };

    const getCommonSuffixCount = (paths, prefixCount) => {
        const minLength = Math.min(...paths.map((path) => path.length));
        let count = 0;
        for (let offset = 1; offset <= minLength - prefixCount; offset += 1) {
            const point = paths[0][paths[0].length - offset];
            if (!paths.every((path) => samePoint(path[path.length - offset], point))) {
                break;
            }
            count += 1;
        }
        return count;
    };

    const createVirtualSegments = (points, prefixCount, suffixCount, maxBranchLen) => {
        const branchStartIndex = Math.max(0, prefixCount - 1);
        const branchEndIndex = suffixCount > 0
            ? points.length - suffixCount
            : points.length - 1;
        const branchPoints = points.slice(branchStartIndex, branchEndIndex + 1);
        const branchLen = getPathLength(branchPoints);
        const branchScale = branchLen > 0 && maxBranchLen > 0 ? maxBranchLen / branchLen : 1;
        const segments = [];
        let virtualLen = 0;

        for (let i = 1; i < points.length; i += 1) {
            const from = points[i - 1];
            const to = points[i];
            const physicalLen = getDistance(from, to);
            const inBranch = (i - 1) >= branchStartIndex && i <= branchEndIndex;
            const segmentVirtualLen = physicalLen * (inBranch ? branchScale : 1);

            segments.push({
                from,
                to,
                physicalLen,
                virtualStart: virtualLen,
                virtualLen: segmentVirtualLen
            });
            virtualLen += segmentVirtualLen;
        }

        return { segments, virtualLen };
    };

    const getPointAtVirtualLength = (renderer, distance) => {
        const target = renderer.virtualLen > 0 ? distance % renderer.virtualLen : 0;
        const segment = renderer.segments.find((item) => target <= item.virtualStart + item.virtualLen)
            || renderer.segments[renderer.segments.length - 1];

        if (!segment) {
            return null;
        }

        if (segment.virtualLen <= 0 || segment.physicalLen <= 0) {
            return { x: segment.to.x, y: segment.to.y };
        }

        const ratio = Math.max(0, Math.min(1, (target - segment.virtualStart) / segment.virtualLen));
        return {
            x: segment.from.x + (segment.to.x - segment.from.x) * ratio,
            y: segment.from.y + (segment.to.y - segment.from.y) * ratio
        };
    };

    const commonPrefixCount = getCommonPrefixCount(trailVariants);
    const commonSuffixCount = getCommonSuffixCount(trailVariants, commonPrefixCount);
    const branchLengths = trailVariants.map((points) => {
        const branchStartIndex = Math.max(0, commonPrefixCount - 1);
        const branchEndIndex = commonSuffixCount > 0
            ? points.length - commonSuffixCount
            : points.length - 1;
        return getPathLength(points.slice(branchStartIndex, branchEndIndex + 1));
    });
    const maxBranchLen = Math.max(...branchLengths, 0);

    const baseSpeed = 100; // px/s for the longest trail
    const dotRadius = 3;
    const glowBaseRadius = 10;
    const glowPulseAmplitude = 0.25;
    const glowPulseSpeed = 0.006;

    const dotGroup = createSvgElement('g', { class: 'switching-energy-dots' });
    const trailRenderers = [];

    if (!svg.__trailCounter) svg.__trailCounter = 0;

    trailVariants.forEach((pathPoints, pathIndex) => {
        const trailId = `switching-trail-${Date.now()}-${svg.__trailCounter++}-${pathIndex}`;
        const d = pathPoints.map((point, index) => (index === 0 ? `M ${point.x} ${point.y}` : `L ${point.x} ${point.y}`)).join(' ');
        const trailPath = createSvgElement('path', {
            id: trailId,
            d,
            class: 'switching-trail'
        });
        svg.appendChild(trailPath);

        const virtualPath = createVirtualSegments(pathPoints, commonPrefixCount, commonSuffixCount, maxBranchLen);
        const trailLen = virtualPath.virtualLen;

        if (trailLen <= 0) {
            return;
        }

        const dotCount = Math.max(3, Math.min(6, Math.round(trailLen / 220)));
        const dotSpacing = trailLen / dotCount;
        const energyDots = [];

        for (let i = 0; i < dotCount; i += 1) {
            const glow = createSvgElement('circle', {
                r: glowBaseRadius,
                class: 'switching-energy-glow'
            });
            const dot = createSvgElement('circle', {
                r: dotRadius,
                class: 'switching-energy-dot'
            });
            dotGroup.appendChild(glow);
            dotGroup.appendChild(dot);
            energyDots.push({ glow, dot, offset: dotSpacing * i });
        }

        trailRenderers.push({
            trailPath,
            trailLen,
            virtualLen: trailLen,
            segments: virtualPath.segments,
            energyDots
        });
    });

    if (!trailRenderers.length) {
        return;
    }

    svg.appendChild(dotGroup);

    const maxTrailLen = trailRenderers.reduce((max, renderer) => Math.max(max, renderer.trailLen), 0);
    const cycleDuration = Math.max(1800, (maxTrailLen / baseSpeed) * 1000);
    const state = {
        startTime: null
    };

    const advanceDot = (timestamp) => {
        if (!svg.isConnected) {
            return;
        }

        const occupiedPositions = new Set();
        if (state.startTime === null) {
            state.startTime = timestamp;
        }

        const elapsed = timestamp - state.startTime;
        const progress = (elapsed % cycleDuration) / cycleDuration;

        trailRenderers.forEach((renderer, rendererIndex) => {
            renderer.energyDots.forEach((energyDot, index) => {
                const offsetProgress = energyDot.offset / renderer.trailLen;
                const dotDistance = ((progress + offsetProgress) % 1) * renderer.trailLen;
                const point = getPointAtVirtualLength(renderer, dotDistance);

                if (!point) {
                    return;
                }

                const positionKey = `${Math.round(point.x / 3)}:${Math.round(point.y / 3)}`;
                const isDuplicatePosition = occupiedPositions.has(positionKey);
                occupiedPositions.add(positionKey);

                energyDot.dot.style.visibility = isDuplicatePosition ? 'hidden' : 'visible';
                energyDot.glow.style.visibility = isDuplicatePosition ? 'hidden' : 'visible';

                energyDot.dot.setAttribute('cx', point.x);
                energyDot.dot.setAttribute('cy', point.y);
                energyDot.glow.setAttribute('cx', point.x);
                energyDot.glow.setAttribute('cy', point.y);

                if (isDuplicatePosition) {
                    return;
                }

                const pulsePhase = timestamp * glowPulseSpeed + index * 0.9 + rendererIndex * 0.3;
                const pulse = 1 + Math.sin(pulsePhase) * glowPulseAmplitude;
                energyDot.glow.setAttribute('r', (glowBaseRadius * pulse).toFixed(2));
                energyDot.glow.setAttribute('opacity', (0.12 + Math.sin(pulsePhase) * 0.04).toFixed(2));
            });
        });

        svg.__energyAnimFrame = requestAnimationFrame(advanceDot);
    };

    svg.__energyAnimFrame = requestAnimationFrame(advanceDot);
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
            const childStates = children.map((child) => annotateConduct(child));
            const allClosed = childStates.every(Boolean);
            node._conduct = allClosed;
            return allClosed;
        }
        case 'PARALLEL': {
            const children = node.children || [];
            const childStates = children.map((child) => annotateConduct(child));
            const anyClosed = childStates.some(Boolean);
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
    const d = `M ${from.x} ${from.y} L ${to.x} ${to.y}`;
    const path = createSvgElement('path', {
        id: pathId,
        d,
        class: `switching-wire${isActive ? ' is-active' : ''}`
    });
    svg.appendChild(path);
    // se ativo, registre o segmento para criação da trilha global
    if (isActive) {
        if (!svg.__activeSegments) svg.__activeSegments = [];
        svg.__activeSegments.push({ from, to, d });
    }
}


// Desenha a fonte de energia do circuito como um ícone de bateria (vertical).
function drawSource(svg, x, y) {
    const group = createSvgElement('g', { class: 'switching-source' });

    // Dimensões da pilha baseadas no SVG de referencia
    const scale = 0.52;
    const bodyW = 60 * scale;
    const bodyH = 90 * scale;
    const termW = 28 * scale;
    const termH = 10 * scale;
    const bodyX = x - bodyW / 2;
    const bodyY = y - bodyH / 2;
    const termX = x - termW / 2;

    // Terminal superior
    const posTerm = createSvgElement('rect', {
        class: 'switching-source-terminal',
        x: termX,
        y: bodyY - termH,
        width: termW,
        height: termH,
        rx: 2
    });

    // Corpo
    const body = createSvgElement('rect', {
        class: 'switching-source-body',
        x: bodyX,
        y: bodyY,
        width: bodyW,
        height: bodyH,
        rx: 4
    });

    // Sinal +
    const markShiftY = 2.5;
    const plusCenterY = bodyY + 26 * scale + markShiftY;
    const plusV = createSvgElement('line', {
        class: 'switching-source-mark',
        x1: x,
        y1: plusCenterY - 6 * scale,
        x2: x,
        y2: plusCenterY + 6 * scale
    });
    const plusH = createSvgElement('line', {
        class: 'switching-source-mark',
        x1: x - 6 * scale,
        y1: plusCenterY,
        x2: x + 6 * scale,
        y2: plusCenterY
    });

    // Sinal -
    const minusY = bodyY + 56 * scale + markShiftY;
    const minus = createSvgElement('line', {
        class: 'switching-source-mark',
        x1: x - 6 * scale,
        y1: minusY,
        x2: x + 6 * scale,
        y2: minusY
    });

    // Terminal inferior
    const negTerm = createSvgElement('rect', {
        class: 'switching-source-terminal',
        x: termX,
        y: bodyY + bodyH,
        width: termW,
        height: termH,
        rx: 2
    });

    group.appendChild(posTerm);
    group.appendChild(body);
    group.appendChild(plusV);
    group.appendChild(plusH);
    group.appendChild(minus);
    group.appendChild(negTerm);
    svg.appendChild(group);
}

// Desenha a lâmpada com estado ligado ou desligado.
function drawLamp(svg, x, y, isOn, label) {
    const scale = 0.42;
    const lampWidth = 120 * scale;
    const lampHeight = 160 * scale;
    const leftPinX = x - 8 * scale;
    const rightPinX = x + 8 * scale;
    const topY = y - lampHeight;

    const group = createSvgElement('g', {
        class: `switching-lamp${isOn ? ' is-on' : ''}`,
        transform: `translate(${x - lampWidth / 2} ${topY}) scale(${scale})`
    });

    const glow = createSvgElement('circle', {
        cx: 60,
        cy: 60,
        r: 52,
        class: `switching-lamp-glow${isOn ? ' is-on' : ''}`
    });

    const bulb = createSvgElement('path', {
        d: 'M60 20 C38 20, 20 38, 20 60 C20 78, 30 92, 42 102 C48 107, 50 114, 50 120 H70 C70 114, 72 107, 78 102 C90 92, 100 78, 100 60 C100 38, 82 20, 60 20 Z',
        class: 'switching-lamp-body'
    });

    const filament = createSvgElement('path', {
        d: 'M48 70 Q60 82 72 70',
        class: 'switching-lamp-filament'
    });

    const supportLeft = createSvgElement('line', {
        x1: 52,
        y1: 70,
        x2: 52,
        y2: 95,
        class: 'switching-lamp-support'
    });

    const supportRight = createSvgElement('line', {
        x1: 68,
        y1: 70,
        x2: 68,
        y2: 95,
        class: 'switching-lamp-support'
    });

    const base = createSvgElement('rect', {
        x: 45,
        y: 120,
        width: 30,
        height: 20,
        rx: 4,
        class: 'switching-lamp-base'
    });

    const groove1 = createSvgElement('line', {
        x1: 48,
        y1: 126,
        x2: 72,
        y2: 126,
        class: 'switching-lamp-groove'
    });

    const groove2 = createSvgElement('line', {
        x1: 48,
        y1: 133,
        x2: 72,
        y2: 133,
        class: 'switching-lamp-groove'
    });

    const pinLeft = createSvgElement('path', {
        d: 'M52 140 V160',
        class: 'switching-lamp-pin'
    });

    const pinRight = createSvgElement('path', {
        d: 'M68 140 V160',
        class: 'switching-lamp-pin'
    });

    group.appendChild(glow);
    group.appendChild(bulb);
    group.appendChild(filament);
    group.appendChild(supportLeft);
    group.appendChild(supportRight);
    group.appendChild(base);
    group.appendChild(groove1);
    group.appendChild(groove2);
    group.appendChild(pinLeft);
    group.appendChild(pinRight);
    svg.appendChild(group);

    if (label) {
        const text = createSvgElement('text', {
            x: x - 10,
            y: topY - 8,
            class: 'switching-label switching-output-label',
            'text-anchor': 'middle'
        });
        text.textContent = label;
        svg.appendChild(text);

        const value = createSvgElement('text', {
            x: x + 24,
            y: topY - 8,
            class: `switching-output-value${isOn ? ' is-on' : ' is-off'}`,
            'text-anchor': 'middle'
        });
        value.textContent = isOn ? '1' : '0';
        svg.appendChild(value);
    }

    return {
        leftTerminal: { x: leftPinX, y },
        rightTerminal: { x: rightPinX, y },
        bodyTopY: topY,
        bodyBottomY: y
    };
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
        cx: startX + 3.5,
        cy: midY,
        r: 3.5,
        class: 'switching-contact'
    });

    const contactRight = createSvgElement('circle', {
        cx: endX - 3.5,
        cy: midY,
        r: 3.5,
        class: 'switching-contact'
    });

    const armEndX = isClosed ? endX - 5 : endX - 8;
    const armEndY = isClosed ? midY : midY - 12;
    const arm = createSvgElement('line', {
        x1: startX + 7,
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
    const switchName = node.name || '?';
    label.textContent = node.inverted && switchName !== '?' && switchName !== 'NOT'
        ? `¬${switchName}`
        : switchName;

    svg.appendChild(contactLeft);
    svg.appendChild(contactRight);
    svg.appendChild(arm);
    svg.appendChild(label);

    // Inverted input contacts are also marked in the label so De Morgan forms are readable.

    if (isActive) {
        drawWire(svg, { x: startX + 7, y: midY }, { x: endX - 7, y: midY }, true);
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
        const activeConnectorYs = layout.children
            .filter((child) => child.node && child.node._conduct)
            .map((child) => originY + child.y + child.in.y);
        const busTop = connectorYs.length ? Math.min(...connectorYs) : originY;
        const busBottom = connectorYs.length ? Math.max(...connectorYs) : originY + layout.height;
        const busCenterY = originY + layout.in.y;

        const drawSplitBus = (x, centerY) => {
            const splitPoints = [...new Set([busTop, busBottom, centerY, ...connectorYs])].sort((a, b) => a - b);

            for (let index = 0; index < splitPoints.length - 1; index += 1) {
                const fromY = splitPoints[index];
                const toY = splitPoints[index + 1];
                const midY = (fromY + toY) / 2;
                const segmentActive = busActive && activeConnectorYs.some((activeY) => (
                    midY >= Math.min(centerY, activeY) && midY <= Math.max(centerY, activeY)
                ));

                drawWire(svg, { x, y: fromY }, { x, y: toY }, segmentActive);
            }
        };

        drawSplitBus(busXIn, busCenterY);
        drawSplitBus(busXOut, originY + layout.out.y);

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

    if (svg.__energyAnimFrame) {
        cancelAnimationFrame(svg.__energyAnimFrame);
        svg.__energyAnimFrame = null;
    }

    svg.innerHTML = '';
    svg.__activeSegments = [];

    if (!tree) {
        return;
    }

    annotateConduct(tree);
    const layout = layoutNode(tree);

    const padX = 90;
    const padY = 92;
    const returnGap = 54;
    const circuitActive = Boolean(tree._conduct);

    const baseWidth = layout.width + padX * 2 + 200;
    const baseHeight = Math.max(layout.height + padY * 2 + returnGap, 240);

    svg.setAttribute('viewBox', `0 0 ${baseWidth} ${baseHeight}`);

    const originX = padX + 40;
    const originY = padY;

    const entry = { x: originX + layout.in.x, y: originY + layout.in.y };
    const exit = { x: originX + layout.out.x, y: originY + layout.out.y };
    const batteryX = padX - 10;
    const sourceStart = { x: batteryX, y: entry.y };

    // Coloca a bateria no fio vertical da esquerda, entre o fio superior e o retorno.
    const batteryBodyH = 44;
    const batteryOffsetY = 36;
    const batteryCenterY = entry.y + batteryOffsetY;
    const batteryBodyTopY = batteryCenterY - Math.round(batteryBodyH / 2) - 1.5;
    const batteryBodyBottomY = batteryCenterY + Math.round(batteryBodyH / 2) - 1.5;
    const batteryTopWireY = batteryBodyTopY - 5;
    const batteryBottomWireY = batteryBodyBottomY + 10;
    const batteryTopJoin = { x: batteryX, y: batteryTopWireY };
    const batteryBottomJoin = { x: batteryX, y: batteryBottomWireY };

    // fio saindo da bateria (por cima) até a entrada do circuito
    drawWire(svg, batteryTopJoin, sourceStart, circuitActive);
    drawWire(svg, sourceStart, entry, circuitActive);
    // desenha a bateria centralizada na coluna do fio
    drawSource(svg, batteryX, batteryCenterY);

    renderNode(svg, layout, originX, originY, circuitActive);

    const lampX = exit.x + 90;
    const returnY = Math.max(exit.y + 90, originY + layout.height + returnGap);
    const lampTerminals = drawLamp(svg, lampX, exit.y, circuitActive, tree.name || 'OUT');
    const lampEntry = lampTerminals.leftTerminal;
    const lampExit = lampTerminals.rightTerminal;
    const returnDown = { x: lampExit.x, y: returnY };
    const returnLeft = { x: batteryX, y: returnY };
    const returnUp = { x: batteryX, y: batteryBottomWireY };

    drawWire(svg, exit, lampEntry, circuitActive);

    drawWire(svg, lampExit, returnDown, circuitActive);
    drawWire(svg, returnDown, returnLeft, circuitActive);
    drawWire(svg, returnLeft, returnUp, circuitActive);

        renderActiveTrails(
            svg,
            layout,
            originX,
            originY,
            circuitActive,
            [batteryTopJoin, sourceStart, entry],
            [exit, lampEntry, lampExit, returnDown, returnLeft, returnUp]
        );
}
