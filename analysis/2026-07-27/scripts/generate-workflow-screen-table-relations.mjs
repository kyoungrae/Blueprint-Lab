import fs from 'node:fs';
import path from 'node:path';

const [inputPath, outputPath, schemaPath] = process.argv.slice(2);
if (!inputPath || !outputPath) {
  throw new Error('Usage: node generate-workflow-screen-table-relations.mjs <screen-data.json> <output.json> [schema.sql]');
}

const source = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
const normalize = (value = '') => value
  .replace(/\s*>\s*/g, ' > ')
  .replace(/\s+/g, ' ')
  .trim();
const tight = (value = '') => normalize(value).replace(/\s/g, '');
// Some important detail pages are incorrectly classified as screenType=팝업
// in the source. Only explicit popup/alert/confirm names are omitted.
const isPopup = (screen) => /팝업|alert|confirm/i.test(screen.name ?? '');
const cleanTables = (value = '') => value
  .split('\n')
  .map((item) => item.replace(/^[\s•]+|\s+$/g, ''))
  .filter(Boolean);
const internalTableAliases = new Map([
  ['WEB_NEW_REG_APLY', 'REG_NEW_REG_APLY'],
  ['WEB_BFR_REG_APLY', 'REG_BFR_REG_APLY'],
  ['WEB_ERSR_REG_APLY', 'REG_ERSR_REG_APLY'],
  ['WEB_NOPLT_RISSU_APLY', 'REG_NOPLT_RISSU_APLY'],
  ['WEB_REG_SRVC_MST', 'REG_SRVC_MST'],
  ['WEB_STLM', 'REG_SRVC_STLM'],
  ['WEB_IF_TRGT_LINK_MST', 'COM_IF_TRGT_LINK_MST'],
  ['WEB_INFO_LINK_DTL', 'COM_INFO_LINK_DTL'],
  ['WEB_JOIN_INFO_LINK_DTL', 'COM_JOIN_INFO_LINK_DTL'],
  ['WEB_NATARY_INFO_LINK_DTL', 'COM_NATARY_INFO_LINK_DTL'],
]);
const internalTable = (table) => internalTableAliases.get(table) ?? table;

const tableLabels = new Map();
if (schemaPath && fs.existsSync(schemaPath)) {
  const schema = fs.readFileSync(schemaPath, 'utf8');
  for (const match of schema.matchAll(/-- Table: ([A-Z0-9_]+)\n-- Comment: ([^\n]+)\nCREATE TABLE/g)) {
    tableLabels.set(match[1], match[2].trim());
  }
}
const tableText = (table, role) => {
  const label = tableLabels.get(table);
  const name = label ? label + '\n' + table : table;
  return role ? name + '\n(' + role + ')' : name;
};

const sectionById = new Map(source.sections.map((section) => [section.id, section]));
function sectionPath(sectionId) {
  const names = [];
  const visited = new Set();
  let current = sectionById.get(sectionId);
  while (current && !visited.has(current.id)) {
    visited.add(current.id);
    if (current.name && current.name !== 'Section') names.unshift(current.name);
    current = sectionById.get(current.parentId);
  }
  return names.join(' > ') || '미분류';
}

function domainOf(name) {
  const value = tight(name);
  if (/말소복원|복원등록|등록소말소복원/.test(value)) return '말소복원';
  if (/등록증.*재발급|등록증교체/.test(value)) return '등록증 재발급';
  if (/번호판.*재발급|번호판분실재발급/.test(value)) return '번호판 재발급';
  if (/차량번호변경|차량번호 변경/.test(normalize(name))) return '차량번호변경';
  if (/자동차번호예약|번호예약|보관번호조회/.test(value)) return '자동차 번호 예약';
  if (/신규등록/.test(value)) return '신규등록';
  if (/이전등록/.test(value)) return '이전등록';
  if (/말소등록|등록소말소/.test(value)) return '말소등록';
  if (/변경등록/.test(value)) return '변경등록';
  if (/경정등록/.test(value)) return '경정등록';
  if (/임시운행|임시번호/.test(value)) return '임시등록';
  if (/압류/.test(value)) return '압류';
  if (/자동차사용자/.test(value)) return '자동차 사용자';
  if (/등록번호생성|지역번호관리/.test(value)) return '등록번호 생성';
  if (/번호판제작/.test(value)) return '번호판 제작';
  if (/수입차/.test(value)) return '수입차 관리';
  if (/아카이브/.test(value)) return '아카이브';
  if (/일마감/.test(value)) return '일마감';
  return null;
}

