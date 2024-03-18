import React, { useState } from 'react';
import { WaveData, WaveDataPeaks } from '../types';
import Player from '../waves/player';
import WaveDisplay from './WaveEdit';
import { DefaultTable, alignLoop, crossfadeLoop, fastInterp, normalize, roundFine, slowPrepareLoop, trimLoop } from '../waves/resampler';
import { preparePeaks } from '../waves/analysis';
import { saveWave } from '../waves/io';
import './App.css';

const NoteNames = ['A', 'A#', 'B', 'C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#'];

function midiToName(midi: number) {
    let num = midi + 3;
    return `${NoteNames[num - Math.floor(num / 12) * 12]}${Math.floor(num / 12) - 1}`;
}

const NoteOptions = (function () {
    const res: React.ReactNode[] = [];
    for (let i = 127; i >= 0; i--) {
        res.push(<option key={i} value={i}>{midiToName(i)}</option>);
    }
    return res;
})();

function trimNum(num: number) {
    return Math.round(num * 100) / 100;
}

function getLoopNoteVals(wave: WaveData, loopCount: number, tuneStd: number) {
    const freq = wave.sampleRate * loopCount / (wave.loopEnd - wave.loopStart);
    const midiFine = Math.log2(freq / tuneStd) * 12 + 69;
    let midi = Math.floor(midiFine);
    let cents = Math.round((midiFine - midi) * 100);
    if (cents === 100) {
        midi++;
        cents = 0;
    }
    return { rootNote: midi, rootFine: cents };
}

