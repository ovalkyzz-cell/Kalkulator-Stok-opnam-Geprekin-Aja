/* Lib server: auth crew + akses database Vercel Blob (private store) */
const crypto = require("crypto");
const { put, get, list, del } = require("@vercel/blob");

const ACCESS = "private";
const PREFIX_RIWAYAT = "riwayat/";
const PREFIX_SESI = "sesi/";
const TOKEN_TTL = 7 * 24 * 60 * 60 * 1000; // 7 hari
const MAX_BODY = 300 * 1024; // 300 KB

/* Hash SHA-256 password crew (hanya tersimpan di sisi server) */
const CREW = {
  naufal: { name: "Maz-Naufal", hash: "48aeae72169ab8661f45c301a3949173242a17f3e3752685aa92639ff9cd2fe2" },
  afifah: { name: "Mbak Afifah", hash: "d9d88ab8c328d44f2262b33e210189621649cd133c70028b749b7255ed802f4c" },
  desti:  { name: "Mbak Desti", hash: "437abcd24c9b0a2da56f78a0e92094152baae1087904c7b15b7e4f27f89a4bc7" },
  anggiku:{ name: "Anggiku",     hash: "1a612fa7f80f4ce2647698c786e958382596da609a06329eb8f051039e12b5b6" }
};

function sha256hex(str) {
  return crypto.createHash("sha256").update(String(str), "utf8").digest("hex");
}

function newToken() {
  return "sk_" + crypto.randomBytes(24).toString("hex");
}

function safeId(id) {
  return typeof id === "string" && /^[A-Za-z0-9_-]{1,80}$/.test(id);
}

async function readJson(pathname) {
  const res = await get(pathname, { access: ACCESS, useCache: false });
  if (!res) return null;
  const text = await new Response(res.stream).text();
  try {
    return JSON.parse(text);
  } catch (e) {
    return null;
  }
}

async function writeJson(pathname, obj) {
  await put(pathname, JSON.stringify(obj), {
    access: ACCESS,
    contentType: "application/json",
    allowOverwrite: true
  });
}

async function removeBlobs(pathnames) {
  if (!pathnames.length) return;
  await del(pathnames, { access: ACCESS });
}

/* Verifikasi token sesi -> {crew,name} atau null */
async function auth(req) {
  const header = (req.headers && (req.headers.authorization || req.headers.Authorization)) || "";
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (!token || !/^[A-Za-z0-9_-]{10,120}$/.test(token)) return null;
  let ses;
  try {
    ses = await readJson(PREFIX_SESI + token + ".json");
  } catch (e) {
    return null;
  }
  if (!ses || !ses.crew || !CREW[ses.crew]) return null;
  if (!ses.exp || ses.exp < Date.now()) {
    try { await removeBlobs([PREFIX_SESI + token + ".json"]); } catch (e) {}
    return null;
  }
  return { token: token, crew: ses.crew, name: ses.name || CREW[ses.crew].name };
}

async function listOwn(crew, limit) {
  const res = await list({ prefix: PREFIX_RIWAYAT + crew + "/", access: ACCESS, limit: Math.min(limit || 50, 100) });
  const items = res.blobs
    .filter(b => b.pathname.endsWith(".json"))
    .map(b => ({
      id: b.pathname.split("/").pop().replace(/\.json$/, ""),
      size: b.size,
      uploadedAt: b.uploadedAt
    }));
  items.sort((a, b) => (a.uploadedAt < b.uploadedAt ? 1 : -1));
  return items;
}

function ownPath(crew, id) {
  return PREFIX_RIWAYAT + crew + "/" + id + ".json";
}

module.exports = {
  ACCESS, PREFIX_RIWAYAT, PREFIX_SESI, TOKEN_TTL, MAX_BODY, CREW,
  sha256hex, newToken, safeId, readJson, writeJson, removeBlobs,
  auth, listOwn, ownPath
};
