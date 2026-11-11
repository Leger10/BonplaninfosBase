#!/usr/bin/env node
/**
 * Convertit un contrat Markdown en document Word (.docx) éditable, sans dépendance externe.
 * Usage : node scripts/md-to-docx.mjs <source.md> [destination.docx]
 *
 * Gère : titres (#, ##, ###), paragraphes, gras (**), italique (*), code (`),
 * listes à puces, citations (>) et tableaux (| ... |).
 */
import fs from 'node:fs';
import path from 'node:path';

const src = process.argv[2];
if (!src) {
  console.error('Usage : node scripts/md-to-docx.mjs <source.md> [destination.docx]');
  process.exit(1);
}
const dest = process.argv[3] || src.replace(/\.md$/i, '.docx');
const markdown = fs.readFileSync(src, 'utf8').replace(/\r\n/g, '\n');

/* ------------------------------------------------------------------ */
/* Helpers XML                                                         */
/* ------------------------------------------------------------------ */

const esc = (s) =>
  s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

const RUN = (text, opts = {}) => {
  const rPr = [];
  if (opts.font) rPr.push(`<w:rFonts w:ascii="${opts.font}" w:hAnsi="${opts.font}" w:cs="${opts.font}"/>`);
  if (opts.bold) rPr.push('<w:b/><w:bCs/>');
  if (opts.italic) rPr.push('<w:i/><w:iCs/>');
  if (opts.color) rPr.push(`<w:color w:val="${opts.color}"/>`);
  if (opts.size) rPr.push(`<w:sz w:val="${opts.size}"/><w:szCs w:val="${opts.size}"/>`);
  if (opts.underline) rPr.push('<w:u w:val="single"/>');
  const props = rPr.length ? `<w:rPr>${rPr.join('')}</w:rPr>` : '';
  return `<w:r>${props}<w:t xml:space="preserve">${esc(text)}</w:t></w:r>`;
};

const P = (runs, pPr = '') => `<w:p>${pPr ? `<w:pPr>${pPr}</w:pPr>` : ''}${runs}</w:p>`;

/** Découpe le texte inline en runs (gras, italique, code). */
function inlineRuns(text, base = {}) {
  const runs = [];
  const re = /(\*\*[^*]+\*\*|`[^`]+`|\*[^*]+\*)/g;
  let last = 0;
  let m;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) runs.push(RUN(text.slice(last, m.index), base));
    const tok = m[0];
    if (tok.startsWith('**')) runs.push(RUN(tok.slice(2, -2), { ...base, bold: true }));
    else if (tok.startsWith('`')) runs.push(RUN(tok.slice(1, -1), { ...base, font: 'Consolas', size: base.size || 19 }));
    else runs.push(RUN(tok.slice(1, -1), { ...base, italic: true }));
    last = m.index + tok.length;
  }
  if (last < text.length) runs.push(RUN(text.slice(last), base));
  return runs.join('');
}

/* ------------------------------------------------------------------ */
/* Parsing du Markdown                                                 */
/* ------------------------------------------------------------------ */

const lines = markdown.split('\n');
const blocks = [];
let i = 0;

const isTableRow = (l) => /^\s*\|.*\|\s*$/.test(l);
const isTableSep = (l) => /^\s*\|[\s:|-]+\|\s*$/.test(l) && l.includes('-');

function cellsOf(row) {
  return row
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map((c) => c.trim());
}

