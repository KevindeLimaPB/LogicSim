// Conta quantos bits 1 existem em uma máscara binária.
function countBits(mask) {
    let count = 0;
    let value = mask;
    while (value > 0) {
        count += value & 1;
        value >>= 1;
    }
    return count;
}

// Monta uma expressão SOP para representar XOR ou XNOR.
function buildParitySop(inputs, parity) {
    if (!inputs || inputs.length === 0) {
        return { type: 'MISSING' };
    }

    if (inputs.length === 1) {
        if (parity === 1) {
            return inputs[0];
        }
        return { type: 'NOT', inputs: [inputs[0]] };
    }

    const terms = [];
    const total = 1 << inputs.length;
    for (let mask = 0; mask < total; mask += 1) {
        const ones = countBits(mask);
        if (ones % 2 !== parity) {
            continue;
        }

        const literals = inputs.map((node, index) => {
            const bit = (mask >> index) & 1;
            return bit ? node : { type: 'NOT', inputs: [node] };
        });

        if (literals.length === 1) {
            terms.push(literals[0]);
        } else {
            terms.push({ type: 'AND', inputs: literals });
        }
    }

    if (terms.length === 1) {
        return terms[0];
    }

    return { type: 'OR', inputs: terms };
}

// Expande portas compostas em combinações lógicas básicas.
function expandLogic(node) {
    if (!node) {
        return { type: 'MISSING' };
    }

    switch (node.type) {
        case 'OUTPUT':
            return {
                type: 'OUTPUT',
                name: node.name || 'Y',
                input: expandLogic(node.input)
            };
        case 'INPUT':
            return {
                type: 'INPUT',
                name: node.name || 'A',
                value: node.value
            };
        case 'CONST':
            return {
                type: 'CONST',
                value: node.value ? 1 : 0
            };
        case 'NOT':
            return { type: 'NOT', inputs: [expandLogic(node.inputs?.[0])] };
        case 'AND':
        case 'OR':
            return {
                type: node.type,
                inputs: (node.inputs || []).map((child) => expandLogic(child))
            };
        case 'NAND':
            return {
                type: 'NOT',
                inputs: [{ type: 'AND', inputs: (node.inputs || []).map((child) => expandLogic(child)) }]
            };
        case 'NOR':
            return {
                type: 'NOT',
                inputs: [{ type: 'OR', inputs: (node.inputs || []).map((child) => expandLogic(child)) }]
            };
        case 'XOR':
            return buildParitySop((node.inputs || []).map((child) => expandLogic(child)), 1);
        case 'XNOR':
            return buildParitySop((node.inputs || []).map((child) => expandLogic(child)), 0);
        default:
            return { type: 'MISSING' };
    }
}

// Empurra as negações para dentro da árvore lógica.
function pushNot(node, negate = false) {
    if (!node) {
        return { type: 'MISSING' };
    }

    switch (node.type) {
        case 'OUTPUT':
            return {
                type: 'OUTPUT',
                name: node.name || 'Y',
                input: pushNot(node.input, negate)
            };
        case 'INPUT':
            return {
                type: 'INPUT',
                name: node.name || 'A',
                value: node.value,
                inverted: Boolean(negate)
            };
        case 'CONST':
            return {
                type: 'CONST',
                value: negate ? (node.value ? 0 : 1) : (node.value ? 1 : 0)
            };
        case 'NOT':
            return pushNot(node.inputs?.[0], !negate);
        case 'AND':
        case 'OR': {
            const op = negate ? (node.type === 'AND' ? 'OR' : 'AND') : node.type;
            const inputs = (node.inputs || []).map((child) => pushNot(child, negate));
            return { type: op, inputs };
        }
        default:
            return { type: 'MISSING' };
    }
}

// Converte a árvore lógica normalizada em elementos do circuito elétrico.
function convertNormalizedToElectrical(node, inputValues) {
    if (!node) {
        return { type: 'SWITCH', name: '?', state: 0, inverted: false, isMissing: true };
    }

    switch (node.type) {
        case 'OUTPUT':
            return {
                type: 'OUTPUT',
                name: node.name || 'Y',
                child: convertNormalizedToElectrical(node.input, inputValues)
            };
        case 'INPUT':
            return {
                type: 'SWITCH',
                name: node.name || 'A',
                state: node.value ?? inputValues?.get?.(node.name) ?? 0,
                inverted: Boolean(node.inverted)
            };
        case 'CONST':
            return {
                type: 'SWITCH',
                name: node.value ? '1' : '0',
                state: node.value ? 1 : 0,
                inverted: false
            };
        case 'AND':
            return {
                type: 'SERIES',
                children: (node.inputs || []).map((item) => convertNormalizedToElectrical(item, inputValues))
            };
        case 'OR':
            return {
                type: 'PARALLEL',
                children: (node.inputs || []).map((item) => convertNormalizedToElectrical(item, inputValues))
            };
        case 'MISSING':
        default:
            return { type: 'SWITCH', name: '?', state: 0, inverted: false, isMissing: true };
    }
}

// Executa a conversão completa da lógica para o circuito elétrico.
export function convertLogicToElectrical(node, inputValues) {
    if (!node) {
        return { type: 'SWITCH', name: '?', state: 0, inverted: false, isMissing: true };
    }

    const expanded = expandLogic(node);
    const normalized = pushNot(expanded, false);
    return convertNormalizedToElectrical(normalized, inputValues);
}
