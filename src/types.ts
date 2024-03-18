export type WaveData = {
    samples: Float32Array;
    sampleRate: number;
    loopStart: number;
    loopEnd: number;
    rootNote: number;
    rootFine: number;
};

export type WaveDataPeaks = WaveData & {
    id: number;
    min: Float32Array[];
    max: Float32Array[];
};

export interface ISmplChunk {
    chunkId: string;
    dwManufacturer: number;
    dwProduct: number;
    dwSamplePeriod: number;
    dwMIDIUnityNote: number;
    dwMIDIPitchFraction: number;
    dwSMPTEFormat: number;
    dwSMPTEOffset: number;
    dwNumSampleLoops: number;
    dwSamplerData: number;
    loops: ISmplLoop[];
}

export interface ISmplLoop {
    dwName: number;
    dwType: number;
    dwStart: number;
    dwEnd: number;
    dwFraction: number;
    dwPlayCount: number;
}

export interface IWavePlayerCommandStart {
    type: 'start';
    wave: WaveData;
}

export interface IWavePlayerCommandStop {
    type: 'stop';
}

export interface IWavePlayerCommandTune {
    type: 'tune';
    freq: number;
    vol: number;
}

export type WavePlayerCommand = IWavePlayerCommandStart | IWavePlayerCommandStop | IWavePlayerCommandTune;

export type WavePlayerReport = {
    position: number;
};
