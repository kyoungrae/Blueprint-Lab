/** 관리자 번역 탭에서 저장한 브라우저 세션 덮어쓰기 (PPT `t()`에 병합) */
export const MN_DICT_SESSION_KEY = 'blueprint-lab-mn-dict-overrides';

function readSessionOverrides(): Record<string, string> {
    if (typeof sessionStorage === 'undefined') return {};
    try {
        const raw = sessionStorage.getItem(MN_DICT_SESSION_KEY);
        if (!raw) return {};
        const parsed = JSON.parse(raw) as unknown;
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
        return parsed as Record<string, string>;
    } catch {
        return {};
    }
}

/** 관리자 UI에서 일괄 저장 시 호출 */
export function persistMnDictSession(dict: Record<string, string>): void {
    if (typeof sessionStorage === 'undefined') return;
    sessionStorage.setItem(MN_DICT_SESSION_KEY, JSON.stringify(dict));
}

// 몽골어 번역 사전 (PPT_BETA 고정 라벨 등)
export const mnDict: Record<string, string> = {
    시스템명: 'Системийн нэр',
    작성자: 'Зохиогч',
    작성일자: 'Огноо',
    화면ID: 'Дэлгэцийн ID',
    화면유형: 'Дэлгэцийн төрөл',
    페이지: 'Хуудас',
    화면설명: 'Дэлгэцийн тайлбар',
    '화면에 대한 구체적인 설명을 입력하세요': 'Дэлгэцийн дэлгэрэнгүй тайлбарыг оруулна уу',
    초기화면설정: 'Эхний дэлгэцийн тохиргоо',
    기능상세: 'Үйл ажиллагааны дэлгэрэнгүй',
    관련테이블: 'Холбоотой хүснэгт',
    '테이블명(한글)': 'Хүснэгтийн нэр',
    '테이블명(영문)': 'Хүснэгтийн нэр (EN)',
    '항목명(한글)': 'Зүйлийн нэр',
    '필드명(영문)': 'Талбарын нэр',
    항목타입: 'Төрөл',
    항목정의: 'Тодорхойлолт',
    비고: 'Тэмдэглэл',
    자릿수: 'Урт',
    초기값: 'Анхны утга',
};

/** 빌트인 `mnDict` + sessionStorage 오버레이 */
export function getEffectiveMnDict(): Record<string, string> {
    return { ...mnDict, ...readSessionOverrides() };
}

/**
 * @param text 원문 (한국어)
 * @param isMn 몽골어 번역 여부
 */
export const t = (text: string, isMn: boolean): string => {
    if (!isMn) return text;
    return getEffectiveMnDict()[text] ?? text;
};
