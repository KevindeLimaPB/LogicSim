// Constrói as árvores lógicas a partir das portas e fios do editor.
export function buildLogicTrees(state) {
    const gates = state?.gates || [];
    const wires = state?.wires || [];
    const gateMap = new Map(gates.map((gate) => [gate.id, gate]));
    const wireMap = new Map();
    const inputValues = new Map();

    gates.forEach((gate) => {
        if (gate.type === 'INPUT') {
            const name = gate.label || 'A';
            inputValues.set(name, gate.output ? 1 : 0);
        }
    });

    wires.forEach((wire) => {
        wireMap.set(`${wire.toId}:${wire.inputIndex}`, wire);
    });

    // Monta um nó recursivamente e evita ciclos no grafo.
    const buildNode = (gateId, visiting = new Set()) => {
        const gate = gateMap.get(gateId);
        if (!gate) {
            return { type: 'MISSING' };
        }

        if (visiting.has(gateId)) {
            return { type: 'LOOP' };
        }

        visiting.add(gateId);

        const getInput = (index) => {
            const wire = wireMap.get(`${gate.id}:${index}`);
            if (!wire) {
                return { type: 'MISSING' };
            }
            return buildNode(wire.fromId, visiting);
        };

        let node = { type: gate.type };

        switch (gate.type) {
            case 'INPUT':
                node = { type: 'INPUT', name: gate.label || 'A', value: gate.output ? 1 : 0 };
                break;
            case 'OUTPUT':
                node = { type: 'OUTPUT', input: getInput(0) };
                break;
            case 'NOT':
                node = { type: 'NOT', inputs: [getInput(0)] };
                break;
            case 'AND':
            case 'OR':
            case 'NAND':
            case 'NOR':
            case 'XOR':
            case 'XNOR': {
                const count = gate.inputs?.length || 2;
                const inputs = [];
                for (let i = 0; i < count; i += 1) {
                    inputs.push(getInput(i));
                }
                node = { type: gate.type, inputs };
                break;
            }
            default:
                node = { type: 'MISSING' };
        }

        visiting.delete(gateId);
        return node;
    };

    const outputGates = gates.filter((gate) => gate.type === 'OUTPUT');
    const roots = outputGates.map((gate, index) => {
        const logicNode = buildNode(gate.id);
        return {
            gateId: gate.id,
            type: 'OUTPUT',
            name: `Y${index + 1}`,
            input: logicNode.input || logicNode
        };
    });

    return { roots, inputs: inputValues };
}
