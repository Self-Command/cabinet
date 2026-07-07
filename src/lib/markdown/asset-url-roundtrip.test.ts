import { test } from "node:test";
import assert from "node:assert/strict";
import { markdownToHtml } from "@/lib/markdown/to-html";

const pagePath = "\u6536\u4ef6\u7bb1/\u9875\u9762";
const expected =
  'src="/api/assets/%E6%94%B6%E4%BB%B6%E7%AE%B1/%E9%A1%B5%E9%9D%A2/%E5%9B%BE%E7%89%87/%E6%B5%8B%E8%AF%95.png"';

test("markdown relative image URLs are encoded as asset URLs", async () => {
  const html = await markdownToHtml(
    "![x](\u56fe\u7247/\u6d4b\u8bd5.png)",
    pagePath
  );
  assert.match(html, /<img /);
  assert.ok(html.includes(expected));
});

test("markdown dot-relative image URLs with encoded segments are not double encoded", async () => {
  const html = await markdownToHtml(
    "![x](./%E5%9B%BE%E7%89%87/%E6%B5%8B%E8%AF%95.png)",
    pagePath
  );
  assert.match(html, /<img /);
  assert.ok(html.includes(expected));
  assert.doesNotMatch(html, /%25E5/);
});
