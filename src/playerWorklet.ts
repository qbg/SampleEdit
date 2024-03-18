import { DefaultTable, fastInterp, foldLoop, prepareTable } from './waves/resampler';
import { WavePlayerCommand, WaveData, IWavePlayerCommandStart, IWavePlayerCommandTune } from './types';

class PlayerProcessor extends AudioWorkletProcessor {
    private wave: WaveData;
    private pos: number;
    private table: Float32Array;
    private dPos: number;
    private lastUpdate: number;
    private tunePos: number;
    private tuneDPos: number;
    private tuneVol: number;

    constructor() {
        super();
        this.port.onmessage = this.handleMessage.bind(this);
        this.wave = {
            samples: new Float32Array(0),
            sampleRate,
            loopStart: -1,
            loopEnd: -1,
            rootNote: 60,
            rootFine: 0
        };
        this.pos = -1;
        this.table = DefaultTable;
        this.dPos = 1;
        this.lastUpdate = currentTime;
        this.tunePos = 0;
        this.tuneDPos = 0;
        this.tuneVol = 0;
    }

    handleMessage(evt: MessageEvent<WavePlayerCommand>) {
        const cmd = evt.data;
        switch (cmd.type) {
            case 'start':
                this.handleStartMessage(cmd);
                break;
            case 'stop':
                this.handleStopMessage();
                break;
            case 'tune':
                this.handleTuneMessage(cmd);
                break;
        }
    }

    handleStartMessage({wave}: IWavePlayerCommandStart) {
        const newDPos = wave.sampleRate / sampleRate;
        if (this.dPos === newDPos) {
            // Nothing
        } else if (sampleRate < wave.sampleRate) {
            this.table = prepareTable(sampleRate / wave.sampleRate);
        } else {
            this.table = DefaultTable;
        }
        
        this.wave = wave;
        this.dPos = newDPos;
        this.pos = 0;
        this.port.postMessage(this.pos);
        this.lastUpdate = currentTime;
    }

    handleStopMessage() {
        this.pos = -1;
        this.port.postMessage(this.pos);
    }

    handleTuneMessage({freq, vol}: IWavePlayerCommandTune) {
        this.tuneDPos = Math.max(0, Math.min(1, freq / sampleRate));
        this.tuneVol = Math.max(0, Math.min(1, vol));
    }

    process(_: any, outputs: Float32Array[][]) {
        const outputChans = outputs[0];
        const output = outputChans[0];

        let {pos, tunePos, tuneDPos, tuneVol, table, wave, dPos} = this;
        if (pos === -1) {
            return true;
        }

        for (let i = 0; i < output.length; i++) {
            if (pos >= wave.samples.length) {
                pos = -1;
                break;
            }

            output[i] = fastInterp(table, wave.samples, pos) * 0.8 * (1 - tuneVol) + Math.sin(tunePos * 2 * Math.PI) * tuneVol;
            pos = foldLoop(wave, pos + dPos);
            tunePos = tunePos + tuneDPos;
            tunePos = tunePos - Math.floor(tunePos);
        }
        this.pos = pos;
        this.tunePos = tunePos;

        for (let i = 1; i < outputChans.length; i++) {
            const o = outputChans[i];
            for (let j = 0; j < output.length; j++) {
                o[j] = output[j];
            }
        }

        if (currentTime - this.lastUpdate > 1/60 || pos === -1) {
            this.port.postMessage(pos);
            this.lastUpdate = currentTime;
        }

        return true;
    }
}

registerProcessor('wave-player', PlayerProcessor);
