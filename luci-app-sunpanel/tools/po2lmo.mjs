// po2lmo.mjs -- compile LuCI .po files into .lmo archives
// Faithful reimplementation of luci-base po2lmo.c + lib/lmo.c (sfh_hash,
// blob area + key-sorted 16-byte big-endian index + trailing blob size).
//
// Usage: node tools/po2lmo.mjs <input.po> <output.lmo>

import fs from 'node:fs';

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
    case 3:
      hash = u(hash + g16(p));
      hash = u(hash ^ u(hash << 16));
      hash = u(hash ^ u(s8(p + 2) * 262144));
      hash = u(hash + (hash >>> 11));
      break;
    case 2:
      hash = u(hash + g16(p));
      hash = u(hash ^ u(hash << 11));
      hash = u(hash + (hash >>> 17));
      break;
    case 1:
      hash = u(hash + s8(p));
      hash = u(hash ^ u(hash << 10));
      hash = u(hash + (hash >>> 1));
      break;
  }
  hash = u(hash ^ u(hash << 3));
  hash = u(hash + (hash >>> 5));
  hash = u(hash ^ u(hash << 4));
  hash = u(hash + (hash >>> 17));
  hash = u(hash ^ u(hash << 25));
  hash = u(hash + (hash >>> 6));
  return hash >>> 0;
}

// --- minimal PO parser (msgctxt / msgid / msgid_plural / msgstr[..]) ---
function parsePo(text) {
  const entries = [];
  let cur = null;
  let field = null; // 'ctxt' | 'id' | 'idp' | {plural index}
  const unesc = (s) => s
    .replace(/\\n/g, '\n').replace(/\\t/g, '\t')
    .replace(/\\"/g, '"').replace(/\\\\/g, '\\');
  const grab = (line) => {
    const m = line.match(/^"(?:.*)$/);
    return line.replace(/^\s*"(.*)"\s*$/, '$1');
  };
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (line.startsWith('#') || line === '') continue;
    let m;
    if ((m = line.match(/^msgctxt\s+"(.*)"\s*$/))) {
      if (cur && (cur.id != null || cur.strs[0] != null)) entries.push(cur);
      cur = { ctxt: '', id: null, idp: null, strs: {}, pluralNum: -1 };
      field = 'ctxt'; cur.ctxt += unesc(m[1]);
    } else if ((m = line.match(/^msgid_plural\s+"(.*)"\s*$/))) {
      if (!cur) cur = { ctxt: null, id: null, idp: null, strs: {}, pluralNum: -1 };
      field = 'idp'; cur.idp = unesc(m[1]);
    } else if ((m = line.match(/^msgid\s+"(.*)"\s*$/))) {
      if (cur && (cur.id != null || cur.strs[0] != null)) entries.push(cur);
      cur = { ctxt: null, id: null, idp: null, strs: {}, pluralNum: -1 };
      field = 'id'; cur.id = unesc(m[1]);
    } else if ((m = line.match(/^msgstr\[(\d+)\]\s+"(.*)"\s*$/))) {
      if (!cur) continue;
      const n = parseInt(m[1], 10);
      field = n; cur.strs[n] = unesc(m[2]);
      if (n > cur.pluralNum) cur.pluralNum = n;
    } else if ((m = line.match(/^msgstr\s+"(.*)"\s*$/))) {
      if (!cur) continue;
      field = 0; cur.strs[0] = unesc(m[1]);
      if (cur.pluralNum < 0) cur.pluralNum = 0;
    } else if ((m = line.match(/^"(.*)"\s*$/))) {
      // continuation of the current field
      const piece = unesc(m[1]);
      if (field === 'ctxt' && cur) cur.ctxt += piece;
      else if (field === 'id' && cur) cur.id = (cur.id ?? '') + piece;
      else if (field === 'idp' && cur) cur.idp = (cur.idp ?? '') + piece;
      else if (typeof field === 'number' && cur) cur.strs[field] = (cur.strs[field] ?? '') + piece;
    }
  }
  if (cur && (cur.id != null || cur.strs[0] != null)) entries.push(cur);
  return entries;
}

function compile(poText) {
  const entries = parsePo(poText);
  const out = [];
  let offset = 0;
  let nEntries = 0;
  const index = [];

  for (const e of entries) {
    // header entry: msgid "" -> extract "Plural-Forms: ..." line from msgstr[0]
    if (e.id === '' && e.strs[0] != null) {
      const m = e.strs[0].match(/Plural-Forms:\s*(.+?)(?:\\n|$)/);
      if (m) {
        const val = m[1].replace(/\\n$/, '');
        const b = Buffer.from(val, 'utf8');
        out.push(b);
        const padded = b.length + ((4 - (b.length % 4)) % 4);
        out.push(Buffer.alloc(padded - b.length, 0));
        index.push({ key: 0, val: 0, offset, length: b.length });
        offset += padded;
        nEntries++;
      }
      continue;
    }
    const vals = [];
    for (let i = 0; i <= e.pluralNum; i++) {
      if (e.strs[i] == null) continue;
      vals.push([i, e.strs[i]]);
    }
    for (const [pluralIdx, val] of vals) {
      let keyStr;
      if (e.ctxt && e.idp != null) keyStr = `${e.ctxt}\u0001${e.id}\u0002${pluralIdx}`;
      else if (e.ctxt) keyStr = `${e.ctxt}\u0001${e.id}`;
      else if (e.idp != null) keyStr = `${e.id}\u0002${pluralIdx}`;
      else keyStr = e.id;

      const kb = Buffer.from(keyStr, 'utf8');
      const keyId = sfhHash(kb, kb.length, kb.length);
      const vb = Buffer.from(val, 'utf8');
      const valId = sfhHash(vb, vb.length, vb.length);

      if (keyId === valId) continue; // po2lmo skips identity translations

      const b = Buffer.from(val, 'utf8');
      const padded = b.length + ((4 - (b.length % 4)) % 4);
      index.push({ key: keyId, val: e.pluralNum + 1, offset, length: b.length });
      out.push(b);
      out.push(Buffer.alloc(padded - b.length, 0));
      offset += padded;
      nEntries++;
    }
  }

  index.sort((a, b) => (a.key - b.key) || 0);
  const parts = [Buffer.concat(out)];
  for (const e of index) {
    const rec = Buffer.alloc(16);
    rec.writeUInt32BE(e.key, 0);
    rec.writeUInt32BE(e.val, 4);
    rec.writeUInt32BE(e.offset, 8);
    rec.writeUInt32BE(e.length, 12);
    parts.push(rec);
  }
  const tail = Buffer.alloc(4);
  tail.writeUInt32BE(offset, 0);
  parts.push(tail);
  return Buffer.concat(parts);
}

const [, , inPath, outPath] = process.argv;
if (!inPath || !outPath) {
  console.error('usage: node po2lmo.mjs <input.po> <output.lmo>');
  process.exit(2);
}
const buf = compile(fs.readFileSync(inPath, 'utf8'));
if (buf.length === 4) {
  console.error('no translatable entries; not writing ' + outPath);
  process.exit(1);
}
fs.writeFileSync(outPath, buf);
console.log(`wrote ${outPath} (${buf.length} bytes)`);
