import { render } from 'react';
import Player from './waves/player';
import App from './components/App';
import { preparePeaks } from './waves/analysis';
import { loadWave } from './waves/io';
import './index.css'

const root = document.getElementById('root')!
render(<p>Please load a file</p>, root);

async function loadFile(file: File) {
    const arrBuff = await file.arrayBuffer();
    let wave;
    try {
        wave = preparePeaks(loadWave(arrBuff));
    } catch (err) {
        alert(err);
        return;
    }

    Player.stop();
    render(<App key={wave.id} initialWave={wave} />, root);
}

document.body.addEventListener('dragover', evt => {
    evt.preventDefault();
});

document.body.addEventListener('drop', evt => {
    evt.preventDefault();
    const file = evt.dataTransfer?.files?.[0];
    if (file) {
        loadFile(file);
    }
});
