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

test("markdown bare relative image URLs may include spaces and Chinese filenames", async () => {
  const html = await markdownToHtml(
    "![x](assets/github \u5feb\u901fpush\u6307\u5357/\u590d\u5236 GitHub \u4ed3\u5e93\u94fe\u63a5.webp)",
    pagePath
  );
  assert.match(html, /<img /);
  assert.ok(
    html.includes(
      'src="/api/assets/%E6%94%B6%E4%BB%B6%E7%AE%B1/%E9%A1%B5%E9%9D%A2/assets/github%20%E5%BF%AB%E9%80%9Fpush%E6%8C%87%E5%8D%97/%E5%A4%8D%E5%88%B6%20GitHub%20%E4%BB%93%E5%BA%93%E9%93%BE%E6%8E%A5.webp"'
    )
  );
});

test("markdown angle-bracket image URLs with spaces remain supported", async () => {
  const html = await markdownToHtml(
    "![x](<assets/github \u5feb\u901fpush\u6307\u5357/IMG-20260423214446955.webp>)",
    pagePath
  );
  assert.match(html, /<img /);
  assert.ok(
    html.includes(
      'src="/api/assets/%E6%94%B6%E4%BB%B6%E7%AE%B1/%E9%A1%B5%E9%9D%A2/assets/github%20%E5%BF%AB%E9%80%9Fpush%E6%8C%87%E5%8D%97/IMG-20260423214446955.webp"'
    )
  );
});

test("markdown non-image links with spaces are left for the link resolver", async () => {
  const html = await markdownToHtml(
    "[x](assets/github \u5feb\u901fpush\u6307\u5357/page.md)",
    pagePath
  );
  assert.doesNotMatch(html, /<img /);
  assert.doesNotMatch(html, /\/api\/assets\//);
});
