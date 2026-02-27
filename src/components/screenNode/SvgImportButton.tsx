import React, { useRef } from 'react';
import { FileUp } from 'lucide-react';
import type { DrawElement } from '../../types/screenDesign';
import { parseSvgToDrawElements } from '../../utils/svgToDrawElements';
import PremiumTooltip from './PremiumTooltip';

export interface SvgImportButtonProps {
    onImport: (elements: DrawElement[]) => void;
    disabled?: boolean;
}

const SvgImportButton: React.FC<SvgImportButtonProps> = ({ onImport, disabled }) => {
    const inputRef = useRef<HTMLInputElement>(null);

    const handleChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const isSvg = file.type === 'image/svg+xml' || file.name.toLowerCase().endsWith('.svg');
        if (!isSvg) {
            alert('SVG 파일만 가져올 수 있습니다.');
            e.target.value = '';
            return;
        }

        try {
            const text = await new Promise<string>((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = () => resolve(reader.result as string);
                reader.onerror = reject;
                reader.readAsText(file);
            });

            const elements = parseSvgToDrawElements(text);
            if (elements.length === 0) {
                alert('변환 가능한 요소가 없습니다. rect, circle, text, path 등이 포함된 SVG를 사용해 주세요.');
            } else {
                onImport(elements);
            }
        } catch (err) {
            console.error('SVG import failed:', err);
            alert('SVG 파일을 읽는 중 오류가 발생했습니다.');
        }
        e.target.value = '';
    };

    return (
        <PremiumTooltip label="SVG 가져오기 (PPT 등에서 내보낸 SVG)">
            <div className="nodrag nopan">
                <button
                    type="button"
                    onClick={() => inputRef.current?.click()}
                    disabled={disabled}
                    className="p-2 rounded-lg transition-colors hover:bg-gray-100 text-gray-500 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    <FileUp size={18} />
                </button>
                <input
                    ref={inputRef}
                    type="file"
                    accept=".svg,image/svg+xml"
                    className="hidden"
                    onChange={handleChange}
                />
            </div>
        </PremiumTooltip>
    );
};

export default SvgImportButton;
