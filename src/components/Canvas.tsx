import { useEffect, useRef, useState } from 'react';
import { useAnimationFrame } from '../hooks';

function getZoom(log: number) {
    return Math.pow(1.25, log);
}

export type CanvasArgs = {
    viewStart: number;
    viewEnd: number;
    width: number;
    height: number;
    innerWidth: number;
    innerHeight: number;
};

export type DrawArgs = CanvasArgs & {
    ctx: CanvasRenderingContext2D;
};

interface ICanvasProps {
    draw(args: DrawArgs): void;
    allowZoom?(zoom: number, width: number, height: number): boolean;
    onMouseDown?(evt: MouseEvent, args: CanvasArgs, x: number, y: number): void;
    onMouseUp?(evt: MouseEvent, args: CanvasArgs, x: number, y: number): void;
    onMouseMove?(evt: MouseEvent, args: CanvasArgs, x: number, y: number): void;
    onMouseLeave?(evt: MouseEvent, args: CanvasArgs, x: number, y: number): void;

    className?: string;
}
export default function Canvas(props: ICanvasProps) {
    const [innerWidth, setInnerWidth] = useState(0);
    const [innerHeight, setInnerHeight] = useState(0);
    const [dpr, setDpr] = useState(window.devicePixelRatio);
    const [viewOffset, setViewOffset] = useState(0);
    const [viewZoomLog, setViewZoomLog] = useState(0);
    const wrapRef = useRef<HTMLDivElement>(null);
    const paneRef = useRef<HTMLDivElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const zoom = getZoom(viewZoomLog);
    const viewStart = viewOffset / (innerWidth * zoom);

    useAnimationFrame(() => {
        const wrap = wrapRef.current;
        if (wrap) {
            const style = getComputedStyle(wrap);
            setDpr(window.devicePixelRatio);
            const iW = parseInt(style.getPropertyValue('width'));
            setInnerWidth(iW);
            setInnerHeight(parseInt(style.getPropertyValue('height')));
            setViewOffset(wrap.scrollLeft);
        }
    }, []);

    function buildArgs() {
        return {
            innerWidth,
            innerHeight,
            width: innerWidth * dpr,
            height: innerHeight * dpr,
            viewStart,
            viewEnd: viewStart + 1 / zoom
        };
    }

    useEffect(() => {
        const canvas = canvasRef.current;
        if (canvas) {
            canvas.width = innerWidth * dpr;
            canvas.height = innerHeight * dpr;
            canvas.style.width = `${innerWidth}px`;
            canvas.style.height = `${innerHeight}px`;
            if (canvas.width && canvas.height) {
                const ctx = canvas.getContext('2d', {alpha: false})!;
                props.draw({...buildArgs(), ctx});
            }
        }
    }, [props.draw, innerWidth, innerHeight, dpr, viewOffset, viewZoomLog]);

    function isZoomAllowed(zoom: number) {
        if (props.allowZoom) {
            return props.allowZoom(zoom, innerWidth, innerHeight);
        } else {
            return false;
        }
    }

    function handleWheel(evt: WheelEvent) {
        const wrap = wrapRef.current;
        if (wrap) {
            let newZoomLog = viewZoomLog;
            if (evt.deltaY < 0 && isZoomAllowed(getZoom(viewZoomLog + 1))) {
                newZoomLog++;
            } else if (viewZoomLog > 0 && evt.deltaY > 0) {
                newZoomLog--;
            } else {
                return;
            }
            
            const newZoom = getZoom(newZoomLog);

            const rect = wrap.getBoundingClientRect();
            const xFrac = (evt.clientX - rect.left) / rect.width;
            const newFrac = Math.max(0, Math.min(viewStart + xFrac / zoom - xFrac / newZoom, 1 - 1 / newZoom));
            const offset = Math.floor(newFrac * innerWidth * newZoom);
            
            paneRef.current!.style.width = `${innerWidth * newZoom}px`;
            canvasRef.current!.style.left = `${offset}px`;
            wrap.scrollLeft = offset;
            setViewZoomLog(newZoomLog);
            setViewOffset(offset);
        }
    }

    function handleMouseDown(evt: MouseEvent) {
        evt.preventDefault();
        const canvas = canvasRef.current;
        if (props.onMouseDown && canvas) {
            const rect = canvas.getBoundingClientRect();
            props.onMouseDown(evt, buildArgs(), evt.clientX - rect.left, evt.clientY - rect.top);
        }
    }

    function handleMouseUp(evt: MouseEvent) {
        evt.preventDefault();
        const canvas = canvasRef.current;
        if (props.onMouseUp && canvas) {
            const rect = canvas.getBoundingClientRect();
            props.onMouseUp(evt, buildArgs(), evt.clientX - rect.left, evt.clientY - rect.top);
        }
    }

    function handleMouseMove(evt: MouseEvent) {
        evt.preventDefault();
        const canvas = canvasRef.current;
        if (props.onMouseMove && canvas) {
            const rect = canvas.getBoundingClientRect();
            props.onMouseMove(evt, buildArgs(), evt.clientX - rect.left, evt.clientY - rect.top);
        }
    }

    function handleMouseLeave(evt: MouseEvent) {
        evt.preventDefault();
        const canvas = canvasRef.current;
        if (props.onMouseLeave && canvas) {
            const rect = canvas.getBoundingClientRect();
            props.onMouseLeave(evt, buildArgs(), evt.clientX - rect.left, evt.clientY - rect.top);
        }
    }

    return (
        <div
            className={props.className}
            ref={wrapRef}
            style={{position: 'relative', overflowX: 'scroll'}}
            onWheel={handleWheel}
        >
            <canvas
                ref={canvasRef}
                style={{position: 'absolute', top: 0, left: viewOffset}}
                onMouseDown={handleMouseDown}
                onMouseUp={handleMouseUp}
                onMouseMove={handleMouseMove}
                onMouseLeave={handleMouseLeave}
            />
            <div ref={paneRef} style={{height: '100%', width: Math.ceil(innerWidth * zoom)}} />
        </div>
    );
}
