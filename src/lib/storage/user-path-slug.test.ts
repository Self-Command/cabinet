import { test } from "node:test";
import assert from "node:assert/strict";
import {
  sanitizeUserFileBaseName,
  sanitizeUserFileExtension,
  slugifyUserPathSegment,
} from "@/lib/storage/user-path-slug";

test("slugifyUserPathSegment preserves unicode letters and numbers", () => {
  assert.equal(slugifyUserPathSegment("生活领域"), "生活领域");
  assert.equal(slugifyUserPathSegment("个人 财务"), "个人-财务");
  assert.equal(slugifyUserPathSegment("2026数学建模竞赛"), "2026数学建模竞赛");
  assert.equal(slugifyUserPathSegment("My Room!"), "my-room");
});

test("slugifyUserPathSegment rejects empty or unsafe-only names", () => {
  assert.equal(slugifyUserPathSegment("../"), "");
  assert.equal(slugifyUserPathSegment("😀✨"), "");
  assert.equal(slugifyUserPathSegment("---"), "");
});

test("slugifyUserPathSegment neutralizes path separators", () => {
  assert.equal(slugifyUserPathSegment("生活/个人财务"), "生活-个人财务");
  assert.equal(slugifyUserPathSegment("foo\\bar"), "foo-bar");
});

test("sanitizeUserFileBaseName preserves unicode flat file names", () => {
  assert.equal(sanitizeUserFileBaseName("数据清洗"), "数据清洗");
  assert.equal(sanitizeUserFileBaseName("个人 财务"), "个人 财务");
  assert.equal(sanitizeUserFileBaseName("My Report"), "My Report");
  assert.equal(sanitizeUserFileBaseName("流程图😀"), "流程图");
});

test("sanitizeUserFileBaseName can dash spaces for uploaded file names", () => {
  assert.equal(
    sanitizeUserFileBaseName("个人 财务", { preserveSpaces: false }),
    "个人-财务"
  );
});

test("sanitizeUserFileExtension keeps safe lowercase extensions", () => {
  assert.equal(sanitizeUserFileExtension("TS", ".txt"), ".ts");
  assert.equal(sanitizeUserFileExtension(".XLSX", ".txt"), ".xlsx");
  assert.equal(sanitizeUserFileExtension("..", ".txt"), ".txt");
});
