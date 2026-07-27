import fs from 'node:fs';
import path from 'node:path';

const [inputPath, outputPath, schemaPath] = process.argv.slice(2);

if (!inputPath || !outputPath) {
  throw new Error('Usage: node generate-comprehensive-screen-table-relations.mjs <screen-data.json> <output.json> [schema.sql]');
}

const source = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
const isPopup = (screen) => screen.screenType === '팝업' || /팝업|alert|confirm/i.test(screen.name ?? '');
const cleanTableList = (value = '') => value
  .split('\n')
  .map((table) => table.replace(/^[\s•]+|\s+$/g, ''))
  .filter(Boolean);

const tableLabels = new Map();
if (schemaPath && fs.existsSync(schemaPath)) {
  const schema = fs.readFileSync(schemaPath, 'utf8');
  for (const match of schema.matchAll(/-- Table: ([A-Z0-9_]+)\n-- Comment: ([^\n]+)\nCREATE TABLE/g)) {
    tableLabels.set(match[1], match[2].trim());
  }
}

const tableText = (table) => tableLabels.has(table)
  ? tableLabels.get(table) + '\n' + table
  : table;
const screenById = new Map(source.screens.map((screen) => [screen.id, screen]));
const coreScreens = source.screens.filter((screen) => !isPopup(screen));
const coreIds = new Set(coreScreens.map((screen) => screen.id));

const sectionsById = new Map(source.sections.map((section) => [section.id, section]));
function sourceSectionPath(sectionId) {
  const names = [];
  const visited = new Set();
  let current = sectionsById.get(sectionId);
  while (current && !visited.has(current.id)) {
    visited.add(current.id);
    if (current.name && current.name !== 'Section') names.unshift(current.name);
    current = sectionsById.get(current.parentId);
  }
  return names.join(' > ') || '미분류';
}

function shortScreenName(name) {
  const chunks = (name ?? '').split(' > ').filter(Boolean);
  return chunks.slice(-2).join(' > ') || name || '화면';
}

const sectionOrder = [];
const pagesByKey = new Map();
const pageByScreenId = new Map();
for (const screen of coreScreens) {
  const key = screen.sectionId + '::' + screen.name;
  let page = pagesByKey.get(key);
  if (!page) {
    page = {
      id: 'pf_page_' + (pagesByKey.size + 1),
      sourceSectionId: screen.sectionId,
      name: screen.name,
      representative: screen,
      screens: [],
      usages: new Map(),
    };
    pagesByKey.set(key, page);
    if (!sectionOrder.includes(screen.sectionId)) sectionOrder.push(screen.sectionId);
  }
  page.screens.push(screen);
  pageByScreenId.set(screen.id, page);
}

function addUsage(page, table, usage) {
  if (!table) return;
  const existing = page.usages.get(table) ?? { read: false, writes: new Set() };
  if (usage.direction === 'read') existing.read = true;
  if (usage.direction === 'write') existing.writes.add(usage.label);
  page.usages.set(table, existing);
}

function directUsage(screen) {
  if (screen.screenType === '등록') return { direction: 'write', label: '등록' };
  if (screen.screenType === '수정') return { direction: 'write', label: '수정' };
  return { direction: 'read', label: '조회' };
}

for (const screen of coreScreens) {
  const page = pageByScreenId.get(screen.id);
  for (const table of cleanTableList(screen.relatedTables)) addUsage(page, table, directUsage(screen));
}

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

