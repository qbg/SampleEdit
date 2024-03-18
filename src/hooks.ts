import { useEffect } from 'react';

export function useAnimationFrame(f: () => void, deps: React.Inputs) {
    useEffect(() => {
        let frameId: number;
        function update() {
            f();
            frameId = window.requestAnimationFrame(update);
        }
        update();

        return () => window.cancelAnimationFrame(frameId);
    }, deps);
}
