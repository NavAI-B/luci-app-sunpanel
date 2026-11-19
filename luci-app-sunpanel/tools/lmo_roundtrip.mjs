import fs from "node:fs";

function sfhHash(bytes, len, init) {
  let hash = init >>> 0, tmp;
  const rem = len & 3;
  let p = 0, l = len >> 2;
  const g16 = (i) => (bytes[i] | (bytes[i + 1] << 8));
  const s8 = (i) => (bytes[i] << 24 >> 24);
  const u = (x) => x >>> 0;
  for (; l > 0; l--) {
    hash = u(hash + g16(p));
    tmp = u(u(g16(p + 2) << 11) ^ hash);
    hash = u(u(hash << 16) ^ tmp);
    p += 4;
    hash = u(hash + (hash >>> 11));
  }
  switch (rem) {
    case 3: hash = u(hash + g16(p)); hash = u(hash ^ u(hash << 16)); hash = u(hash ^ u(s8(p+2) * 262144)); hash = u(hash + (hash >>> 11)); break;
    case 2: hash = u(hash + g16(p)); hash = u(hash ^ u(hash << 11)); hash = u(hash + (hash >>> 17)); break;
    case 1: hash = u(hash + s8(p)); hash = u(hash ^ u(hash << 10)); hash = u(hash + (hash >>> 1)); break;
  }
  hash = u(hash ^ u(hash << 3)); hash = u(hash + (hash >>> 5)); hash = u(hash ^ u(hash << 4));
  hash = u(hash + (hash >>> 17)); hash = u(hash ^ u(hash << 25)); hash = u(hash + (hash >>> 6));
  return hash >>> 0;
}
const isspace = (c) => c === 0x20 || (c >= 0x09 && c <= 0x0d);
function canonHash(str) {
  const b = Buffer.from(str, "utf8");
  const res = [];
  let prev = 0x20;
  for (const c of b) {
    if (isspace(c)) { if (!isspace(prev)) res.push(0x20); } else res.push(c);
    prev = c;
  }
  while (res.length && isspace(res[res.length - 1])) res.pop();
  return sfhHash(res, res.length, res.length);
}

// read pairs from po
const po = fs.readFileSync("luci-app-sunpanel/po/en/sunpanel.po", "utf8");
const pairs = [];
let cur = null;
for (const raw of po.split("\n")) {
  const line = raw.trim();
  let m;
  if ((m = line.match(/^msgid "(.*)"$/))) cur = { id: m[1], str: null };
  else if ((m = line.match(/^msgstr "(.*)"$/)) && cur) { cur.str = m[1]; if (cur.id !== "") pairs.push(cur); cur = null; }
}

// parse lmo
const buf = fs.readFileSync("luci-app-sunpanel/po_build/sunpanel.en.lmo");
const blobSize = buf.readUInt32BE(buf.length - 4);
const count = (buf.length - blobSize - 4) / 16;
const entries = [];
for (let i = 0; i < count; i++) {
  const o = blobSize + i * 16;
  entries.push({ key: buf.readUInt32BE(o), off: buf.readUInt32BE(o + 8), len: buf.readUInt32BE(o + 12) });
}
let ok = 0, miss = 0, badval = 0;
for (const p of pairs) {
  if (!p.str) continue;
  const h = canonHash(p.id);
  const e = entries.find(x => x.key === h);
  if (!e) { miss++; console.log("MISS:", JSON.stringify(p.id.slice(0, 40))); continue; }
  const got = buf.slice(e.off, e.off + e.len).toString("utf8");
  if (got !== p.str) { badval++; console.log("VAL MISMATCH:", JSON.stringify(p.id.slice(0, 30)), "expected", JSON.stringify(p.str.slice(0, 30)), "got", JSON.stringify(got.slice(0, 30))); }
  else ok++;
}
console.log(`pairs: ${pairs.length - 1} (excl header), lookup ok: ${ok}, missing: ${miss}, badvalue: ${badval}, lmo entries: ${count}`);
