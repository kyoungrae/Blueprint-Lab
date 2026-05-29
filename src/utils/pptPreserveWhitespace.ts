import {
    stripHtmlForTranslationLookup,
    translationLookupKeySpaced,
} from './translationTextNormalize';

const LEADING_WS_RE = /^[\u00A0\t ]+/;
const TRAILING_WS_RE = /[\u00A0\t ]+$/;

/** PPT에서 trim되지 않도록 스페이스·탭을 NBSP로 */
function spacesToNbsp(run: string): string {
    return run.replace(/\t/g, '    ').replace(/ /g, '\u00A0');
}

/**
 * PowerPoint OOXML `<a:t>`는 xml:space="preserve" 없이 앞·연속 공백이 trim될 수 있다.
 * 캔버스(white-space: pre-wrap)와 맞추려 들여쓰기·연속 스페이스는 NBSP(U+00A0)로 보존한다.
 */
export function preserveWhitespaceForPpt(text: string): string {
    if (!text) return text;
    return text
        .replace(/\t/g, '    ')
        .split('\n')
        .map((line) => {
            const leadingMatch = line.match(LEADING_WS_RE);
            const leading = leadingMatch ? spacesToNbsp(leadingMatch[0]) : '';
            const rest = line.slice(leadingMatch?.[0].length ?? 0);
            const restPreserved = rest.replace(/ {2,}/g, (run) => '\u00A0'.repeat(run.length));
            return leading + restPreserved;
        })
        .join('\n');
}

type LineStructure = { leading: string; trailing: string; content: string };

function firstNonemptyLine(structures: LineStructure[]): LineStructure | undefined {
    return structures.find((s) => s.content.trim());
}

function lastNonemptyLine(structures: LineStructure[]): LineStructure | undefined {
    for (let i = structures.length - 1; i >= 0; i--) {
        if (structures[i].content.trim()) return structures[i];
    }
    return undefined;
}

/**
 * 줄 앞·뒤 들여쓰기는 유지.
 * 여러 줄은 DB와 같이 공백으로 이어 붙여 한 번에 치환하고, 번역문은 첫 줄 들여쓰기만 복원한다.
 */
export function translateTextPreservingIndent(
    text: string,
    translateContent: (plainLineContent: string) => string
): string {
    if (!text) return text;

    const structures: LineStructure[] = text.split('\n').map((line) => {
        const leadingMatch = line.match(LEADING_WS_RE);
        const trailingMatch = line.match(TRAILING_WS_RE);
        const leading = leadingMatch?.[0] ?? '';
        const trailing = trailingMatch?.[0] ?? '';
        const content = line.slice(leading.length, line.length - trailing.length);
        return { leading, trailing, content };
    });

    const contentLines = structures.filter((s) => s.content.trim());
    if (contentLines.length > 1) {
        const joined = contentLines
            .map((s) => translationLookupKeySpaced(s.content))
            .filter(Boolean)
            .join(' ');
        const blockOut = translateContent(joined);
        if (blockOut !== joined) {
            const outLines = blockOut.split(/\n/).map((l) => l.trim()).filter(Boolean);
            if (outLines.length === structures.length) {
                return preserveWhitespaceForPpt(
                    structures
                        .map((s, i) => spacesToNbsp(s.leading) + outLines[i] + spacesToNbsp(s.trailing))
                        .join('\n')
                );
            }
            const anchor = firstNonemptyLine(structures) ?? structures[0];
            const tail = lastNonemptyLine(structures) ?? anchor;
            return preserveWhitespaceForPpt(
                spacesToNbsp(anchor.leading) + blockOut + spacesToNbsp(tail.trailing)
            );
        }
    }

    const translated = structures
        .map((s) => {
            if (!s.content.trim()) return s.leading + s.trailing;
            const plainForLookup = stripHtmlForTranslationLookup(s.content.replace(/\u00A0/g, ' '));
            const out = translateContent(plainForLookup);
            return spacesToNbsp(s.leading) + out + spacesToNbsp(s.trailing);
        })
        .join('\n');

    return preserveWhitespaceForPpt(translated);
}
