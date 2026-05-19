const GATE_INPUTS = {
    INPUT: 0,
    OUTPUT: 1,
    AND: 2,
    OR: 2,
    NOT: 1,
    NAND: 2,
    NOR: 2,
    XOR: 2,
    XNOR: 2
};

// Cria um objeto de porta com estado inicial para o editor.
export function createGate(type, x, y) {
    return {
        id: crypto.randomUUID(),
        type,
        x,
        y,
        inputs: new Array(GATE_INPUTS[type]).fill(0),
        output: type === 'INPUT' ? 0 : 0,
        label: type === 'INPUT' ? 'A' : ''
    };
}

// Retorna quantas entradas cada tipo de porta deve ter.
export function getInputCount(type) {
    return GATE_INPUTS[type] || 0;
}

// Calcula a saída da porta com base no tipo e nos sinais de entrada.
export function evaluateGate(gate) {
    const inputs = gate.inputs;

    switch (gate.type) {
        case 'INPUT':
            return gate.output;
        case 'OUTPUT':
            return inputs[0] ? 1 : 0;
        case 'AND':
            return inputs.every((v) => v === 1) ? 1 : 0;
        case 'OR':
            return inputs.some((v) => v === 1) ? 1 : 0;
        case 'NOT':
            return inputs[0] ? 0 : 1;
        case 'NAND':
            return inputs.every((v) => v === 1) ? 0 : 1;
        case 'NOR':
            return inputs.some((v) => v === 1) ? 0 : 1;
        case 'XOR':
            return inputs.filter((v) => v === 1).length % 2 === 1 ? 1 : 0;
        case 'XNOR':
            return inputs.filter((v) => v === 1).length % 2 === 0 ? 1 : 0;
        default:
            return 0;
    }
}
