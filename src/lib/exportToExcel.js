import { exportExcel } from './excelExport';

/**
 * Export Excel générique (en-têtes personnalisés + lignes objets).
 *
 * @param {{ data: Array<object>, headers: Array<{ key: string, label: string }>, sheetName?: string, fileName?: string }} options
 */
export const exportToExcel = async ({ data, headers, sheetName = 'Export', fileName = 'export.xlsx' }) => {
  if (!data?.length) return;

  await exportExcel({
    fileName,
    sheets: [
      {
        name: sheetName,
        columns: headers.map((h) => ({ header: h.label, key: h.key })),
        rows: data,
      },
    ],
  });
};
