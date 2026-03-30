const crypto = require("node:crypto");
const fsSync = require("node:fs");
const fs = require("node:fs/promises");
const path = require("node:path");

const express = require("express");
const MarkdownIt = require("markdown-it");
const multer = require("multer");
const sanitizeHtml = require("sanitize-html");
const { diffWordsWithSpace } = require("diff");
const { getSchema, Node: TipTapNode, mergeAttributes: mergeTipTapAttributes } = require("@tiptap/core");
const ImageExtension = require("@tiptap/extension-image").default;
const StarterKit = require("@tiptap/starter-kit").default;
const TaskItemExtension = require("@tiptap/extension-task-item").default;
const TaskListExtension = require("@tiptap/extension-task-list").default;
const { prosemirrorJSONToYDoc, yDocToProsemirrorJSON } = require("@tiptap/y-tiptap");
const { WebSocketServer } = require("ws");
const syncProtocol = require("y-protocols/sync");
const awarenessProtocol = require("y-protocols/awareness");
const encoding = require("lib0/encoding");
const decoding = require("lib0/decoding");
const Y = require("yjs");

const app = express();
const port = Number(process.env.PORT) || 3000;
const rootDir = __dirname;
const clientDir = path.join(rootDir, "dist");
const clientIndexPath = path.join(clientDir, "index.html");
const dataDir = path.join(rootDir, "data");
const uploadDir = path.join(dataDir, "uploads");

const files = {
  groups: path.join(dataDir, "groups.json"),
  legacyNotes: path.join(dataDir, "notes.json"),
  members: path.join(dataDir, "members.json"),
  pages: path.join(dataDir, "pages.json"),
  preferences: path.join(dataDir, "preferences.json"),
  projects: path.join(dataDir, "projects.json"),
  revisions: path.join(dataDir, "revisions.json"),
  users: path.join(dataDir, "users.json"),
  workspace: path.join(dataDir, "workspace.json")
};

const markdown = new MarkdownIt({
  breaks: true,
  html: false,
  linkify: true
});

const EMPTY_DOC = {
  type: "doc",
  content: [{ type: "paragraph" }]
};

const groupPalette = ["cyan", "orange", "emerald", "violet", "rose", "amber"];
const sessionCookieName = "zeeum_session";
const sessionTtlMs = 1000 * 60 * 60 * 24 * 7;
const passwordIterations = 120000;
const sessionSecret = process.env.SESSION_SECRET || "zeeum-dev-session-secret";
const collabWriteTimers = new Map();
const connectionUsers = new WeakMap();
let baseStateCache = null;
let baseStatePromise = null;
let revisionsCache = null;
let revisionsPromise = null;

const ServerVideoBlock = TipTapNode.create({
  addAttributes() {
    return {
      controls: {
        default: true
      },
      src: {
        default: null
      },
      width: {
        default: null
      }
    };
  },
  group: "block",
  name: "videoBlock",
  parseHTML() {
    return [{ tag: "video[src]" }];
  },
  renderHTML({ HTMLAttributes }) {
    return ["video", mergeTipTapAttributes(HTMLAttributes)];
  }
});

const collaborationSchema = getSchema([
  ImageExtension,
  StarterKit.configure({
    undoRedo: false
  }),
  TaskListExtension,
  TaskItemExtension.configure({
    nested: true
  }),
  ServerVideoBlock
]);

app.use(express.json({ limit: "2mb" }));

if (fsSync.existsSync(clientIndexPath)) {
  app.use(express.static(clientDir, { index: false }));
}

const upload = multer({
  storage: multer.diskStorage({
    destination(_req, _file, callback) {
      callback(null, uploadDir);
    },
    filename(_req, file, callback) {
      const extension = path.extname(file.originalname || "").toLowerCase();
      callback(null, `${crypto.randomUUID()}${extension}`);
    }
  }),
  limits: {
    fileSize: 1024 * 1024 * 100
  },
  fileFilter(_req, file, callback) {
    const mime = file.mimetype || "";

    if (mime.startsWith("image/") || mime.startsWith("video/")) {
      callback(null, true);
      return;
    }

    callback(new Error("이미지 또는 비디오 파일만 업로드할 수 있습니다."));
  }
});

function nowIso() {
  return new Date().toISOString();
}

function nowMs() {
  return Date.now();
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function normalizeEmail(value) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function makeTitle(value, fallback = "Untitled") {
  const normalized = typeof value === "string" ? value.trim() : "";
  return normalized.slice(0, 120) || fallback;
}

function makeDescription(value, fallback = "") {
  return typeof value === "string" ? value.trim().slice(0, 240) : fallback;
}

function makeRichDocument(lines = []) {
  const content = lines.length
    ? lines.map((line) => {
        return line
          ? {
              type: "paragraph",
              content: [{ type: "text", text: line }]
            }
          : { type: "paragraph" };
      })
    : clone(EMPTY_DOC.content);

  return {
    type: "doc",
    content
  };
}

function defaultMembers() {
  return [
    {
      id: "member-owner",
      name: "Workspace Admin",
      email: "admin@zeeum.local",
      role: "Admin"
    },
    {
      id: "member-editor",
      name: "Content Editor",
      email: "editor@zeeum.local",
      role: "Member"
    },
    {
      id: "member-reviewer",
      name: "Product Reviewer",
      email: "reviewer@zeeum.local",
      role: "Member"
    }
  ];
}

function createPasswordRecord(password, salt = crypto.randomBytes(16).toString("hex")) {
  const passwordHash = crypto
    .pbkdf2Sync(password, salt, passwordIterations, 64, "sha512")
    .toString("hex");

  return { passwordHash, passwordSalt: salt };
}

function verifyPassword(password, user) {
  if (!user?.passwordHash || !user?.passwordSalt) {
    return false;
  }

  const { passwordHash } = createPasswordRecord(password, user.passwordSalt);

  return crypto.timingSafeEqual(
    Buffer.from(passwordHash, "hex"),
    Buffer.from(user.passwordHash, "hex")
  );
}

function signSession(userId, expiresAt) {
  return crypto
    .createHmac("sha256", sessionSecret)
    .update(`${userId}.${expiresAt}`)
    .digest("hex");
}

function makeSessionToken(userId) {
  const expiresAt = nowMs() + sessionTtlMs;
  const signature = signSession(userId, expiresAt);
  return `${userId}.${expiresAt}.${signature}`;
}

function readSessionToken(token) {
  if (!token || typeof token !== "string") {
    return null;
  }

  const parts = token.split(".");

  if (parts.length !== 3) {
    return null;
  }

  const [userId, expiresAtRaw, signature] = parts;
  const expiresAt = Number(expiresAtRaw);

  if (!userId || !Number.isFinite(expiresAt) || expiresAt < nowMs()) {
    return null;
  }

  const expected = signSession(userId, expiresAt);

  if (signature.length !== expected.length) {
    return null;
  }

  if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) {
    return null;
  }

  return { userId, expiresAt };
}

function parseCookies(cookieHeader) {
  if (!cookieHeader) {
    return {};
  }

  return cookieHeader.split(";").reduce((cookies, chunk) => {
    const [name, ...rest] = chunk.trim().split("=");

    if (!name) {
      return cookies;
    }

    cookies[name] = decodeURIComponent(rest.join("="));
    return cookies;
  }, {});
}

function serializeCookie(name, value, options = {}) {
  const attributes = [`${name}=${encodeURIComponent(value)}`];

  if (options.maxAge !== undefined) {
    attributes.push(`Max-Age=${options.maxAge}`);
  }

  if (options.path) {
    attributes.push(`Path=${options.path}`);
  }

  if (options.httpOnly) {
    attributes.push("HttpOnly");
  }

  if (options.sameSite) {
    attributes.push(`SameSite=${options.sameSite}`);
  }

  if (options.secure) {
    attributes.push("Secure");
  }

  return attributes.join("; ");
}

function setSessionCookie(res, userId) {
  res.setHeader(
    "Set-Cookie",
    serializeCookie(sessionCookieName, makeSessionToken(userId), {
      httpOnly: true,
      maxAge: sessionTtlMs / 1000,
      path: "/",
      sameSite: "Lax",
      secure: false
    })
  );
}

function clearSessionCookie(res) {
  res.setHeader(
    "Set-Cookie",
    serializeCookie(sessionCookieName, "", {
      httpOnly: true,
      maxAge: 0,
      path: "/",
      sameSite: "Lax",
      secure: false
    })
  );
}

function sessionFromRequest(req) {
  const authHeader = req.headers.authorization || "";
  const requestUrl = new URL(req.url || "/", "http://localhost");
  const authParam = requestUrl.searchParams.get("auth") || "";

  if (authHeader.startsWith("Bearer ")) {
    return readSessionToken(authHeader.slice("Bearer ".length).trim());
  }

  if (authParam) {
    return readSessionToken(authParam);
  }

  const cookies = parseCookies(req.headers.cookie || "");
  return readSessionToken(cookies[sessionCookieName]);
}

