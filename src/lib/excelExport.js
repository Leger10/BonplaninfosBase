/**
 * Export Excel commun à l'application (remplace SheetJS `xlsx`).
 *
 * Toutes les feuilles sont générées avec : en-tête stylé, lignes figées,
 * filtre automatique, largeurs de colonnes ajustées et alternance de couleurs.
 *
 * ExcelJS est chargé dynamiquement : il ne pèse pas sur le bundle initial,
 * il n'est téléchargé qu'au premier clic sur un bouton d'export.
 */

let excelJsPromise = null;

function loadExcelJS() {
  if (!excelJsPromise) {
    excelJsPromise = import('exceljs').then((mod) => mod.default || mod);
  }
  return excelJsPromise;
}

const HEADER_FILL = 'FFEFEAFF';
const HEADER_BORDER = 'FFB3A4F2';
const CELL_BORDER = 'FFDDDDDD';
const ZEBRA_FILL = 'FFFAFAFA';

const MAX_WIDTH = 60;
const MIN_WIDTH = 10;

function normalizeColumns(sheet) {
  if (Array.isArray(sheet.columns) && sheet.columns.length) {
    return sheet.columns.map((col) => ({
      header: col.header ?? col.label ?? String(col.key ?? ''),
      key: col.key,
      width: col.width,
    }));
  }

  if (Array.isArray(sheet.header) && sheet.header.length) {
    return sheet.header.map((label, index) => ({ header: String(label), index }));
  }

  const objectRows = (sheet.rows || []).filter((r) => r && typeof r === 'object' && !Array.isArray(r));
  if (!objectRows.length) return [];

  const keys = [];
  for (const row of objectRows.slice(0, 50)) {
    for (const key of Object.keys(row)) {
      if (!keys.includes(key)) keys.push(key);
    }
  }

  return keys.map((key) => ({ header: key, key }));
}

function computeWidth(column, rows) {
  if (column.width) return column.width;

  const lengths = [String(column.header ?? '').length];
  for (const row of rows) {
    const value = Array.isArray(row) ? row[column.index ?? 0] : row?.[column.key];
    if (value === null || value === undefined) continue;
    lengths.push(String(value).length);
  }

  return Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, Math.max(...lengths) + 2));
}

function styleHeaderRow(row, columnCount) {
  row.height = 22;
  for (let c = 1; c <= columnCount; c += 1) {
    const cell = row.getCell(c);
    cell.font = { name: 'Calibri', bold: true, size: 11 };
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: HEADER_FILL } };
    cell.border = {
      top: { style: 'thin', color: { argb: CELL_BORDER } },
      left: { style: 'thin', color: { argb: CELL_BORDER } },
      right: { style: 'thin', color: { argb: CELL_BORDER } },
      bottom: { style: 'medium', color: { argb: HEADER_BORDER } },
    };
  }
}

function styleBodyRow(row, columnCount, index) {
  for (let c = 1; c <= columnCount; c += 1) {
    const cell = row.getCell(c);
    cell.font = { name: 'Calibri', size: 10 };
    cell.alignment = { vertical: 'middle', wrapText: false };
    cell.border = {
      top: { style: 'thin', color: { argb: CELL_BORDER } },
      left: { style: 'thin', color: { argb: CELL_BORDER } },
      right: { style: 'thin', color: { argb: CELL_BORDER } },
      bottom: { style: 'thin', color: { argb: CELL_BORDER } },
    };
    if (index % 2 === 1) {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: ZEBRA_FILL } };
    }
  }
}

/**
 * Construit un classeur Excel et renvoie son contenu binaire.
 *
 * @param {{ sheets: Array<{ name?: string, rows: Array<object|Array>, columns?: Array<{header: string, key?: string, width?: number}>, freezeHeader?: boolean, autoFilter?: boolean }> }} options
 * @returns {Promise<ArrayBuffer>}
 */
export async function buildExcelBuffer({ sheets }) {
  const ExcelJS = await loadExcelJS();
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'BonPlanInfos';
  workbook.created = new Date();

  for (const sheet of sheets) {
    if (!sheet?.rows?.length) continue;

    const worksheet = workbook.addWorksheet(sheet.name || 'Export', {
      views: sheet.freezeHeader === false ? [] : [{ state: 'frozen', ySplit: 1, activeCell: 'A2' }],
      pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
    });

    const columns = normalizeColumns(sheet);
    if (columns.length) {
      worksheet.columns = columns.map((col, index) => ({
        header: col.header,
        key: col.key,
        width: computeWidth({ ...col, index }, sheet.rows),
      }));
    }

    worksheet.addRows(sheet.rows);

    const columnCount = worksheet.columnCount || (columns.length || 1);
    styleHeaderRow(worksheet.getRow(1), columnCount);

    for (let r = 2; r <= worksheet.rowCount; r += 1) {
      styleBodyRow(worksheet.getRow(r), columnCount, r);
    }

    if (sheet.freezeHeader !== false) {
      worksheet.views = [{ state: 'frozen', ySplit: 1, activeCell: 'A2' }];
    }

    if (sheet.autoFilter !== false) {
      worksheet.autoFilter = {
        from: { row: 1, column: 1 },
        to: { row: 1, column: columnCount },
      };
    }
  }

  return workbook.xlsx.writeBuffer();
}

export function downloadExcelBuffer(buffer, fileName = 'export.xlsx') {
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/**
 * Exporte une ou plusieurs feuilles et déclenche le téléchargement.
 */
export async function exportExcel({ sheets, fileName = 'export.xlsx' }) {
  const buffer = await buildExcelBuffer({ sheets: Array.isArray(sheets) ? sheets : [sheets] });
  downloadExcelBuffer(buffer, fileName);
}

/**
 * Raccourci pour une seule feuille de lignes (objets ou tableaux).
 */
export function exportRowsToExcel({ rows, name, fileName, columns, ...rest }) {
  return exportExcel({
    sheets: [{ name, rows, columns, ...rest }],
    fileName,
  });
}
