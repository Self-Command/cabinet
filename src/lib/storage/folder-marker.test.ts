import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { TreeNode } from "@/types";

let tempRoot: string;
let pageIo: typeof import("./page-io");
let treeBuilder: typeof import("./tree-builder");
let marker: typeof import("./folder-marker");

const exists = (p: string) => fs.access(p).then(() => true, () => false);

function findNode(nodes: TreeNode[], targetPath: string): TreeNode | null {
  for (const node of nodes) {
    if (node.path === targetPath) return node;
    const child = node.children ? findNode(node.children, targetPath) : null;
    if (child) return child;
  }
  return null;
}

before(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "cabinet-folder-marker-"));
  process.env.CABINET_DATA_DIR = tempRoot;
  pageIo = await import("./page-io");
  treeBuilder = await import("./tree-builder");
  marker = await import("./folder-marker");
});

after(async () => {
  if (tempRoot) await fs.rm(tempRoot, { recursive: true, force: true });
});

test("createPage marks explicit folders without changing the index.md page shape", async () => {
  await pageIo.createPage("收件箱", "收件箱");
  await pageIo.createPage("收件箱/测试文件夹", "测试文件夹", { folder: true });

  const folderDir = path.join(tempRoot, "收件箱", "测试文件夹");
  assert.equal(await exists(path.join(folderDir, "index.md")), true);
  assert.equal(await exists(path.join(folderDir, marker.FOLDER_MARKER_FILE)), true);

  const page = await pageIo.readPage("收件箱/测试文件夹");
  assert.equal(page.frontmatter.title, "测试文件夹");

  const tree = await treeBuilder.buildTree(false, true);
  const folderNode = findNode(tree, "收件箱/测试文件夹");
  assert.equal(folderNode?.type, "directory");
  assert.equal(folderNode?.isFolder, true);
  assert.equal(folderNode?.children?.length ?? 0, 0);
});

test("ordinary pages are not marked as folders", async () => {
  await pageIo.createPage("收件箱/普通页面", "普通页面");

  const pageDir = path.join(tempRoot, "收件箱", "普通页面");
  assert.equal(await exists(path.join(pageDir, "index.md")), true);
  assert.equal(await exists(path.join(pageDir, marker.FOLDER_MARKER_FILE)), false);

  const tree = await treeBuilder.buildTree(false, true);
  const pageNode = findNode(tree, "收件箱/普通页面");
  assert.equal(pageNode?.type, "directory");
  assert.equal(pageNode?.isFolder, undefined);
  assert.equal(pageNode?.children?.length ?? 0, 0);
});

test("folder marker stays hidden even when hidden entries are shown", async () => {
  const tree = await treeBuilder.buildTree(true, true);
  assert.equal(findNode(tree, `收件箱/测试文件夹/${marker.FOLDER_MARKER_FILE}`), null);
});
