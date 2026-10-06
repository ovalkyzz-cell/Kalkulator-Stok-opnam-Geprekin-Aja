/* Riwayat per akun crew — disimpan di Vercel Blob (private) */
const {
  ACCESS, PREFIX_RIWAYAT, MAX_BODY, safeId,
  readJson, writeJson, removeBlobs, auth, ownPath
} = require("../lib/server.js");
const crypto = require("crypto");

const INDEX_MAX = 100;

function indexPath(crew) {
  return PREFIX_RIWAYAT + crew + "/_index.json";
}

async function readIndex(crew) {
  try {
    const idx = await readJson(indexPath(crew));
    return Array.isArray(idx) ? idx : [];
  } catch (e) {
    return [];
  }
}

async function writeIndex(crew, idx) {
  await writeJson(indexPath(crew), idx.slice(0, INDEX_MAX));
}

function bad(res, code, msg) {
  res.status(code).json({ error: msg });
}

module.exports = async (req, res) => {
  try {
    const user = await auth(req);
    if (!user) {
      bad(res, 401, "Sesi tidak valid, silakan login ulang");
      return;
    }

    /* ---- LIST ---- */
    if (req.method === "GET" && !req.query.id) {
      const idx = await readIndex(user.crew);
      res.status(200).json({ ok: true, name: user.name, crew: user.crew, items: idx });
      return;
    }

    /* ---- DETAIL ---- */
    if (req.method === "GET" && req.query.id) {
      const id = String(req.query.id);
      if (!safeId(id)) { bad(res, 400, "ID tidak valid"); return; }
      const rec = await readJson(ownPath(user.crew, id));
      if (!rec) { bad(res, 404, "Riwayat tidak ditemukan"); return; }
      res.status(200).json({ ok: true, record: rec });
      return;
    }

    /* ---- SIMPAN ---- */
    if (req.method === "POST") {
      const body = req.body || {};
      if (JSON.stringify(body).length > MAX_BODY) { bad(res, 413, "Data terlalu besar"); return; }
      const items = Array.isArray(body.items) ? body.items.slice(0, 60) : null;
      if (!items) { bad(res, 400, "Data riwayat tidak lengkap"); return; }

      const now = Date.now();
      const id = "r-" + now + "-" + crypto.randomBytes(3).toString("hex");
      const rec = {
        id: id,
        crew: user.crew,
        name: user.name,
        ts: now,
        title: String(body.title || ("Opnam " + new Date(now).toLocaleString("id-ID"))).slice(0, 80),
        ok: Number(body.ok) || 0,
        minus: Number(body.minus) || 0,
        rekap: Array.isArray(body.rekap) ? body.rekap.slice(0, 20) : [],
        items: items.map(it => ({
          id: Number(it.id) || 0,
          name: String(it.name || "").slice(0, 60),
          cat: String(it.cat || "").slice(0, 20),
          stok: String(it.stok || "").slice(0, 60),
          pakai: String(it.pakai || "").slice(0, 60),
          sisa: String(it.sisa || "").slice(0, 60),
          minus: !!it.minus,
          vals: Array.isArray(it.vals) && Array.isArray(it.vals.s) && Array.isArray(it.vals.p)
            ? { s: it.vals.s.slice(0, 6).map(v => String(v).slice(0, 12)),
                p: it.vals.p.slice(0, 6).map(v => String(v).slice(0, 12)) }
            : null
        }))
      };

      await writeJson(ownPath(user.crew, id), rec);

      const idx = await readIndex(user.crew);
      idx.unshift({
        id: id, ts: now, title: rec.title, ok: rec.ok, minus: rec.minus,
        total: rec.items.length, by: user.name
      });

      /* buang record paling lama bila melebihi batas */
      const pruned = idx.splice(INDEX_MAX);
      await writeIndex(user.crew, idx);
      if (pruned.length) {
        try { await removeBlobs(pruned.map(p => ownPath(user.crew, p.id))); } catch (e) {}
      }

      res.status(200).json({ ok: true, id: id, ts: now, count: idx.length });
      return;
    }

    /* ---- HAPUS ---- */
    if (req.method === "DELETE" && req.query.id) {
      const id = String(req.query.id);
      if (!safeId(id)) { bad(res, 400, "ID tidak valid"); return; }
      const rec = await readJson(ownPath(user.crew, id));
      if (!rec) { bad(res, 404, "Riwayat tidak ditemukan"); return; }
      await removeBlobs([ownPath(user.crew, id)]);
      const idx = await readIndex(user.crew);
      await writeIndex(user.crew, idx.filter(x => x.id !== id));
      res.status(200).json({ ok: true, deleted: id });
      return;
    }

    bad(res, 405, "Method tidak diizinkan");
  } catch (e) {
    bad(res, 500, "Kesalahan server riwayat");
  }
};
