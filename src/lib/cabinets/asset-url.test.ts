import { test } from "node:test";
import assert from "node:assert/strict";
import { assetUrlFor, assetUrlForPossiblyEncodedPath } from "@/lib/cabinets/asset-url";

test("assetUrlFor encodes each virtual path segment", () => {
  assert.equal(
    assetUrlFor("\u6536\u4ef6\u7bb1/\u9875\u9762/\u56fe\u7247/\u6d4b\u8bd5.png"),
    "/api/assets/%E6%94%B6%E4%BB%B6%E7%AE%B1/%E9%A1%B5%E9%9D%A2/%E5%9B%BE%E7%89%87/%E6%B5%8B%E8%AF%95.png"
  );
  assert.equal(assetUrlFor("images/test.png"), "/api/assets/images/test.png");
});

test("assetUrlForPossiblyEncodedPath accepts encoded markdown asset segments", () => {
  assert.equal(
    assetUrlForPossiblyEncodedPath(
      "\u6536\u4ef6\u7bb1/\u9875\u9762/%E5%9B%BE%E7%89%87/%E6%B5%8B%E8%AF%95.png"
    ),
    "/api/assets/%E6%94%B6%E4%BB%B6%E7%AE%B1/%E9%A1%B5%E9%9D%A2/%E5%9B%BE%E7%89%87/%E6%B5%8B%E8%AF%95.png"
  );
});
