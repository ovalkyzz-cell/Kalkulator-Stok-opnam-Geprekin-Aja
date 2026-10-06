/* POST /api/auth  -> login crew, terbitkan token sesi (7 hari) */
const { CREW, sha256hex, newToken, writeJson, TOKEN_TTL, MAX_BODY } = require("../lib/server.js");

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method tidak diizinkan" });
    return;
  }
  try {
    const body = req.body || {};
    const crew = String(body.crew || "");
    const password = String(body.password || "");

    if (!CREW[crew]) {
      res.status(400).json({ error: "Akun tidak dikenal" });
      return;
    }
    if (!password || password.length > 200 || JSON.stringify(body).length > MAX_BODY) {
      res.status(400).json({ error: "Data login tidak valid" });
      return;
    }
    if (sha256hex(password) !== CREW[crew].hash) {
      res.status(401).json({ error: "Password salah" });
      return;
    }

    const token = newToken();
    const now = Date.now();
    await writeJson("sesi/" + token + ".json", {
      crew: crew,
      name: CREW[crew].name,
      iat: now,
      exp: now + TOKEN_TTL
    });

    res.status(200).json({ ok: true, token: token, name: CREW[crew].name, exp: now + TOKEN_TTL });
  } catch (e) {
    res.status(500).json({ error: "Gagal membuat sesi" });
  }
};