function workflowKey(screen) {
  const name = normalize(screen.name);
  const value = tight(name);
  const domain = domainOf(name);
  if (/전자업무/.test(value) && domain) return '전자업무 > ' + domain;
  if (/서비스>등록서비스/.test(value) && domain) return '서비스 등록 > ' + domain;
  if (/업무처리현황/.test(value) && domain) return '업무처리현황 > ' + domain;
  if (/관리업무>말소관리/.test(value) && domain) return '말소 관리 > ' + domain;
  if (/관리업무/.test(value) && domain) return '관리업무 > ' + domain;
  if (/서비스/.test(value) && domain) return '서비스 > ' + domain;
  if (/^(통계|보고서)/.test(name)) return name;
  const parts = name.split(' > ');
  if (parts.length >= 3) return parts.slice(0, 3).join(' > ');
  if (parts.length >= 2) return parts.slice(0, 2).join(' > ');
  return sectionPath(screen.sectionId) + ' > ' + (name || screen.screenId);
}

const domainBaseTables = new Map([
  ['신규등록', ['REG_NEW_REG_APLY', 'REG_VHCL_MST', 'REG_VHCL_HIST', 'REG_SRVC_MST']],
  ['이전등록', ['REG_BFR_REG_APLY', 'REG_VHCL_MST', 'REG_VHCL_HIST', 'REG_SRVC_MST']],
  ['말소등록', ['REG_ERSR_REG_APLY', 'REG_VHCL_MST', 'REG_VHCL_HIST', 'REG_VHCL_ERSR_HIST', 'REG_SRVC_MST']],
  ['말소복원', ['REG_VHCL_MST', 'REG_VHCL_HIST', 'REG_SRVC_MST']],
  ['변경등록', ['REG_VHCL_MST', 'REG_VHCL_HIST', 'REG_SRVC_MST']],
  ['차량번호변경', ['REG_VHCL_NO_CHG', 'REG_VHCL_MST', 'REG_VHCL_HIST', 'REG_SRVC_MST']],
  ['번호판 재발급', ['REG_NOPLT_RISSU_APLY', 'REG_VHCL_MST', 'REG_SRVC_MST']],
  ['등록증 재발급', ['REG_VHCL_REG_CERT_RISSU_APLY', 'REG_VHCL_MST', 'REG_VHCL_HIST', 'REG_SRVC_MST']],
  ['자동차 번호 예약', ['REG_NO_KPNG_REG_APLY', 'REG_VHCL_NO_KPNG', 'REG_VHCL_MST']],
  ['경정등록', ['REG_VHCL_MST', 'REG_VHCL_HIST', 'REG_SRVC_MST']],
  ['임시등록', ['REG_TMPR_REG_APLY', 'REG_VHCL_MST']],
  ['압류', ['REG_VHCL_MST']],
  ['자동차 사용자', ['REG_OWNR_MST', 'REG_VHCL_MST']],
]);

const screenById = new Map(source.screens.map((screen) => [screen.id, screen]));
const coreScreens = source.screens.filter((screen) => !isPopup(screen));
const coreIds = new Set(coreScreens.map((screen) => screen.id));
const isFinalStageScreen = (screen) =>
  /최종처리|최종 처리|최종>/.test(screen.name ?? '')
  || /최종/.test(sectionPath(screen.sectionId));
const outbound = new Map();
const inbound = new Map();
for (const flow of source.flows) {
  const out = outbound.get(flow.source) ?? [];
  out.push(flow);
  outbound.set(flow.source, out);
  const incoming = inbound.get(flow.target) ?? [];
  incoming.push(flow);
  inbound.set(flow.target, incoming);
}

const duplicateCandidates = new Map();
for (const screen of coreScreens) {
  const key = workflowKey(screen) + '::' + normalize(screen.name) + '::' + screen.screenType;
  const bucket = duplicateCandidates.get(key) ?? [];
  bucket.push(screen);
  duplicateCandidates.set(key, bucket);
}
const logicalScreenById = new Map();
const logicalScreens = [];
let mergedDuplicateScreens = 0;
function groupHasProcessConnection(group) {
  if (group.length < 2) return false;
  const members = new Set(group.map((screen) => screen.id));
  for (const screen of group) {
    const queue = [screen.id];
    const visited = new Set([screen.id]);
    while (queue.length) {
      const current = queue.shift();
      for (const flow of outbound.get(current) ?? []) {
        if (members.has(flow.target) && flow.target !== screen.id) return true;
        if (!visited.has(flow.target)) {
          visited.add(flow.target);
          queue.push(flow.target);
        }
      }
    }
  }
  return false;
}
function screenRichness(screen) {
  return cleanTables(screen.relatedTables).length * 10000
    + (screen.drawElements?.length ?? 0)
    + (screen.screenDescription?.length ?? 0)
    + (screen.initialSettings?.length ?? 0);
}
for (const group of duplicateCandidates.values()) {
  if (group.length === 1 || groupHasProcessConnection(group)) {
    for (const screen of group) {
      logicalScreens.push(screen);
      logicalScreenById.set(screen.id, screen);
    }
    continue;
  }
  const representative = [...group].sort((a, b) => screenRichness(b) - screenRichness(a))[0];
  logicalScreens.push(representative);
  for (const screen of group) logicalScreenById.set(screen.id, representative);
  mergedDuplicateScreens += group.length - 1;
}
const logicalScreen = (screenOrId) => {
  const id = typeof screenOrId === 'string' ? screenOrId : screenOrId.id;
  return logicalScreenById.get(id) ?? screenById.get(id);
};