function defaultUsers() {
  const timestamp = nowIso();
  const adminPassword = createPasswordRecord("admin1234!");

  return [
    {
      id: "member-owner",
      name: "Workspace Admin",
      email: "admin@zeeum.local",
      role: "admin",
      canLogin: true,
      passwordHash: adminPassword.passwordHash,
      passwordSalt: adminPassword.passwordSalt,
      createdAt: timestamp,
      updatedAt: timestamp
    },
    {
      id: "member-editor",
      name: "Content Editor",
      email: "editor@zeeum.local",
      role: "member",
      canLogin: false,
      passwordHash: null,
      passwordSalt: null,
      createdAt: timestamp,
      updatedAt: timestamp
    },
    {
      id: "member-reviewer",
      name: "Product Reviewer",
      email: "reviewer@zeeum.local",
      role: "member",
      canLogin: false,
      passwordHash: null,
      passwordSalt: null,
      createdAt: timestamp,
      updatedAt: timestamp
    }
  ];
}

function migrateMembersToUsers(members) {
  const timestamp = nowIso();
  const adminPassword = createPasswordRecord("admin1234!");

  return members.map((member) => {
    if (member.id === "member-owner") {
      return {
        id: member.id,
        name: member.name || "Workspace Admin",
        email: "admin@zeeum.local",
        role: "admin",
        canLogin: true,
        passwordHash: adminPassword.passwordHash,
        passwordSalt: adminPassword.passwordSalt,
        createdAt: timestamp,
        updatedAt: timestamp
      };
    }

    return {
      id: member.id,
      name: member.name,
      email: normalizeEmail(member.email),
      role: "member",
      canLogin: false,
      passwordHash: null,
      passwordSalt: null,
      createdAt: timestamp,
      updatedAt: timestamp
    };
  });
}

function memberSummary(user) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role === "admin" ? "Admin" : "Member"
  };
}

function syncMembersFromUsers(users) {
  return users.map(memberSummary);
}

function publicUser(user) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    canLogin: user.canLogin,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt
  };
}

function defaultPreferences() {
  return {
    density: "comfortable",
    showInspector: true,
    theme: "light"
  };
}

function defaultProject(seed = {}) {
  const timestamp = nowIso();

  return {
    id: crypto.randomUUID(),
    name: makeTitle(seed.name, "Zeeum Project"),
    description: makeDescription(
      seed.description,
      "A project workspace inspired by Docmost, with pages, groups, and project settings."
    ),
    icon: makeTitle(seed.icon, "ZE").slice(0, 2),
    homePageId: seed.homePageId || null,
    createdAt: timestamp,
    updatedAt: timestamp,
    lastOpenedAt: timestamp
  };
}

function normalizeColor(value) {
  return groupPalette.includes(value) ? value : "cyan";
}

function createGroup(projectId, seed = {}) {
  const timestamp = nowIso();
  const memberIds = Array.isArray(seed.memberIds) ? Array.from(new Set(seed.memberIds)) : [];

  return {
    id: crypto.randomUUID(),
    projectId,
    name: makeTitle(seed.name, "Untitled group"),
    description: makeDescription(seed.description),
    color: normalizeColor(seed.color),
    memberIds,
    createdAt: timestamp,
    updatedAt: timestamp
  };
}

function starterPages(projectId) {
  const timestamp = nowIso();

  return [
    {
      id: crypto.randomUUID(),
      projectId,
      title: "Overview",
      parentId: null,
      position: 0,
      icon: "book-open",
      contentFormat: "tiptap-json",
      content: makeRichDocument([
        "Welcome to your new project.",
        "Use the left sidebar to organize pages, and open Project settings to manage groups and preferences."
      ]),
      createdAt: timestamp,
      updatedAt: timestamp
    },
    {
      id: crypto.randomUUID(),
      projectId,
      title: "Planning Notes",
      parentId: null,
      position: 1,
      icon: "check-square",
      contentFormat: "tiptap-json",
      content: {
        type: "doc",
        content: [
          {
            type: "heading",
            attrs: { level: 2 }
          },
          {
            type: "taskList",
            content: [
              {
                type: "taskItem",
                attrs: { checked: false },
                content: [{ type: "paragraph", content: [{ type: "text", text: "Outline the page hierarchy" }] }]
              },
              {
                type: "taskItem",
                attrs: { checked: false },
                content: [{ type: "paragraph", content: [{ type: "text", text: "Define project ownership groups" }] }]
              }
            ]
          }
        ]
      },
      createdAt: timestamp,
      updatedAt: timestamp
    }
  ];
}

function defaultGroups(projectId) {
  return [
    createGroup(projectId, {
      name: "Administrators",
      description: "Project administrators and primary content owners.",
      color: "cyan",
      memberIds: ["member-owner"]
    }),
    createGroup(projectId, {
      name: "Editorial",
      description: "Editors and reviewers shaping project content.",
      color: "emerald",
      memberIds: ["member-editor", "member-reviewer"]
    })
  ];
}

function migrateNotesToPages(notes, projectId) {
  return notes.map((note, index) => {
    return {
      id: note.id || crypto.randomUUID(),
      projectId,
      title: makeTitle(note.title, "Untitled page"),
      parentId: null,
      position: index,
      icon: "file-text",
      contentFormat: "markdown",
      content: typeof note.content === "string" ? note.content : "",
      createdAt: note.createdAt || nowIso(),
      updatedAt: note.updatedAt || note.createdAt || nowIso()
    };
  });
}

