#!/usr/bin/env node
/**
 * Convertit un contrat Markdown en HTML prêt à imprimer (A4).
 * Usage : node scripts/md-to-print-html.mjs <source.md> [destination.html]
 * Puis : ouvrir le HTML dans un navigateur → Imprimer → Enregistrer au format PDF.
 */
import fs from 'node:fs';
import path from 'node:path';

const src = process.argv[2];
if (!src) {
  console.error('Usage : node scripts/md-to-print-html.mjs <source.md> [destination.html]');
  process.exit(1);
}
const dest = process.argv[3] || src.replace(/\.md$/i, '.html');

const escapeHtml = (s) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function inline(text) {
  let out = escapeHtml(text);
  out = out.replace(/`([^`]+)`/g, '<code>$1</code>');
  out = out.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  out = out.replace(/\*([^*]+)\*/g, '<em>$1</em>');
  out = out.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
  return out;
}

const lines = fs.readFileSync(src, 'utf8').replace(/\r\n/g, '\n').split('\n');
const html = [];
let i = 0;

const isTableRow = (l) => /^\s*\|.*\|\s*$/.test(l);
const isTableSep = (l) => /^\s*\|[\s:|-]+\|\s*$/.test(l) && l.includes('-');

function parseTable(start) {
  const rows = [];
  let k = start;
  while (k < lines.length && isTableRow(lines[k])) {
    rows.push(lines[k]);
    k++;
  }
  const cells = (row) =>
    row.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim());
  const head = cells(rows[0]);
  const body = rows.slice(2).map(cells);
  let t = '<table><thead><tr>';
  head.forEach((c) => (t += `<th>${inline(c)}</th>`));
  t += '</tr></thead><tbody>';
  body.forEach((r) => {
    t += '<tr>';
    r.forEach((c) => (t += `<td>${inline(c)}</td>`));
    t += '</tr>';
  });
  t += '</tbody></table>';
  return { table: t, next: k };
}

while (i < lines.length) {
  const line = lines[i];

  if (!line.trim()) { i++; continue; }

  if (/^---+\s*$/.test(line)) { html.push('<hr />'); i++; continue; }

  const h = /^(#{1,4})\s+(.*)$/.exec(line);
  if (h) {
    const level = h[1].length;
    const id = h[2].toLowerCase().replace(/[^a-z0-9\u00e0-\u00ff]+/g, '-').replace(/^-|-$/g, '');
    html.push(`<h${level} id="${id}">${inline(h[2])}</h${level}>`);
    i++;
    continue;
  }

  if (line.startsWith('>')) {
    const quote = [];
    while (i < lines.length && lines[i].startsWith('>')) {
      quote.push(lines[i].replace(/^>\s?/, ''));
      i++;
    }
    html.push(`<blockquote>${quote.map(inline).join('<br />')}</blockquote>`);
    continue;
  }

  if (isTableRow(line) && i + 1 < lines.length && isTableSep(lines[i + 1])) {
    const { table, next } = parseTable(i);
    html.push(table);
    i = next;
    continue;
  }

  if (/^\s*[-*]\s+/.test(line)) {
    const items = [];
    while (i < lines.length && /^\s*[-*]\s+/.test(lines[i])) {
      items.push(lines[i].replace(/^\s*[-*]\s+/, ''));
      i++;
    }
    html.push(`<ul>${items.map((it) => `<li>${inline(it)}</li>`).join('')}</ul>`);
    continue;
  }

  const para = [];
  while (
    i < lines.length &&
    lines[i].trim() &&
    !/^(#{1,4})\s/.test(lines[i]) &&
    !lines[i].startsWith('>') &&
    !/^---+\s*$/.test(lines[i]) &&
    !/^\s*[-*]\s+/.test(lines[i]) &&
    !isTableRow(lines[i])
  ) {
    para.push(lines[i]);
    i++;
  }
  html.push(`<p>${para.map(inline).join('<br />')}</p>`);
}

const title = (fs.readFileSync(src, 'utf8').match(/^#\s+(.+)$/m) || [, path.basename(src)])[1];

const page = `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8" />
<title>${escapeHtml(title)}</title>
<style>
  @page { size: A4; margin: 20mm 18mm; }
  * { box-sizing: border-box; }
  body {
    font-family: "Cambria", "Georgia", "Times New Roman", serif;
    font-size: 10.5pt; line-height: 1.55; color: #1a1a1a;
    max-width: 190mm; margin: 0 auto; padding: 12mm 0;
    background: #fff; text-align: justify;
  }
  h1 { font-size: 17pt; text-align: center; line-height: 1.3; margin: 0 0 4mm; text-transform: uppercase; letter-spacing: .02em; }
  h1 + h2 { text-align: center; font-size: 12pt; font-weight: normal; margin-top: 0; color: #444; border-bottom: none; }
  h2 { font-size: 13pt; margin: 8mm 0 3mm; padding-bottom: 1.5mm; border-bottom: 1px solid #999; page-break-after: avoid; }
  h3 { font-size: 11pt; margin: 6mm 0 2mm; page-break-after: avoid; }
  h4 { font-size: 10.5pt; margin: 4mm 0 2mm; page-break-after: avoid; }
  p { margin: 0 0 2.6mm; }
  ul { margin: 0 0 2.6mm; padding-left: 6mm; }
  li { margin-bottom: 1mm; }
  strong { font-weight: 700; }
  code { font-family: "Consolas", monospace; font-size: 9.5pt; background: #f2f2f2; padding: 0 .6mm; border-radius: 1mm; }
  blockquote {
    margin: 3mm 0; padding: 2.5mm 4mm; border-left: 3px solid #999;
    background: #f7f7f7; font-size: 10pt;
  }
  hr { border: 0; border-top: 1px solid #bbb; margin: 6mm 0; }
  table { width: 100%; border-collapse: collapse; margin: 3mm 0 4mm; font-size: 9.5pt; page-break-inside: avoid; }
  th, td { border: 1px solid #999; padding: 1.6mm 2mm; vertical-align: top; text-align: left; }
  th { background: #eee; font-weight: 700; }
  a { color: #14508c; text-decoration: none; }
  @media print {
    body { padding: 0; }
    a { color: inherit; }
    h2, h3 { break-after: avoid; }
    table { break-inside: avoid; }
  }
</style>
</head>
<body>
${html.join('\n')}
</body>
</html>
`;

fs.writeFileSync(dest, page, 'utf8');
console.log('HTML généré :', dest);
