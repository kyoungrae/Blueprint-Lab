#!/usr/bin/env python3
"""Parse SYS_MENU INSERT SQL and generate menu structure document."""
import re
import json
from pathlib import Path

from collections import defaultdict

INSERT_RE = re.compile(
    r"VALUES\s*\(\s*'([^']*)'\s*,\s*'([^']*)'\s*,\s*([^,]+)\s*,\s*([^,]+)\s*,\s*'([^']*)'\s*,\s*'([^']*)'\s*,\s*'([^']*)'\s*,\s*'([^']*)'\s*,\s*'([^']*)'\s*,\s*([^,]+)\s*,\s*([^,]+)\s*,\s*([^,]+)\s*,\s*([^,]+)\s*,\s*(\d+)\s*,\s*([^,]+)\s*,\s*'([^']*)'\s*\)",
    re.IGNORECASE,
)

def nullish(s: str) -> str:
    s = s.strip()
    if s.lower() == 'null':
        return ''
    if s.startswith("'") and s.endswith("'"):
        return s[1:-1]
    return s

def parse_inserts(text: str):
    menus = []
    for m in INSERT_RE.finditer(text):
        menu_cd, menu_nm_kr, menu_nm_en, menu_nm_mn, menu_no, menu_lvl, top_menu_cd, url, use_yn = m.group(1,2,3,4,5,6,7,8,9)
        menu_unq_no = int(m.group(14))
        prgm_url = m.group(16)
        menus.append({
            'menuCode': menu_cd,
            'name': menu_nm_kr,
            'nameEn': nullish(menu_nm_en),
            'nameMn': nullish(menu_nm_mn),
            'menuNo': int(menu_no) if menu_no.isdigit() else menu_no,
            'menuLvl': int(menu_lvl),
            'topMenuCode': top_menu_cd if top_menu_cd != '-' else None,
            'url': url,
            'useYn': use_yn == '1',
            'menuUnqNo': menu_unq_no,
            'programId': prgm_url if prgm_url not in ('', '-') else '',
        })
    return menus

def build_tree(menus):
    by_parent = defaultdict(list)
    by_code = {m['menuCode']: m for m in menus}
    for m in menus:
        parent = m['topMenuCode']
        by_parent[parent].append(m)
    for lst in by_parent.values():
        lst.sort(key=lambda x: (x['menuNo'], x['menuUnqNo']))
    return by_parent, by_code

def render_md(menus, by_parent, by_code):
    lines = []
    lines.append('# MVIMS SYS_MENU 메뉴 구조도')
    lines.append('')
    lines.append('> DB 테이블 `NEW_MVIMS.SYS_MENU` 기준 메뉴 코드·프로그램 ID 매핑 문서')
    lines.append('> Blueprint-Lab WBS 메뉴 구조도 입력 시 `menuCode` = `MENU_CD`, `programId` = `PRGM_URL` 로 사용')
    lines.append('>')
    lines.append('> 관련 파일: `MVIMS_SYS_MENU_WBS.json`(JSON 가져오기), `MVIMS_SYS_MENU_메뉴데이터.tsv`(엑셀 메뉴데이터 시트 붙여넣기)')
    lines.append('')
    lines.append(f'총 메뉴 수: **{len(menus)}**개 (사용 중: **{sum(1 for m in menus if m["useYn"])}**개)')
    lines.append('')
    lines.append('## 필드 매핑')
    lines.append('')
    lines.append('| DB 컬럼 | WBS 필드 | 설명 |')
    lines.append('|---------|----------|------|')
    lines.append('| `MENU_CD` | menuCode | 메뉴 코드 (고유) |')
    lines.append('| `MENU_NM_KR` | name | 메뉴명 |')
    lines.append('| `PRGM_URL` | programId | 프로그램 ID |')
    lines.append('| `TOP_MENU_CD` | parentId (코드로 연결) | 상위 메뉴 코드 (`-` = 최상위) |')
    lines.append('| `MENU_NO` | order | 형제 간 정렬 순서 |')
    lines.append('| `MENU_UNQ_NO` | — | DB 고유번호 (참고용) |')
    lines.append('| `URL` | — | 화면 URL 경로 (참고용) |')
    lines.append('| `USE_YN` | — | 사용 여부 (`1`=사용) |')
    lines.append('')

    def walk(parent, depth):
        for m in by_parent.get(parent, []):
            indent = '  ' * depth
            use = '' if m['useYn'] else ' `[미사용]`'
            pid = f"`{m['programId']}`" if m['programId'] else '—'
            url = f"`{m['url']}`" if m['url'] and m['url'] != '#' else '#'
            lines.append(f"{indent}- **{m['name']}** `{m['menuCode']}`{use}")
            lines.append(f"{indent}  - 프로그램 ID: {pid} · URL: {url} · UNQ: {m['menuUnqNo']} · LVL: {m['menuLvl']}")
            walk(m['menuCode'], depth + 1)

    lines.append('## 메뉴 트리')
    lines.append('')
    walk(None, 0)
    lines.append('')

    lines.append('## 전체 목록 (정렬: 레벨 → 상위코드 → 순번)')
    lines.append('')
    lines.append('| LVL | MENU_CD | 메뉴명 | 상위코드 | PRGM_URL | URL | UNQ | 사용 |')
    lines.append('|-----|---------|--------|----------|----------|-----|-----|------|')
    sorted_menus = sorted(menus, key=lambda x: (x['menuLvl'], x['topMenuCode'] or '', x['menuNo'], x['menuUnqNo']))
    for m in sorted_menus:
        use = 'Y' if m['useYn'] else 'N'
        lines.append(
            f"| {m['menuLvl']} | `{m['menuCode']}` | {m['name']} | `{m['topMenuCode'] or '-'}` | `{m['programId'] or ''}` | `{m['url']}` | {m['menuUnqNo']} | {use} |"
        )
    return '\n'.join(lines) + '\n'

