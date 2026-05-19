import { evaluateGate } from './gates.js';

// Recalcula os sinais do circuito até estabilizar o resultado.
export function recompute(state) {
    const { gates, wires } = state;
    const gateMap = new Map(gates.map((gate) => [gate.id, gate]));

    for (let pass = 0; pass < 6; pass += 1) {
        let changed = false;

        gates.forEach((gate) => {
            gate.inputs = gate.inputs.map(() => 0);
        });

        wires.forEach((wire) => {
            const fromGate = gateMap.get(wire.fromId);
            const toGate = gateMap.get(wire.toId);
            if (!fromGate || !toGate) {
                return;
            }
            toGate.inputs[wire.inputIndex] = fromGate.output;
        });

        gates.forEach((gate) => {
            const next = evaluateGate(gate);
            if (gate.output !== next) {
                gate.output = next;
                changed = true;
            }
        });

        if (!changed) {
            break;
        }
    }
}
