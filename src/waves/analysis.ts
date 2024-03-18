import { DefaultTable, fastInterp } from './resampler';
import { WaveData, WaveDataPeaks } from '../types';

let waveIdCounter = 0;
export function preparePeaks(wave: WaveData) {
    let len = wave.samples.length;
    const res: WaveDataPeaks = {
        ...wave,
        id: waveIdCounter++,
        min: [new Float32Array(len)],
        max: [new Float32Array(len)],
    };
    let cMin = res.min[0];
    let cMax = res.max[0];
    if (len === 0) {
        return res;
    }

    // Oversampled peaks
    for (let i = 0; i < len; i++) {
        let min = Infinity;
        let max = -Infinity;

        for (let o = -5; o <= 5; o++) {
            const s = fastInterp(DefaultTable, wave.samples, i + o/10);
            min = Math.min(min, s);
            max = Math.max(max, s);
        }

        cMin[i] = min;
        cMax[i] = max;
    }

    // Scaled versions
    while (true) {
        if (len === 1) {
            return res;
        }

        len = Math.ceil(len / 2);
        const pMin = cMin;
        const pMax = cMax;
        cMin = new Float32Array(len);
        cMax = new Float32Array(len);
        res.min.push(cMin);
        res.max.push(cMax);

        for (let i = 0; i < len; i++) {
            let min = pMin[i * 2];
            let max = pMax[i * 2];
            if (i * 2 + 1 < pMin.length) {
                min = Math.min(min, pMin[i * 2 + 1]);
                max = Math.max(max, pMax[i * 2 + 1]);
            }

            cMin[i] = min;
            cMax[i] = max;
        }
    }
}

export function getPeaks(peaks: WaveDataPeaks, start: number, end: number, subdivs: number) {
    const min = new Float32Array(subdivs);
    const max = new Float32Array(subdivs);
    const width = (end - start) / subdivs;
    const length = peaks.min[0].length;

    for (let subdiv = 0; subdiv < subdivs; subdiv++) {
        let chunkStart = Math.round(start + subdiv * width);
        let chunkEnd = Math.round(start + (subdiv + 1) * width);
        let table = 0;

        if (chunkEnd <= 0 || chunkStart >= length) {
            continue;
        }

        chunkStart = Math.max(0, chunkStart);
        chunkEnd = Math.min(length, chunkEnd);
        if (chunkStart === chunkEnd) {
            chunkEnd++;
        }
    
        while (chunkEnd - chunkStart >= 8) {
            table++;
            chunkStart = Math.floor(chunkStart / 2);
            chunkEnd = Math.floor(chunkEnd / 2);
        }

        min[subdiv] = Infinity;
        max[subdiv]  = -Infinity;
        for (let i = chunkStart; i < chunkEnd; i++) {
            min[subdiv] = Math.min(min[subdiv], peaks.min[table][i]);
            max[subdiv] = Math.max(max[subdiv], peaks.max[table][i]);
        }
    }

    return {min, max};
}
