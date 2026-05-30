function collectInputNames(node, names = new Set()) {
    if (!node) {
        return names;
    }

    if (node.type === 'INPUT') {
        names.add(node.name || 'A');
        return names;
    }

    const children = node.inputs || [];
    children.forEach((child) => collectInputNames(child, names));
    collectInputNames(node.input, names);
    collectInputNames(node.child, names);
    return names;
}

function evaluateLogic(node, values) {
    if (!node) {
        return false;
    }

    const children = node.inputs || [];

    switch (node.type) {
        case 'OUTPUT':
            return evaluateLogic(node.input || node.child, values);
        case 'INPUT':
            return Boolean(values.get(node.name || 'A'));
        case 'NOT':
            return !evaluateLogic(children[0], values);
        case 'AND':
            return children.every((child) => evaluateLogic(child, values));
        case 'OR':
            return children.some((child) => evaluateLogic(child, values));
        case 'NAND':
            return !children.every((child) => evaluateLogic(child, values));
        case 'NOR':
            return !children.some((child) => evaluateLogic(child, values));
        case 'XOR':
            return children.filter((child) => evaluateLogic(child, values)).length % 2 === 1;
        case 'XNOR':
            return children.filter((child) => evaluateLogic(child, values)).length % 2 === 0;
        default:
            return false;
    }
}

function countOnes(bits) {
    return bits.split('').filter((bit) => bit === '1').length;
}

function combineBits(left, right) {
    let diffCount = 0;
    let combined = '';

    for (let index = 0; index < left.length; index += 1) {
        if (left[index] === right[index]) {
            combined += left[index];
        } else if (left[index] !== '-' && right[index] !== '-') {
            diffCount += 1;
            combined += '-';
        } else {
            return null;
        }
    }

    return diffCount === 1 ? combined : null;
}

function bitsCover(bits, minterm) {
    return bits.split('').every((bit, index) => bit === '-' || bit === minterm[index]);
}

function uniqueByBits(items) {
    const map = new Map();
    items.forEach((item) => {
        if (!map.has(item.bits)) {
            map.set(item.bits, item);
        }
    });
    return [...map.values()];
}

function findPrimeImplicants(minterms) {
    let current = uniqueByBits(minterms.map((bits) => ({ bits, used: false })));
    const primes = [];

    while (current.length) {
        const next = [];
        const usedBits = new Set();

        for (let leftIndex = 0; leftIndex < current.length; leftIndex += 1) {
            for (let rightIndex = leftIndex + 1; rightIndex < current.length; rightIndex += 1) {
                const combined = combineBits(current[leftIndex].bits, current[rightIndex].bits);
                if (combined) {
                    usedBits.add(current[leftIndex].bits);
                    usedBits.add(current[rightIndex].bits);
                    next.push({ bits: combined, used: false });
                }
            }
        }

        current
            .filter((item) => !usedBits.has(item.bits))
            .forEach((item) => primes.push(item));

        current = uniqueByBits(next);
    }

    return uniqueByBits(primes);
}

function getLiteralCost(bits) {
    return bits.split('').filter((bit) => bit !== '-').length;
}

function chooseCover(primes, minterms) {
    const covered = new Set();
    const selected = [];

    minterms.forEach((minterm) => {
        const covering = primes.filter((prime) => bitsCover(prime.bits, minterm));
        if (covering.length === 1 && !selected.includes(covering[0])) {
            selected.push(covering[0]);
        }
    });

    selected.forEach((prime) => {
        minterms.filter((minterm) => bitsCover(prime.bits, minterm)).forEach((minterm) => covered.add(minterm));
    });

    const remaining = minterms.filter((minterm) => !covered.has(minterm));
    if (!remaining.length) {
        return selected;
    }

    const candidates = primes.filter((prime) => !selected.includes(prime));
    let best = null;

    const search = (index, picked) => {
        const pickedCover = new Set();
        picked.forEach((prime) => {
            remaining.filter((minterm) => bitsCover(prime.bits, minterm)).forEach((minterm) => pickedCover.add(minterm));
        });

        if (remaining.every((minterm) => pickedCover.has(minterm))) {
            const cost = picked.length * 100 + picked.reduce((sum, prime) => sum + getLiteralCost(prime.bits), 0);
            if (!best || cost < best.cost) {
                best = { cost, picked: picked.slice() };
            }
            return;
        }

        if (index >= candidates.length) {
            return;
        }

        if (best && picked.length >= best.picked.length) {
            return;
        }

        search(index + 1, picked.concat(candidates[index]));
        search(index + 1, picked);
    };

    search(0, []);
    return selected.concat(best ? best.picked : []);
}

function buildNodeFromImplicant(bits, names, inputValues) {
    const literals = bits.split('').map((bit, index) => {
        if (bit === '-') {
            return null;
        }

        const name = names[index];
        const inputNode = {
            type: 'INPUT',
            name,
            value: inputValues?.get?.(name) ?? 0
        };

        return bit === '1'
            ? inputNode
            : { type: 'NOT', inputs: [inputNode] };
    }).filter(Boolean);

    if (literals.length === 0) {
        return { type: 'CONST', value: 1 };
    }

    if (literals.length === 1) {
        return literals[0];
    }

    return { type: 'AND', inputs: literals };
}

export function simplifyLogicTree(root, inputValues) {
    const names = [...collectInputNames(root)].sort((left, right) => left.localeCompare(right));
    const maxInputsForExactSimplification = 10;

    if (names.length === 0) {
        return {
            type: 'OUTPUT',
            name: root?.name || 'Y',
            input: { type: 'CONST', value: evaluateLogic(root, new Map()) ? 1 : 0 }
        };
    }

    if (names.length > maxInputsForExactSimplification) {
        return root;
    }

    const total = 1 << names.length;
    const minterms = [];

    for (let mask = 0; mask < total; mask += 1) {
        const values = new Map();
        const bits = names.map((name, index) => {
            const bit = (mask >> (names.length - index - 1)) & 1;
            values.set(name, bit);
            return String(bit);
        }).join('');

        if (evaluateLogic(root, values)) {
            minterms.push(bits);
        }
    }

    let input;
    if (minterms.length === 0) {
        input = { type: 'CONST', value: 0 };
    } else if (minterms.length === total) {
        input = { type: 'CONST', value: 1 };
    } else {
        const primes = findPrimeImplicants(minterms);
        const cover = chooseCover(primes, minterms);
        const terms = cover.map((prime) => buildNodeFromImplicant(prime.bits, names, inputValues));
        input = terms.length === 1 ? terms[0] : { type: 'OR', inputs: terms };
    }

    return {
        type: 'OUTPUT',
        name: root?.name || 'Y',
        id: root?.id,
        gateId: root?.gateId,
        input
    };
}