async function readJson(file, fallback) {
  try {
    const raw = await fs.readFile(file, "utf8");
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

async function writeJson(file, value) {
  const tempFile = `${file}.${crypto.randomUUID()}.tmp`;
  const payload = `${JSON.stringify(value, null, 2)}\n`;

  await fs.writeFile(tempFile, payload, "utf8");
  await fs.rename(tempFile, file);

  if (file === files.revisions) {
    revisionsCache = value;
    return;
  }

  if (!baseStateCache) {
    return;
  }

  if (file === files.projects) {
    baseStateCache.projects = value;
  } else if (file === files.pages) {
    baseStateCache.pages = value;
  } else if (file === files.groups) {
    baseStateCache.groups = value;
  } else if (file === files.users) {
    baseStateCache.users = value;
  } else if (file === files.members) {
    baseStateCache.members = value;
  } else if (file === files.preferences) {
    baseStateCache.preferences = value;
  }
}

function byProject(projectId, entries) {
  return entries.filter((entry) => entry.projectId === projectId);
}

function sortPagesWithinProject(pages) {
  return [...pages].sort((left, right) => {
    if ((left.parentId || "") === (right.parentId || "")) {
      return left.position - right.position;
    }

    return (left.parentId || "").localeCompare(right.parentId || "");
  });
}

function ensureProjectShape(project, pages) {
  const projectPages = byProject(project.id, pages);
  const fallbackHomePageId = projectPages[0]?.id || null;

  return {
    ...project,
    description: makeDescription(project.description),
    homePageId:
      project.homePageId && projectPages.some((page) => page.id === project.homePageId)
        ? project.homePageId
        : fallbackHomePageId,
    icon: makeTitle(project.icon, "ZE").slice(0, 2),
    lastOpenedAt: project.lastOpenedAt || project.updatedAt || project.createdAt || nowIso(),
    updatedAt: project.updatedAt || nowIso(),
    createdAt: project.createdAt || nowIso()
  };
}

function touchProject(projects, projectId, { opened = false } = {}) {
  const timestamp = nowIso();

  return projects.map((project) => {
    if (project.id !== projectId) {
      return project;
    }

    return {
      ...project,
      updatedAt: timestamp,
      lastOpenedAt: opened ? timestamp : project.lastOpenedAt || timestamp
    };
  });
}

async function ensureStore() {
  await fs.mkdir(dataDir, { recursive: true });
  await fs.mkdir(uploadDir, { recursive: true });

  const existingState = await Promise.all([
    readJson(files.projects, null),
    readJson(files.revisions, null),
    readJson(files.users, null),
    readJson(files.workspace, null),
    readJson(files.pages, null),
    readJson(files.groups, null),
    readJson(files.members, null),
    readJson(files.preferences, null),
    readJson(files.legacyNotes, null)
  ]);

  let [projects, revisions, users, workspace, pages, groups, members, preferences, legacyNotes] = existingState;
  let changed = false;

  if (!Array.isArray(members) || members.length === 0) {
    members = defaultMembers();
    changed = true;
  }

  if (!Array.isArray(users) || users.length === 0) {
    users =
      Array.isArray(members) && members.length > 0
        ? migrateMembersToUsers(members)
        : defaultUsers();
    changed = true;
  }

  if (!Array.isArray(projects) || projects.length === 0) {
    let projectPages = Array.isArray(pages) && pages.length > 0 ? pages : null;
    const migratedProject = defaultProject({
      description: workspace?.description,
      homePageId: workspace?.homePageId || null,
      icon: "ZE",
      name: workspace?.name || "Zeeum Project"
    });

    if (!projectPages || projectPages.length === 0) {
      projectPages =
        Array.isArray(legacyNotes) && legacyNotes.length > 0
          ? migrateNotesToPages(legacyNotes, migratedProject.id)
          : starterPages(migratedProject.id);
    } else {
      projectPages = projectPages.map((page) => ({
        ...page,
        projectId: page.projectId || migratedProject.id
      }));
    }

    migratedProject.homePageId =
      migratedProject.homePageId && projectPages.some((page) => page.id === migratedProject.homePageId)
        ? migratedProject.homePageId
        : projectPages[0]?.id || null;

    projects = [migratedProject];
    pages = projectPages;
    groups =
      Array.isArray(groups) && groups.length > 0
        ? groups.map((group) => ({
            ...group,
            projectId: group.projectId || migratedProject.id
          }))
        : defaultGroups(migratedProject.id);
    changed = true;
  }

  const fallbackProjectId = projects[0].id;

  if (!Array.isArray(pages) || pages.length === 0) {
    pages = starterPages(fallbackProjectId);
    changed = true;
  }

  if (pages.some((page) => !page.projectId)) {
    pages = pages.map((page) => ({
      ...page,
      projectId: page.projectId || fallbackProjectId
    }));
    changed = true;
  }

  const sanitizedPages = pages.map((page) => {
    if (page.contentFormat !== "tiptap-json") {
      return page;
    }

    return {
      ...page,
      content: normalizeStoredRichDocContent(page.content)
    };
  });

  if (JSON.stringify(sanitizedPages) !== JSON.stringify(pages)) {
    pages = sanitizedPages;
    changed = true;
  } else {
    pages = sanitizedPages;
  }

  if (!Array.isArray(groups) || groups.length === 0) {
    groups = defaultGroups(fallbackProjectId);
    changed = true;
  }

  if (groups.some((group) => !group.projectId)) {
    groups = groups.map((group) => ({
      ...group,
      projectId: group.projectId || fallbackProjectId
    }));
    changed = true;
  }

  const normalizedProjects = projects.map((project) => ensureProjectShape(project, pages));

  if (JSON.stringify(normalizedProjects) !== JSON.stringify(projects)) {
    projects = normalizedProjects;
    changed = true;
  } else {
    projects = normalizedProjects;
  }

  if (!preferences || typeof preferences !== "object") {
    preferences = defaultPreferences();
    changed = true;
  }

  if (!Array.isArray(revisions)) {
    revisions = [];
    changed = true;
  }

  const syncedMembers = syncMembersFromUsers(users);

  if (JSON.stringify(syncedMembers) !== JSON.stringify(members)) {
    members = syncedMembers;
    changed = true;
  }

  if (changed) {
    await Promise.all([
      writeJson(files.users, users),
      writeJson(files.members, members),
      writeJson(files.preferences, preferences),
      writeJson(files.projects, projects),
      writeJson(files.revisions, revisions),
      writeJson(files.pages, pages),
      writeJson(files.groups, groups)
    ]);
  }
}

function trimRevisions(revisions, { perPage = 20, total = 200 } = {}) {
  if (!Array.isArray(revisions) || revisions.length <= total) {
    return Array.isArray(revisions) ? revisions : [];
  }

  const perPageCounts = new Map();
  const kept = [];

  for (let index = revisions.length - 1; index >= 0; index -= 1) {
    const revision = revisions[index];
    const pageId = revision?.pageId || "unknown";
    const count = perPageCounts.get(pageId) || 0;

    if (count >= perPage) {
      continue;
    }

    kept.push(revision);
    perPageCounts.set(pageId, count + 1);

    if (kept.length >= total) {
      break;
    }
  }

  return kept.reverse();
}

async function loadBaseState() {
  await ensureStore();

  if (baseStateCache) {
    return baseStateCache;
  }

  if (!baseStatePromise) {
    baseStatePromise = Promise.all([
      readJson(files.projects, []),
      readJson(files.pages, []),
      readJson(files.groups, []),
      readJson(files.users, []),
      readJson(files.members, []),
      readJson(files.preferences, defaultPreferences())
    ]).then(([projects, pages, groups, users, members, preferences]) => {
      baseStateCache = { projects, pages, groups, users, members, preferences };
      baseStatePromise = null;
      return baseStateCache;
    });
  }

  return baseStatePromise;
}

async function loadRevisionsState() {
  await ensureStore();

  if (revisionsCache) {
    return revisionsCache;
  }

  if (!revisionsPromise) {
    revisionsPromise = readJson(files.revisions, []).then(async (loaded) => {
      const normalized = Array.isArray(loaded) ? loaded.map(compactRevision) : [];
      const trimmed = trimRevisions(normalized);
      revisionsPromise = null;
      revisionsCache = trimmed;

      const shouldRewrite =
        trimmed.length !== normalized.length ||
        normalized.some((revision, index) => {
          const original = Array.isArray(loaded) ? loaded[index] : null;
          return original?.snapshot !== undefined || original?.text !== revision.text;
        });

      if (shouldRewrite) {
        await writeJson(files.revisions, trimmed);
      }

      return revisionsCache;
    });
  }

  return revisionsPromise;
}

async function loadState({ includeRevisions = false } = {}) {
  const baseState = await loadBaseState();

  if (!includeRevisions) {
    return {
      ...baseState,
      revisions: []
    };
  }

  return {
    ...baseState,
    revisions: await loadRevisionsState()
  };
}

function reindexSiblings(pages, projectId, parentId) {
  const siblings = pages
    .filter(
      (page) =>
        page.projectId === projectId && (page.parentId ?? null) === (parentId ?? null)
    )
    .sort((left, right) => left.position - right.position);

  siblings.forEach((page, index) => {
    page.position = index;
  });
}

function makePage(seed, pages) {
  const timestamp = nowIso();
  const parentId = seed.parentId ?? null;
  const position = pages.filter(
    (page) =>
      page.projectId === seed.projectId && (page.parentId ?? null) === (parentId ?? null)
  ).length;

  return {
    id: crypto.randomUUID(),
    projectId: seed.projectId,
    title: makeTitle(seed.title, "Untitled page"),
    parentId,
    position,
    icon: typeof seed.icon === "string" ? seed.icon : "file-text",
    contentFormat: seed.contentFormat === "markdown" ? "markdown" : "tiptap-json",
    content:
      seed.contentFormat === "markdown"
        ? seed.content || ""
        : normalizeStoredRichDocContent(clone(seed.content || EMPTY_DOC)),
    createdAt: timestamp,
    updatedAt: timestamp
  };
}

function extractRichText(node) {
  if (!node || typeof node !== "object") {
    return "";
  }

  if (typeof node.text === "string") {
    return node.text;
  }

  if (!Array.isArray(node.content)) {
    return "";
  }

  return node.content.map(extractRichText).join(" ");
}

function excerptFromPage(page) {
  const source =
    page.contentFormat === "markdown" ? page.content : extractRichText(page.content);

  return source.replace(/\s+/g, " ").trim().slice(0, 180);
}

function pageText(page) {
  if (!page) {
    return "";
  }

  if (page.contentFormat === "markdown") {
    return typeof page.content === "string" ? page.content : "";
  }

  return extractRichText(page.content);
}

function proseDocFromMarkdown(markdownText) {
  const lines = String(markdownText || "").split(/\n+/).filter((line) => line.trim().length > 0);

  if (lines.length === 0) {
    return clone(EMPTY_DOC);
  }

  return {
    type: "doc",
    content: lines.map((line) => ({
      type: "paragraph",
      content: [{ type: "text", text: line }]
    }))
  };
}

function richNodeText(node) {
  if (!node || typeof node !== "object") {
    return "";
  }

  if (node.type === "text") {
    return node.text || "";
  }

  if (node.type === "hardBreak") {
    return "\n";
  }

  return Array.isArray(node.content) ? node.content.map(richNodeText).join("") : "";
}

function stripKnownCorruptionText(text) {
  return String(text || "")
    .replace(/\b(?:CHECK|SYNC|RECHECK)_\d+\b/g, "")
    .replace(/\bMD_(?=\b|$)/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function sanitizeRichNode(node) {
  if (!node || typeof node !== "object") {
    return null;
  }

  if (node.type === "text") {
    const text = stripKnownCorruptionText(typeof node.text === "string" ? node.text : "");
    return text.length > 0 ? { ...node, text } : null;
  }

  if (!Array.isArray(node.content)) {
    return clone(node);
  }

  const content = node.content.map((child) => sanitizeRichNode(child)).filter(Boolean);
  return {
    ...node,
    content
  };
}

function sanitizeRichDocContent(content) {
  const sanitized = sanitizeRichNode(content);

  if (!sanitized || sanitized.type !== "doc") {
    return clone(EMPTY_DOC);
  }

  if (!Array.isArray(sanitized.content) || sanitized.content.length === 0) {
    return clone(EMPTY_DOC);
  }

  return sanitized;
}

function collapseRepeatedBlockWindows(nodes, maxWindow = 80) {
  let blocks = Array.isArray(nodes) ? [...nodes] : [];

  for (let size = Math.min(maxWindow, Math.floor(blocks.length / 2)); size >= 2; size -= 1) {
    const next = [];

    for (let index = 0; index < blocks.length;) {
      if (index + size * 2 <= blocks.length) {
        const baseSignature = blocks
          .slice(index, index + size)
          .map((node) => JSON.stringify(node))
          .join("\u0000");

        let repeats = 1;

        while (index + size * (repeats + 1) <= blocks.length) {
          const candidateSignature = blocks
            .slice(index + size * repeats, index + size * (repeats + 1))
            .map((node) => JSON.stringify(node))
            .join("\u0000");

          if (candidateSignature !== baseSignature) {
            break;
          }

          repeats += 1;
        }

        if (repeats > 1) {
          next.push(...blocks.slice(index, index + size));
          index += size * repeats;
          continue;
        }
      }

      next.push(blocks[index]);
      index += 1;
    }

    blocks = next;
  }

  return blocks;
}

function normalizeStoredRichDocContent(content) {
  const sanitized = sanitizeRichDocContent(content);
  const cleanedBlocks = sanitized.content
    .map((node) => sanitizeRichNode(node))
    .filter((node) => node && stripKnownCorruptionText(richNodeText(node)).length > 0);
  const collapsedBlocks = collapseRepeatedBlockWindows(cleanedBlocks);

  return {
    ...sanitized,
    content: collapsedBlocks.length > 0 ? collapsedBlocks : clone(EMPTY_DOC.content)
  };
}

function markdownFromRichDoc(node, level = 0) {
  if (!node || typeof node !== "object") {
    return "";
  }

  if (node.type === "doc") {
    return (node.content || []).map((child) => markdownFromRichDoc(child, level)).join("\n\n").trim();
  }

  if (node.type === "paragraph") {
    return (node.content || []).map((child) => markdownFromRichDoc(child, level)).join("");
  }

  if (node.type === "text") {
    let text = node.text || "";

    if (Array.isArray(node.marks)) {
      for (const mark of node.marks) {
        if (mark.type === "bold") {
          text = `**${text}**`;
        } else if (mark.type === "italic") {
          text = `*${text}*`;
        } else if (mark.type === "strike") {
          text = `~~${text}~~`;
        } else if (mark.type === "link") {
          text = `[${text}](${mark.attrs?.href || "#"})`;
        }
      }
    }

    return text;
  }

  if (node.type === "heading") {
    const hashes = "#".repeat(node.attrs?.level || 1);
    return `${hashes} ${(node.content || []).map((child) => markdownFromRichDoc(child, level)).join("")}`;
  }

  if (node.type === "bulletList") {
    return (node.content || []).map((child) => markdownFromRichDoc(child, level)).join("\n");
  }

  if (node.type === "orderedList") {
    return (node.content || []).map((child) => markdownFromRichDoc(child, level)).join("\n");
  }

  if (node.type === "listItem") {
    const content = (node.content || []).map((child) => markdownFromRichDoc(child, level + 1)).join("\n");
    return `${"  ".repeat(level)}- ${content}`;
  }

  if (node.type === "blockquote") {
    return (node.content || [])
      .map((child) => markdownFromRichDoc(child, level))
      .join("\n")
      .split("\n")
      .map((line) => `> ${line}`)
      .join("\n");
  }

  if (node.type === "codeBlock") {
    return `\`\`\`\n${pageText({ content: node, contentFormat: "tiptap-json" })}\n\`\`\``;
  }

  if (node.type === "horizontalRule") {
    return "---";
  }

  if (node.type === "taskList") {
    return (node.content || []).map((child) => markdownFromRichDoc(child, level)).join("\n");
  }

  if (node.type === "taskItem") {
    const checked = node.attrs?.checked ? "x" : " ";
    const content = (node.content || []).map((child) => markdownFromRichDoc(child, level + 1)).join("");
    return `${"  ".repeat(level)}- [${checked}] ${content}`;
  }

  if (node.type === "image") {
    return `![image](${node.attrs?.src || ""})`;
  }

  if (node.type === "videoBlock") {
    return `<video src="${node.attrs?.src || ""}" />`;
  }

  return (node.content || []).map((child) => markdownFromRichDoc(child, level)).join("");
}

function collaborationDocJsonFromPage(page) {
  if (!page) {
    return clone(EMPTY_DOC);
  }

  if (page.contentFormat === "tiptap-json" && page.content) {
    return normalizeStoredRichDocContent(clone(page.content));
  }

  return proseDocFromMarkdown(page.content);
}

function collaborationRoomName(projectId, pageId) {
  return `project:${projectId}:page:${pageId}`;
}

function parseCollaborationRoomName(roomName = "") {
  const match = /^project:(.+):page:(.+)$/.exec(roomName);

  if (!match) {
    return null;
  }

  return {
    projectId: match[1],
    pageId: match[2]
  };
}

const collabDocs = new Map();
const collabMessageSync = 0;
const collabMessageAwareness = 1;

class CollaborationDoc extends Y.Doc {
  constructor(name) {
    super({ gc: false });
    this.name = name;
    this.awareness = new awarenessProtocol.Awareness(this);
    this.awareness.setLocalState(null);
    this.conns = new Map();
    this.initialized = false;

    this.on("update", (update, origin) => {
      const encoder = encoding.createEncoder();
      encoding.writeVarUint(encoder, collabMessageSync);
      syncProtocol.writeUpdate(encoder, update);
      const message = encoding.toUint8Array(encoder);

      this.conns.forEach((_ids, conn) => {
        if (conn.readyState === 1) {
          conn.send(message);
        }
      });

      if (origin && connectionUsers.has(origin)) {
        this._zeeumLastActor = connectionUsers.get(origin);
      }

      scheduleCollaborationWrite(this);
    });

    this.awareness.on("update", ({ added, updated, removed }, conn) => {
      const changedClients = added.concat(updated, removed);

      if (conn) {
        const tracked = this.conns.get(conn);

        if (tracked) {
          added.forEach((clientId) => tracked.add(clientId));
          removed.forEach((clientId) => tracked.delete(clientId));
        }
      }

      const encoder = encoding.createEncoder();
      encoding.writeVarUint(encoder, collabMessageAwareness);
      encoding.writeVarUint8Array(
        encoder,
        awarenessProtocol.encodeAwarenessUpdate(this.awareness, changedClients)
      );
      const message = encoding.toUint8Array(encoder);

      this.conns.forEach((_ids, connection) => {
        if (connection.readyState === 1) {
          connection.send(message);
        }
      });
    });
  }
}

async function initializeCollaborationDoc(doc) {
  if (doc.initialized) {
    return doc;
  }

  const room = parseCollaborationRoomName(doc.name);

  if (!room) {
    doc.initialized = true;
    return doc;
  }

  const state = await loadState({ includeRevisions: true });
  const page = state.pages.find(
    (entry) => entry.projectId === room.projectId && entry.id === room.pageId
  );

  if (page) {
    const sourceDoc = prosemirrorJSONToYDoc(
      collaborationSchema,
      collaborationDocJsonFromPage(page)
    );
    Y.applyUpdate(doc, Y.encodeStateAsUpdate(sourceDoc));
    sourceDoc.destroy();

    const markdownText = doc.getText("markdown");
    const nextMarkdown =
      page.contentFormat === "markdown"
        ? String(page.content || "")
        : markdownFromRichDoc(page.content);

    if (markdownText.length > 0) {
      markdownText.delete(0, markdownText.length);
    }

    if (nextMarkdown) {
      markdownText.insert(0, nextMarkdown);
    }
  }

  doc.initialized = true;
  return doc;
}

async function getCollaborationDoc(roomName) {
  if (!collabDocs.has(roomName)) {
    collabDocs.set(roomName, new CollaborationDoc(roomName));
  }

  const doc = collabDocs.get(roomName);
  await initializeCollaborationDoc(doc);
  return doc;
}

async function writeCollaborationState(doc) {
  const room = parseCollaborationRoomName(doc.name);

  if (!room) {
    return;
  }

  const state = await loadState();
  const page = state.pages.find(
    (entry) => entry.projectId === room.projectId && entry.id === room.pageId
  );

  if (!page) {
    return;
  }

  const previousPage = clone(page);
  page.content = normalizeStoredRichDocContent(yDocToProsemirrorJSON(doc));
  page.contentFormat = "tiptap-json";
  page.updatedAt = nowIso();

  const nextProjects = touchProject(state.projects, page.projectId);
  const revision = createRevision({
    actor: doc._zeeumLastActor || { name: "Collaborator" },
    nextPage: page,
    previousPage
  });
  const nextRevisions = appendRevision(state.revisions, revision);

  await Promise.all([
    writeJson(files.pages, state.pages),
    writeJson(files.projects, nextProjects),
    writeJson(files.revisions, nextRevisions)
  ]);
}

function scheduleCollaborationWrite(doc) {
  clearTimeout(collabWriteTimers.get(doc.name));
  collabWriteTimers.set(
    doc.name,
    setTimeout(() => {
      collabWriteTimers.delete(doc.name);
      void writeCollaborationState(doc);
    }, 1200)
  );
}

function closeCollaborationConnection(doc, conn) {
  if (doc.conns.has(conn)) {
    const controlledIds = doc.conns.get(conn);
    doc.conns.delete(conn);
    awarenessProtocol.removeAwarenessStates(doc.awareness, Array.from(controlledIds), null);

    if (doc.conns.size === 0) {
      void writeCollaborationState(doc).finally(() => {
        doc.destroy();
        collabDocs.delete(doc.name);
      });
    }
  }

  conn.close();
}

function sendCollaborationMessage(doc, conn, message) {
  if (conn.readyState !== 1) {
    closeCollaborationConnection(doc, conn);
    return;
  }

  conn.send(message, {}, (error) => {
    if (error) {
      closeCollaborationConnection(doc, conn);
    }
  });
}

function handleCollaborationMessage(conn, doc, message) {
  try {
    const decoder = decoding.createDecoder(message);
    const encoder = encoding.createEncoder();
    const messageType = decoding.readVarUint(decoder);

    switch (messageType) {
      case collabMessageSync:
        encoding.writeVarUint(encoder, collabMessageSync);
        syncProtocol.readSyncMessage(decoder, encoder, doc, conn);
        if (encoding.length(encoder) > 1) {
          sendCollaborationMessage(doc, conn, encoding.toUint8Array(encoder));
        }
        break;
      case collabMessageAwareness:
        awarenessProtocol.applyAwarenessUpdate(
          doc.awareness,
          decoding.readVarUint8Array(decoder),
          conn
        );
        break;
    }
  } catch (error) {
    console.error(error);
  }
}

function revisionDiffStats(previousPage, nextPage) {
  const previousText = pageText(previousPage);
  const nextText = pageText(nextPage);
  const parts = diffWordsWithSpace(previousText, nextText);

  return parts.reduce(
    (stats, part) => {
      if (part.added) {
        stats.addedChars += part.value.length;
      } else if (part.removed) {
        stats.removedChars += part.value.length;
      }

      return stats;
    },
    { addedChars: 0, removedChars: 0 }
  );
}

function createRevision({ actor, nextPage, previousPage = null }) {
  const timestamp = nowIso();
  const stats = revisionDiffStats(previousPage, nextPage);

  return {
    id: crypto.randomUUID(),
    authorId: actor?.id || null,
    authorName: actor?.name || "Unknown",
    createdAt: timestamp,
    diff: stats,
    pageId: nextPage.id,
    projectId: nextPage.projectId,
    text: pageText(nextPage)
  };
}

function appendRevision(revisions, revision) {
  return trimRevisions([...(Array.isArray(revisions) ? revisions : []), revision]);
}

function compactRevision(revision) {
  return {
    id: revision?.id || crypto.randomUUID(),
    authorId: revision?.authorId || null,
    authorName: revision?.authorName || "Unknown",
    createdAt: revision?.createdAt || nowIso(),
    diff: revision?.diff || { addedChars: 0, removedChars: 0 },
    pageId: revision?.pageId || null,
    projectId: revision?.projectId || null,
    text: typeof revision?.text === "string" ? revision.text : ""
  };
}

function pageSummary(page, pages) {
  const scopedPages = byProject(page.projectId, pages);

  return {
    id: page.id,
    projectId: page.projectId,
    title: page.title,
    parentId: page.parentId,
    position: page.position,
    icon: page.icon,
    contentFormat: page.contentFormat,
    excerpt: excerptFromPage(page),
    createdAt: page.createdAt,
    updatedAt: page.updatedAt,
    childCount: scopedPages.filter((entry) => entry.parentId === page.id).length
  };
}

function recentPagesForProject(projectId, pages, count = 6) {
  return byProject(projectId, pages)
    .sort((left, right) => new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime())
    .slice(0, count);
}

function projectSummary(project, pages, groups) {
  const projectPages = byProject(project.id, pages);
  const projectGroups = byProject(project.id, groups);
  const latestPageUpdate = projectPages.reduce((latest, page) => {
    return new Date(page.updatedAt).getTime() > new Date(latest).getTime()
      ? page.updatedAt
      : latest;
  }, project.updatedAt);

  return {
    id: project.id,
    name: project.name,
    description: project.description,
    icon: project.icon,
    homePageId: project.homePageId,
    createdAt: project.createdAt,
    updatedAt: latestPageUpdate,
    lastOpenedAt: project.lastOpenedAt,
    pageCount: projectPages.length,
    groupCount: projectGroups.length,
    recentPages: recentPagesForProject(project.id, pages, 3).map((page) => pageSummary(page, pages))
  };
}

function recentProjects(projects, pages, groups, count = 5) {
  return [...projects]
    .sort((left, right) => {
      return (
        new Date(right.lastOpenedAt || right.updatedAt).getTime() -
        new Date(left.lastOpenedAt || left.updatedAt).getTime()
      );
    })
    .slice(0, count)
    .map((project) => projectSummary(project, pages, groups));
}

function collectDescendantIds(pages, pageId, projectId) {
  const descendants = [];
  const queue = [pageId];

  while (queue.length > 0) {
    const currentId = queue.shift();
    const children = pages.filter(
      (page) => page.projectId === projectId && page.parentId === currentId
    );

    children.forEach((child) => {
      descendants.push(child.id);
      queue.push(child.id);
    });
  }

  return descendants;
}

function canMovePage(pages, pageId, nextParentId, projectId) {
  if (!nextParentId) {
    return true;
  }

  if (pageId === nextParentId) {
    return false;
  }

  return !collectDescendantIds(pages, pageId, projectId).includes(nextParentId);
}

function normalizeMovePosition(position, max) {
  if (typeof position !== "number" || Number.isNaN(position)) {
    return max;
  }

  return Math.max(0, Math.min(position, max));
}

function colorValue(color) {
  const map = {
    amber: "#d97706",
    cyan: "#0891b2",
    emerald: "#059669",
    orange: "#ea580c",
    rose: "#e11d48",
    violet: "#7c3aed"
  };

  return map[color] || map.cyan;
}

function getProjectOr404(projects, projectId, res) {
  const project = projects.find((entry) => entry.id === projectId);

  if (!project) {
    res.status(404).json({ error: "프로젝트를 찾을 수 없습니다." });
    return null;
  }

  return project;
}

function getPageOr404(pages, projectId, pageId, res) {
  const page = pages.find((entry) => entry.projectId === projectId && entry.id === pageId);

  if (!page) {
    res.status(404).json({ error: "페이지를 찾을 수 없습니다." });
    return null;
  }

  return page;
}

function getGroupOr404(groups, projectId, groupId, res) {
  const group = groups.find((entry) => entry.projectId === projectId && entry.id === groupId);

  if (!group) {
    res.status(404).json({ error: "그룹을 찾을 수 없습니다." });
    return null;
  }

  return group;
}

function mediaUrl(filename) {
  return `/api/media/${filename}`;
}

app.use(async (req, _res, next) => {
  req.cookies = parseCookies(req.headers.cookie || "");
  req.session = sessionFromRequest(req);

  if (!req.session?.userId) {
    req.currentUser = null;
    next();
    return;
  }

  try {
    const state = await loadState();
    const user = state.users.find((entry) => entry.id === req.session.userId) || null;
    req.currentUser = user && user.canLogin ? publicUser(user) : null;
  } catch {
    req.currentUser = null;
  }

  next();
});

function requireAuth(req, res, next) {
  if (!req.currentUser) {
    res.status(401).json({ error: "로그인이 필요합니다." });
    return;
  }

  next();
}

function requireAdmin(req, res, next) {
  if (!req.currentUser) {
    res.status(401).json({ error: "로그인이 필요합니다." });
    return;
  }

  if (req.currentUser.role !== "admin") {
    res.status(403).json({ error: "관리자 권한이 필요합니다." });
    return;
  }

  next();
}

app.get("/api/health", async (_req, res, next) => {
  try {
    const { projects } = await loadState();

    res.json({
      name: "zeeum-note",
      status: "ok",
      node: process.version,
      projects: projects.length,
      time: nowIso()
    });
  } catch (error) {
    next(error);
  }
});

app.get("/api/auth/session", async (req, res) => {
  if (!req.currentUser) {
    res.json({
      authenticated: false,
      currentUser: null
    });
    return;
  }

  res.json({
    authenticated: true,
    currentUser: req.currentUser
  });
});

app.post("/api/auth/login", async (req, res, next) => {
  try {
    const state = await loadState();
    const email = normalizeEmail(req.body?.email);
    const password = typeof req.body?.password === "string" ? req.body.password : "";
    const user = state.users.find((entry) => entry.email === email) || null;

    if (!user || !user.canLogin || !verifyPassword(password, user)) {
      res.status(401).json({ error: "이메일 또는 비밀번호가 올바르지 않습니다." });
      return;
    }

    const sessionToken = makeSessionToken(user.id);
    setSessionCookie(res, user.id);

    res.json({
      authenticated: true,
      currentUser: publicUser(user),
      sessionToken
    });
  } catch (error) {
    next(error);
  }
});

app.post("/api/auth/signup", async (req, res, next) => {
  try {
    const state = await loadState();
    const email = normalizeEmail(req.body?.email);
    const name = makeTitle(req.body?.name, "New member");
    const password = typeof req.body?.password === "string" ? req.body.password : "";

    if (!email || !email.includes("@")) {
      res.status(400).json({ error: "유효한 이메일을 입력하세요." });
      return;
    }

    if (password.trim().length < 8) {
      res.status(400).json({ error: "비밀번호는 8자 이상이어야 합니다." });
      return;
    }

    if (state.users.some((entry) => entry.email === email)) {
      res.status(409).json({ error: "이미 존재하는 이메일입니다." });
      return;
    }

    const timestamp = nowIso();
    const passwordRecord = createPasswordRecord(password);
    const user = {
      id: crypto.randomUUID(),
      name,
      email,
      role: "member",
      canLogin: true,
      passwordHash: passwordRecord.passwordHash,
      passwordSalt: passwordRecord.passwordSalt,
      createdAt: timestamp,
      updatedAt: timestamp
    };

    const users = [...state.users, user];
    const members = syncMembersFromUsers(users);

    await Promise.all([writeJson(files.users, users), writeJson(files.members, members)]);
    const sessionToken = makeSessionToken(user.id);
    setSessionCookie(res, user.id);

    res.status(201).json({
      authenticated: true,
      currentUser: publicUser(user),
      sessionToken
    });
  } catch (error) {
    next(error);
  }
});

app.post("/api/auth/logout", (req, res) => {
  clearSessionCookie(res);
  res.status(204).end();
});

app.post("/api/uploads", requireAuth, (req, res, next) => {
  upload.single("file")(req, res, (error) => {
    if (error) {
      next(error);
      return;
    }

    if (!req.file) {
      res.status(400).json({ error: "업로드할 파일이 없습니다." });
      return;
    }

    const isImage = req.file.mimetype.startsWith("image/");
    const isVideo = req.file.mimetype.startsWith("video/");

    res.status(201).json({
      asset: {
        filename: req.file.filename,
        mimeType: req.file.mimetype,
        name: req.file.originalname,
        size: req.file.size,
        type: isImage ? "image" : isVideo ? "video" : "file",
        url: mediaUrl(req.file.filename)
      }
    });
  });
});

app.get("/api/media/:filename", requireAuth, async (req, res, next) => {
  try {
    const filename = path.basename(req.params.filename || "");
    const filePath = path.join(uploadDir, filename);
    await fs.access(filePath);
    res.sendFile(filePath);
  } catch (error) {
    if (error?.code === "ENOENT") {
      res.status(404).json({ error: "파일을 찾을 수 없습니다." });
      return;
    }

    next(error);
  }
});

app.get("/api/bootstrap", async (req, res, next) => {
  try {
    if (!req.currentUser) {
      res.json({
        authenticated: false,
        currentUser: null
      });
      return;
    }

    const state = await loadState();

    res.json({
      authenticated: true,
      currentUser: req.currentUser,
      members: state.members,
      memberDirectory:
        req.currentUser.role === "admin" ? state.users.map(publicUser) : [],
      preferences: state.preferences,
      projects: [...state.projects]
        .sort((left, right) => left.name.localeCompare(right.name))
        .map((project) => projectSummary(project, state.pages, state.groups)),
      recentProjects: recentProjects(state.projects, state.pages, state.groups)
    });
  } catch (error) {
    next(error);
  }
});

app.get("/api/admin/members", requireAdmin, async (_req, res, next) => {
  try {
    const state = await loadState();
    res.json({
      members: state.users.map(publicUser)
    });
  } catch (error) {
    next(error);
  }
});

app.put("/api/admin/members/:memberId", requireAdmin, async (req, res, next) => {
  try {
    const state = await loadState();
    const user = state.users.find((entry) => entry.id === req.params.memberId);

    if (!user) {
      res.status(404).json({ error: "회원을 찾을 수 없습니다." });
      return;
    }

    if (req.body?.role) {
      if (!["admin", "member"].includes(req.body.role)) {
        res.status(400).json({ error: "지원하지 않는 역할입니다." });
        return;
      }

      const adminCount = state.users.filter((entry) => entry.role === "admin").length;

      if (user.role === "admin" && req.body.role !== "admin" && adminCount === 1) {
        res.status(400).json({ error: "마지막 admin 계정은 강등할 수 없습니다." });
        return;
      }

      user.role = req.body.role;
    }

    if (typeof req.body?.name === "string") {
      user.name = makeTitle(req.body.name, user.name);
    }

    if (typeof req.body?.canLogin === "boolean") {
      user.canLogin = req.body.canLogin;
    }

    if (typeof req.body?.password === "string" && req.body.password.trim().length >= 8) {
      const passwordRecord = createPasswordRecord(req.body.password);
      user.passwordHash = passwordRecord.passwordHash;
      user.passwordSalt = passwordRecord.passwordSalt;
      user.canLogin = true;
    }

    user.updatedAt = nowIso();

    const members = syncMembersFromUsers(state.users);
    await Promise.all([writeJson(files.users, state.users), writeJson(files.members, members)]);

    res.json({
      member: publicUser(user),
      members: state.users.map(publicUser)
    });
  } catch (error) {
    next(error);
  }
});

app.delete("/api/admin/members/:memberId", requireAdmin, async (req, res, next) => {
  try {
    const state = await loadState();
    const target = state.users.find((entry) => entry.id === req.params.memberId);

    if (!target) {
      res.status(404).json({ error: "회원을 찾을 수 없습니다." });
      return;
    }

    if (req.currentUser.id === target.id) {
      res.status(400).json({ error: "현재 로그인한 admin 계정은 삭제할 수 없습니다." });
      return;
    }

    const adminCount = state.users.filter((entry) => entry.role === "admin").length;

    if (target.role === "admin" && adminCount === 1) {
      res.status(400).json({ error: "마지막 admin 계정은 삭제할 수 없습니다." });
      return;
    }

    const users = state.users.filter((entry) => entry.id !== target.id);
    const members = syncMembersFromUsers(users);
    const groups = state.groups.map((group) => ({
      ...group,
      memberIds: group.memberIds.filter((memberId) => memberId !== target.id)
    }));

    await Promise.all([
      writeJson(files.users, users),
      writeJson(files.members, members),
      writeJson(files.groups, groups)
    ]);

    res.status(204).end();
  } catch (error) {
    next(error);
  }
});

app.get("/api/projects/:projectId", requireAuth, async (req, res, next) => {
  try {
    const state = await loadState();
    const project = getProjectOr404(state.projects, req.params.projectId, res);

    if (!project) {
      return;
    }

    const pages = sortPagesWithinProject(byProject(project.id, state.pages));
    const groups = byProject(project.id, state.groups).map((group) => ({
      ...group,
      colorValue: colorValue(group.color)
    }));

    res.json({
      project: projectSummary(project, state.pages, state.groups),
      pages: pages.map((page) => pageSummary(page, state.pages)),
      groups
    });
  } catch (error) {
    next(error);
  }
});

app.post("/api/projects", requireAuth, async (req, res, next) => {
  try {
    const state = await loadState();
    const project = defaultProject({
      description: req.body?.description,
      icon: req.body?.icon || makeTitle(req.body?.name, "PR").slice(0, 2),
      name: req.body?.name || "New project"
    });
    const pages = starterPages(project.id);
    const groups = defaultGroups(project.id);

    project.homePageId = pages[0]?.id || null;

    const nextProjects = [...state.projects, project];
    const nextPages = [...state.pages, ...pages];
    const nextGroups = [...state.groups, ...groups];

    await Promise.all([
      writeJson(files.projects, nextProjects),
      writeJson(files.pages, nextPages),
      writeJson(files.groups, nextGroups)
    ]);

    res.status(201).json({
      project: projectSummary(project, nextPages, nextGroups),
      pages: pages.map((page) => pageSummary(page, nextPages))
    });
  } catch (error) {
    next(error);
  }
});

app.put("/api/projects/:projectId", requireAuth, async (req, res, next) => {
  try {
    const state = await loadState();
    const project = getProjectOr404(state.projects, req.params.projectId, res);

    if (!project) {
      return;
    }

    const projectPages = byProject(project.id, state.pages);

    project.name = makeTitle(req.body?.name, project.name);
    project.description =
      typeof req.body?.description === "string"
        ? makeDescription(req.body.description, project.description)
        : project.description;
    project.icon =
      typeof req.body?.icon === "string" ? makeTitle(req.body.icon, project.icon).slice(0, 2) : project.icon;
    project.homePageId =
      req.body?.homePageId && projectPages.some((page) => page.id === req.body.homePageId)
        ? req.body.homePageId
        : project.homePageId;
    project.updatedAt = nowIso();

    await writeJson(files.projects, state.projects);

    res.json({
      project: projectSummary(project, state.pages, state.groups)
    });
  } catch (error) {
    next(error);
  }
});

app.post("/api/projects/:projectId/open", requireAuth, async (req, res, next) => {
  try {
    const state = await loadState();
    const project = getProjectOr404(state.projects, req.params.projectId, res);

    if (!project) {
      return;
    }

    const nextProjects = touchProject(state.projects, project.id, { opened: true });

    await writeJson(files.projects, nextProjects);

    res.json({
      project: projectSummary(
        nextProjects.find((entry) => entry.id === project.id),
        state.pages,
        state.groups
      ),
      recentProjects: recentProjects(nextProjects, state.pages, state.groups)
    });
  } catch (error) {
    next(error);
  }
});

app.get("/api/page-locator/:pageId", requireAuth, async (req, res, next) => {
  try {
    const { pages } = await loadState();
    const page = pages.find((entry) => entry.id === req.params.pageId);

    if (!page) {
      res.status(404).json({ error: "페이지를 찾을 수 없습니다." });
      return;
    }

    res.json({
      pageId: page.id,
      projectId: page.projectId
    });
  } catch (error) {
    next(error);
  }
});

app.get("/api/projects/:projectId/pages/:pageId", requireAuth, async (req, res, next) => {
  try {
    const state = await loadState();
    const page = getPageOr404(state.pages, req.params.projectId, req.params.pageId, res);

    if (!page) {
      return;
    }

    res.json({ page });
  } catch (error) {
    next(error);
  }
});

app.get("/api/projects/:projectId/pages/:pageId/history", requireAuth, async (req, res, next) => {
  try {
    const state = await loadState({ includeRevisions: true });
    const page = getPageOr404(state.pages, req.params.projectId, req.params.pageId, res);

    if (!page) {
      return;
    }

    const revisions = state.revisions
      .filter((entry) => entry.projectId === page.projectId && entry.pageId === page.id)
      .sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime());

    res.json({ revisions });
  } catch (error) {
    next(error);
  }
});

app.post("/api/projects/:projectId/pages", requireAuth, async (req, res, next) => {
  try {
    const state = await loadState({ includeRevisions: true });
    const project = getProjectOr404(state.projects, req.params.projectId, res);

    if (!project) {
      return;
    }

    const parentId =
      req.body?.parentId &&
      state.pages.some((page) => page.projectId === project.id && page.id === req.body.parentId)
        ? req.body.parentId
        : null;

    const page = makePage(
      {
        title: req.body?.title,
        projectId: project.id,
        parentId,
        icon: req.body?.icon,
        content: req.body?.content || clone(EMPTY_DOC),
        contentFormat: req.body?.contentFormat || "tiptap-json"
      },
      state.pages
    );

    const nextPages = [...state.pages, page];
    const nextRevisions = appendRevision(
      state.revisions,
      createRevision({
        actor: req.currentUser,
        nextPage: page
      })
    );
    reindexSiblings(nextPages, project.id, parentId);

    const nextProjects = touchProject(state.projects, project.id);
    const storedProject = nextProjects.find((entry) => entry.id === project.id);

    if (!storedProject.homePageId) {
      storedProject.homePageId = page.id;
    }

    await Promise.all([
      writeJson(files.pages, nextPages),
      writeJson(files.projects, nextProjects),
      writeJson(files.revisions, nextRevisions)
    ]);

    res.status(201).json({
      page,
      project: projectSummary(storedProject, nextPages, state.groups)
    });
  } catch (error) {
    next(error);
  }
});

app.put("/api/projects/:projectId/pages/:pageId", requireAuth, async (req, res, next) => {
  try {
    const state = await loadState({ includeRevisions: true });
    const page = getPageOr404(state.pages, req.params.projectId, req.params.pageId, res);

    if (!page) {
      return;
    }

    const previousPage = clone(page);

    page.title = makeTitle(req.body?.title, page.title);
    page.icon = typeof req.body?.icon === "string" ? req.body.icon : page.icon;

    if (req.body?.contentFormat === "markdown") {
      page.contentFormat = "markdown";
      page.content = typeof req.body?.content === "string" ? req.body.content : page.content;
    } else if (req.body?.contentFormat === "tiptap-json") {
      page.contentFormat = "tiptap-json";
      page.content =
        typeof req.body?.content === "object"
          ? normalizeStoredRichDocContent(req.body.content)
          : page.content;
    }

    page.updatedAt = nowIso();

    const nextProjects = touchProject(state.projects, page.projectId);
    const nextRevisions = appendRevision(
      state.revisions,
      createRevision({
        actor: req.currentUser,
        nextPage: page,
        previousPage
      })
    );

    await Promise.all([
      writeJson(files.pages, state.pages),
      writeJson(files.projects, nextProjects),
      writeJson(files.revisions, nextRevisions)
    ]);
    res.json({ page });
  } catch (error) {
    next(error);
  }
});

app.post("/api/projects/:projectId/pages/:pageId/move", requireAuth, async (req, res, next) => {
  try {
    const state = await loadState();
    const page = getPageOr404(state.pages, req.params.projectId, req.params.pageId, res);

    if (!page) {
      return;
    }

    const nextParentId =
      req.body?.parentId &&
      state.pages.some(
        (entry) => entry.projectId === page.projectId && entry.id === req.body.parentId
      )
        ? req.body.parentId
        : null;

    if (!canMovePage(state.pages, page.id, nextParentId, page.projectId)) {
      res.status(400).json({ error: "페이지를 자기 자신 또는 하위 페이지 아래로 이동할 수 없습니다." });
      return;
    }

    const currentParentId = page.parentId ?? null;
    const pagesWithoutCurrent = state.pages.filter((entry) => entry.id !== page.id);
    const siblings = pagesWithoutCurrent
      .filter(
        (entry) => entry.projectId === page.projectId && (entry.parentId ?? null) === nextParentId
      )
      .sort((left, right) => left.position - right.position);

    page.parentId = nextParentId;
    page.position = normalizeMovePosition(req.body?.position, siblings.length);
    page.updatedAt = nowIso();

    const nextPages = [...pagesWithoutCurrent, page];
    reindexSiblings(nextPages, page.projectId, currentParentId);
    reindexSiblings(nextPages, page.projectId, nextParentId);

    const nextProjects = touchProject(state.projects, page.projectId);

    await Promise.all([writeJson(files.pages, nextPages), writeJson(files.projects, nextProjects)]);
    res.json({ page });
  } catch (error) {
    next(error);
  }
});

app.delete("/api/projects/:projectId/pages/:pageId", requireAuth, async (req, res, next) => {
  try {
    const state = await loadState();
    const page = getPageOr404(state.pages, req.params.projectId, req.params.pageId, res);

    if (!page) {
      return;
    }

    const idsToDelete = new Set([page.id, ...collectDescendantIds(state.pages, page.id, page.projectId)]);
    const nextPages = state.pages.filter((entry) => !idsToDelete.has(entry.id));

    reindexSiblings(nextPages, page.projectId, page.parentId ?? null);

    const nextProjects = touchProject(state.projects, page.projectId).map((project) => {
      if (project.id !== page.projectId) {
        return project;
      }

      const projectPages = byProject(project.id, nextPages);

      return {
        ...project,
        homePageId:
          project.homePageId && idsToDelete.has(project.homePageId)
            ? projectPages[0]?.id || null
            : project.homePageId
      };
    });

    await Promise.all([writeJson(files.pages, nextPages), writeJson(files.projects, nextProjects)]);
    res.status(204).end();
  } catch (error) {
    next(error);
  }
});

app.post("/api/projects/:projectId/groups", requireAuth, async (req, res, next) => {
  try {
    const state = await loadState();
    const project = getProjectOr404(state.projects, req.params.projectId, res);

    if (!project) {
      return;
    }

    const group = createGroup(project.id, req.body || {});
    const nextGroups = [...state.groups, group];
    const nextProjects = touchProject(state.projects, project.id);

    await Promise.all([writeJson(files.groups, nextGroups), writeJson(files.projects, nextProjects)]);

    res.status(201).json({
      group: {
        ...group,
        colorValue: colorValue(group.color)
      }
    });
  } catch (error) {
    next(error);
  }
});

app.put("/api/projects/:projectId/groups/:groupId", requireAuth, async (req, res, next) => {
  try {
    const state = await loadState();
    const group = getGroupOr404(state.groups, req.params.projectId, req.params.groupId, res);

    if (!group) {
      return;
    }

    group.name = makeTitle(req.body?.name, group.name);
    group.description =
      typeof req.body?.description === "string" ? makeDescription(req.body.description, group.description) : group.description;
    group.color = normalizeColor(req.body?.color || group.color);
    group.updatedAt = nowIso();

    const nextProjects = touchProject(state.projects, group.projectId);

    await Promise.all([writeJson(files.groups, state.groups), writeJson(files.projects, nextProjects)]);

    res.json({
      group: {
        ...group,
        colorValue: colorValue(group.color)
      }
    });
  } catch (error) {
    next(error);
  }
});

app.put("/api/projects/:projectId/groups/:groupId/members", requireAuth, async (req, res, next) => {
  try {
    const state = await loadState();
    const group = getGroupOr404(state.groups, req.params.projectId, req.params.groupId, res);

    if (!group) {
      return;
    }

    const memberIds = Array.isArray(req.body?.memberIds)
      ? req.body.memberIds.filter((memberId) => state.members.some((member) => member.id === memberId))
      : group.memberIds;

    group.memberIds = Array.from(new Set(memberIds));
    group.updatedAt = nowIso();

    const nextProjects = touchProject(state.projects, group.projectId);

    await Promise.all([writeJson(files.groups, state.groups), writeJson(files.projects, nextProjects)]);

    res.json({
      group: {
        ...group,
        colorValue: colorValue(group.color)
      }
    });
  } catch (error) {
    next(error);
  }
});

app.delete("/api/projects/:projectId/groups/:groupId", requireAuth, async (req, res, next) => {
  try {
    const state = await loadState();
    const group = getGroupOr404(state.groups, req.params.projectId, req.params.groupId, res);

    if (!group) {
      return;
    }

    const nextGroups = state.groups.filter((entry) => entry.id !== group.id);
    const nextProjects = touchProject(state.projects, group.projectId);

    await Promise.all([writeJson(files.groups, nextGroups), writeJson(files.projects, nextProjects)]);
    res.status(204).end();
  } catch (error) {
    next(error);
  }
});

app.get("/api/members", requireAuth, async (_req, res, next) => {
  try {
    const { members } = await loadState();
    res.json({ members });
  } catch (error) {
    next(error);
  }
});

app.get("/api/preferences", requireAuth, async (_req, res, next) => {
  try {
    const { preferences } = await loadState();
    res.json({ preferences });
  } catch (error) {
    next(error);
  }
});

app.put("/api/preferences", requireAuth, async (req, res, next) => {
  try {
    const state = await loadState();
    const nextPreferences = {
      ...state.preferences,
      theme: ["light", "sepia", "slate"].includes(req.body?.theme)
        ? req.body.theme
        : state.preferences.theme,
      density: ["comfortable", "compact"].includes(req.body?.density)
        ? req.body.density
        : state.preferences.density,
      showInspector:
        typeof req.body?.showInspector === "boolean"
          ? req.body.showInspector
          : state.preferences.showInspector
    };

    await writeJson(files.preferences, nextPreferences);
    res.json({ preferences: nextPreferences });
  } catch (error) {
    next(error);
  }
});

app.post("/api/render", requireAuth, (req, res) => {
  const markdownText = typeof req.body?.markdown === "string" ? req.body.markdown : "";
  const rendered = markdown.render(markdownText);
  const allowedTags = [
    ...sanitizeHtml.defaults.allowedTags,
    "h1",
    "h2",
    "h3",
    "h4",
    "h5",
    "h6",
    "hr",
    "img",
    "table",
    "thead",
    "tbody",
    "tr",
    "th",
    "td"
  ];

  const html = sanitizeHtml(rendered, {
    allowedTags,
    allowedAttributes: {
      a: ["href", "name", "target", "rel"],
      code: ["class"],
      img: ["src", "alt", "title"],
      input: ["checked", "disabled", "type"]
    },
    allowedSchemes: ["http", "https", "mailto"]
  });

  res.json({ html });
});

app.get(/^(?!\/api).*/, (_req, res) => {
  if (!fsSync.existsSync(clientIndexPath)) {
    res.status(503).send("Client build not found. Run `npm run build` or start the Vite dev server.");
    return;
  }

  res.sendFile(clientIndexPath);
});

app.use((error, _req, res, _next) => {
  console.error(error);
  res.status(500).json({ error: "서버에서 오류가 발생했습니다." });
});

const server = app.listen(port, "0.0.0.0", async () => {
  await ensureStore();
  const wss = new WebSocketServer({ noServer: true });

  server.on("upgrade", async (req, socket, head) => {
    try {
      const requestUrl = new URL(req.url || "/", "http://localhost");

      if (!requestUrl.pathname.startsWith("/api/collab/")) {
        socket.destroy();
        return;
      }

      const session = sessionFromRequest(req);

      if (!session?.userId) {
        socket.destroy();
        return;
      }

      const state = await loadState();
      const user = state.users.find((entry) => entry.id === session.userId && entry.canLogin);
      const roomName = decodeURIComponent(requestUrl.pathname.replace("/api/collab/", ""));
      const room = parseCollaborationRoomName(roomName);
      const projectId = room?.projectId;
      const pageId = room?.pageId;
      const page = state.pages.find(
        (entry) => entry.projectId === projectId && entry.id === pageId
      );

      if (!user || !room || !projectId || !pageId || !page) {
        socket.destroy();
        return;
      }

      wss.handleUpgrade(req, socket, head, async (ws) => {
        connectionUsers.set(ws, publicUser(user));
        ws.binaryType = "arraybuffer";
        ws._zeeumPong = true;

        const earlyMessages = [];
        let doc = null;

        ws.on("message", (message) => {
          if (!doc) {
            earlyMessages.push(message);
            return;
          }

          handleCollaborationMessage(ws, doc, new Uint8Array(message));
        });
        ws.on("close", () => {
          if (doc) {
            closeCollaborationConnection(doc, ws);
          }
        });
        ws.on("error", () => {
          if (doc) {
            closeCollaborationConnection(doc, ws);
          }
        });
        ws.on("pong", () => {
          ws._zeeumPong = true;
        });

        doc = await getCollaborationDoc(roomName);
        doc.conns.set(ws, new Set());

        for (const message of earlyMessages) {
          handleCollaborationMessage(ws, doc, new Uint8Array(message));
        }

        const pingInterval = setInterval(() => {
          if (ws.readyState !== 1) {
            clearInterval(pingInterval);
            return;
          }

          if (ws._zeeumPong === false) {
            clearInterval(pingInterval);
            closeCollaborationConnection(doc, ws);
            return;
          }

          ws._zeeumPong = false;
          ws.ping();
        }, 30000);

        ws.on("close", () => clearInterval(pingInterval));

        const syncEncoder = encoding.createEncoder();
        encoding.writeVarUint(syncEncoder, collabMessageSync);
        syncProtocol.writeSyncStep1(syncEncoder, doc);
        sendCollaborationMessage(doc, ws, encoding.toUint8Array(syncEncoder));

        const awarenessStates = doc.awareness.getStates();

        if (awarenessStates.size > 0) {
          const awarenessEncoder = encoding.createEncoder();
          encoding.writeVarUint(awarenessEncoder, collabMessageAwareness);
          encoding.writeVarUint8Array(
            awarenessEncoder,
            awarenessProtocol.encodeAwarenessUpdate(
              doc.awareness,
              Array.from(awarenessStates.keys())
            )
          );
          sendCollaborationMessage(doc, ws, encoding.toUint8Array(awarenessEncoder));
        }
      });
    } catch (error) {
      console.error(error);
      socket.destroy();
    }
  });

  console.log(`Server listening on port ${port}`);
  void loadBaseState().catch((error) => {
    console.error("Failed to warm base state cache", error);
  });
});
