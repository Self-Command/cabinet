import { test } from "node:test";
import assert from "node:assert/strict";
import {
  isPathLikeWikiTarget,
  markdownPageTargetCandidates,
  markdownPageTargetSlug,
  normalizeMarkdownPageTarget,
  wikiLinkHrefForPageName,
} from "@/lib/markdown/internal-link-target";
import { markdownToHtml } from "@/lib/markdown/to-html";

test("normalizes markdown page targets to Cabinet tree paths", () => {
  assert.equal(normalizeMarkdownPageTarget("收件箱/index.md"), "收件箱");
  assert.equal(normalizeMarkdownPageTarget("/收件箱/index.md"), "收件箱");
  assert.equal(normalizeMarkdownPageTarget("link-test/index.md"), "link-test");
  assert.equal(normalizeMarkdownPageTarget("/link-test/index.md"), "link-test");
  assert.equal(
    normalizeMarkdownPageTarget("link-test/中文文件.md"),
    "link-test/中文文件"
  );
  assert.equal(
    normalizeMarkdownPageTarget("/link-test/%E4%B8%AD%E6%96%87%E6%96%87%E4%BB%B6.md"),
    "link-test/中文文件"
  );
  assert.equal(
    normalizeMarkdownPageTarget("link-test/test-file.md"),
    "link-test/test-file"
  );
  assert.equal(normalizeMarkdownPageTarget("link-test/"), "link-test");
});

test("offers current folder candidates for relative page links", () => {
  assert.deepEqual(markdownPageTargetCandidates("child.md", "收件箱"), [
    "child",
    "收件箱/child",
  ]);
  assert.deepEqual(markdownPageTargetCandidates("child.md", "收件箱/current"), [
    "child",
    "收件箱/child",
    "收件箱/current/child",
  ]);
  assert.deepEqual(markdownPageTargetCandidates("/child.md", "收件箱"), ["child"]);
});

test("uses final path segment for slug fallback", () => {
  assert.equal(markdownPageTargetSlug("收件箱/index.md"), "收件箱");
  assert.equal(markdownPageTargetSlug("link-test/中文文件.md"), "中文文件");
});

test("detects wiki links that should resolve as paths", () => {
  assert.equal(isPathLikeWikiTarget("收件箱"), false);
  assert.equal(isPathLikeWikiTarget("收件箱/index.md"), true);
  assert.equal(isPathLikeWikiTarget("中文文件.md"), true);
});

test("builds wiki-link hrefs from the shared resolver", () => {
  assert.equal(wikiLinkHrefForPageName("收件箱"), "#page:收件箱");
  assert.equal(
    wikiLinkHrefForPageName("收件箱/index.md"),
    "#page-path:%E6%94%B6%E4%BB%B6%E7%AE%B1%2Findex.md"
  );
  assert.equal(
    wikiLinkHrefForPageName("link-test/test-file.md"),
    "#page-path:link-test%2Ftest-file.md"
  );
});

test("renders path-style wiki links with a path resolver href", async () => {
  const html = await markdownToHtml(
    "[[收件箱/index.md]]\n\n[[link-test/test-file.md]]\n\n[[收件箱]]"
  );
  assert.match(html, /href="#page-path:%E6%94%B6%E4%BB%B6%E7%AE%B1%2Findex\.md"/);
  assert.match(html, /href="#page-path:link-test%2Ftest-file\.md"/);
  assert.match(html, /href="#page:收件箱"/);
});
