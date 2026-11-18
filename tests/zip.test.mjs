import assert from "node:assert/strict";
import test from "node:test";
import { buildZip, crc32 } from "../extension/shared/zip.mjs";

function readStoreZip(bytes) {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let eocd = -1;
  for (let i = bytes.length - 22; i >= 0; i--) {
    if (dv.getUint32(i, true) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  assert.notEqual(eocd, -1, "EOCD not found");

  const count = dv.getUint16(eocd + 10, true);
  const cdSize = dv.getUint32(eocd + 12, true);
  const cdOffset = dv.getUint32(eocd + 16, true);
  assert.equal(cdOffset + cdSize, eocd);

  const decoder = new TextDecoder();
  const result = [];
  let p = cdOffset;
  for (let n = 0; n < count; n++) {
    assert.equal(dv.getUint32(p, true), 0x02014b50);
    const method = dv.getUint16(p + 10, true);
    const flags = dv.getUint16(p + 8, true);
    const csize = dv.getUint32(p + 20, true);
    const usize = dv.getUint32(p + 24, true);
    const nameLen = dv.getUint16(p + 28, true);
    const extraLen = dv.getUint16(p + 30, true);
    const commentLen = dv.getUint16(p + 32, true);
    const localOffset = dv.getUint32(p + 42, true);
    const name = decoder.decode(bytes.subarray(p + 46, p + 46 + nameLen));

    assert.equal(dv.getUint32(localOffset, true), 0x04034b50);
    const localNameLen = dv.getUint16(localOffset + 26, true);
    const localExtraLen = dv.getUint16(localOffset + 28, true);
    const dataStart = localOffset + 30 + localNameLen + localExtraLen;
    const data = bytes.subarray(dataStart, dataStart + csize);

    assert.equal(method, 0);
    assert.equal(flags, 0x0800);
    assert.equal(csize, usize);
    result.push({ name, data: decoder.decode(data) });
    p += 46 + nameLen + extraLen + commentLen;
  }
  return result;
}

test("crc32 matches the standard hello vector", () => {
  assert.equal(crc32(new TextEncoder().encode("hello")), 0x3610a686);
});

test("buildZip writes UTF-8 store entries without data descriptors", () => {
  const fixed = new Date(2026, 10, 18, 10, 0, 0);
  const bytes = buildZip([
    { name: "index.md", data: "# 索引\n\n- 会话 A\n" },
    { name: "conversations/中文 会话.md", data: "## 标题\n\n正文 🙂\n" },
    { name: "export.json", data: JSON.stringify({ hello: "world", n: 3 }) },
  ], fixed);

  assert.equal(new TextDecoder().decode(bytes.subarray(0, 4)), "PK\x03\x04");
  const entries = readStoreZip(bytes);
  assert.deepEqual(entries.map((e) => e.name), [
    "index.md",
    "conversations/中文 会话.md",
    "export.json",
  ]);
  assert.equal(entries[0].data, "# 索引\n\n- 会话 A\n");
  assert.equal(entries[1].data, "## 标题\n\n正文 🙂\n");
});
