import type { WorkBook, WorkSheet } from "xlsx";
import type { ICellData, IWorkbookData, IWorksheetData } from "@univerjs/core";

export type UniverWorkbookData = IWorkbookData;

function safeSheetId(index: number): string {
  return `sheet-${index + 1}`;
}

function getCellValue(cell: { v?: unknown; w?: string; t?: string }): ICellData["v"] {
  if (cell.v == null) return null;
  if (cell.t === "n" && typeof cell.v === "number") return cell.v;
  if (cell.t === "b") return Boolean(cell.v);
  if (cell.t === "d") return cell.v instanceof Date ? cell.v.toISOString() : String(cell.v);
  return typeof cell.v === "string" || typeof cell.v === "number" || typeof cell.v === "boolean"
    ? cell.v
    : cell.w ?? String(cell.v);
}

function worksheetToUniver(
  XLSX: typeof import("xlsx"),
  sheet: WorkSheet,
  name: string,
  index: number
): IWorksheetData {
  const range = XLSX.utils.decode_range(sheet["!ref"] || "A1");
  const rowCount = Math.max(range.e.r + 1, 30);
  const columnCount = Math.max(range.e.c + 1, 10);
  const cellData: IWorksheetData["cellData"] = {};

  for (const address of Object.keys(sheet)) {
    if (address.startsWith("!")) continue;
    const decoded = XLSX.utils.decode_cell(address);
    const cell = sheet[address] as { v?: unknown; w?: string; t?: string; f?: string };
    const value = getCellValue(cell);
    if (value == null && !cell.f) continue;
    cellData[decoded.r] ??= {};
    cellData[decoded.r][decoded.c] = {
      ...(value != null ? { v: value } : {}),
      ...(cell.f ? { f: cell.f.startsWith("=") ? cell.f.slice(1) : cell.f } : {}),
    };
  }

  const mergeData: IWorksheetData["mergeData"] = (sheet["!merges"] ?? []).map((merge) => ({
    startRow: merge.s.r,
    endRow: merge.e.r,
    startColumn: merge.s.c,
    endColumn: merge.e.c,
  }));

  return {
    id: safeSheetId(index),
    name,
    tabColor: "",
    hidden: 0,
    rowCount,
    columnCount,
    zoomRatio: 1,
    freeze: { startRow: -1, startColumn: -1, ySplit: 0, xSplit: 0 },
    scrollTop: 0,
    scrollLeft: 0,
    defaultColumnWidth: 88,
    defaultRowHeight: 24,
    mergeData,
    cellData,
    rowData: {},
    columnData: {},
    showGridlines: 1,
    rowHeader: { width: 46, hidden: 0 },
    columnHeader: { height: 20, hidden: 0 },
    rightToLeft: 0,
  };
}

export function xlsxWorkbookToUniverData(
  XLSX: typeof import("xlsx"),
  workbook: WorkBook,
  name: string
): UniverWorkbookData {
  const sheetOrder: string[] = [];
  const sheets: IWorkbookData["sheets"] = {};

  workbook.SheetNames.forEach((sheetName, index) => {
    const sheet = workbook.Sheets[sheetName];
    if (!sheet) return;
    const sheetData = worksheetToUniver(XLSX, sheet, sheetName, index);
    sheetOrder.push(sheetData.id);
    sheets[sheetData.id] = sheetData;
  });

  if (sheetOrder.length === 0) {
    const emptySheet = worksheetToUniver(XLSX, {}, "Sheet1", 0);
    sheetOrder.push(emptySheet.id);
    sheets[emptySheet.id] = emptySheet;
  }

  return {
    id: `cabinet-univer-${Date.now()}`,
    name,
    appVersion: "0.10.2",
    locale: "enUS" as IWorkbookData["locale"],
    styles: {},
    sheetOrder,
    sheets,
  };
}
