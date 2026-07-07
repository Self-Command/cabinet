import { test } from "node:test";
import assert from "node:assert/strict";
import * as XLSX from "xlsx";
import { xlsxWorkbookToUniverData } from "@/lib/office/xlsx-to-univer";

test("converts an xlsx workbook into a Univer workbook snapshot", () => {
  const workbook = XLSX.utils.book_new();
  const sheet = XLSX.utils.aoa_to_sheet([
    ["Name", "Score"],
    ["Ada", 98],
  ]);
  sheet["!merges"] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 1 } }];
  XLSX.utils.book_append_sheet(workbook, sheet, "Grades");

  const result = xlsxWorkbookToUniverData(XLSX, workbook, "test.xlsx");
  const firstSheet = result.sheets[result.sheetOrder[0]];

  assert.equal(result.name, "test.xlsx");
  assert.equal(firstSheet.name, "Grades");
  assert.equal(firstSheet.cellData![0][0].v, "Name");
  assert.equal(firstSheet.cellData![1][1].v, 98);
  assert.deepEqual(firstSheet.mergeData![0], {
    startRow: 0,
    endRow: 0,
    startColumn: 0,
    endColumn: 1,
  });
});
