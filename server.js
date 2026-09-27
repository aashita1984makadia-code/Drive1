const express = require("express");
const session = require("express-session");
const multer = require("multer");
const Database = require("better-sqlite3");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const app = express();
const PORT = process.env.PORT || 3000;
const ROOT = __dirname;
const DATA_DIR = path.join(ROOT, "data");
const UPLOAD_DIR = path.join(DATA_DIR, "uploads");
const DB_FILE = path.join(DATA_DIR, "cloud.db");

fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const db = new Database(DB_FILE);
db.pragma("journal_mode = WAL");
db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS files (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  original_name TEXT NOT NULL,
  stored_name TEXT NOT NULL UNIQUE,
  size INTEGER NOT NULL,
  mime_type TEXT,
  folder TEXT NOT NULL DEFAULT '/',
  uploaded_at TEXT NOT NULL
);
`);

function hashPassword(password) {
  return crypto.createHash("sha256").update(password).digest("hex");
}

const DEFAULT_USER = process.env.CLOUD_USER || "jeel";
const DEFAULT_PASSWORD = process.env.CLOUD_PASSWORD || "1234";
if (!db.prepare("SELECT id FROM users WHERE username=?").get(DEFAULT_USER)) {
  db.prepare("INSERT INTO users (username,password_hash) VALUES (?,?)")
    .run(DEFAULT_USER, hashPassword(DEFAULT_PASSWORD));
}

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(session({
  secret: process.env.SESSION_SECRET || "change-this-secret",
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true, sameSite: "lax" }
}));
app.use(express.static(path.join(ROOT, "public")));

function auth(req, res, next) {
  if (!req.session.user) return res.status(401).json({ error: "Not logged in" });
  next();
}

function safeFolder(folder) {
  folder = typeof folder === "string" ? folder.trim() : "/";
  if (!folder.startsWith("/")) folder = "/" + folder;
  folder = path.posix.normalize(folder);
  if (!folder.endsWith("/")) folder += "/";
  if (folder.includes("..")) return "/";
  return folder;
}

function safeName(name) {
  return path.basename(name).replace(/[<>:"/\\|?*\x00-\x1F]/g, "_").trim() || "file";
}

const storage = multer.diskStorage({
  destination: UPLOAD_DIR,
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, crypto.randomUUID() + ext);
  }
});
const upload = multer({
  storage,
  limits: { fileSize: 100 * 1024 * 1024 }
});

app.post("/api/login", (req, res) => {
  const { username, password } = req.body;
  const user = db.prepare("SELECT * FROM users WHERE username=?").get(username);
  if (!user || user.password_hash !== hashPassword(password || "")) {
    return res.status(401).json({ error: "Invalid username or password" });
  }
  req.session.user = { id: user.id, username: user.username };
  res.json({ ok: true, username: user.username });
});

app.post("/api/logout", (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

app.get("/api/me", (req, res) => {
  res.json({ loggedIn: !!req.session.user, username: req.session.user?.username || null });
});

app.get("/api/files", auth, (req, res) => {
  const folder = safeFolder(req.query.folder || "/");
  const q = (req.query.q || "").trim();
  let rows;
  if (q) {
    rows = db.prepare(`
      SELECT * FROM files
      WHERE (original_name LIKE ? OR folder LIKE ?)
      ORDER BY uploaded_at DESC
    `).all(`%${q}%`, `%${q}%`);
  } else {
    rows = db.prepare("SELECT * FROM files WHERE folder=? ORDER BY original_name COLLATE NOCASE").all(folder);
  }
  res.json(rows);
});

app.post("/api/upload", auth, upload.array("files", 20), (req, res) => {
  const folder = safeFolder(req.body.folder || "/");
  const insert = db.prepare(`
    INSERT INTO files (original_name,stored_name,size,mime_type,folder,uploaded_at)
    VALUES (?,?,?,?,?,?)
  `);
  const now = new Date().toISOString();
  const tx = db.transaction((files) => {
    for (const f of files) {
      insert.run(safeName(f.originalname), f.filename, f.size, f.mimetype || "", folder, now);
    }
  });
  tx(req.files || []);
  res.json({ ok: true, count: (req.files || []).length });
});

app.get("/api/download/:id", auth, (req, res) => {
  const file = db.prepare("SELECT * FROM files WHERE id=?").get(req.params.id);
  if (!file) return res.status(404).send("File not found");
  const full = path.join(UPLOAD_DIR, file.stored_name);
  if (!fs.existsSync(full)) return res.status(404).send("Stored file not found");
  res.download(full, file.original_name);
});

app.delete("/api/files/:id", auth, (req, res) => {
  const file = db.prepare("SELECT * FROM files WHERE id=?").get(req.params.id);
  if (!file) return res.status(404).json({ error: "File not found" });
  const full = path.join(UPLOAD_DIR, file.stored_name);
  try { if (fs.existsSync(full)) fs.unlinkSync(full); } catch {}
  db.prepare("DELETE FROM files WHERE id=?").run(req.params.id);
  res.json({ ok: true });
});

app.post("/api/folders", auth, (req, res) => {
  const parent = safeFolder(req.body.parent || "/");
  const name = safeName(req.body.name || "").replace(/\.+$/g, "");
  if (!name) return res.status(400).json({ error: "Folder name required" });
  const folder = safeFolder(parent + name);
  // Folders are represented by metadata-free marker files in this lightweight version.
  // A hidden marker makes empty folders persistent.
  const marker = ".folder-" + crypto.createHash("sha1").update(folder).digest("hex");
  const stored = crypto.randomUUID() + ".folder";
  const full = path.join(UPLOAD_DIR, stored);
  fs.writeFileSync(full, "");
  db.prepare(`
    INSERT INTO files (original_name,stored_name,size,mime_type,folder,uploaded_at)
    VALUES (?,?,?,?,?,?)
  `).run(name, stored, 0, "application/x-folder", parent, new Date().toISOString());
  res.json({ ok: true, folder });
});

app.get("/api/storage", auth, (req, res) => {
  const row = db.prepare("SELECT COALESCE(SUM(size),0) AS used, COUNT(*) AS count FROM files WHERE mime_type != 'application/x-folder'").get();
  res.json(row);
});

app.get("/api/health", (req, res) => res.json({ ok: true }));

app.get("*", (req, res) => {
  res.sendFile(path.join(ROOT, "public", "index.html"));
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Cloud Drive running at http://127.0.0.1:${PORT}`);
});