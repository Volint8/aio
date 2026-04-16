import { useCallback, useRef } from 'react';

export default function useDebouncedCallback<T extends (...args: any[]) => any>(cb: T, wait = 800) {
    const lastCallRef = useRef<number | null>(null);

    return useCallback(((...args: Parameters<T>) => {
        const now = Date.now();
        if (lastCallRef.current && now - lastCallRef.current < wait) {
            return;
        }
        lastCallRef.current = now;
        try {
            // Call the original callback
            // eslint-disable-next-line @typescript-eslint/ban-ts-comment
            // @ts-ignore
            return cb(...args);
        } finally {
            // allow next call after `wait` ms
            setTimeout(() => {
                lastCallRef.current = null;
            }, wait);
        }
    }) as T, [cb, wait]);
}
