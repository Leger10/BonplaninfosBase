import jsPDF from 'jspdf';
import { renderContract } from './fields';
import { parseContractMarkdown } from './parseContract';

/**
 * Génération du PDF du contrat de partenariat stratégique.
 *
 * Le rendu est fait directement avec jsPDF (texte, tableaux, pagination),
 * sans capture d'écran : le document reste net, cherchable et léger.
 */

const PAGE_WIDTH = 210;
const PAGE_HEIGHT = 297;
const MARGIN_LEFT = 18;
const MARGIN_RIGHT = 18;
const MARGIN_TOP = 20;
const MARGIN_BOTTOM = 18;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN_LEFT - MARGIN_RIGHT;
const BOTTOM = PAGE_HEIGHT - MARGIN_BOTTOM;

const COLORS = {
  ink: [31, 41, 55],
  muted: [100, 116, 139],
  accent: [79, 70, 229],
  border: [209, 213, 219],
  headerFill: [238, 242, 255],
  zebra: [250, 250, 252],
  quoteBg: [248, 250, 252],
  quoteText: [55, 65, 81],
  warningBg: [255, 251, 235],
  warningBar: [217, 119, 6],
  warningText: [120, 53, 15],
};

function sanitizeText(text) {
  return String(text)
    .replace(/\u00a0/g, ' ')
    .replace(/[\u2007\u2009\u202f]/g, ' ')
    .replace(/[\u2010\u2011\u2212]/g, '-')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201c\u201d]/g, '"')
    .replace(/\u2026/g, '...');
}

function plainText(runs) {
  return (runs || []).map((run) => run.text).join('');
}

function computeColumnWidths(block, totalWidth) {
  const columnCount = block.header.length;
  const minWidth = 14;

  const weights = Array.from({ length: columnCount }, (_, column) => {
    const texts = [block.header[column], ...block.rows.map((row) => row[column] || [])];
    const longest = Math.max(...texts.map((runs) => plainText(runs).length), 6);
    return Math.sqrt(longest);
  });

  const weightSum = weights.reduce((sum, weight) => sum + weight, 0);
  let widths = weights.map((weight) => (totalWidth * weight) / weightSum);

  for (let iteration = 0; iteration < 12; iteration += 1) {
    const fixed = widths.map((width) => width < minWidth);
    if (!fixed.some(Boolean)) break;

    const fixedTotal = widths.reduce((sum, width, index) => sum + (fixed[index] ? minWidth : 0), 0);
    const freeTotal = totalWidth - fixedTotal;
    const freeWeightSum = weights.reduce((sum, weight, index) => sum + (fixed[index] ? 0 : weight), 0);

    widths = widths.map((width, index) => {
      if (fixed[index]) return minWidth;
      if (freeWeightSum === 0) return freeTotal / columnCount;
      return (freeTotal * weights[index]) / freeWeightSum;
    });
  }

  const finalTotal = widths.reduce((sum, width) => sum + width, 0);
  return widths.map((width) => (width * totalWidth) / finalTotal);
}

class ContractPdfWriter {
  constructor(doc) {
    this.doc = doc;
    this.y = MARGIN_TOP;
  }

  lineHeight(size) {
    return size * 0.3528 * 1.3;
  }

  setFont(bold) {
    this.doc.setFont('helvetica', bold ? 'bold' : 'normal');
  }

  measure(text, size, bold) {
    this.doc.setFontSize(size);
    this.setFont(bold);
    return this.doc.getTextWidth(sanitizeText(text));
  }

  ensureSpace(height) {
    if (this.y + height > BOTTOM) {
      this.doc.addPage();
      this.y = MARGIN_TOP;
    }
  }