const workflows = new Map();
for (const screen of logicalScreens) {
  const key = workflowKey(screen);
  const workflow = workflows.get(key) ?? { key, screens: [], domain: domainOf(screen.name) };
  workflow.screens.push(screen);
  if (!workflow.domain) workflow.domain = domainOf(screen.name);
  workflows.set(key, workflow);
}

const usageByScreen = new Map(logicalScreens.map((screen) => [
  screen.id,
  { reads: new Map(), writes: new Map(), popups: [], syncServiceMaster: false },
]));
function addOperation(map, table, label) {
  if (!table) return;
  const labels = map.get(table) ?? new Set();
  labels.add(label);
  map.set(table, labels);
}
function addRead(screenId, table, label = '조회') {
  const usage = usageByScreen.get(logicalScreen(screenId)?.id);
  if (usage) addOperation(usage.reads, internalTable(table), label);
}
function addWrite(screenId, table, label) {
  const usage = usageByScreen.get(logicalScreen(screenId)?.id);
  if (!usage) return;
  const targetTable = internalTable(table);
  if (targetTable === 'REG_SRVC_MST') usage.syncServiceMaster = true;
  addOperation(usage.writes, targetTable, label);
}

function writeLabelForTable(screen, table, condition = '') {
  const domain = domainOf(screen.name);
  const prefix = condition ? condition + ' -> ' : '';
  if (screen.screenType === '수정') return prefix + '수정';
  if (table === 'REG_VHCL_NO_KPNG') return prefix + '등록';
  if (/_HIST$|_APLY$|_DTL$|_STLM$/.test(table)) return prefix + '등록';
  if (table === 'REG_VHCL_MST' && domain === '신규등록') return prefix + '등록';
  if (/_MST$/.test(table)) return prefix + '수정';
  return prefix + (screen.screenType === '등록' ? '등록' : '처리');
}

for (const screen of coreScreens) {
  const tables = cleanTables(screen.relatedTables);
  if (screen.screenType === '등록' || screen.screenType === '수정') {
    const hasCoreContinuation = (outbound.get(screen.id) ?? []).some((flow) => {
      const target = screenById.get(flow.target);
      return target && coreIds.has(target.id) && workflowKey(target) === workflowKey(screen);
    });
    for (const table of tables) {
      if (hasCoreContinuation) {
        const label = table === 'REG_VHCL_MST' && domainOf(screen.name) === '신규등록'
          ? '차대번호 중복 여부 확인'
          : '처리 기준 조회';
        addRead(screen.id, table, label);
        continue;
      }
      if (/_MST$/.test(table)) {
        const label = table === 'REG_VHCL_MST' && domainOf(screen.name) === '신규등록'
          ? '차대번호 중복 여부 확인'
          : '처리 전 조회';
        addRead(screen.id, table, label);
      }
      addWrite(screen.id, table, writeLabelForTable(screen, table));
    }
  } else {
    for (const table of tables) addRead(screen.id, table, '조회');
  }
}

function nearestCoreOwners(startId) {
  const owners = new Set();
  const queue = [startId];
  const visited = new Set([startId]);
  while (queue.length) {
    const current = queue.shift();
    for (const flow of inbound.get(current) ?? []) {
      if (visited.has(flow.source)) continue;
      visited.add(flow.source);
      if (coreIds.has(flow.source)) owners.add(flow.source);
      else queue.push(flow.source);
    }
  }
  return owners;
}

function isDecisionPopup(screen) {
  return /승인|반려|confirm|번호보관.*처리|최종 승인/i.test(screen.name ?? '');
}
function inferredPopupTables(popup) {
  const direct = cleanTables(popup.relatedTables);
  const value = tight(popup.name);
  const inferred = new Set(direct);
  if (/파일업로드/.test(value)) {
    inferred.add('SYS_FILE');
    inferred.add('SYS_FILE_DTL');
  }
  if (/검사정보/.test(value)) inferred.add('INSP_RCPT_MST');
  if (/보험정보/.test(value)) inferred.add('COM_VHCL_VLTN_DTL');
  if (/압류내역|세금미납|벌금|과태료|통행료미납/.test(value)) inferred.add('COM_NATARY_INFO_LINK_DTL');
  if (/이전소유자|이전사용자|비은행권담보/.test(value)) inferred.add('COM_JOIN_INFO_LINK_DTL');
  if (/Q-Pay|결제/.test(popup.name ?? '')) inferred.add('REG_SRVC_STLM');
  if (/보관번호조회/.test(value)) inferred.add('REG_VHCL_NO_KPNG');
  if (/신규차량번호조회/.test(value)) inferred.add('REG_VHCL_MST');
  if (/번호보관/.test(value)) {
    inferred.add('REG_NO_KPNG_REG_APLY');
    inferred.add('REG_VHCL_NO_KPNG');
  }
  return [...inferred];
}

