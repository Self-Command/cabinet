import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

let tempRoot: string;
let mod: typeof import("./page-io");

const exists = (p: string) => fs.access(p).then(() => true, () => false);

before(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "cabinet-page-delete-"));
  process.env.CABINET_DATA_DIR = tempRoot;
  mod = await import("./page-io");
});

after(async () => {
  if (tempRoot) await fs.rm(tempRoot, { recursive: true, force: true });
});

test("deletePage removes a directory page with index.md", async () => {
  const pageDir = path.join(tempRoot, "项目页面");
  await fs.mkdir(pageDir, { recursive: true });
  await fs.writeFile(path.join(pageDir, "index.md"), "# 项目页面\n");

  await mod.deletePage("项目页面");

  assert.equal(await exists(pageDir), false);
});

test("deletePage removes a standalone markdown page addressed without .md", async () => {
  const pageFile = path.join(tempRoot, "AI文件整理快速决策指南.md");
  await fs.writeFile(pageFile, "# AI文件整理快速决策指南\n");

  await mod.deletePage("AI文件整理快速决策指南");

  assert.equal(await exists(pageFile), false);
});

test("deletePage removes an English standalone markdown page addressed without .md", async () => {
  const pageFile = path.join(tempRoot, "agent-note.md");
  await fs.writeFile(pageFile, "# Agent note\n");

  await mod.deletePage("agent-note");

  assert.equal(await exists(pageFile), false);
});

test("deletePage removes a regular folder and all children", async () => {
  const folder = path.join(tempRoot, "AI生成文件夹");
  await fs.mkdir(path.join(folder, "子目录"), { recursive: true });
  await fs.writeFile(path.join(folder, "子目录", "内容.md"), "# 内容\n");

  await mod.deletePage("AI生成文件夹");

  assert.equal(await exists(folder), false);
});

test("deletePage removes visible non-markdown files by exact virtual path", async () => {
  const files = [
    "脚本.ts",
    "数据.csv",
    "流程.mermaid",
    "文档.pdf",
    "图片.png",
    "配置.yaml",
  ];

  for (const file of files) {
    await fs.writeFile(path.join(tempRoot, file), "test");
    await mod.deletePage(file);
    assert.equal(await exists(path.join(tempRoot, file)), false, `${file} should be deleted`);
  }
});

test("deletePage throws when the virtual path does not exist", async () => {
  await assert.rejects(
    () => mod.deletePage("不存在的文件"),
    /Page not found: 不存在的文件/
  );
});