  wrapRuns(runs, maxWidth, size) {
    const words = [];

    for (const run of runs || []) {
      const clean = sanitizeText(run.text);
      const pieces = clean.split(/(\s+)/);

      for (const piece of pieces) {
        if (!piece) continue;
        if (/^\s+$/.test(piece)) continue;
        words.push({
          text: piece,
          bold: Boolean(run.bold),
          width: this.measure(piece, size, Boolean(run.bold)),
        });
      }
    }

    const spaceWidth = this.measure(' ', size, false);
    const lines = [];
    let line = [];
    let lineWidth = 0;

    const pushLine = () => {
      if (!line.length) return;
      lines.push({ words: line, width: lineWidth });
      line = [];
      lineWidth = 0;
    };

    const splitLongWord = (word) => {
      const chunks = [];
      let current = '';
      let width = 0;

      for (const character of word.text) {
        const characterWidth = this.measure(character, size, word.bold);
        if (current && width + characterWidth > maxWidth) {
          chunks.push({ ...word, text: current, width });
          current = character;
          width = characterWidth;
        } else {
          current += character;
          width += characterWidth;
        }
      }

      if (current) chunks.push({ ...word, text: current, width });
      return chunks;
    };

    for (const word of words) {
      if (word.width > maxWidth) {
        const chunks = splitLongWord(word);
        chunks.forEach((chunk, index) => {
          const needed = (line.length ? spaceWidth : 0) + chunk.width;
          if (line.length && lineWidth + needed > maxWidth) pushLine();
          if (line.length) lineWidth += spaceWidth;
          line.push(chunk);
          lineWidth += chunk.width;
          if (index < chunks.length - 1) pushLine();
        });
        continue;
      }

      const needed = (line.length ? spaceWidth : 0) + word.width;
      if (line.length && lineWidth + needed > maxWidth) pushLine();
      if (line.length) lineWidth += spaceWidth;
      line.push(word);
      lineWidth += word.width;
    }

    pushLine();
    return { lines, spaceWidth };
  }

  drawLine(line, x, baseline, size, color, spaceWidth) {
    let cursor = x;

    line.words.forEach((word, index) => {
      if (index > 0) cursor += spaceWidth;

      this.doc.setFont('helvetica', word.bold ? 'bold' : 'normal');
      this.doc.setFontSize(size);
      this.doc.setTextColor(...color);
      this.doc.text(word.text, cursor, baseline);
      cursor += word.width;
    });
  }

  writeRuns(runs, options = {}) {
    const {
      x = MARGIN_LEFT,
      width = CONTENT_WIDTH,
      size = 9.5,
      color = COLORS.ink,
      align = 'left',
      lineHeight,
      gapAfter = 2.2,
    } = options;

    const height = lineHeight || this.lineHeight(size);
    const { lines, spaceWidth } = this.wrapRuns(runs, width, size);

    for (const line of lines) {
      this.ensureSpace(height);
      this.y += height;

      const offset =
        align === 'center'
          ? (width - line.width) / 2
          : align === 'right'
            ? width - line.width
            : 0;

      this.drawLine(line, x + offset, this.y - 0.9, size, color, spaceWidth);
    }

    this.y += gapAfter;
  }

  renderHeading(block, index) {
    const text = plainText(block.runs).trim();

    if (block.level === 1) {
      const isDocumentTitle = index === 0;

      if (!isDocumentTitle && (/^ANNEXE/i.test(text) || text === 'CONTRAT')) {
        this.doc.addPage();
        this.y = MARGIN_TOP;
      } else if (!isDocumentTitle) {
        this.ensureSpace(20);
        this.y += 4;
      }

      const size = isDocumentTitle ? 18 : 15;
      this.writeRuns(block.runs, {
        size,
        align: isDocumentTitle ? 'center' : 'left',
        color: COLORS.ink,
        lineHeight: size * 0.3528 * 1.35,
        gapAfter: isDocumentTitle ? 2 : 3,
      });

      if (!isDocumentTitle) {
        this.ensureSpace(4);
        this.doc.setDrawColor(...COLORS.accent);
        this.doc.setLineWidth(0.5);
        this.doc.line(MARGIN_LEFT, this.y - 1.5, MARGIN_LEFT + 28, this.y - 1.5);
        this.y += 2;
      }
      return;
    }

    if (block.level === 2 && text === 'BonPlanInfos') {
      this.writeRuns(block.runs, {
        size: 11.5,
        align: 'center',
        color: COLORS.muted,
        lineHeight: 5,
        gapAfter: 5,
      });
      return;
    }

    if (block.level === 2 && text === 'SIGNATURES') {
      this.doc.addPage();
      this.y = MARGIN_TOP;
    } else {
      this.ensureSpace(block.level === 2 ? 20 : 16);
      this.y += block.level === 2 ? 4 : 2.5;
    }

    const size = block.level === 2 ? 12 : 10.5;
    this.writeRuns(block.runs, {
      size,
      color: block.level === 2 ? COLORS.accent : COLORS.ink,
      lineHeight: size * 0.3528 * 1.32,
      gapAfter: block.level === 2 ? 2.5 : 2,
    });
  }

