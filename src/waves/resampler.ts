import { WaveData } from '../types';

function sinc(x: number) {
    if (x === 0) {
        return 1;
    } else {
        const v = Math.PI * x;
        return Math.sin(v) / v;
    }
}

function kernel(x: number, f: number, w: number) {
    return sinc(f * x) * sinc(2 * x / w);
}

export function prepareTable(f: number) {
    function addr(oN: number, i: number, slot: number) {
        return (oN * 24 + i) * 2 + slot;
    }

    // 24 point window, with 32 offset subdivisions
    // 25 points so we can calcuate the deltas after the normal end
    const res = new Float32Array(33 * 24 * 2);
    for (let oN = 0; oN < 33; oN++) {
        const o = oN / 32;
        let total = 0;

        // Sample kernel
        for (let i = 0; i < 24; i++) {
            const value = kernel(o - i + 11, f, 24);
            res[addr(oN, i, 0)] = value;
            total += value;
        }

        // Normalize
        for (let i = 0; i < 24; i++) {
            res[addr(oN, i, 0)] /= total;
        }
    }

    for (let oN = 0; oN < 32; oN++) {
        for (let i = 0; i < 24; i++) {
            const cur = res[addr(oN, i, 0)];
            const next = res[addr(oN + 1, i, 0)];
            res[addr(oN, i, 1)] = next - cur;
        }
    }

    return res;
}

export const DefaultTable = prepareTable(1);

function sampleGet(samples: Float32Array, p: number) {
    if (p < 0) {
        return samples.length ? samples[0] : 0;
    } else if (p >= samples.length) {
        return samples.length ? samples[samples.length - 1] : 0;
    } else {
        return samples[p];
    }
}

export function fastInterp(table: Float32Array, samples: Float32Array, pos: number) {
    const floorPos = Math.floor(pos);
    const offset = (pos - floorPos) * 32;
    const floorOff = Math.floor(offset);
    const residual = offset - floorOff;
    const tableOffset = floorOff * 24;

    let res = 0;
    for (let i = 0; i < 24; i++) {
        const p = floorPos + i - 11;
        const t = (tableOffset + i) * 2;
        res += sampleGet(samples, p) * (table[t] + table[t + 1] * residual);
    }

    return res;
}

export function slowInterp(f: number, scratch: Float32Array, samples: Float32Array, pos: number) {
    const floorPos = Math.floor(pos);
    const offset = pos - floorPos;

    // Sample kernel and normalize
    let total = 0;
    for (let i = 0; i < 512; i++) {
        const v = kernel(offset - i + 255, f, 512);
        scratch[i] = v;
        total += v;
    }
    for (let i = 0; i < 512; i++) {
        scratch[i] /= total;
    }
    
    // Compute result
    let res = 0;
    for (let i = 0; i < 512; i++) {
        const p = floorPos + i - 255;
        res += sampleGet(samples, p) * scratch[i];
    }

    return res;
}

export function fastPrepareLoop(wave: WaveData) {
    return prepareLoop(wave, (s, p) => fastInterp(DefaultTable, s, p), 12);
}

export function slowPrepareLoop(wave: WaveData) {
    const scratch = new Float32Array(512);
    return prepareLoop(wave, (s, p) => slowInterp(1, scratch, s, p), 256);
}

export function foldLoop(wave: WaveData, position: number) {
    if (wave.loopStart === -1 || position < wave.loopEnd) {
        return position;
    }

    const width = wave.loopEnd - wave.loopStart;
    const after = position - wave.loopEnd;
    return wave.loopStart + after - width * Math.floor(after / width);
}

export function prepareLoop(wave: WaveData, interp: (samples: Float32Array, pos: number) => number, padding: number): WaveData {
    if (wave.loopStart === -1) {
        return wave;
    }

    const newSamples = new Float32Array(Math.ceil(wave.loopEnd) + padding);
    let pos = 0;
    for (let i = 0; i < newSamples.length; i++) {
        if (pos === Math.floor(pos)) {
            newSamples[i] = wave.samples[pos];
        } else {
            newSamples[i] = interp(wave.samples, pos);
        }

        pos = foldLoop(wave, pos + 1);
    }

    return {
        ...wave,
        samples: newSamples
    };
}

