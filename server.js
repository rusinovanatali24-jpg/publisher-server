import express from "express";

const app = express();
app.use(express.json({ limit: "2mb" }));

// ===== CORS =====
app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, X-Publish-Key");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});

// ===== НАСТРОЙКИ (ТОЛЬКО В RENDER) =====
const PORT = process.env.PORT || 3000;
const GH_TOKEN = process.env.GH_TOKEN;
const GH_OWNER = process.env.GH_OWNER;
const GH_REPO = process.env.GH_REPO;
const GH_BRANCH = process.env.GH_BRANCH || "main";
const PUBLISH_KEY = process.env.PUBLISH_KEY;
const PATH_PREFIX = process.env.GITHUB_PATH_PREFIX || "data";
const PAGES_BASE_URL = process.env.PAGES_BASE_URL;

function mustEnv(name, value) {
  if (!value) throw new Error(`Missing env var: ${name}`);
}

// ===== ROUTES =====
app.get("/health", (req, res) => res.status(200).send("ok"));

app.post("/publish", async (req, res) => {
  try {
    if (req.header("X-Publish-Key") !== PUBLISH_KEY) {
      return res.status(401).json({ ok:false, error:"Bad publish key" });
    }

    mustEnv("GH_TOKEN", GH_TOKEN);
    mustEnv("GH_OWNER", GH_OWNER);
    mustEnv("GH_REPO", GH_REPO);

    const { id, data } = req.body || {};
    if (!id || !data) return res.status(400).json({ ok:false, error:"Need id and data" });

    const safeId = id.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 64);
    const filePath = `${PATH_PREFIX}/${safeId}.json`;

    const headers = {
      "Authorization": `Bearer ${GH_TOKEN}`,
      "Accept": "application/vnd.github+json"
    };

    const getUrl = `https://api.github.com/repos/${GH_OWNER}/${GH_REPO}/contents/${filePath}?ref=${GH_BRANCH}`;
    let sha = null;

    const getResp = await fetch(getUrl, { headers });
    if (getResp.ok) {
      const j = await getResp.json();
      sha = j.sha;
    }

    const content = Buffer.from(JSON.stringify(data, null, 2)).toString("base64");

    await fetch(
      `https://api.github.com/repos/${GH_OWNER}/${GH_REPO}/contents/${filePath}`,
      {
        method: "PUT",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({
          message: `publish ${safeId}`,
          content,
          branch: GH_BRANCH,
          ...(sha ? { sha } : {})
        })
      }
    );

    res.json({
      ok: true,
      url: `${PAGES_BASE_URL}/${PATH_PREFIX}/${safeId}.json`
    });

  } catch (e) {
    res.status(500).json({ ok:false, error:String(e.message) });
  }
});

app.listen(PORT, () => {
  console.log("Server started on port", PORT);
});
