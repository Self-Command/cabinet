import { test } from "node:test";
import assert from "node:assert/strict";
import { isOleCompoundBuffer, isZipBuffer } from "@/lib/office/browser-file";

test("detects OOXML zip buffers and rejects legacy OLE Word buffers", () => {
  assert.equal(isZipBuffer(new Uint8Array([0x50, 0x4b, 0x03, 0x04]).buffer), true);
  assert.equal(isZipBuffer(new Uint8Array([0xd0, 0xcf, 0x11, 0xe0]).buffer), false);
});

test("detects legacy OLE compound Office buffers", () => {
  assert.equal(
    isOleCompoundBuffer(
      new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]).buffer
    ),
    true
  );
  assert.equal(isOleCompoundBuffer(new Uint8Array([0x50, 0x4b, 0x03, 0x04]).buffer), false);
});
