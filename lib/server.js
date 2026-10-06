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
  naufal: { name: "Maz-Naufal", hash: "34c135e6c40d3aa577aca9087576d7edeac437776628ed5feb4a61d14a634ad2" },
  afifah: { name: "Mbak Afifah", hash: "3e17b9881b494f32219cd940b28390114f5818b1363578db9b3e28a6877636bd" },
  desti:  { name: "Mbak Desti",  hash: "6fcadb8de83649754d630946bb1e12e9ce0b0b39613351dd39133fe409baef4e" }
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