const domainWriteTables = new Map();
for (const screen of source.screens) {
  const domain = domainOf(screen.name);
  if (!domain) continue;
  const isWriter = isDecisionPopup(screen) || (!isPopup(screen) && (screen.screenType === '등록' || screen.screenType === '수정'));
  if (!isWriter) continue;
  const bucket = domainWriteTables.get(domain) ?? new Set();
  for (const table of cleanTables(screen.relatedTables)) bucket.add(table);
  domainWriteTables.set(domain, bucket);
}

function popupOperation(popup, table, owner) {
  const value = tight(popup.name);
  if (/반려/.test(value)) return { direction: 'write', label: 'false -> 반려 (수정)' };
  if (/파일업로드/.test(value)) return { direction: 'write', label: '등록 / 삭제' };
  if (/Q-Pay|결제/.test(popup.name ?? '')) return { direction: 'write', label: '결제 등록' };
  if (/승인|confirm/i.test(popup.name ?? '')) {
    return { direction: 'write', label: writeLabelForTable(owner, table, 'true') };
  }
  if (/번호보관.*처리/.test(value)) {
    return { direction: 'write', label: /_MST$/.test(table) ? 'true -> 수정' : 'true -> 등록' };
  }
  return { direction: 'read', label: '조회' };
}

for (const popup of source.screens.filter(isPopup)) {
  const owners = nearestCoreOwners(popup.id);
  if (owners.size === 0) continue;
  const directPopupTables = cleanTables(popup.relatedTables);
  let tables = inferredPopupTables(popup);
  const domain = domainOf(popup.name);
  const isReject = /반려/.test(popup.name ?? '');
  if (tables.length === 0 && isReject) {
    tables = /최종/.test(popup.name ?? '')
      ? ['REG_SRVC_MST', 'WEB_REG_SRVC_MST']
      : ['WEB_REG_SRVC_MST'];
  } else if (tables.length === 0 && isDecisionPopup(popup) && domain) {
    tables = [...(domainWriteTables.get(domain) ?? domainBaseTables.get(domain) ?? [])];
  }
  for (const ownerId of owners) {
    const ownerLogical = logicalScreen(ownerId);
    const usage = usageByScreen.get(ownerLogical?.id);
    const owner = screenById.get(ownerId);
    if (!usage || !owner) continue;
    if (!usage.popups.some((item) => item.id === popup.id)) usage.popups.push(popup);
    const ownerTables = isReject && directPopupTables.length === 0 && isFinalStageScreen(owner)
      ? ['REG_SRVC_MST', 'WEB_REG_SRVC_MST']
      : [...tables];
    if (
      !isReject
      && isFinalStageScreen(owner)
      && /승인|confirm/i.test(popup.name ?? '')
      && !ownerTables.includes('REG_SRVC_MST')
    ) {
      ownerTables.push('REG_SRVC_MST');
    }
    for (const table of ownerTables) {
      const operation = popupOperation(popup, table, owner);
      if (operation.direction === 'read') addRead(ownerId, table, operation.label);
      else addWrite(ownerId, table, operation.label);
    }
  }
}

for (const workflow of workflows.values()) {
  const explicitReads = new Set();
  for (const screen of workflow.screens) {
    for (const table of usageByScreen.get(screen.id).reads.keys()) explicitReads.add(table);
  }
  const fallback = explicitReads.size > 0
    ? [...explicitReads]
    : [...(domainBaseTables.get(workflow.domain) ?? [])];
  for (const screen of workflow.screens) {
    const usage = usageByScreen.get(screen.id);
    if (usage.reads.size > 0) continue;
    if (!/(조회|내역|현황|상세|신청|최종처리|최종 처리)/.test(screen.name ?? '')) continue;
    for (const table of fallback) addRead(screen.id, table, '업무 기준 조회');
  }
}

