/**
 * Copies text to the clipboard.
 * Uses the modern navigator.clipboard API if available (requires HTTPS/localhost),
 * otherwise falls back to a hidden textarea with document.execCommand('copy').
 */
export const copyToClipboard = async (text: string): Promise<boolean> => {
    // Try modern API first
    if (navigator.clipboard && window.isSecureContext) {
        try {
            await navigator.clipboard.writeText(text);
            return true;
        } catch (err) {
            console.error('Failed to copy using navigator.clipboard:', err);
            // Fall through to fallback
        }
    }

    // Fallback for non-secure contexts (HTTP)
    try {
        const textArea = document.createElement('textarea');
        textArea.value = text;

        // Ensure the textarea is not visible but part of the DOM
        textArea.style.position = 'fixed';
        textArea.style.left = '-9999px';
        textArea.style.top = '0';
        document.body.appendChild(textArea);

        textArea.focus();
        textArea.select();

        const successful = document.execCommand('copy');
        document.body.removeChild(textArea);

        return successful;
    } catch (err) {
        console.error('Fallback copy failed:', err);
        return false;
    }
};
