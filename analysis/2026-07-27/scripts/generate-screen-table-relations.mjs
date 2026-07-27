import fs from 'node:fs';
import path from 'node:path';

const [inputPath, outputPath, schemaPath, semanticTemplatePath] = process.argv.slice(2);

if (!inputPath || !outputPath) {
  throw new Error('Usage: node generate-screen-table-relations.mjs <screen-data.json> <output.json> [schema.sql] [semantic-template.json]');
}

const source = JSON.parse(fs.readFileSync(inputPath, 'utf8'));

if (semanticTemplatePath) {
  const semanticTemplate = JSON.parse(fs.readFileSync(semanticTemplatePath, 'utf8'));
  const output = {
    nodes: semanticTemplate.nodes,
    edges: semanticTemplate.edges,
    sections: semanticTemplate.sections,
  };

  /**
   * The manually created relation map intentionally leaves popups out.  The
   * approval popups are still important as process evidence though: they are
   * where vehicle status and the two history tables are actually updated.
   * Keep that work in the two main pages instead of drawing popup nodes.
   */
  const removalSections = {
    application: {
      id: 'section_1784858868928',
      screen: 'pf_node_1784858548728_ye51d',
      review: 'pf_node_1784858767800_3mml0',
      serviceMaster: 'pf_node_1784858771111_tksya',
      webServiceMaster: 'pf_node_1784860700523_pbwin',
      numberStorage: 'pf_node_1785115292346_253yj',
      numberApplication: 'pf_node_1785115303302_v92rd',
    },
    final: {
      id: 'section_1785119933699',
      screen: 'pf_node_1785118574947_znptx',
      review: 'pf_node_1785118619606_01sus',
      numberStorage: 'pf_node_1785118623237_ew22a',
      numberApplication: 'pf_node_1785118626638_zbwbp',
      serviceMaster: 'pf_node_1785118629930_of61u',
      webServiceMaster: 'pf_node_1785118633120_tk9pu',
      vehicleMaster: 'pf_node_1785118638387_3uhdl',
      vehicleNumberStorage: 'pf_node_1785118908265_wwjuq',
    },
  };

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
  const edgeStyle = (stroke) => ({ stroke, strokeWidth: 2 });
  const addEdge = ({ id, source, target, kindText, stroke = '#2563eb', sourceHandle = 'right', targetHandle = 'in-left' }) => {
    if (output.edges.some((edge) => edge.id === id)) return;
    output.edges.push({
      id,
      source,
      target,
      sourceHandle,
      targetHandle,
      style: edgeStyle(stroke),
      arrow: { start: 'none', end: 'arrow' },
      animated: true,
      kindText,
    });
  };

  const setEdgeMeaning = (id, kindText, stroke) => {
    const edge = output.edges.find((item) => item.id === id);
    if (!edge) return;
    edge.kindText = kindText;
    edge.style = edgeStyle(stroke);
  };

  const nodeById = new Map(output.nodes.map((node) => [node.id, node]));
  const annotateLookupEdges = ({ id: sectionId, screen }) => {
    for (const edge of output.edges) {
      if (edge.target !== screen) continue;
      const sourceNode = nodeById.get(edge.source);
      if (!sourceNode || sourceNode.sectionId !== sectionId || sourceNode.shape !== 'db') continue;
      edge.kindText = /외부/.test(sourceNode.text) ? '외부 조회' : '조회';
    }
  };

  annotateLookupEdges(removalSections.application);
  annotateLookupEdges(removalSections.final);

  // 신청 검토 단계: 반려와 번호보관 여부를 명확한 조건으로 표기한다.
  setEdgeMeaning('pf_edge_1784858852246_92pf0', 'false -> 반려 (수정)', '#dc2626');
  setEdgeMeaning('pf_edge_1785115315112_yqd4j', 'true -> 승인', '#16a34a');
  setEdgeMeaning('pf_edge_1785115309374_noq0j', 'false -> 수정', '#ea580c');
  setEdgeMeaning('pf_edge_1785115326366_rohd5', 'true -> 등록', '#16a34a');
  setEdgeMeaning('pf_edge_1785115339217_4ek5t', '승인 -> 수정', '#ea580c');
  setEdgeMeaning('pf_edge_1784860723675_c69y1', '동기화', '#2563eb');

  // 신청 처리 결과가 팝업이 아닌 다음 핵심 페이지인 최종 처리로 이어진다.
  addEdge({
    id: 'pf_edge_removal_application_to_final',
    source: removalSections.application.webServiceMaster,
    target: removalSections.final.screen,
    kindText: '최종 처리 대상 조회',
    stroke: '#2563eb',
    sourceHandle: 'right',
    targetHandle: 'in-left',
  });

  // 최종 처리 단계의 조건과 실제 DB 반영을 구분한다.
  setEdgeMeaning('pf_edge_1785118878976_6rfd8', 'true -> 승인', '#16a34a');
  setEdgeMeaning('pf_edge_1785118882766_o97wx', 'true -> 등록', '#16a34a');
  setEdgeMeaning('pf_edge_1785118892281_gq90g', 'false -> 반려 (수정)', '#dc2626');
  setEdgeMeaning('pf_edge_1785118894158_8f7tv', 'false -> 수정', '#ea580c');
  setEdgeMeaning('pf_edge_1785118896902_jnjvm', '동기화', '#2563eb');
  setEdgeMeaning('pf_edge_1785118901851_1yxyi', 'true -> 수정', '#ea580c');
  setEdgeMeaning('pf_edge_1785119873530_el2up', 'true -> 등록', '#16a34a');

  const finalSection = output.sections.find((section) => section.id === removalSections.final.id);
  if (finalSection) {
    // The final state is positioned to the right so it does not overlap the
    // next lower section in the user's hand-authored layout.
    finalSection.size.width = Math.max(finalSection.size.width, 3300);
  }

  const terminalNodes = [
    {
      id: 'pf_node_removal_vehicle_history',
      text: '자동차이력정보\nREG_VHCL_HIST',
      position: { x: 4915, y: 2917 },
      linkedErdTableName: 'REG_VHCL_HIST',
    },
    {
      id: 'pf_node_removal_history',
      text: '말소자동차이력정보\nREG_VHCL_ERSR_HIST',
      position: { x: 5198, y: 2917 },
      linkedErdTableName: 'REG_VHCL_ERSR_HIST',
    },
    {
      id: 'pf_node_removal_complete',
      text: '말소등록 완료',
      position: { x: 5481, y: 2917 },
      shape: 'rectangle',
      style: {
        ...nodeStyle,
        fill: '#ecfdf5',
        stroke: '#16a34a',
      },
    },
  ];

  for (const terminalNode of terminalNodes) {
    if (nodeById.has(terminalNode.id)) continue;
    output.nodes.push({
      id: terminalNode.id,
      type: 'RECT',
      shape: terminalNode.shape ?? 'db',
      position: terminalNode.position,
      text: terminalNode.text,
      style: terminalNode.style ?? nodeStyle,
      textStyle,
      sectionId: removalSections.final.id,
      ...(terminalNode.linkedErdTableName ? { linkedErdTableName: terminalNode.linkedErdTableName } : {}),
    });
    nodeById.set(terminalNode.id, terminalNode);
  }

  addEdge({
    id: 'pf_edge_removal_vehicle_to_history',
    source: removalSections.final.vehicleMaster,
    target: 'pf_node_removal_vehicle_history',
    kindText: '이력 등록',
    stroke: '#16a34a',
  });
  addEdge({
    id: 'pf_edge_removal_history_to_erasure_history',
    source: 'pf_node_removal_vehicle_history',
    target: 'pf_node_removal_history',
    kindText: 'true -> 등록',
    stroke: '#16a34a',
  });
  addEdge({
    id: 'pf_edge_removal_history_to_complete',
    source: 'pf_node_removal_history',
    target: 'pf_node_removal_complete',
    kindText: '처리 완료',
    stroke: '#16a34a',
  });

  const nodeIds = new Set(output.nodes.map((node) => node.id));
  const validEdges = output.edges.filter((edge) => nodeIds.has(edge.source) && nodeIds.has(edge.target));
  output.edges = validEdges;

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify(output, null, 2)}\n`, 'utf8');

  console.log(JSON.stringify({
    mode: 'semantic-template',
    sourceScreens: source.screens.length,
    sections: output.sections.length,
    nodes: output.nodes.length,
    edges: output.edges.length,
    removedDanglingEdges: semanticTemplate.edges.length - output.edges.length,
    labeledEdges: output.edges.filter((edge) => edge.kindText).length,
    popupScreenNodes: output.nodes.filter((node) => node.shape === 'rectangle' && /팝업/i.test(node.text)).length,
  }));
  process.exit(0);
}

const tableAliases = new Map([
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

const cleanTableList = (value = '') => value
  .split('\n')
  .map((table) => table.replace(/^[\s•]+|\s+$/g, ''))
  .filter(Boolean);

const canonicalTable = (table) => tableAliases.get(table) ?? table;
const sectionById = new Map(source.sections.map((section) => [section.id, section]));
const tableLabels = new Map();

if (schemaPath && fs.existsSync(schemaPath)) {
  const schema = fs.readFileSync(schemaPath, 'utf8');
  for (const match of schema.matchAll(/-- Table: ([A-Z0-9_]+)\n-- Comment: ([^\n]+)\nCREATE TABLE/g)) {
    tableLabels.set(match[1], match[2].trim());
  }
}

function sectionPath(sectionId) {
  const names = [];
  let current = sectionById.get(sectionId);

  while (current) {
    if (current.name && current.name !== 'Section') names.unshift(current.name);
    current = sectionById.get(current.parentId);
  }

  return names.join(' > ') || '미분류';
}

function shortScreenName(screen) {
  return screen.name.split(' > ').at(-1) || screen.name || screen.screenId;
}

function sectionTitle(screen, fallback) {
  const title = screen.name
    .replace(/\s+내역$/, '')
    .replace(/\s+상세$/, '');
  return title.includes(' > ') ? title : fallback;
}

function isPopup(screen) {
  return screen.screenType === '팝업' || /팝업|alert|confirm/i.test(screen.name);
}

function representativeScore(screen) {
  let score = screen.declaredTables.length * 10;
  if (/신청 내역/.test(screen.name)) score += 200;
  if (/신청/.test(screen.name)) score += 80;
  if (screen.screenType === '신청') score += 60;
  if (screen.screenType === '등록') score += 40;
  if (screen.screenType === '조회') score += 20;
  score -= Math.min(screen.name.length, 80) / 100;
  return score;
}

function tableDisplayText(table) {
  const label = tableLabels.get(table);
  return label ? `${label}\n${table}` : table;
}

const tableScreens = source.screens
  .map((screen) => ({ ...screen, declaredTables: cleanTableList(screen.relatedTables) }))
  .filter((screen) => screen.declaredTables.length > 0);

const screensBySection = new Map();
for (const screen of tableScreens) {
  const sectionId = sectionById.has(screen.sectionId) ? screen.sectionId : 'section_unassigned';
  const screens = screensBySection.get(sectionId) ?? [];
  screens.push(screen);
  screensBySection.set(sectionId, screens);
}

const sectionGroups = [...screensBySection.entries()]
  .map(([id, screens]) => {
    const nonPopupScreens = screens.filter((screen) => !isPopup(screen));
    if (nonPopupScreens.length === 0) return null;

    const representative = [...nonPopupScreens].sort((a, b) => representativeScore(b) - representativeScore(a))[0];
    const tables = [...new Set(screens.flatMap((screen) => screen.declaredTables.map(canonicalTable)))].sort();

    return {
      id,
      name: sectionTitle(
        representative,
        id === 'section_unassigned' ? '미분류' : sectionPath(id),
      ),
      representative,
      tables,
      sourceScreenCount: screens.length,
      popupScreenCount: screens.filter(isPopup).length,
    };
  })
  .filter(Boolean)
  .sort((a, b) => a.name.localeCompare(b.name, 'ko'));

const nodes = [];
const edges = [];
const sections = [];
let sectionY = 0;

for (const [sectionIndex, group] of sectionGroups.entries()) {
  const tableColumns = 4;
  const tableRows = Math.ceil(group.tables.length / tableColumns);
  const width = 1710;
  const tableStartY = sectionY + 70;
  const processY = tableStartY + (tableRows * 150) + 90;
  const height = processY - sectionY + 220;
  const outputSectionId = `section_table_relation_${sectionIndex + 1}`;
  const screenId = `pf_screen_relation_${sectionIndex + 1}`;
  const usesServiceMaster = group.tables.includes('REG_SRVC_MST');
  const isApplicationProcess = /신청/.test(group.representative.name);
  const needsReview = usesServiceMaster && isApplicationProcess;

  sections.push({
    id: outputSectionId,
    name: group.name,
    position: { x: 0, y: sectionY },
    size: { width, height },
    color: '#fef3c7',
    parentId: null,
  });

  group.tables.forEach((table, index) => {
    const column = index % tableColumns;
    const row = Math.floor(index / tableColumns);
    const tableId = `pf_table_relation_${sectionIndex + 1}_${index + 1}`;

    nodes.push({
      id: tableId,
      type: 'RECT',
      shape: 'db',
      position: { x: 60 + (column * 280), y: tableStartY + (row * 150) },
      text: tableDisplayText(table),
      style: nodeStyle,
      textStyle,
      sectionId: outputSectionId,
      linkedErdTableName: table,
    });

    edges.push({
      id: `pf_edge_table_screen_${sectionIndex + 1}_${index + 1}`,
      source: tableId,
      target: screenId,
      sourceHandle: 'bottom',
      targetHandle: 'in-top',
      style: { stroke: '#2563eb', strokeWidth: 2 },
      arrow: { start: 'none', end: 'arrow' },
      animated: true,
      kindText: '관련 테이블',
    });
  });

  nodes.push({
    id: screenId,
    type: 'RECT',
    shape: 'rectangle',
    position: { x: 560, y: processY },
    text: shortScreenName(group.representative),
    style: nodeStyle,
    textStyle,
    sectionId: outputSectionId,
  });

  if (needsReview) {
    const reviewId = `pf_decision_review_${sectionIndex + 1}`;
    const statusId = `pf_table_status_${sectionIndex + 1}`;

    nodes.push({
      id: reviewId,
      type: 'RECT',
      shape: 'diamond',
      position: { x: 880, y: processY },
      text: '검토',
      style: nodeStyle,
      textStyle,
      sectionId: outputSectionId,
    });

    nodes.push({
      id: statusId,
      type: 'RECT',
      shape: 'db',
      position: { x: 1200, y: processY },
      text: `${tableDisplayText('REG_SRVC_MST')}\n(처리 상태 갱신)`,
      style: nodeStyle,
      textStyle,
      sectionId: outputSectionId,
      linkedErdTableName: 'REG_SRVC_MST',
    });

    edges.push(
      {
        id: `pf_edge_screen_review_${sectionIndex + 1}`,
        source: screenId,
        target: reviewId,
        sourceHandle: 'right',
        targetHandle: 'in-left',
        style: { stroke: '#a33894', strokeWidth: 2 },
        arrow: { start: 'none', end: 'arrow' },
        animated: true,
      },
      {
        id: `pf_edge_review_status_${sectionIndex + 1}`,
        source: reviewId,
        target: statusId,
        sourceHandle: 'right',
        targetHandle: 'in-left',
        style: { stroke: '#09eb66', strokeWidth: 2 },
        arrow: { start: 'none', end: 'arrow' },
        animated: true,
        kindText: '승인 / 반려',
      },
    );
  }

  sectionY += height + 100;
}

const output = { nodes, edges, sections };
fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(output, null, 2)}\n`, 'utf8');

console.log(JSON.stringify({
  sourceTableScreens: tableScreens.length,
  majorPages: sectionGroups.length,
  omittedPopupScreens: tableScreens.filter(isPopup).length,
  tableNodes: nodes.filter((node) => node.shape === 'db').length,
  screenNodes: nodes.filter((node) => node.shape === 'rectangle').length,
  decisionNodes: nodes.filter((node) => node.shape === 'diamond').length,
  edges: edges.length,
}));
