const crypto = require("node:crypto");
const fs = require("node:fs/promises");
const path = require("node:path");

const express = require("express");
const MarkdownIt = require("markdown-it");
const sanitizeHtml = require("sanitize-html");

const app = express();
const port = Number(process.env.PORT) || 3000;
const rootDir = __dirname;
const publicDir = path.join(rootDir, "public");
const dataDir = path.join(rootDir, "data");
const dataFile = path.join(dataDir, "notes.json");

const markdown = new MarkdownIt({
  breaks: true,
  html: false,
  linkify: true
});

const welcomeContent = `# Welcome to zeeum-note

이 앱은 간단한 마크다운 노트 에디터입니다.

## 할 수 있는 일

- 새 노트 만들기
- 목록에서 빠르게 검색하기
- 자동 저장으로 바로 수정하기
- 오른쪽 미리보기에서 결과 확인하기

> 왼쪽에서 노트를 고르고, 오른쪽에서 편집해 보세요.
`;

app.use(express.json({ limit: "1mb" }));
app.use(express.static(publicDir));

function sortNotes(notes) {
  return [...notes].sort((left, right) => {
    return new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime();
  });
}

function makeTitle(value) {
  const normalized = typeof value === "string" ? value.trim() : "";
  return normalized.slice(0, 120) || "Untitled note";
}

function makeContent(value) {
  return typeof value === "string" ? value : "";
}

function createNote(seed = {}) {
  const now = new Date().toISOString();

  return {
    id: crypto.randomUUID(),
    title: makeTitle(seed.title),
    content: makeContent(seed.content),
    createdAt: now,
    updatedAt: now
  };
}

async function ensureStore() {
  await fs.mkdir(dataDir, { recursive: true });

  try {
    await fs.access(dataFile);
  } catch {
    const initialNotes = [
      createNote({
        title: "Welcome note",
        content: welcomeContent
      })
    ];

    await writeNotes(initialNotes);
  }
}

async function readNotes() {
  await ensureStore();

  const raw = await fs.readFile(dataFile, "utf8");
  const parsed = JSON.parse(raw);

  if (!Array.isArray(parsed)) {
    return [];
  }

  return sortNotes(parsed);
}

async function writeNotes(notes) {
  const payload = `${JSON.stringify(sortNotes(notes), null, 2)}\n`;
  const tempFile = `${dataFile}.tmp`;

  await fs.writeFile(tempFile, payload, "utf8");
  await fs.rename(tempFile, dataFile);
}

function findNote(notes, noteId) {
  return notes.find((note) => note.id === noteId);
}

function renderMarkdown(markdownText) {
  const rendered = markdown.render(markdownText || "");
  const allowedTags = [...sanitizeHtml.defaults.allowedTags, "h1", "h2", "img", "table", "thead", "tbody", "tr", "th", "td"];

  return sanitizeHtml(rendered, {
    allowedTags,
    allowedAttributes: {
      a: ["href", "name", "target", "rel"],
      code: ["class"],
      img: ["src", "alt", "title"],
      input: ["checked", "disabled", "type"]
    },
    allowedSchemes: ["http", "https", "mailto"]
  });
}

app.get("/api/health", (_req, res) => {
  res.json({
    name: "zeeum-note",
    status: "ok",
    node: process.version,
    time: new Date().toISOString()
  });
});

app.get("/api/notes", async (_req, res, next) => {
  try {
    res.json(await readNotes());
  } catch (error) {
    next(error);
  }
});

app.get("/api/notes/:noteId", async (req, res, next) => {
  try {
    const notes = await readNotes();
    const note = findNote(notes, req.params.noteId);

    if (!note) {
      res.status(404).json({ error: "노트를 찾을 수 없습니다." });
      return;
    }

    res.json(note);
  } catch (error) {
    next(error);
  }
});

app.post("/api/notes", async (req, res, next) => {
  try {
    const notes = await readNotes();
    const note = createNote({
      title: req.body?.title,
      content: req.body?.content
    });

    notes.unshift(note);
    await writeNotes(notes);

    res.status(201).json(note);
  } catch (error) {
    next(error);
  }
});

app.put("/api/notes/:noteId", async (req, res, next) => {
  try {
    const notes = await readNotes();
    const note = findNote(notes, req.params.noteId);

    if (!note) {
      res.status(404).json({ error: "노트를 찾을 수 없습니다." });
      return;
    }

    note.title = makeTitle(req.body?.title ?? note.title);
    note.content = makeContent(req.body?.content ?? note.content);
    note.updatedAt = new Date().toISOString();

    await writeNotes(notes);
    res.json(note);
  } catch (error) {
    next(error);
  }
});

app.delete("/api/notes/:noteId", async (req, res, next) => {
  try {
    const notes = await readNotes();
    const remainingNotes = notes.filter((note) => note.id !== req.params.noteId);

    if (remainingNotes.length === notes.length) {
      res.status(404).json({ error: "노트를 찾을 수 없습니다." });
      return;
    }

    await writeNotes(remainingNotes);
    res.status(204).end();
  } catch (error) {
    next(error);
  }
});

app.post("/api/render", (req, res) => {
  const markdownText = typeof req.body?.markdown === "string" ? req.body.markdown : "";

  res.json({
    html: renderMarkdown(markdownText)
  });
});

app.get(/^(?!\/api).*/, (_req, res) => {
  res.sendFile(path.join(publicDir, "index.html"));
});

app.use((error, _req, res, _next) => {
  console.error(error);
  res.status(500).json({
    error: "서버에서 오류가 발생했습니다."
  });
});

app.listen(port, "0.0.0.0", async () => {
  await ensureStore();
  console.log(`Server listening on port ${port}`);
});
