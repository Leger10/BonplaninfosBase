/**
 * Petit analyseur Markdown adapté au contrat de partenariat.
 * Il couvre uniquement les éléments utilisés dans le document :
 * titres, paragraphes, listes, citations, tableaux et séparateurs.
 */

const INLINE_PATTERN = /\*\*([\s\S]+?)\*\*|`([^`]+)`/g;

export function parseInline(text = '', inheritedBold = false) {
  const runs = [];
  let lastIndex = 0;

  for (const match of text.matchAll(INLINE_PATTERN)) {
    if (match.index > lastIndex) {
      runs.push({
        text: text.slice(lastIndex, match.index),
        bold: inheritedBold,
        code: false,
      });
    }

    if (match[1] !== undefined) {
      // Le gras peut contenir des segments de code : on analyse son contenu
      // pour ne pas afficher les backticks.
      runs.push(...parseInline(match[1], true));
    } else {
      runs.push({ text: match[2], bold: inheritedBold, code: true });
    }

    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) {
    runs.push({ text: text.slice(lastIndex), bold: inheritedBold, code: false });
  }

  return runs.filter((run) => run.text.length > 0);
}

function splitTableRow(line) {
  const cells = [];
  let current = '';

  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];

    if (character === '\\' && line[index + 1] === '|') {
      current += '|';
      index += 1;
      continue;
    }

    if (character === '|') {
      cells.push(current);
      current = '';
      continue;
    }

    current += character;
  }

  cells.push(current);

  if (cells[0]?.trim() === '') cells.shift();
  if (cells[cells.length - 1]?.trim() === '') cells.pop();

  return cells.map((cell) => cell.trim());
}

function isSeparatorRow(line) {
  const cells = splitTableRow(line);
  return cells.length > 0 && cells.every((cell) => /^:?-{3,}:?$/.test(cell));
}

function parseTable(lines) {
  const header = lines[0];
  const hasSeparator = lines.length > 1 && isSeparatorRow(lines[1]);
  const bodyLines = hasSeparator ? lines.slice(2) : lines.slice(1);
  const separator = hasSeparator ? splitTableRow(lines[1]) : [];

  return {
    type: 'table',
    header: splitTableRow(header).map(parseInline),
    rows: bodyLines.map((line) => splitTableRow(line).map(parseInline)),
    aligns: separator.map((cell) => {
      const trimmed = cell.trim();
      if (trimmed.startsWith(':') && trimmed.endsWith(':')) return 'center';
      if (trimmed.endsWith(':')) return 'right';
      return 'left';
    }),
  };
}

function quoteTone(rawLines) {
  const text = rawLines.join(' ').toLowerCase();
  if (text.includes('avocat') || text.includes('rappel final') || text.includes('valider')) {
    return 'warning';
  }
  return 'default';
}

export function parseContractMarkdown(markdown = '') {
  const lines = markdown.replace(/\r\n/g, '\n').split('\n');
  const blocks = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index];
    const trimmed = line.trim();

    if (!trimmed) {
      index += 1;
      continue;
    }

    if (/^-{3,}$/.test(trimmed)) {
      blocks.push({ type: 'hr' });
      index += 1;
      continue;
    }

    const heading = trimmed.match(/^(#{1,3})\s+(.*)$/);
    if (heading) {
      blocks.push({
        type: 'heading',
        level: heading[1].length,
        runs: parseInline(heading[2].trim()),
      });
      index += 1;
      continue;
    }

    if (trimmed.startsWith('>')) {
      const quoteLines = [];
      while (index < lines.length && lines[index].trim().startsWith('>')) {
        const content = lines[index].trim().replace(/^>\s?/, '').trim();
        if (content) quoteLines.push(content);
        index += 1;
      }
      blocks.push({
        type: 'quote',
        tone: quoteTone(quoteLines),
        lines: quoteLines.map(parseInline),
      });
      continue;
    }

    if (trimmed.startsWith('|')) {
      const tableLines = [];
      while (index < lines.length && lines[index].trim().startsWith('|')) {
        tableLines.push(lines[index]);
        index += 1;
      }
      blocks.push(parseTable(tableLines));
      continue;
    }

    if (/^-\s+/.test(trimmed)) {
      const items = [];
      while (index < lines.length && /^-\s+/.test(lines[index].trim())) {
        items.push(parseInline(lines[index].trim().replace(/^-\s+/, '')));
        index += 1;
      }
      blocks.push({ type: 'list', items });
      continue;
    }

    blocks.push({ type: 'paragraph', runs: parseInline(trimmed) });
    index += 1;
  }

  return blocks;
}