  renderList(block) {
    const size = 9.4;
    const height = this.lineHeight(size);
    const indent = 5;

    for (const item of block.items) {
      const { lines, spaceWidth } = this.wrapRuns(item, CONTENT_WIDTH - indent, size);

      lines.forEach((line, lineIndex) => {
        this.ensureSpace(height);
        this.y += height;

        if (lineIndex === 0) {
          this.doc.setFontSize(size);
          this.doc.setTextColor(...COLORS.accent);
          this.doc.setFont('helvetica', 'bold');
          this.doc.text('•', MARGIN_LEFT + 1.2, this.y - 0.9);
        }

        this.drawLine(
          line,
          MARGIN_LEFT + indent,
          this.y - 0.9,
          size,
          COLORS.ink,
          spaceWidth,
        );
      });

      this.y += 1.1;
    }

    this.y += 1;
  }

  renderQuote(block) {
    const size = 9.1;
    const height = this.lineHeight(size);
    const x = MARGIN_LEFT + 5;
    const width = CONTENT_WIDTH - 5;
    const warning = block.tone === 'warning';
    const background = warning ? COLORS.warningBg : COLORS.quoteBg;
    const bar = warning ? COLORS.warningBar : COLORS.accent;
    const color = warning ? COLORS.warningText : COLORS.quoteText;

    this.ensureSpace(6);
    this.y += 1;

    for (const lineRuns of block.lines) {
      const { lines, spaceWidth } = this.wrapRuns(lineRuns, width, size);

      for (const line of lines) {
        this.ensureSpace(height);

        this.doc.setFillColor(...background);
        this.doc.rect(MARGIN_LEFT, this.y + 0.8, CONTENT_WIDTH, height, 'F');

        this.doc.setFillColor(...bar);
        this.doc.rect(MARGIN_LEFT, this.y + 0.8, 1.2, height, 'F');

        this.y += height;
        this.drawLine(line, x, this.y - 1.2, size, color, spaceWidth);
      }

      this.y += 0.5;
    }

    this.y += 2;
  }

  renderTable(block) {
    const size = 8.1;
    const height = this.lineHeight(size);
    const padX = 1.8;
    const padY = 1.5;
    const widths = computeColumnWidths(block, CONTENT_WIDTH);

    const prepareRow = (row, forceBold = false) =>
      row.map((cellRuns, column) => {
        const runs = forceBold
          ? (cellRuns || []).map((run) => ({ ...run, bold: true }))
          : cellRuns || [];
        return this.wrapRuns(runs, widths[column] - padX * 2, size);
      });

    const header = prepareRow(block.header, true);
    const rows = block.rows.map((row) => prepareRow(row));

    const drawRow = (prepared, isHeader, rowIndex) => {
      const rowHeight =
        Math.max(1, ...prepared.map((cell) => cell.lines.length)) * height + padY * 2;

      if (this.y + rowHeight > BOTTOM) {
        this.doc.addPage();
        this.y = MARGIN_TOP;
        if (!isHeader) drawRow(header, true, 0);
      }

      const fill = isHeader
        ? COLORS.headerFill
        : rowIndex % 2 === 0
          ? [255, 255, 255]
          : COLORS.zebra;

      this.doc.setFillColor(...fill);
      this.doc.rect(MARGIN_LEFT, this.y, CONTENT_WIDTH, rowHeight, 'F');

      let x = MARGIN_LEFT;

      prepared.forEach((cell, column) => {
        const align = block.aligns[column] || 'left';
        let baseline = this.y + padY + height - 0.9;

        for (const line of cell.lines) {
          const offset =
            align === 'right'
              ? widths[column] - padX - line.width
              : align === 'center'
                ? (widths[column] - line.width) / 2
                : padX;

          this.drawLine(
            line,
            x + offset,
            baseline,
            size,
            COLORS.ink,
            cell.spaceWidth,
          );
          baseline += height;
        }

        x += widths[column];
      });

      this.doc.setDrawColor(...COLORS.border);
      this.doc.setLineWidth(0.18);
      this.doc.rect(MARGIN_LEFT, this.y, CONTENT_WIDTH, rowHeight);
      this.y += rowHeight;
    };

    this.ensureSpace(8);
    drawRow(header, true, 0);
    rows.forEach((row, index) => drawRow(row, false, index));
    this.y += 3;
  }