while (i < lines.length) {
  const line = lines[i];
  if (!line.trim()) { i++; continue; }

  if (/^---+\s*$/.test(line)) { blocks.push({ type: 'hr' }); i++; continue; }

  const h = /^(#{1,4})\s+(.*)$/.exec(line);
  if (h) { blocks.push({ type: 'h', level: h[1].length, text: h[2] }); i++; continue; }

  if (line.startsWith('>')) {
    const quote = [];
    while (i < lines.length && lines[i].startsWith('>')) {
      quote.push(lines[i].replace(/^>\s?/, ''));
      i++;
    }
    blocks.push({ type: 'quote', lines: quote });
    continue;
  }

  if (isTableRow(line) && i + 1 < lines.length && isTableSep(lines[i + 1])) {
    const rows = [];
    let k = i;
    while (k < lines.length && isTableRow(lines[k])) { rows.push(cellsOf(lines[k])); k++; }
    blocks.push({ type: 'table', head: rows[0], body: rows.slice(2) });
    i = k;
    continue;
  }

  if (/^\s*[-*]\s+/.test(line)) {
    const items = [];
    while (i < lines.length && /^\s*[-*]\s+/.test(lines[i])) {
      items.push(lines[i].replace(/^\s*[-*]\s+/, ''));
      i++;
    }
    blocks.push({ type: 'ul', items });
    continue;
  }

  const para = [];
  while (
    i < lines.length &&
    lines[i].trim() &&
    !/^#{1,4}\s/.test(lines[i]) &&
    !lines[i].startsWith('>') &&
    !/^---+\s*$/.test(lines[i]) &&
    !/^\s*[-*]\s+/.test(lines[i]) &&
    !isTableRow(lines[i])
  ) {
    para.push(lines[i]);
    i++;
  }
  blocks.push({ type: 'p', lines: para });
}

/* ------------------------------------------------------------------ */
/* Rendu WordprocessingML                                              */
/* ------------------------------------------------------------------ */

const PAGE_WIDTH = 9639; // 17 cm utile (A4, marges 2 cm)
const body = [];

for (const b of blocks) {
  if (b.type === 'h') {
    if (b.level === 1) {
      body.push(P(inlineRuns(b.text, { bold: true, size: 34, color: '111111' }), '<w:spacing w:before="0" w:after="80"/><w:jc w:val="center"/>'));
    } else if (b.level === 2) {
      body.push(
        P(inlineRuns(b.text, { bold: true, size: 26, color: '111111' }),
          '<w:keepNext/><w:pBdr><w:bottom w:val="single" w:sz="6" w:space="2" w:color="999999"/></w:pBdr><w:spacing w:before="240" w:after="120"/>')
      );
    } else {
      body.push(P(inlineRuns(b.text, { bold: true, size: 22 }), '<w:keepNext/><w:spacing w:before="180" w:after="80"/>'));
    }
    continue;
  }

  if (b.type === 'p') {
    const joined = b.lines.join('\n');
    const chunks = joined.split('\n');
    chunks.forEach((chunk, idx) => {
      const isLast = idx === chunks.length - 1;
      body.push(
        P(inlineRuns(chunk), `<w:spacing w:before="0" w:after="${isLast ? 100 : 0}"/><w:jc w:val="both"/>`)
      );
    });
    continue;
  }

  if (b.type === 'ul') {
    b.items.forEach((item) => {
      body.push(
        P(
          RUN('•\t') + inlineRuns(item),
          '<w:spacing w:before="0" w:after="40"/><w:ind w:left="360" w:hanging="240"/><w:jc w:val="both"/>'
        )
      );
    });
    continue;
  }

  if (b.type === 'quote') {
    b.lines.forEach((q) => {
      if (!q.trim()) return;
      body.push(
        P(inlineRuns(q, { size: 20 }), [
          '<w:pBdr><w:left w:val="single" w:sz="18" w:space="6" w:color="999999"/></w:pBdr>',
          '<w:shd w:val="clear" w:color="auto" w:fill="F5F5F5"/>',
          '<w:spacing w:before="80" w:after="80"/>',
          '<w:ind w:left="240" w:right="120"/>',
          '<w:jc w:val="both"/>',
        ].join(''))
      );
    });
    continue;
  }

  if (b.type === 'hr') {
    body.push(P('', '<w:pBdr><w:bottom w:val="single" w:sz="6" w:space="1" w:color="BBBBBB"/></w:pBdr><w:spacing w:before="120" w:after="120"/>'));
    continue;
  }

  if (b.type === 'table') {
    const cols = b.head.length;
    const firstW = Math.round(PAGE_WIDTH * (cols > 2 ? 0.22 : 0.42));
    const restW = Math.floor((PAGE_WIDTH - firstW) / (cols - 1));
    const widths = [firstW, ...Array(cols - 1).fill(restW)];

    const grid = `<w:tblGrid>${widths.map((w) => `<w:gridCol w:w="${w}"/>`).join('')}</w:tblGrid>`;
    const tblPr = [
      '<w:tblPr>',
      `<w:tblW w:w="${PAGE_WIDTH}" w:type="dxa"/>`,
      '<w:tblBorders>',
      '<w:top w:val="single" w:sz="6" w:space="0" w:color="888888"/>',
      '<w:left w:val="single" w:sz="6" w:space="0" w:color="888888"/>',
      '<w:bottom w:val="single" w:sz="6" w:space="0" w:color="888888"/>',
      '<w:right w:val="single" w:sz="6" w:space="0" w:color="888888"/>',
      '<w:insideH w:val="single" w:sz="4" w:space="0" w:color="AAAAAA"/>',
      '<w:insideV w:val="single" w:sz="4" w:space="0" w:color="AAAAAA"/>',
      '</w:tblBorders>',
      '<w:tblCellMar><w:top w:w="60" w:type="dxa"/><w:left w:w="90" w:type="dxa"/><w:bottom w:w="60" w:type="dxa"/><w:right w:w="90" w:type="dxa"/></w:tblCellMar>',
      '<w:tblLook w:val="04A0" w:firstRow="1" w:lastRow="0" w:firstColumn="0" w:lastColumn="0" w:noHBand="1" w:noVBand="1"/>',
      '</w:tblPr>',
    ].join('');

    const row = (cells, header) => {
      const tcs = cells.map((c, idx) => {
        const tcPr = [
          `<w:tcW w:w="${widths[idx] || restW}" w:type="dxa"/>`,
          header ? '<w:shd w:val="clear" w:color="auto" w:fill="E8E8E8"/>' : '',
          '<w:vAlign w:val="top"/>',
        ].join('');
        const content = P(
          inlineRuns(c, header ? { bold: true, size: 19 } : { size: 19 }),
          '<w:spacing w:before="0" w:after="0"/>'
        );
        return `<w:tc><w:tcPr>${tcPr}</w:tcPr>${content}</w:tc>`;
      });
      return `<w:tr><w:trPr><w:cantSplit/>${header ? '<w:tblHeader/>' : ''}</w:trPr>${tcs.join('')}</w:tr>`;
    };

    body.push(
      `<w:tbl>${tblPr}${grid}${row(b.head, true)}${b.body.map((r) => row(r, false)).join('')}</w:tbl>`,
      P('', '<w:spacing w:before="0" w:after="60"/>')
    );
  }
}

const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<w:body>
${body.join('\n')}
<w:sectPr>
<w:pgSz w:w="11906" w:h="16838"/>
<w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134" w:header="709" w:footer="709" w:gutter="0"/>
</w:sectPr>
</w:body>
</w:document>`;

const stylesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
<w:docDefaults>
<w:rPrDefault><w:rPr><w:rFonts w:ascii="Cambria" w:hAnsi="Cambria" w:cs="Cambria"/><w:sz w:val="21"/><w:szCs w:val="21"/><w:lang w:val="fr-FR"/></w:rPr></w:rPrDefault>
<w:pPrDefault><w:pPr><w:spacing w:after="100" w:line="276" w:lineRule="auto"/></w:pPr></w:pPrDefault>
</w:docDefaults>
<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style>
<w:style w:type="table" w:default="1" w:styleId="TableNormal"><w:name w:val="Normal Table"/><w:tblPr><w:tblCellMar><w:top w:w="0" w:type="dxa"/><w:left w:w="108" w:type="dxa"/><w:bottom w:w="0" w:type="dxa"/><w:right w:w="108" w:type="dxa"/></w:tblCellMar></w:tblPr></w:style>
</w:styles>`;

const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
<Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>
</Types>`;

const rootRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>
<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>
</Relationships>`;

const docRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`;

const now = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
const coreXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
<dc:title>Contrat de partenariat strategique - BonPlanInfos</dc:title>
<dc:subject>Partenariat promotion et partage de revenus</dc:subject>
<dc:creator>BonPlanInfos</dc:creator>
<cp:lastModifiedBy>BonPlanInfos</cp:lastModifiedBy>
<dcterms:created xsi:type="dcterms:W3CDTF">${now}</dcterms:created>
<dcterms:modified xsi:type="dcterms:W3CDTF">${now}</dcterms:modified>
</cp:coreProperties>`;

const appXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes">
<Application>BonPlanInfos</Application>
<DocSecurity>0</DocSecurity>
</Properties>`;

/* ------------------------------------------------------------------ */
/* Écriture du ZIP (méthode « stored », compatible Word)               */
/* ------------------------------------------------------------------ */

const crcTable = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let n = 0; n < buf.length; n++) c = crcTable[(c ^ buf[n]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

const dosTime = ((now2) =>
  ((now2.getHours() << 11) | (now2.getMinutes() << 5) | Math.floor(now2.getSeconds() / 2)) & 0xffff)(new Date());
const dosDate = ((d) => (((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate()) & 0xffff)(new Date());

function buildZip(entries) {
  const locals = [];
  const centrals = [];
  let offset = 0;

  for (const [name, content] of entries) {
    const nameBuf = Buffer.from(name, 'utf8');
    const dataBuf = Buffer.isBuffer(content) ? content : Buffer.from(content, 'utf8');
    const crc = crc32(dataBuf);

    const local = Buffer.alloc(30 + nameBuf.length);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6); // UTF-8
    local.writeUInt16LE(0, 8); // stored
    local.writeUInt16LE(dosTime, 10);
    local.writeUInt16LE(dosDate, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(dataBuf.length, 18);
    local.writeUInt32LE(dataBuf.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    local.writeUInt16LE(0, 28);
    nameBuf.copy(local, 30);

    locals.push(local, dataBuf);

    const central = Buffer.alloc(46 + nameBuf.length);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(0, 10);
    central.writeUInt16LE(dosTime, 12);
    central.writeUInt16LE(dosDate, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(dataBuf.length, 20);
    central.writeUInt32LE(dataBuf.length, 24);
    central.writeUInt16LE(nameBuf.length, 28);
    central.writeUInt16LE(0, 30);
    central.writeUInt16LE(0, 32);
    central.writeUInt16LE(0, 34);
    central.writeUInt16LE(0, 36);
    central.writeUInt32LE(0, 38);
    central.writeUInt32LE(offset, 42);
    nameBuf.copy(central, 46);

    centrals.push(central);
    offset += local.length + dataBuf.length;
  }

  const centralStart = offset;
  const centralSize = centrals.reduce((n, b) => n + b.length, 0);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(centralSize, 12);
  eocd.writeUInt32LE(centralStart, 16);
  eocd.writeUInt16LE(0, 20);

  return Buffer.concat([...locals, ...centrals, eocd]);
}

const zip = buildZip([
  ['[Content_Types].xml', contentTypes],
  ['_rels/.rels', rootRels],
  ['docProps/core.xml', coreXml],
  ['docProps/app.xml', appXml],
  ['word/document.xml', documentXml],
  ['word/styles.xml', stylesXml],
  ['word/_rels/document.xml.rels', docRels],
]);

fs.writeFileSync(dest, zip);
console.log('DOCX généré :', dest, `(${(zip.length / 1024).toFixed(1)} Ko)`);