function transitionLabel(sourceScreen, targetScreen, flowLabel, popups = []) {
  const popupNames = popups.map((popup) => popup.name ?? '').join(' ');
  if (/반려/.test(popupNames)) return 'false -> 반려';
  if (/승인|confirm/i.test(popupNames)) return 'true -> 승인';
  if (/상세/.test(targetScreen.name ?? '') && !/상세/.test(sourceScreen.name ?? '')) return '상세 조회';
  if (normalize(sourceScreen.name) === normalize(targetScreen.name)) return '다음 단계';
  return flowLabel && flowLabel !== '페이징' && flowLabel !== '팝업' ? flowLabel : '화면 이동';
}

function downstreamCoreTargets(startId) {
  const start = screenById.get(startId);
  const results = [];
  const queue = [{ id: startId, popups: start ? [start] : [] }];
  const visited = new Set([startId]);
  while (queue.length) {
    const current = queue.shift();
    for (const flow of outbound.get(current.id) ?? []) {
      if (visited.has(flow.target)) continue;
      visited.add(flow.target);
      const target = screenById.get(flow.target);
      if (!target) continue;
      if (coreIds.has(target.id)) results.push({ target, popups: current.popups, flowLabel: flow.label });
      else queue.push({ id: target.id, popups: [...current.popups, target] });
    }
  }
  return results;
}

const transitions = [];
const transitionKeys = new Set();
function addTransition(sourceScreen, targetScreen, label) {
  const sourceLogical = sourceScreen ? logicalScreen(sourceScreen) : null;
  const targetLogical = targetScreen ? logicalScreen(targetScreen) : null;
  if (!sourceLogical || !targetLogical || sourceLogical.id === targetLogical.id) return;
  if (workflowKey(sourceLogical) !== workflowKey(targetLogical)) return;
  const key = sourceLogical.id + '|' + targetLogical.id + '|' + label;
  if (transitionKeys.has(key)) return;
  transitionKeys.add(key);
  transitions.push({ source: sourceLogical.id, target: targetLogical.id, label });
}
for (const screen of coreScreens) {
  for (const flow of outbound.get(screen.id) ?? []) {
    const target = screenById.get(flow.target);
    if (!target) continue;
    if (coreIds.has(target.id)) {
      addTransition(screen, target, transitionLabel(screen, target, flow.label));
    } else {
      for (const result of downstreamCoreTargets(target.id)) {
        addTransition(screen, result.target, transitionLabel(screen, result.target, result.flowLabel, result.popups));
      }
    }
  }
}

function stageRank(screen) {
  const value = tight(screen.name);
  let rank = 20;
  if (/신청내역|현황$|조회$/.test(value)) rank = 10;
  if (/상세/.test(value)) rank = 30;
  if (/수정/.test(value)) rank = 45;
  if (isFinalStageScreen(screen)) rank += 60;
  return rank;
}
function orderedScreens(workflow) {
  const ids = new Set(workflow.screens.map((screen) => screen.id));
  const outgoingLocal = new Map();
  const indegree = new Map(workflow.screens.map((screen) => [screen.id, 0]));
  for (const transition of transitions) {
    if (!ids.has(transition.source) || !ids.has(transition.target)) continue;
    const list = outgoingLocal.get(transition.source) ?? [];
    list.push(transition.target);
    outgoingLocal.set(transition.source, list);
    indegree.set(transition.target, (indegree.get(transition.target) ?? 0) + 1);
  }
  const compare = (a, b) =>
    stageRank(a) - stageRank(b)
    || (a.position?.y ?? 0) - (b.position?.y ?? 0)
    || (a.position?.x ?? 0) - (b.position?.x ?? 0)
    || a.screenId.localeCompare(b.screenId);
  const queue = workflow.screens.filter((screen) => indegree.get(screen.id) === 0).sort(compare);
  const result = [];
  while (queue.length) {
    const screen = queue.shift();
    result.push(screen);
    for (const targetId of outgoingLocal.get(screen.id) ?? []) {
      indegree.set(targetId, indegree.get(targetId) - 1);
      if (indegree.get(targetId) === 0) {
        queue.push(screenById.get(targetId));
        queue.sort(compare);
      }
    }
  }
  for (const screen of workflow.screens.sort(compare)) {
    if (!result.some((item) => item.id === screen.id)) result.push(screen);
  }
  return result;
}

const nodeStyle = {
  fill: '#ffffff',
  stroke: '#94a3b8',
  strokeWidth: 1,
  width: 240,
  height: 120,
  radius: 12,
};
const textStyle = {
  fontSize: 14,
  color: '#0f172a',
  bold: false,
  italic: false,
};
const colorFor = (label) => {
  if (/false|반려|삭제/.test(label)) return '#dc2626';
  if (/true|등록|완료|승인/.test(label)) return '#16a34a';
  if (/수정/.test(label)) return '#ea580c';
  if (/확인 필요/.test(label)) return '#9ca3af';
  return '#2563eb';
};
function edge(id, sourceId, targetId, label, sourceHandle = 'right', targetHandle = 'in-left') {
  return {
    id,
    source: sourceId,
    target: targetId,
    sourceHandle,
    targetHandle,
    style: { stroke: colorFor(label), strokeWidth: 2 },
    arrow: { start: 'none', end: 'arrow' },
    animated: true,
    kindText: label,
  };
}