  renderHorizontalRule() {
    this.ensureSpace(7);
    this.y += 3;
    this.doc.setDrawColor(...COLORS.border);
    this.doc.setLineWidth(0.25);
    this.doc.line(MARGIN_LEFT, this.y, PAGE_WIDTH - MARGIN_RIGHT, this.y);
    this.y += 3;
  }

  renderBlock(block, index) {
    switch (block.type) {
      case 'heading':
        this.renderHeading(block, index);
        break;
      case 'list':
        this.renderList(block);
        break;
      case 'quote':
        this.renderQuote(block);
        break;
      case 'table':
        this.renderTable(block);
        break;
      case 'hr':
        this.renderHorizontalRule();
        break;
      default:
        this.writeRuns(block.runs);
        break;
    }
  }

  finalize() {
    const total = this.doc.getNumberOfPages();

    for (let page = 1; page <= total; page += 1) {
      this.doc.setPage(page);

      this.doc.setFont('helvetica', 'normal');
      this.doc.setFontSize(7.2);
      this.doc.setTextColor(...COLORS.muted);
      this.doc.text('BonPlanInfos', MARGIN_LEFT, 11);
      this.doc.text('Contrat de partenariat stratégique', PAGE_WIDTH - MARGIN_RIGHT, 11, {
        align: 'right',
      });

      this.doc.setDrawColor(...COLORS.border);
      this.doc.setLineWidth(0.2);
      this.doc.line(MARGIN_LEFT, 13, PAGE_WIDTH - MARGIN_RIGHT, 13);

      this.doc.line(MARGIN_LEFT, 283, PAGE_WIDTH - MARGIN_RIGHT, 283);
      this.doc.setFontSize(7);
      this.doc.text(
        'Document confidentiel — à faire valider par un avocat et un comptable',
        MARGIN_LEFT,
        288,
      );
      this.doc.text(`Page ${page} / ${total}`, PAGE_WIDTH - MARGIN_RIGHT, 288, {
        align: 'right',
      });
    }
  }
}

function slugify(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
}

export function buildContractPdf(values = {}) {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
    compress: true,
  });

  doc.setProperties({
    title: 'Contrat de partenariat stratégique — BonPlanInfos',
    subject: 'Partenariat de promotion et de partage de revenus',
    author: 'BonPlanInfos',
    creator: 'BonPlanInfos',
  });

  const writer = new ContractPdfWriter(doc);
  const blocks = parseContractMarkdown(renderContract(values));

  blocks.forEach((block, index) => writer.renderBlock(block, index));
  writer.finalize();

  return doc;
}

function savePdf(doc, fileName) {
  const blob = doc.output('blob');
  const url = URL.createObjectURL(blob);

  if (/iPad|iPhone|iPod/.test(navigator.userAgent)) {
    window.open(url, '_blank');
    return;
  }

  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

export function downloadContractPdf(values = {}) {
  const doc = buildContractPdf(values);
  const partieA =
    slugify(values['partieA.nom'] || values.partieA?.nom) || 'partie-a';
  const partieB =
    slugify(values['partieB.nom'] || values.partieB?.nom) || 'partie-b';
  const fileName = `contrat-partenariat-${partieA}-${partieB}.pdf`;

  savePdf(doc, fileName);
  return fileName;
}
