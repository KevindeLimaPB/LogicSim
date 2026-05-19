// Cria um objeto de fio para ligar duas portas do editor.
export function createWire(fromId, toId, inputIndex) {
    return {
        id: crypto.randomUUID(),
        fromId,
        toId,
        inputIndex
    };
}
