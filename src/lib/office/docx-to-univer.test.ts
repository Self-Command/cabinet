import { test } from "node:test";
import assert from "node:assert/strict";
import JSZip from "jszip";
import { docxBufferToUniverDocData } from "@/lib/office/docx-to-univer";

test("converts docx document.xml paragraphs into a Univer document snapshot", async () => {
  const zip = new JSZip();
  zip.file(
    "word/document.xml",
    `<?xml version="1.0" encoding="UTF-8"?>
    <w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
      <w:body>
        <w:p><w:r><w:t>Hello</w:t></w:r></w:p>
        <w:p><w:r><w:t>World</w:t></w:r></w:p>
      </w:body>
    </w:document>`
  );

  const buffer = await zip.generateAsync({ type: "arraybuffer" });
  const result = await docxBufferToUniverDocData(JSZip, buffer, "demo.docx");

  assert.equal(result.title, "demo.docx");
  assert.equal(result.body?.dataStream, "Hello\rWorld\r\0");
  assert.equal(result.body?.paragraphs?.length, 2);
});