interface IAppProps {
    initialWave: WaveDataPeaks;
}
export default function App(props: IAppProps) {
    const [wave, setWave] = useState(props.initialWave);
    const [crossfadeLen, setCrossfadeLen] = useState(24);
    const [tuneVol, setTuneVol] = useState(0);
    const [tuneStd, setTuneStd] = useState(440);
    const [loopCount, setLoopCount] = useState(1);
    const [linked, setLinked] = useState(false);

    function tune(wave: WaveData, vol: number) {
        Player.tune(tuneStd * Math.pow(2, (wave.rootNote + wave.rootFine / 100 - 69) / 12), vol / 100);
    }

    function setAndTune(opts: {wave?: WaveDataPeaks, vol?: number, loopCount?: number, tuneStd?: number, linked?: boolean}) {
        const curTuneVol = opts.vol ?? tuneVol;
        setTuneVol(curTuneVol);

        const curLoopCount = opts.loopCount ?? loopCount;
        setLoopCount(curLoopCount);

        const curTuneStd = opts.tuneStd ?? tuneStd;
        setTuneStd(curTuneStd);

        const curLinked = opts.linked ?? linked;
        setLinked(curLinked);

        let curWave = opts.wave ?? wave;
        if (curLinked) {
            curWave = {...curWave, ...getLoopNoteVals(curWave, curLoopCount, curTuneStd) };
        }
        setWave(curWave);

        tune(curWave, curTuneVol);
    }

    function getLoopNote() {
        const { rootNote, rootFine } = getLoopNoteVals(wave, loopCount, tuneStd);
        return `${midiToName(rootNote)} +${rootFine} cents`;
    }

    function handleStart() {
        tune(wave, tuneVol);
        Player.start(wave);
    }

    function handleStop() {
        Player.stop();
    }

    function handleSetWave(wave: WaveDataPeaks) {
        Player.stop();
        setAndTune({wave});
    }

    function handleClearLoop() {
        handleSetWave({
            ...wave,
            loopStart: -1,
            loopEnd: -1
        });
    }

    function handleSnapLoop() {
        handleSetWave({
            ...wave,
            loopStart: Math.round(wave.loopStart),
            loopEnd: Math.round(wave.loopEnd)
        });
    }

    function handleSnapLoopZero() {
        if (wave.loopStart === -1) {
            return;
        }

        function snap(pos: number) {
            let lower = pos - 0.5;
            let upper = pos + 0.5;
            for (let i = 0; i < 20; i++) {
                const middle = (lower + upper) / 2;
                const lv = fastInterp(DefaultTable, wave.samples, lower);
                const uv = fastInterp(DefaultTable, wave.samples, upper);
                if (Math.sign(lv) === Math.sign(uv)) {
                    return middle;
                }

                const mv = fastInterp(DefaultTable, wave.samples, middle);
                if (Math.sign(lv) === Math.sign(mv)) {
                    lower = middle;
                } else {
                    upper = middle;
                }
            }
            return (lower + upper) / 2;
        }

        handleSetWave({
            ...wave,
            loopStart: snap(wave.loopStart),
            loopEnd: snap(wave.loopEnd)
        });
    }

    function handleCrossfadeLoop() {
        handleSetWave(preparePeaks(crossfadeLoop(wave, crossfadeLen)));
    }

    function handleLoopTrim() {
        handleSetWave(preparePeaks(slowPrepareLoop(wave)));
    }

    function handleNormalize() {
        handleSetWave(preparePeaks(normalize(wave)));
    }

    function handleRoundTuning() {
        handleSetWave(preparePeaks(slowPrepareLoop(roundFine(slowPrepareLoop(wave)))));
    }

    function handleAlignLoop() {
        if (wave.loopStart !== -1) {
            handleSetWave(preparePeaks(slowPrepareLoop(alignLoop(slowPrepareLoop(wave)))));
        }
    }

    function handleSave() {
        const aligned = trimLoop(alignLoop(slowPrepareLoop(wave)));
        const blob = new Blob([saveWave(aligned)], {type: 'audio/wav'});
        const a = document.createElement('a');
        const url = URL.createObjectURL(blob);
        a.href = url;
        a.download = 'sample.wav';
        a.style.display = 'none';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    function handleCrossfadeChange(evt: React.ChangeEvent<HTMLInputElement>) {
        const num = parseInt(evt.currentTarget.value);
        if (!isNaN(num)) {
            setCrossfadeLen(num);
        }
    }

    function handleTuneNoteChange(evt: React.ChangeEvent<HTMLSelectElement>) {
        const num = parseInt(evt.currentTarget.value);
        setAndTune({wave: {...wave, rootNote: num}});
    }

    function handleTuneFineChange(evt: React.ChangeEvent<HTMLInputElement>) {
        const num = parseInt(evt.currentTarget.value);
        if (!isNaN(num)) {
            const d = Math.floor(num / 100);
            setAndTune({wave: {...wave, rootNote: wave.rootNote + d, rootFine: num - d * 100}});
        }
    }

    function handleTuneVolChange(evt: React.ChangeEvent<HTMLInputElement>) {
        const num = parseInt(evt.currentTarget.value);
        if (!isNaN(num) && num >= 0 && num <= 100) {
            setAndTune({vol: num});
        }
    }

    function handleLoopCountChange(evt: React.ChangeEvent<HTMLInputElement>) {
        const num = parseInt(evt.currentTarget.value);
        if (!isNaN(num) && num > 0) {
            setAndTune({loopCount: num});
        }
    }

    function handleTuneStdChange(evt: React.ChangeEvent<HTMLInputElement>) {
        const num = parseInt(evt.currentTarget.value);
        if (!isNaN(num) && num > 0) {
            setAndTune({tuneStd: num});
        }
    }

    function handleLinkedChange(evt: React.ChangeEvent<HTMLInputElement>) {
        setAndTune({linked: evt.currentTarget.checked});
    }

    let loopInfo = 'None';
    if (wave.loopStart !== -1) {
        loopInfo = `${trimNum(wave.loopStart)} - ${trimNum(wave.loopEnd)}`;
        if (wave.loopEnd - wave.loopStart >= 1) {
            loopInfo = `${loopInfo} (${getLoopNote()})`;
        }
    }

    return (
        <>
            <div id="controls">
                <div>
                    <label>Play:</label>
                    <button onClick={handleStart}>Start</button>
                    <button onClick={handleStop}>Stop</button>
                </div>
                <div>
                    <label>Loop:</label>
                    <button onClick={handleClearLoop}>Clear</button>
                    <button onClick={handleSnapLoop}>Snap sample</button>
                    <button onClick={handleSnapLoopZero}>Snap zero</button>
                    <button onClick={handleCrossfadeLoop}>Crossfade</button>
                    <button onClick={handleLoopTrim}>Trim</button>
                </div>
                <div>
                    <label>Tools:</label>
                    <button onClick={handleNormalize}>Normalize</button>
                    <button onClick={handleRoundTuning}>Round tuning</button>
                    <button onClick={handleAlignLoop}>Align loop</button>
                    <button onClick={handleSave}>Save</button>
                </div>
                <div>
                    <label htmlFor="crossfadeLen">Crossfade length:</label>
                    <input id="crossfadeLen" type="number" onChange={handleCrossfadeChange} value={crossfadeLen} />

                    <label htmlFor="loopCount">Loop cycles:</label>
                    <input id="loopCount" type="number" onChange={handleLoopCountChange} value={loopCount} />

                    <label htmlFor="tuneStd">Tuning standard:</label>
                    <input id="tuneStd" type="number" onChange={handleTuneStdChange} value={tuneStd} />
                </div>
                <div>
                    <label htmlFor="rootNote">Tune note:</label>
                    <select id="rootNote" onChange={handleTuneNoteChange} value={wave.rootNote}>
                        {NoteOptions}
                    </select>

                    <label htmlFor="rootFine">Tune cents:</label>
                    <input id="rootFine" type="number" onChange={handleTuneFineChange} value={wave.rootFine} />

                    <label htmlFor="tuneVol">Tune vol%:</label>
                    <input id="tuneVol" type="number" onChange={handleTuneVolChange} value={tuneVol} />

                    <label htmlFor="linked">Linked:</label>
                    <input id="linked" type="checkbox" onChange={handleLinkedChange} checked={linked} />
                </div>
                <div>
                    <label>Loop:</label>
                    {loopInfo}
                </div>
            </div>
            <WaveDisplay
                wave={wave}
                setWave={handleSetWave}
                crossfadeLen={crossfadeLen} 
            />
        </>
    );
}
