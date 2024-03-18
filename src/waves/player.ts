import { WaveData, WavePlayerCommand } from '../types';
import { fastPrepareLoop } from './resampler';
import playerWorkletUrl from '../playerWorklet?worker&url';

let audioCtx: AudioContext | undefined;
let audioNode: AudioWorkletNode | undefined;
const queue: WavePlayerCommand[] = [];
let currentPos = -1;
let stopping: (() => void) | undefined = undefined; 

function triggerStart() {
    stopping && stopping();
    stopping = undefined;
    audioCtx!.resume();
}

function triggerStop() {
    if (stopping) {
        return;
    }

    const id = setTimeout(() =>  {
        audioCtx!.suspend();
        stopping = undefined;
    }, 250);
    stopping = () => clearTimeout(id);
}

function sendCommandInternal(cmd: WavePlayerCommand) {
    if (cmd.type === 'start') {
        triggerStart();
    }
    audioNode!.port.postMessage(cmd);
}

function sendCommand(cmd: WavePlayerCommand) {
    if (!audioCtx) {
        audioCtx = new AudioContext();
        audioCtx.audioWorklet.addModule(playerWorkletUrl).then(() => {
            audioNode = new AudioWorkletNode(audioCtx!, 'wave-player');
            audioNode.connect(audioCtx!.destination);
            audioNode.onprocessorerror = () => alert('Error!');
            audioNode.port.onmessage = evt => {
                currentPos = evt.data;
                if (evt.data === -1) {
                    triggerStop();
                }
            }
            
            queue.reverse();
            while (queue.length) {
                sendCommandInternal(queue.pop()!);
            }
        });
    }

    if (audioNode) {
        sendCommandInternal(cmd);
    } else {
        queue.push(cmd);
    }
}

export default {
    start(wave: WaveData) {
        sendCommand({
            type: 'start',
            wave: fastPrepareLoop(wave)
        });
    },
    stop() {
        sendCommand({
            type: 'stop'
        });
    },
    tune(freq: number, vol: number) {
        sendCommand({
            type: 'tune',
            freq,
            vol
        });
    },
    getPosition() {
        return currentPos;
    }
};
