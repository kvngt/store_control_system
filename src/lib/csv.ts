/**
 * CSV para abrir en Excel (lo que se le manda al contador).
 *
 * - Cada celda va entre comillas, con las comillas internas duplicadas.
 * - Un texto que empieza con `=`, `+`, `-` o `@` se antepone con `'`: Excel lo ejecutaría como
 *   fórmula, y las descripciones vienen del banco o las escribe cualquiera ("=HYPERLINK(...)").
 *   Los números van tal cual, así un monto negativo sigue siendo un número.
 * - Se descarga con BOM: sin él, Excel abre "Depósito" como "DepÃ³sito".
 */
export type CsvCell = string | number | null | undefined;

function cell(value: CsvCell): string {
  if (value === null || value === undefined) return '""';
  if (typeof value === 'number') return Number.isFinite(value) ? `"${value}"` : '""';
  const text = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return `"${text.replace(/"/g, '""')}"`;
}

export function toCsv(rows: CsvCell[][]): string {
  return rows.map((row) => row.map(cell).join(',')).join('\r\n');
}

export function downloadCsv(filename: string, csv: string) {
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
