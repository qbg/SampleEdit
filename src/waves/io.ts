import { WaveFile } from 'wavefile';
import { ISmplChunk, WaveData } from '../types';

export function loadWave(bytes: ArrayBuffer): WaveData {
    const wave = new WaveFile(new Uint8Array(bytes));
    const fmt = wave.fmt as { sampleRate: number; numChannels: number };
    if (fmt.numChannels !== 1) {
        throw new Error('File is not mono');
    }
    const sampleRate = fmt.sampleRate;

    wave.toBitDepth('32f');
    const samples = wave.getSamples(false, Float32Array) as any as Float32Array;
    if (!samples.length) {
        throw new Error('Wave is empty');
    }

    const smpl = wave.smpl as ISmplChunk;
    const loop = smpl.loops[0];
    if (loop && loop.dwType !== 0) {
        throw new Error('Unsupported loop type');
    }

    let rootNote = smpl.chunkId ? smpl.dwMIDIUnityNote : 60;
    let rootFine = smpl.chunkId ? Math.round(smpl.dwMIDIPitchFraction / 0x100000000 * 100) : 0;
    if (rootFine === 100) {
        rootNote++;
        rootFine = 0;
    }
    return {
        samples,
        sampleRate: sampleRate,
        loopStart: loop ? loop.dwStart : -1,
        loopEnd: loop ? loop.dwEnd + 1 : -1,
        rootNote,
        rootFine
    };
}

export function saveWave(wave: WaveData): ArrayBuffer {
    const file = new WaveFile();
    file.fromScratch(1, wave.sampleRate, '32f', wave.samples);
    file.toBitDepth('16');
    const smpl = file.smpl as ISmplChunk;
    smpl.chunkId = 'smpl';
    smpl.dwSamplePeriod = Math.floor(1000000000 / wave.sampleRate);
    smpl.dwMIDIUnityNote = Math.max(0, Math.min(127, wave.rootNote));
    smpl.dwMIDIPitchFraction = Math.floor(wave.rootFine / 100 * 0x100000000);

    if (wave.loopStart !== -1) {
        smpl.dwNumSampleLoops = 1;
        smpl.loops = [{
            dwName: 0,
            dwType: 0,
            dwStart: Math.floor(wave.loopStart),
            dwEnd: Math.floor(wave.loopEnd) - 1,
            dwFraction: 0,
            dwPlayCount: 0
        }];
    }

    return file.toBuffer();
}