def to_wbs_json(menus, by_parent):
    """Generate WBS-importable menu list (flat with parent menuCode reference)."""
    result = []
    order_by_parent = defaultdict(int)

    def walk(parent_code, parent_id):
        for m in by_parent.get(parent_code, []):
            oid = order_by_parent[parent_code]
            order_by_parent[parent_code] += 1
            node_id = f"menu_{m['menuCode'].lower()}"
            entry = {
                'id': node_id,
                'parentMenuCode': parent_code,
                'menuCode': m['menuCode'],
                'name': m['name'],
                'order': oid,
                'menuLvl': m['menuLvl'],
                'menuUnqNo': m['menuUnqNo'],
                'url': m['url'],
                'useYn': m['useYn'],
            }
            if m['programId']:
                entry['programId'] = m['programId']
            result.append(entry)
            walk(m['menuCode'], node_id)

    walk(None, None)
    return result

def to_wbs_import(menus, by_parent):
    """Blueprint-Lab WBS JSON보내기 형식 (menus + 빈 rows)."""
    id_by_code = {}
    wbs_menus = []

    def walk(parent_code):
        for m in by_parent.get(parent_code, []):
            node_id = f"mvims_{m['menuCode']}"
            id_by_code[m['menuCode']] = node_id
            parent_id = id_by_code.get(m['topMenuCode']) if m['topMenuCode'] else None
            node = {
                'id': node_id,
                'parentId': parent_id,
                'name': m['name'],
                'menuCode': m['menuCode'],
                'order': m['menuNo'] if isinstance(m['menuNo'], int) else 0,
            }
            if m['programId']:
                node['programId'] = m['programId']
            wbs_menus.append(node)
            walk(m['menuCode'])

    walk(None)
    return wbs_menus

def menu_path_codes(menus, by_code, menu_cd):
    parts = []
    cur = by_code.get(menu_cd)
    while cur:
        parts.append(cur['name'])
        cur = by_code.get(cur['topMenuCode']) if cur['topMenuCode'] else None
    return ' > '.join(reversed(parts))

def to_menu_data_tsv(menus, by_code):
    lines = ['메뉴코드\t메뉴명\t프로그램ID\t전체경로\t상위메뉴코드']
    sorted_menus = sorted(menus, key=lambda x: (x['menuLvl'], x['topMenuCode'] or '', x['menuNo'], x['menuUnqNo']))
    for m in sorted_menus:
        lines.append('\t'.join([
            m['menuCode'],
            m['name'],
            m['programId'] or '',
            menu_path_codes(menus, by_code, m['menuCode']),
            m['topMenuCode'] or '',
        ]))
    return '\n'.join(lines) + '\n'

if __name__ == '__main__':
    import sys
    text = Path(sys.argv[1]).read_text(encoding='utf-8') if len(sys.argv) > 1 else sys.stdin.read()
    menus = parse_inserts(text)
    by_parent, by_code = build_tree(menus)
    out_dir = Path(__file__).resolve().parent.parent / 'docs'
    out_dir.mkdir(exist_ok=True)
    md_path = out_dir / 'MVIMS_SYS_MENU_구조도.md'
    json_path = out_dir / 'MVIMS_SYS_MENU_WBS_import.json'
    wbs_path = out_dir / 'MVIMS_SYS_MENU_WBS.json'
    tsv_path = out_dir / 'MVIMS_SYS_MENU_메뉴데이터.tsv'
    now = __import__('datetime').datetime.now().isoformat()
    md_path.write_text(render_md(menus, by_parent, by_code), encoding='utf-8')
    json_path.write_text(json.dumps({
        'type': 'WBS_MENU_REFERENCE',
        'source': 'NEW_MVIMS.SYS_MENU',
        'exportedAt': now,
        'menus': to_wbs_json(menus, by_parent),
    }, ensure_ascii=False, indent=2), encoding='utf-8')
    wbs_menus = to_wbs_import(menus, by_parent)
    wbs_path.write_text(json.dumps({
        'type': 'WBS',
        'version': 1,
        'exportedAt': now,
        'source': 'NEW_MVIMS.SYS_MENU',
        'menus': wbs_menus,
        'rows': [],
    }, ensure_ascii=False, indent=2), encoding='utf-8')
    tsv_path.write_text(to_menu_data_tsv(menus, by_code), encoding='utf-8')
    print(f'Parsed {len(menus)} menus')
    print(f'Wrote {md_path}')
    print(f'Wrote {json_path}')
    print(f'Wrote {wbs_path}')
    print(f'Wrote {tsv_path}')