const nodes = [];
const edges = [];
const sections = [];
const screenNodeById = new Map();
const decisionNodeByOwner = new Map();
const stateNodeByOwner = new Map();
let sectionY = 0;
let workflowIndex = 0;
let edgeIndex = 0;

const sortedWorkflows = [...workflows.values()]
  .sort((a, b) => a.key.localeCompare(b.key, 'ko'));

for (const workflow of sortedWorkflows) {
  workflowIndex += 1;
  const ordered = orderedScreens(workflow);
  const stages = ordered.map((screen) => {
    const usage = usageByScreen.get(screen.id);
    const reads = [...usage.reads.entries()]
      .sort(([a], [b]) => a.localeCompare(b));
    const decisionPopups = usage.popups.filter(isDecisionPopup);
    const isApprovalDecision = decisionPopups.some((popup) => /승인|반려|confirm/i.test(popup.name ?? ''));
    const writes = [...usage.writes.entries()]
      .flatMap(([table, labels]) => [...labels].sort().map((label) => ({ table, label })))
      .sort((a, b) => a.table.localeCompare(b.table) || a.label.localeCompare(b.label));
    if (isApprovalDecision) {
      if (!writes.some((write) => /true|승인/.test(write.label))) {
        writes.push({ table: 'REG_SRVC_MST', label: 'true -> 승인 (수정)' });
      }
      if (!writes.some((write) => /false|반려/.test(write.label))) {
        writes.push({ table: 'REG_SRVC_MST', label: 'false -> 반려 (수정)' });
      }
      writes.sort((a, b) => a.table.localeCompare(b.table) || a.label.localeCompare(b.label));
    }
    const writeVisuals = writes.flatMap((write) => {
      const operation = {
        ...write,
        kind: 'write',
        key: write.table + '::' + write.label,
      };
      if (write.table !== 'REG_SRVC_MST' || !(usage.syncServiceMaster || isApprovalDecision)) return [operation];
      return [
        operation,
        {
          table: 'WEB_REG_SRVC_MST',
          label: '동기화: ' + write.label,
          branchLabel: write.label,
          kind: 'sync',
          key: 'WEB_REG_SRVC_MST::' + write.label,
          parentKey: operation.key,
        },
      ];
    });
    const localCount = Math.max(reads.length, writeVisuals.length, 1);
    const localColumns = Math.min(3, localCount);
    const cellWidth = Math.max(520, (localColumns * 270) + 80);
    return {
      screen,
      usage,
      reads,
      writes,
      writeVisuals,
      decisionPopups,
      isApprovalDecision,
      hasDecision: decisionPopups.length > 0,
      unknown: reads.length === 0 && writes.length === 0,
      localColumns,
      cellWidth,
    };
  });
  const hasUnknown = stages.some((stage) => stage.unknown);
  const maxReadRows = Math.max(...stages.map((stage) =>
    Math.ceil(stage.reads.length / Math.max(stage.localColumns, 1))), 1);
  const maxWriteRows = Math.max(...stages.map((stage) =>
    Math.ceil(stage.writeVisuals.length / Math.max(stage.localColumns, 1))), 1);
  let cellCursor = 80;
  for (const stage of stages) {
    stage.cellX = cellCursor;
    stage.screenX = cellCursor + ((stage.cellWidth - 240) / 2);
    cellCursor += stage.cellWidth + 80;
  }
  const width = Math.max(1300, cellCursor);
  const readY = sectionY + 65;
  const screenY = readY + (maxReadRows * 145) + 80;
  const decisionY = screenY + 180;
  const writeY = decisionY + 180;
  const stateY = writeY + (maxWriteRows * 145) + 170;
  const noteY = stateY + 160;
  const height = (stateY - sectionY) + 190 + (hasUnknown ? 170 : 0);
  const sectionId = 'section_workflow_' + workflowIndex;

  sections.push({
    id: sectionId,
    name: workflow.key,
    position: { x: 0, y: sectionY },
    size: { width, height },
    color: '#fef3c7',
    parentId: null,
  });

  for (const stage of stages) {
    const screen = stage.screen;
    const nodeId = 'pf_screen_' + screen.id;
    screenNodeById.set(screen.id, nodeId);
    nodes.push({
      id: nodeId,
      type: 'RECT',
      shape: 'rectangle',
      position: { x: stage.screenX, y: screenY },
      text: screen.screenId + '\n' + normalize(screen.name).split(' > ').slice(-2).join(' > '),
      style: nodeStyle,
      textStyle,
      sectionId,
    });

    const readColumns = Math.min(3, Math.max(stage.reads.length, 1));
    const readClusterWidth = readColumns * 270;
    const readStartX = stage.cellX + ((stage.cellWidth - readClusterWidth) / 2);
    stage.reads.forEach(([table, labels], index) => {
      const tableNodeId = 'pf_read_' + screen.id + '_' + (index + 1);
      const label = labels.has('조회') ? '조회' : [...labels][0];
      nodes.push({
        id: tableNodeId,
        type: 'RECT',
        shape: 'db',
        position: {
          x: readStartX + ((index % readColumns) * 270),
          y: readY + (Math.floor(index / readColumns) * 145),
        },
        text: tableText(table, label),
        style: nodeStyle,
        textStyle,
        sectionId,
        linkedErdTableName: table,
      });
      edges.push(edge(
        'pf_edge_' + (++edgeIndex),
        tableNodeId,
        nodeId,
        label,
        'bottom',
        'in-top',
      ));
    });

    let writeSource = nodeId;
    if (stage.hasDecision) {
      const decisionId = 'pf_decision_' + screen.id;
      decisionNodeByOwner.set(screen.id, decisionId);
      const hasNumberStorage = stage.decisionPopups.some((popup) => /번호보관/.test(popup.name ?? ''));
      nodes.push({
        id: decisionId,
        type: 'RECT',
        shape: 'diamond',
        position: { x: stage.screenX, y: decisionY },
        text: hasNumberStorage ? '승인 / 번호보관 여부' : '승인 여부',
        style: nodeStyle,
        textStyle,
        sectionId,
      });
      edges.push(edge(
        'pf_edge_' + (++edgeIndex),
        nodeId,
        decisionId,
        '검토 / 처리',
        'bottom',
        'in-left-1',
      ));
      writeSource = decisionId;
    }

    const writeColumns = Math.min(3, Math.max(stage.writeVisuals.length, 1));
    const writeClusterWidth = writeColumns * 270;
    const writeStartX = stage.cellX + ((stage.cellWidth - writeClusterWidth) / 2);
    let successfulWriteSource = null;
    let successfulWritePriority = -1;
    let rejectedWriteSource = null;
    let rejectedWritePriority = -1;
    const writeNodeByKey = new Map();
    stage.writeVisuals.forEach(({ table, label, branchLabel, kind, key, parentKey }, index) => {
      const tableNodeId = 'pf_write_' + screen.id + '_' + (index + 1);
      const tablePosition = {
        x: writeStartX + ((index % writeColumns) * 270),
        y: writeY + (Math.floor(index / writeColumns) * 145),
      };
      nodes.push({
        id: tableNodeId,
        type: 'RECT',
        shape: 'db',
        position: tablePosition,
        text: tableText(table, label),
        style: nodeStyle,
        textStyle,
        sectionId,
        linkedErdTableName: table,
      });
      writeNodeByKey.set(key, { id: tableNodeId, position: tablePosition });
      if (kind === 'sync') {
        const parentNode = writeNodeByKey.get(parentKey);
        if (parentNode) {
          const sameRow = parentNode.position.y === tablePosition.y;
          edges.push(edge(
            'pf_edge_' + (++edgeIndex),
            parentNode.id,
            tableNodeId,
            '동기화',
            sameRow ? 'right' : 'bottom',
            sameRow ? 'in-left' : 'in-top',
          ));
        }
      } else {
        const decisionHandle = /false|반려/.test(label)
          ? 'bottom-1'
          : (/true|승인/.test(label) ? 'bottom-3' : 'bottom-2');
        edges.push(edge(
          'pf_edge_' + (++edgeIndex),
          writeSource,
          tableNodeId,
          label,
          stage.hasDecision ? decisionHandle : 'bottom',
          'in-top',
        ));
      }
      const effectiveLabel = kind === 'sync' ? branchLabel : label;
      if (/false|반려/.test(effectiveLabel)) {
        const priority = kind === 'sync'
          ? 5
          : (table === 'REG_SRVC_MST' ? 4 : 1);
        if (priority >= rejectedWritePriority) {
          rejectedWritePriority = priority;
          rejectedWriteSource = tableNodeId;
        }
      } else {
        const priority = kind === 'sync'
          ? 5
          : (table === 'REG_SRVC_MST' ? 4 : (/_HIST$/.test(table) ? 2 : 1));
        if (priority >= successfulWritePriority) {
          successfulWritePriority = priority;
          successfulWriteSource = tableNodeId;
        }
      }
    });

    const needsState = stage.isApprovalDecision
      || (!stage.hasDecision && stage.writes.length > 0 && (screen.screenType === '등록' || screen.screenType === '수정'));
    if (needsState) {
      const isFinal = isFinalStageScreen(screen);
      const hasFinalScreens = ordered.some(isFinalStageScreen);
      const isInitialElectronic = /전자업무/.test(screen.name ?? '') && !isFinal && hasFinalScreens;
      const stateText = isInitialElectronic
        ? '1차 승인 완료\n최종처리 대기'
        : (workflow.domain ?? '업무') + (isFinal ? ' 최종 처리 완료' : ' 처리 완료');
      const stateId = 'pf_state_' + screen.id;
      stateNodeByOwner.set(screen.id, stateId);
      nodes.push({
        id: stateId,
        type: 'RECT',
        shape: 'rectangle',
        position: { x: rejectedWriteSource ? stage.screenX - 135 : stage.screenX, y: stateY },
        text: stateText,
        style: { ...nodeStyle, fill: '#ecfdf5', stroke: '#16a34a' },
        textStyle,
        sectionId,
      });
      edges.push(edge(
        'pf_edge_' + (++edgeIndex),
        successfulWriteSource
          ?? (stage.hasDecision ? decisionNodeByOwner.get(screen.id) : nodeId),
        stateId,
        successfulWriteSource ? '반영 완료' : (stage.hasDecision ? 'true -> 완료' : '처리 완료'),
        'bottom',
        'in-top',
      ));
    }

    if (rejectedWriteSource) {
      const rejectStateId = 'pf_reject_state_' + screen.id;
      nodes.push({
        id: rejectStateId,
        type: 'RECT',
        shape: 'rectangle',
        position: { x: needsState ? stage.screenX + 135 : stage.screenX, y: stateY },
        text: (workflow.domain ?? '업무') + ' 반려 처리 완료',
        style: { ...nodeStyle, fill: '#fef2f2', stroke: '#dc2626' },
        textStyle,
        sectionId,
      });
      edges.push(edge(
        'pf_edge_' + (++edgeIndex),
        rejectedWriteSource,
        rejectStateId,
        '반려 반영 완료',
        'bottom',
        'in-top',
      ));
    }

    if (stage.unknown) {
      const noteId = 'pf_note_' + screen.id;
      nodes.push({
        id: noteId,
        type: 'RECT',
        shape: 'rectangle',
        position: { x: stage.screenX, y: noteY },
        text: '원본에 테이블 정보 미기재',
        style: { ...nodeStyle, fill: '#f8fafc', stroke: '#9ca3af' },
        textStyle,
        sectionId,
      });
      edges.push(edge(
        'pf_edge_' + (++edgeIndex),
        nodeId,
        noteId,
        '확인 필요',
        'bottom',
        'in-top',
      ));
    }
  }

  const localIds = new Set(ordered.map((screen) => screen.id));
  for (const transition of transitions) {
    if (!localIds.has(transition.source) || !localIds.has(transition.target)) continue;
    edges.push(edge(
      'pf_edge_' + (++edgeIndex),
      screenNodeById.get(transition.source),
      screenNodeById.get(transition.target),
      transition.label,
    ));
  }

  const finalScreens = ordered.filter(isFinalStageScreen);
  if (finalScreens.length > 0) {
    const firstFinal = finalScreens[0];
    const initialStates = ordered
      .filter((screen) => stateNodeByOwner.has(screen.id) && !isFinalStageScreen(screen));
    for (const initial of initialStates) {
      edges.push(edge(
        'pf_edge_' + (++edgeIndex),
        stateNodeByOwner.get(initial.id),
        screenNodeById.get(firstFinal.id),
        '최종 처리 대상 조회',
      ));
    }
  }

  sectionY += height + 180;
}

const nodeIds = new Set(nodes.map((node) => node.id));
const validEdges = edges.filter((item) => nodeIds.has(item.source) && nodeIds.has(item.target));
const output = { nodes, edges: validEdges, sections };
fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, JSON.stringify(output, null, 2) + '\n', 'utf8');

console.log(JSON.stringify({
  sourceScreens: source.screens.length,
  importantSourceScreens: coreScreens.length,
  includedScreens: logicalScreens.length,
  mergedDuplicateScreens,
  popupScreensOmitted: source.screens.length - coreScreens.length,
  workflows: sections.length,
  nodes: nodes.length,
  edges: validEdges.length,
  screenNodes: nodes.filter((node) => node.id.startsWith('pf_screen_')).length,
  decisionNodes: nodes.filter((node) => node.id.startsWith('pf_decision_')).length,
  completionNodes: nodes.filter((node) => node.id.startsWith('pf_state_')).length,
  unknownTableScreens: nodes.filter((node) => node.id.startsWith('pf_note_')).length,
  danglingEdges: edges.length - validEdges.length,
  genericRelatedTableLabels: validEdges.filter((item) => item.kindText === '관련 테이블').length,
}));