export function crossfadeLoop(wave: WaveData, fadeLen: number): WaveData {
    if (wave.loopStart === -1) {
        return wave;
    }

    fadeLen = Math.min(fadeLen, Math.floor(wave.loopEnd - wave.loopStart));
    const fadeStart = wave.loopEnd - fadeLen;
    const newSamples = new Float32Array(wave.samples.length);
    const stratch = new Float32Array(512);
    for (let i = 0; i < newSamples.length; i++) {
        if (i >= fadeStart && i < wave.loopEnd) {
            const arg = (i - fadeStart) / fadeLen;
            const echo = slowInterp(1, stratch, wave.samples, wave.loopStart - (wave.loopEnd - i));
            newSamples[i] = (1 - arg) * wave.samples[i] + arg * echo;
        } else {
            newSamples[i] = wave.samples[i];
        }
    }

    return {
        ...wave,
        samples: newSamples
    };
}

export function normalize(wave: WaveData): WaveData {
    let maxSamp = 0;
    for (let i = 0; i < wave.samples.length; i++) {
        for (let j = 0; j < 10; j++) {
            maxSamp = Math.max(maxSamp, Math.abs(fastInterp(DefaultTable, wave.samples, i + j / 10)));
        }
    }

    if (maxSamp < 0.001) {
        return wave;
    }

    const newSamples = new Float32Array(wave.samples.length);
    for (let i = 0; i < newSamples.length; i++) {
        newSamples[i] = wave.samples[i] / maxSamp;
    }

    return {
        ...wave,
        samples: newSamples
    };
}

export function roundFine(wave: WaveData): WaveData {
    if (wave.rootFine === 0) {
        return wave;
    }

    const rate = wave.rootFine < 50 ? Math.pow(2, -wave.rootFine / 1200) : Math.pow(2, (100 - wave.rootFine) / 1200);
    const f = rate < 1 ? rate : 1;
    const newSamples = new Float32Array(Math.ceil(wave.samples.length / rate));
    const scratch = new Float32Array(512);
    for (let i = 0; i < newSamples.length; i++) {
        newSamples[i] = slowInterp(f, scratch, wave.samples, i * rate);
    }

    return {
        samples: newSamples,
        sampleRate: wave.sampleRate,
        loopStart: wave.loopStart === -1 ? -1 : wave.loopStart / rate,
        loopEnd: wave.loopEnd === -1 ? -1 : wave.loopEnd / rate,
        rootNote: wave.rootFine < 50 ? wave.rootNote : wave.rootNote + 1,
        rootFine: 0
    };
}

export function alignLoop(wave: WaveData): WaveData {
    const loopLen = wave.loopEnd - wave.loopStart;
    if (loopLen < 1) {
        return wave;
    }

    const newLen = Math.ceil(loopLen);
    if (newLen === loopLen) {
        return wave;
    }

    const rate = newLen / loopLen;
    let newStart = wave.loopStart * rate;
    const offset = Math.ceil(newStart) - newStart;
    newStart += offset;

    const newSamples = new Float32Array(Math.ceil(wave.samples.length * rate + offset));
    const scratch = new Float32Array(512);
    for (let i = 0; i < newSamples.length; i++) {
        newSamples[i] = slowInterp(1, scratch, wave.samples, (i - offset) / rate);
    }

    return {
        ...wave,
        samples: newSamples,
        sampleRate: Math.round(wave.sampleRate * rate),
        loopStart: newStart,
        loopEnd: newStart + newLen,
    };
}

export function trimLoop(wave: WaveData): WaveData {
    if (wave.loopStart === -1) {
        return wave;
    }

    const newSamples = new Float32Array(Math.floor(wave.loopEnd));
    for (let i = 0; i < newSamples.length; i++) {
        newSamples[i] = wave.samples[i];
    }

    return {
        ...wave,
        samples: newSamples,
        loopStart: Math.floor(wave.loopStart),
        loopEnd: Math.floor(wave.loopEnd)
    };
}