function popupUsage(screen, table) {
  const name = screen.name ?? '';
  if (/반려/.test(name)) return { direction: 'write', label: 'false -> 반려 (수정)' };
  if (/승인|confirm/i.test(name)) {
    return {
      direction: 'write',
      label: /_MST$/.test(table) ? 'true -> 수정' : 'true -> 등록',
    };
  }
  if (/번호보관/.test(name)) return { direction: 'write', label: 'true -> 등록' };
  return { direction: 'read', label: '조회' };
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

let popupTableReferences = 0;
let unmappedPopupTableReferences = 0;
for (const popup of source.screens.filter(isPopup)) {
  const tables = cleanTableList(popup.relatedTables);
  if (tables.length === 0) continue;
  const owners = nearestCoreOwners(popup.id);
  for (const table of tables) {
    popupTableReferences += 1;
    if (owners.size === 0) unmappedPopupTableReferences += 1;
    for (const ownerId of owners) {
      const page = pageByScreenId.get(ownerId);
      if (page) addUsage(page, table, popupUsage(popup, table));
    }
  }
}

const pages = [...pagesByKey.values()];
const pagesBySection = new Map();
for (const page of pages) {
  const bucket = pagesBySection.get(page.sourceSectionId) ?? [];
  bucket.push(page);
  pagesBySection.set(page.sourceSectionId, bucket);
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
  if (label.startsWith('false')) return '#dc2626';
  if (label.startsWith('true') || label.includes('등록') || label.includes('완료')) return '#16a34a';
  if (label.includes('수정')) return '#ea580c';
  return '#2563eb';
};

const nodes = [];
const edges = [];
const sections = [];
const pageNodeByPageId = new Map();
let sectionY = 0;
let outputSectionIndex = 0;

for (const sourceSectionId of sectionOrder) {
  const sectionPages = (pagesBySection.get(sourceSectionId) ?? [])
    .sort((a, b) => a.name.localeCompare(b.name, 'ko'));
  if (sectionPages.length === 0) continue;

  const outputSectionId = 'section_full_' + (++outputSectionIndex);
  const tableRows = Math.max(...sectionPages.map((page) => Math.ceil(page.usages.size / 4)), 0);
  const cellWidth = 1120;
  const cellHeight = Math.max(480, (tableRows * 126) + 285);
  const columns = 4;
  const rows = Math.ceil(sectionPages.length / columns);
  const width = (columns * cellWidth) + 120;
  const height = (rows * cellHeight) + 130;

  sections.push({
    id: outputSectionId,
    name: sourceSectionPath(sourceSectionId),
    position: { x: 0, y: sectionY },
    size: { width, height },
    color: '#fef3c7',
    parentId: null,
  });

  for (const [index, page] of sectionPages.entries()) {
    const column = index % columns;
    const row = Math.floor(index / columns);
    const cellX = 40 + (column * cellWidth);
    const cellY = sectionY + 45 + (row * cellHeight);
    const tableList = [...page.usages.entries()].sort(([a], [b]) => a.localeCompare(b));
    const pageY = cellY + (Math.ceil(tableList.length / 4) * 126) + 35;

    nodes.push({
      id: page.id,
      type: 'RECT',
      shape: 'rectangle',
      position: { x: cellX + 400, y: pageY },
      text: (page.representative.screenId ?? '화면') + '\n' + shortScreenName(page.name),
      style: nodeStyle,
      textStyle,
      sectionId: outputSectionId,
    });
    pageNodeByPageId.set(page.id, page.id);

    // 승인 팝업은 화면으로 만들지 않지만, 말소 이력 등록은 업무의
    // 종단 상태이므로 핵심 페이지 안에서 완료 상태로 명시한다.
    const hasRemovalCompletion = tableList.some(([table, usage]) =>
      table === 'REG_VHCL_ERSR_HIST' && usage.writes.size > 0,
    );
    if (hasRemovalCompletion) {
      const completionId = 'pf_state_removal_complete_' + page.id;
      nodes.push({
        id: completionId,
        type: 'RECT',
        shape: 'rectangle',
        position: { x: cellX + 700, y: pageY },
        text: '말소등록 완료',
        style: { ...nodeStyle, fill: '#ecfdf5', stroke: '#16a34a' },
        textStyle,
        sectionId: outputSectionId,
      });
      edges.push({
        id: 'pf_edge_removal_complete_' + page.id,
        source: page.id,
        target: completionId,
        sourceHandle: 'right',
        targetHandle: 'in-left',
        style: { stroke: '#16a34a', strokeWidth: 2 },
        arrow: { start: 'none', end: 'arrow' },
        animated: true,
        kindText: '처리 완료',
      });
    }

    for (const [tableIndex, [table, usage]] of tableList.entries()) {
      const tableColumn = tableIndex % 4;
      const tableRow = Math.floor(tableIndex / 4);
      const tableNodeId = 'pf_table_' + page.id + '_' + (tableIndex + 1);
      nodes.push({
        id: tableNodeId,
        type: 'RECT',
        shape: 'db',
        position: { x: cellX + 20 + (tableColumn * 270), y: cellY + (tableRow * 126) },
        text: tableText(table),
        style: nodeStyle,
        textStyle,
        sectionId: outputSectionId,
        linkedErdTableName: table,
      });

      if (usage.read) {
        edges.push({
          id: 'pf_edge_read_' + page.id + '_' + (tableIndex + 1),
          source: tableNodeId,
          target: page.id,
          sourceHandle: 'bottom',
          targetHandle: 'in-top',
          style: { stroke: '#2563eb', strokeWidth: 2 },
          arrow: { start: 'none', end: 'arrow' },
          animated: true,
          kindText: '조회',
        });
      }
      for (const [writeIndex, label] of [...usage.writes].sort().entries()) {
        edges.push({
          id: 'pf_edge_write_' + page.id + '_' + (tableIndex + 1) + '_' + (writeIndex + 1),
          source: page.id,
          target: tableNodeId,
          sourceHandle: 'top',
          targetHandle: 'in-bottom',
          style: { stroke: colorFor(label), strokeWidth: 2 },
          arrow: { start: 'none', end: 'arrow' },
          animated: true,
          kindText: label,
        });
      }
    }
  }
  sectionY += height + 180;
}

const edgeKeys = new Set();
function addScreenFlow(sourcePage, targetPage, label) {
  if (!sourcePage || !targetPage || sourcePage.id === targetPage.id) return;
  const sourceId = pageNodeByPageId.get(sourcePage.id);
  const targetId = pageNodeByPageId.get(targetPage.id);
  if (!sourceId || !targetId) return;
  const edgeLabel = label || '화면 이동';
  const key = sourceId + '|' + targetId + '|' + edgeLabel;
  if (edgeKeys.has(key)) return;
  edgeKeys.add(key);
  edges.push({
    id: 'pf_flow_' + edgeKeys.size,
    source: sourceId,
    target: targetId,
    sourceHandle: 'right',
    targetHandle: 'in-left',
    style: { stroke: colorFor(edgeLabel), strokeWidth: 2 },
    arrow: { start: 'none', end: 'arrow' },
    animated: true,
    kindText: edgeLabel,
  });
}

function popupPathLabel(popups, fallback) {
  const names = popups.map((popup) => popup.name ?? '').join(' ');
  if (/반려/.test(names)) return 'false -> 반려 (수정)';
  if (/승인|confirm/i.test(names)) return 'true -> 승인';
  if (/번호보관/.test(names)) return 'true -> 번호보관';
  return fallback && fallback !== '팝업' && fallback !== '페이징' ? fallback : '화면 이동';
}

function downstreamCoreTargets(startId) {
  const results = [];
  const startScreen = screenById.get(startId);
  const queue = [{ id: startId, popups: startScreen ? [startScreen] : [] }];
  const visited = new Set([startId]);
  while (queue.length) {
    const current = queue.shift();
    for (const flow of outbound.get(current.id) ?? []) {
      if (visited.has(flow.target)) continue;
      visited.add(flow.target);
      const target = screenById.get(flow.target);
      if (!target) continue;
      if (coreIds.has(target.id)) results.push({ target, popups: current.popups, fallback: flow.label });
      else queue.push({ id: target.id, popups: [...current.popups, target] });
    }
  }
  return results;
}

for (const screen of coreScreens) {
  const sourcePage = pageByScreenId.get(screen.id);
  for (const flow of outbound.get(screen.id) ?? []) {
    const target = screenById.get(flow.target);
    if (!target) continue;
    if (coreIds.has(target.id)) {
      addScreenFlow(sourcePage, pageByScreenId.get(target.id), flow.label === '페이징' ? '화면 이동' : flow.label);
      continue;
    }
    for (const result of downstreamCoreTargets(target.id)) {
      addScreenFlow(sourcePage, pageByScreenId.get(result.target.id), popupPathLabel(result.popups, result.fallback));
    }
  }
}

const nodeIds = new Set(nodes.map((node) => node.id));
const validEdges = edges.filter((edge) => nodeIds.has(edge.source) && nodeIds.has(edge.target));
const output = { nodes, edges: validEdges, sections };
fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, JSON.stringify(output, null, 2) + '\n', 'utf8');

console.log(JSON.stringify({
  sourceScreens: source.screens.length,
  includedNonPopupScreens: coreScreens.length,
  mergedImportantPages: pages.length,
  sourceFlows: source.flows.length,
  outputSections: sections.length,
  outputNodes: nodes.length,
  outputEdges: validEdges.length,
  popupTableReferences,
  unmappedPopupTableReferences,
  genericRelatedTableLabels: validEdges.filter((edge) => edge.kindText === '관련 테이블').length,
}));
