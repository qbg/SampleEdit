import { useMemo, useState } from 'react';
import { WaveDataPeaks } from '../types';
import { getPeaks } from '../waves/analysis';
import Player from '../waves/player';
import { useAnimationFrame } from '../hooks';
import Canvas, { CanvasArgs, DrawArgs } from './Canvas';
import { DefaultTable, fastInterp } from '../waves/resampler';

interface IWaveEditProps {
    wave: WaveDataPeaks;
    setWave(wave: WaveDataPeaks): void;
    crossfadeLen: number;
}
export default function WaveEdit({wave, setWave, crossfadeLen}: IWaveEditProps) {
    const [playPos, setPlayPos] = useState(-1);
    const [grabbed, setGrabbed] = useState<"loopStart" | "loopEnd" | undefined>(undefined);
    const waveLen = wave.samples.length;
    
    const draw = useMemo(() => (args2: DrawArgs) => {
        const {ctx, height, width, viewStart, viewEnd} = args2;
        const viewWidth = viewEnd - viewStart;

        function ampToY(amp: number) {
            return height / 2 - amp * height / 2;
        }

        function posToY(pos: number) {
            return ampToY(fastInterp(DefaultTable, wave.samples, pos));
        }

        function posToX(pos: number) {
            return Math.floor((pos / waveLen - viewStart) / viewWidth * width);
        }
        
        function xToPos(x: number) {
            return (viewStart + (x / width) * viewWidth) * waveLen;
        }

        ctx.fillStyle = '#FFF';
        ctx.fillRect(0, 0, width, height);

        if (wave.loopStart !== -1) {
            const loopStartX = posToX(wave.loopStart);
            const loopEndX = posToX(wave.loopEnd);
            ctx.fillStyle = '#FEE';
            ctx.fillRect(loopStartX, 0, loopEndX - loopStartX, height);

            ctx.fillStyle = '#F00';
            ctx.fillRect(loopStartX, 0, 1, height);
            ctx.fillRect(loopEndX, 0, 1, height);
        }
        
        ctx.fillStyle = '#CCC';
        ctx.fillRect(0, ampToY(0), width, 1);

        const pxPerSample = width / (viewWidth * waveLen);
        if (pxPerSample < 1) {
            ctx.fillStyle = '#000';
            const {min, max} = getPeaks(wave, viewStart * waveLen, viewEnd * waveLen, width);
            for (let i = 0; i < width; i++) {
                const maxY = Math.floor(ampToY(max[i]));
                const minY = Math.ceil(ampToY(min[i]));
                ctx.fillRect(i, maxY, 1, Math.max(1, minY - maxY));
            }
        } else {
            function drawWave(start: number, end: number, posOffset: number) {
                start = Math.max(start, 0);
                end = Math.min(end, width);

                ctx.beginPath();
                ctx.moveTo(start, posToY(xToPos(start) + posOffset));
                for (let i = start + 1; i <= end; i++) {
                    ctx.lineTo(i, posToY(xToPos(i) + posOffset));
                }
                ctx.stroke();
            }

            ctx.strokeStyle = '#000';
            drawWave(0, width, 0);

            if (wave.loopStart !== -1) {
                ctx.strokeStyle = '#F00';
                const loopLen = wave.loopEnd - wave.loopStart;
                const xStart = posToX(wave.loopStart);
                const xEnd = posToX(wave.loopEnd);
                const echoLen = pxPerSample * Math.min(crossfadeLen, loopLen);
                drawWave(xStart - echoLen, xStart, loopLen);
                drawWave(xEnd - echoLen, xEnd, -loopLen);
            }

            ctx.strokeStyle = '#000';
            if (pxPerSample >= 4) {
                for (let i = Math.floor(viewStart * waveLen); i < Math.ceil(viewEnd * waveLen); i++) {
                    ctx.beginPath();
                    ctx.arc(posToX(i), ampToY(wave.samples[i]), Math.min(pxPerSample / 2, 4 * devicePixelRatio), 0, 2*Math.PI);
                    ctx.stroke();
                }
            }
        }

        if (playPos !== -1) {
            ctx.fillStyle = 'blue';
            ctx.fillRect(posToX(playPos), 0, 1, height);
        }
    }, [wave, playPos, crossfadeLen]);

    useAnimationFrame(() => {
        setPlayPos(Player.getPosition());
    }, []);

    function isAllowedZoom(zoom: number, width: number) {
        return width * zoom / waveLen <= 50;
    }

    function posToInnerX(pos: number, args: CanvasArgs) {
        return Math.floor((pos / waveLen - args.viewStart) / (args.viewEnd - args.viewStart) * args.innerWidth);
    }

    function innerXToPos(x: number, args: CanvasArgs) {
        return Math.max(0, Math.min(waveLen, (args.viewStart + x / args.innerWidth * (args.viewEnd - args.viewStart)) * waveLen));
    }

    function handleMouseDown(evt: MouseEvent, args: CanvasArgs, x: number) {
        if (evt.button !== 0) {
            return;
        }

        if (wave.loopStart === -1) {
            const pos = innerXToPos(x, args);
            setWave({...wave, loopStart: pos, loopEnd: pos});
            setGrabbed('loopEnd');
        } else {
            const startDist = Math.abs(posToInnerX(wave.loopStart, args) - x);
            const endDist = Math.abs(posToInnerX(wave.loopEnd, args) - x);
            if (Math.min(startDist, endDist) > 5) {
                return;
            }
    
            setGrabbed(startDist < endDist ? 'loopStart' : 'loopEnd');
        }
    }

    function setGrabbedPos(pos: number) {
        if (grabbed === 'loopStart') {
            setWave({...wave, loopStart: Math.min(pos, wave.loopEnd), loopEnd: Math.max(pos, wave.loopEnd)});
        } else if (grabbed === 'loopEnd') {
            setWave({...wave, loopStart: Math.min(pos, wave.loopStart), loopEnd: Math.max(pos, wave.loopStart)});
        }
    }

    function handleMouseMove(evt: MouseEvent, args: CanvasArgs, x: number) {
        if (evt.button !== 0) {
            return;
        }
        
        setGrabbedPos(innerXToPos(x, args));
    }

    function handleMouseUp(evt: MouseEvent) {
        if (evt.button !== 0) {
            return;
        }
        
        setGrabbed(undefined);
    }

    function handleMouseLeave(_: MouseEvent, args: CanvasArgs, x: number) {
        if (x >= args.innerWidth) {
            setGrabbedPos(waveLen);
            setGrabbed(undefined);
        } else if (x <= 0) {
            setGrabbedPos(0);
            setGrabbed(undefined);
        }
    }

    return (
        <Canvas
            draw={draw}
            allowZoom={isAllowedZoom}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseLeave}
            className="wave-display"
        />
    );
}
