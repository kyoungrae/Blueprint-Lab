import { useState, useCallback } from 'react';

/**
 * IME(한글 등) 조합 중 자음/모음 분리 방지를 위한 훅
 */
export function useInputIME(
    value: string,
    onChange: (v: string) => void,
    onBlur?: (v: string) => void
) {
    const [composing, setComposing] = useState<string | null>(null);
    const displayValue = composing !== null ? composing : value;

    const handleChange = useCallback(
        (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
            const v = e.target.value;
            if ((e.nativeEvent as { isComposing?: boolean }).isComposing) {
                setComposing(v);
                return;
            }
            setComposing(null);
            onChange(v);
        },
        [onChange]
    );

    const handleCompositionEnd = useCallback(
        (e: React.CompositionEvent<HTMLInputElement | HTMLTextAreaElement>) => {
            const v = (e.target as HTMLInputElement | HTMLTextAreaElement).value;
            setComposing(null);
            onChange(v);
        },
        [onChange]
    );

    const handleBlur = useCallback(
        (e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>) => {
            const v = (e.target as HTMLInputElement | HTMLTextAreaElement).value;
            setComposing(null);
            onChange(v);
            onBlur?.(v);
        },
        [onChange, onBlur]
    );

    return { displayValue, handleChange, handleCompositionEnd, handleBlur };
}
