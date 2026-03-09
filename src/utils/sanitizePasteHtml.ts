/** 붙여넣기 HTML에서 스타일(색상, 크기, 폰트 등)은 유지하고 위험한 요소만 제거 */
export function sanitizePasteHtml(html: string): string {
    const doc = document.implementation.createHTMLDocument('');
    const body = doc.body;
    body.innerHTML = html;
    const remove = (el: Element) => el.remove();
    body.querySelectorAll('script, iframe, object, embed, form, input, button').forEach(remove);
    body.querySelectorAll('[onclick], [onload], [onerror]').forEach((el) => {
        el.removeAttribute('onclick');
        el.removeAttribute('onload');
        el.removeAttribute('onerror');
    });
    body.querySelectorAll('a[href^="javascript:"]').forEach((el) => el.removeAttribute('href'));
    return body.innerHTML;
}
