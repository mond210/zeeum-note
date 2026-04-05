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
  aiSettings: path.join(dataDir, "ai-settings.json"),
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
const aiPreviewTtlMs = 1000 * 60 * 15;
const collabWriteTimers = new Map();
const connectionUsers = new WeakMap();
const aiPreviewCache = new Map();
const openAiCodexOAuthFlows = new Map();
const openAiCodexOAuthEvents = new Map();
let openAiCodexLoopbackServer = null;
let openAiCodexLoopbackServerPromise = null;
let baseStateCache = null;
let baseStatePromise = null;
let revisionsCache = null;
let revisionsPromise = null;

const OPENAI_CODEX_PROVIDER_ID = "openai-codex";
const OPENAI_CODEX_AUTHORIZE_URL = "https://auth.openai.com/oauth/authorize";
const OPENAI_CODEX_TOKEN_URL = "https://auth.openai.com/oauth/token";
const OPENAI_CODEX_CLIENT_ID = "app_EMoamEEZ73f0CkXaXp7hrann";
const OPENAI_CODEX_SCOPE = "openid profile email offline_access";
const OPENAI_CODEX_CALLBACK_PORT = 1455;
const OPENAI_CODEX_CALLBACK_HOST = "0.0.0.0";
const OPENAI_CODEX_CALLBACK_PUBLIC_URL = "http://localhost:1455/auth/callback";
const OPENAI_CODEX_CALLBACK_PATH = "/auth/callback";
const OPENAI_CODEX_BASE_URL = "https://chatgpt.com/backend-api";
const OPENAI_CODEX_OAUTH_TTL_MS = 1000 * 60 * 10;
const OPENAI_CODEX_MODEL_IDS = [
  "gpt-5.4",
  "gpt-5.3-codex",
  "gpt-5.3-codex-spark",
  "gpt-5.2",
  "gpt-5.2-codex"
];

function openAiCodexStaticModels() {
  return OPENAI_CODEX_MODEL_IDS.map((id) =>
    normalizeAiModelEntry({
      contextWindow: null,
      description: "Curated OpenAI Codex model",
      id,
      label: id,
      provider: OPENAI_CODEX_PROVIDER_ID,
      supportsSpeechToText: false,
      supportsTextGeneration: true
    })
  );
}

const aiProviderCatalog = {
  claude: {
    capabilities: ["textGeneration"],
    defaultBaseUrl: "https://api.anthropic.com",
    id: "claude",
    label: "Claude"
  },
  gemini: {
    capabilities: ["textGeneration"],
    defaultBaseUrl: "https://generativelanguage.googleapis.com/v1beta",
    id: "gemini",
    label: "Gemini"
  },
  ollama: {
    capabilities: ["textGeneration"],
    defaultBaseUrl: "http://localhost:11434/api",
    id: "ollama",
    label: "Ollama"
  },
  openai: {
    capabilities: ["speechToText", "textGeneration"],
    defaultBaseUrl: "https://api.openai.com/v1",
    id: "openai",
    label: "OpenAI"
  },
  [OPENAI_CODEX_PROVIDER_ID]: {
    capabilities: ["textGeneration"],
    defaultBaseUrl: OPENAI_CODEX_BASE_URL,
    experimental: true,
    id: OPENAI_CODEX_PROVIDER_ID,
    label: "OpenAI Codex"
  },
  openrouter: {
    capabilities: ["textGeneration"],
    defaultBaseUrl: "https://openrouter.ai/api/v1",
    id: "openrouter",
    label: "OpenRouter"
  }
};

const aiProfileCatalog = {
  speechToText: {
    defaultModel: "gpt-4o-mini-transcribe",
    id: "speechToText",
    label: "Speech to text",
    providers: ["openai"]
  },
  textGeneration: {
    defaultModel: "",
    id: "textGeneration",
    label: "Text generation",
    providers: ["ollama", "openai", "openai-codex", "claude", "gemini", "openrouter"]
  }
};

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

const audioUpload = multer({
  limits: {
    fileSize: 1024 * 1024 * 25
  },
  storage: multer.memoryStorage(),
  fileFilter(_req, file, callback) {
    const mime = file.mimetype || "";

    if (mime.startsWith("audio/") || [".mp3", ".m4a", ".wav", ".webm", ".ogg"].includes(path.extname(file.originalname || "").toLowerCase())) {
      callback(null, true);
      return;
    }

    callback(new Error("오디오 파일만 전사할 수 있습니다."));
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

function httpError(message, statusCode = 400) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function stripTrailingSlash(value) {
  return String(value || "").replace(/\/+$/g, "");
}

function aiSecretSource() {
  if (process.env.AI_SETTINGS_SECRET) {
    return process.env.AI_SETTINGS_SECRET;
  }

  if (process.env.SESSION_SECRET) {
    return process.env.SESSION_SECRET;
  }

  return sessionSecret || null;
}

function aiSecretKey() {
  const source = aiSecretSource();

  if (!source) {
    throw httpError("AI_SETTINGS_SECRET 또는 SESSION_SECRET 이 필요합니다.", 500);
  }

  return crypto.createHash("sha256").update(String(source)).digest();
}

function encryptAiSecret(secret) {
  if (!secret) {
    return null;
  }

  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", aiSecretKey(), iv);
  const encrypted = Buffer.concat([cipher.update(String(secret), "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();

  return `v1:${iv.toString("base64")}:${tag.toString("base64")}:${encrypted.toString("base64")}`;
}

function decryptAiSecret(payload) {
  if (!payload) {
    return "";
  }

  const [version, ivRaw, tagRaw, encryptedRaw] = String(payload).split(":");

  if (version !== "v1" || !ivRaw || !tagRaw || !encryptedRaw) {
    throw httpError("저장된 AI 비밀정보 형식이 올바르지 않습니다.", 500);
  }

  const decipher = crypto.createDecipheriv(
    "aes-256-gcm",
    aiSecretKey(),
    Buffer.from(ivRaw, "base64")
  );
  decipher.setAuthTag(Buffer.from(tagRaw, "base64"));

  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(encryptedRaw, "base64")),
    decipher.final()
  ]);

  return decrypted.toString("utf8");
}

function maskApiKeyHint(apiKey) {
  const value = String(apiKey || "").trim();

  if (!value) {
    return null;
  }

  return value.length <= 4 ? `••••${value}` : `••••${value.slice(-4)}`;
}

function maskAccountIdHint(accountId) {
  const value = String(accountId || "").trim();

  if (!value) {
    return null;
  }

  if (value.length <= 8) {
    return `••••${value}`;
  }

  return `${value.slice(0, 4)}••••${value.slice(-4)}`;
}

function normalizeEncryptedValue(value) {
  return typeof value === "string" && value ? value : null;
}

function decodeOpenAiCodexJwt(token) {
  const value = String(token || "").trim();

  if (!value) {
    return null;
  }

  const parts = value.split(".");

  if (parts.length !== 3) {
    return null;
  }

  try {
    const payload = Buffer.from(parts[1], "base64url").toString("utf8");
    return JSON.parse(payload);
  } catch {
    return null;
  }
}

function openAiCodexAccountIdFromAccessToken(accessToken) {
  const payload = decodeOpenAiCodexJwt(accessToken);
  const auth = payload?.["https://api.openai.com/auth"];
  const accountId =
    auth?.chatgpt_account_user_id ||
    auth?.chatgpt_user_id ||
    auth?.user_id ||
    (payload?.iss && payload?.sub ? `${payload.iss}|${payload.sub}` : null) ||
    payload?.sub;

  return typeof accountId === "string" && accountId.trim() ? accountId.trim() : null;
}

function providerDefaultConfig(providerId) {
  const meta = aiProviderCatalog[providerId];
  const timestamp = nowIso();
  const isOpenAiCodex = providerId === OPENAI_CODEX_PROVIDER_ID;

  return {
    apiKeyEncrypted: null,
    apiKeyHint: null,
    baseUrl: meta?.defaultBaseUrl || "",
    enabled: providerId === "ollama",
    lastTest: {
      checkedAt: null,
      message: "Not tested",
      ok: false
    },
    modelCache: {
      error: null,
      fetchedAt: null,
      models: isOpenAiCodex ? openAiCodexStaticModels() : []
    },
    oauthAccessEncrypted: null,
    oauthAccountIdEncrypted: null,
    oauthExpiresEncrypted: null,
    oauthRefreshEncrypted: null,
    updatedAt: timestamp
  };
}

function defaultAiSettings() {
  return {
    profiles: Object.fromEntries(
      Object.values(aiProfileCatalog).map((profile) => [
        profile.id,
        {
          model: profile.defaultModel,
          provider: profile.providers[0] || null,
          updatedAt: nowIso()
        }
      ])
    ),
    providers: Object.fromEntries(
      Object.values(aiProviderCatalog).map((provider) => [provider.id, providerDefaultConfig(provider.id)])
    ),
    version: 1
  };
}

function normalizeAiModelEntry(entry = {}) {
  return {
    contextWindow: Number(entry.contextWindow || entry.maxInputTokens || entry.inputTokenLimit || 0) || null,
    description: typeof entry.description === "string" ? entry.description : "",
    id: typeof entry.id === "string" ? entry.id : "",
    label: typeof entry.label === "string" ? entry.label : typeof entry.id === "string" ? entry.id : "",
    provider: typeof entry.provider === "string" ? entry.provider : "",
    supportsSpeechToText: Boolean(entry.supportsSpeechToText),
    supportsTextGeneration: Boolean(entry.supportsTextGeneration)
  };
}

function normalizeAiSettings(settings) {
  const defaults = defaultAiSettings();
  const next = {
    ...defaults,
    ...((settings && typeof settings === "object") ? settings : {})
  };

  next.providers = Object.fromEntries(
    Object.keys(aiProviderCatalog).map((providerId) => {
      const defaultsForProvider = providerDefaultConfig(providerId);
      const current = next.providers?.[providerId] || {};

      return [
        providerId,
        {
          ...defaultsForProvider,
          ...current,
          apiKeyEncrypted:
            typeof current.apiKeyEncrypted === "string" && current.apiKeyEncrypted
              ? current.apiKeyEncrypted
              : null,
          apiKeyHint:
            typeof current.apiKeyHint === "string" && current.apiKeyHint
              ? current.apiKeyHint
              : null,
          baseUrl: stripTrailingSlash(current.baseUrl || defaultsForProvider.baseUrl),
          enabled: typeof current.enabled === "boolean" ? current.enabled : defaultsForProvider.enabled,
          lastTest: {
            ...defaultsForProvider.lastTest,
            ...(current.lastTest || {})
          },
          modelCache: {
            ...defaultsForProvider.modelCache,
            ...(current.modelCache || {}),
            models: Array.isArray(current.modelCache?.models) && current.modelCache.models.length > 0
              ? current.modelCache.models.map(normalizeAiModelEntry).filter((model) => model.id)
              : defaultsForProvider.modelCache.models
          },
          oauthAccessEncrypted: normalizeEncryptedValue(current.oauthAccessEncrypted),
          oauthAccountIdEncrypted: normalizeEncryptedValue(current.oauthAccountIdEncrypted),
          oauthExpiresEncrypted: normalizeEncryptedValue(current.oauthExpiresEncrypted),
          oauthRefreshEncrypted: normalizeEncryptedValue(current.oauthRefreshEncrypted),
          updatedAt: current.updatedAt || defaultsForProvider.updatedAt
        }
      ];
    })
  );

  next.profiles = Object.fromEntries(
    Object.keys(aiProfileCatalog).map((profileId) => {
      const current = next.profiles?.[profileId] || {};
      const defaultsForProfile = aiProfileCatalog[profileId];
      const provider =
        typeof current.provider === "string" && defaultsForProfile.providers.includes(current.provider)
          ? current.provider
          : defaultsForProfile.providers[0] || null;

      return [
        profileId,
        {
          model: typeof current.model === "string" ? current.model : defaultsForProfile.defaultModel,
          provider,
          updatedAt: current.updatedAt || nowIso()
        }
      ];
    })
  );

  next.version = 1;
  return next;
}

function sanitizeAiSettingsForClient(settings) {
  const normalized = normalizeAiSettings(settings);

  return {
    profiles: normalized.profiles,
    providerCatalog: Object.values(aiProviderCatalog),
    providers: Object.fromEntries(
      Object.entries(normalized.providers).map(([providerId, config]) => [
        providerId,
        {
          ...config,
          apiKeyEncrypted: undefined,
          hasApiKey: Boolean(config.apiKeyEncrypted),
          oauthAccessEncrypted: undefined,
          oauthAccountIdEncrypted: undefined,
          oauthExpiresEncrypted: undefined,
          oauthRefreshEncrypted: undefined,
          oauth: providerId === OPENAI_CODEX_PROVIDER_ID
            ? {
                accountIdHint: maskAccountIdHint(
                  (() => {
                    try {
                      return decryptAiSecret(config.oauthAccountIdEncrypted);
                    } catch {
                      return "";
                    }
                  })()
                ),
                connected: Boolean(config.oauthAccessEncrypted || config.oauthRefreshEncrypted),
                expiresAt: (() => {
                  try {
                    const raw = decryptAiSecret(config.oauthExpiresEncrypted);
                    const value = Number(raw);
                    return raw && Number.isFinite(value) ? value : null;
                  } catch {
                    return null;
                  }
                })()
              }
            : null,
          providerId
        }
      ])
    ),
    version: normalized.version
  };
}

function normalizeEmail(value) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function makeTitle(value, fallback = "Untitled") {
  const normalized = typeof value === "string" ? value.trim() : "";
  return normalized.slice(0, 120) || fallback;
}

function makeUniqueSiblingTitle(pages, { excludePageId = null, parentId = null, projectId, title }) {
  const normalizedTitle = makeTitle(title, "Untitled page");
  const siblingTitles = new Set(
    (pages || [])
      .filter((page) => {
        return (
          page.projectId === projectId &&
          (page.parentId ?? null) === (parentId ?? null) &&
          page.id !== excludePageId
        );
      })
      .map((page) => makeTitle(page.title).toLowerCase())
  );

  if (!siblingTitles.has(normalizedTitle.toLowerCase())) {
    return normalizedTitle;
  }

  const match = normalizedTitle.match(/^(.*?)(?: \((\d+)\))?$/);
  const baseTitle = (match?.[1] || normalizedTitle).trim() || normalizedTitle;
  let counter = 2;
  let candidate = `${baseTitle} (${counter})`;

  while (siblingTitles.has(candidate.toLowerCase())) {
    counter += 1;
    candidate = `${baseTitle} (${counter})`;
  }

  return candidate;
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
  } else if (file === files.aiSettings) {
    baseStateCache.aiSettings = value;
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

function isFolderPage(page) {
  return page?.icon === "folder_open";
}

function canParentAcceptChild(parent, child) {
  if (!parent) {
    return true;
  }

  if (isFolderPage(parent)) {
    return true;
  }

  return !isFolderPage(child);
}

function nearestValidContainerParentId(pagesById, page) {
  let currentId = page.parentId ?? null;
  const visited = new Set([page.id]);

  while (currentId) {
    if (visited.has(currentId)) {
      return null;
    }

    visited.add(currentId);

    const parent = pagesById.get(currentId);

    if (!parent || parent.projectId !== page.projectId) {
      return null;
    }

    if (canParentAcceptChild(parent, page)) {
      return parent.id;
    }

    currentId = parent.parentId ?? null;
  }

  return null;
}

function normalizePageHierarchy(pages) {
  const originalOrder = new Map(pages.map((page, index) => [page.id, index]));
  const pagesById = new Map(pages.map((page) => [page.id, page]));
  const normalized = pages.map((page, index) => {
    const currentParentId = page.parentId ?? null;
    const nextParentId = currentParentId
      ? nearestValidContainerParentId(pagesById, page)
      : null;
    const parentChanged = currentParentId !== nextParentId;

    return {
      ...page,
      parentId: nextParentId,
      position: parentChanged ? 1_000_000 + index : page.position
    };
  });

  const projectIds = new Set(normalized.map((page) => page.projectId));

  projectIds.forEach((projectId) => {
    const parentIds = new Set(
      normalized
        .filter((page) => page.projectId === projectId)
        .map((page) => page.parentId ?? null)
    );

    parentIds.forEach((parentId) => {
      const siblings = normalized
        .filter(
          (page) =>
            page.projectId === projectId && (page.parentId ?? null) === (parentId ?? null)
        )
        .sort((left, right) => {
          if (left.position === right.position) {
            return (originalOrder.get(left.id) ?? 0) - (originalOrder.get(right.id) ?? 0);
          }

          return left.position - right.position;
        });

      siblings.forEach((page, index) => {
        page.position = index;
      });
    });
  });

  return normalized;
}

function resolveRequestedParentId(pages, projectId, requestedParentId, child) {
  if (!requestedParentId) {
    return { parentId: null };
  }

  const parent = pages.find((page) => page.projectId === projectId && page.id === requestedParentId);

  if (!parent) {
    return { error: "대상 위치를 찾을 수 없습니다." };
  }

  if (!canParentAcceptChild(parent, child)) {
    return {
      error: isFolderPage(child)
        ? "폴더는 루트 또는 폴더 아래에만 둘 수 있습니다."
        : "페이지는 루트, 페이지, 또는 폴더 아래에 둘 수 있습니다."
    };
  }

  return { parentId: parent.id };
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
    readJson(files.aiSettings, null),
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

  let [aiSettings, projects, revisions, users, workspace, pages, groups, members, preferences, legacyNotes] = existingState;
  let changed = false;

  const normalizedAiSettings = normalizeAiSettings(aiSettings);

  if (JSON.stringify(normalizedAiSettings) !== JSON.stringify(aiSettings)) {
    aiSettings = normalizedAiSettings;
    changed = true;
  } else {
    aiSettings = normalizedAiSettings;
  }

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

  const normalizedHierarchyPages = normalizePageHierarchy(pages);

  if (JSON.stringify(normalizedHierarchyPages) !== JSON.stringify(pages)) {
    pages = normalizedHierarchyPages;
    changed = true;
  } else {
    pages = normalizedHierarchyPages;
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
      writeJson(files.aiSettings, aiSettings),
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
      readJson(files.aiSettings, defaultAiSettings()),
      readJson(files.projects, []),
      readJson(files.pages, []),
      readJson(files.groups, []),
      readJson(files.users, []),
      readJson(files.members, []),
      readJson(files.preferences, defaultPreferences())
    ]).then(([aiSettings, projects, pages, groups, users, members, preferences]) => {
      baseStateCache = {
        aiSettings: normalizeAiSettings(aiSettings),
        groups,
        members,
        pages,
        preferences,
        projects,
        users
      };
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
  const title = makeUniqueSiblingTitle(pages, {
    parentId,
    projectId: seed.projectId,
    title: seed.title
  });

  return {
    id: crypto.randomUUID(),
    projectId: seed.projectId,
    title,
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
  const lines = String(markdownText || "").replace(/\r\n/g, "\n").split("\n");
  const content = [];
  let codeLines = [];
  let inCodeBlock = false;
  let listType = null;
  let listItems = [];
  let paragraphLines = [];

  function textParagraph(text) {
    const value = String(text || "").trim();

    if (!value) {
      return { type: "paragraph" };
    }

    return {
      type: "paragraph",
      content: [{ type: "text", text: value }]
    };
  }

  function flushParagraph() {
    if (paragraphLines.length === 0) {
      return;
    }

    content.push(textParagraph(paragraphLines.join(" ").trim()));
    paragraphLines = [];
  }

  function flushList() {
    if (!listType || listItems.length === 0) {
      listItems = [];
      listType = null;
      return;
    }

    content.push({
      type: listType,
      content: listItems
    });
    listItems = [];
    listType = null;
  }

  function flushCodeBlock() {
    if (codeLines.length === 0) {
      content.push({
        type: "codeBlock"
      });
      return;
    }

    content.push({
      type: "codeBlock",
      content: [
        {
          type: "text",
          text: codeLines.join("\n")
        }
      ]
    });
    codeLines = [];
  }

  for (const rawLine of lines) {
    const line = String(rawLine || "");
    const trimmed = line.trim();

    if (inCodeBlock) {
      if (/^```/.test(trimmed)) {
        flushCodeBlock();
        inCodeBlock = false;
      } else {
        codeLines.push(line);
      }
      continue;
    }

    if (/^```/.test(trimmed)) {
      flushParagraph();
      flushList();
      inCodeBlock = true;
      codeLines = [];
      continue;
    }

    if (!trimmed) {
      flushParagraph();
      flushList();
      continue;
    }

    const headingMatch = /^(#{1,3})\s+(.+)$/.exec(trimmed);

    if (headingMatch) {
      flushParagraph();
      flushList();
      content.push({
        type: "heading",
        attrs: {
          level: headingMatch[1].length
        },
        content: [{ type: "text", text: headingMatch[2].trim() }]
      });
      continue;
    }

    if (/^(?:---|\*\*\*|___)\s*$/.test(trimmed)) {
      flushParagraph();
      flushList();
      content.push({ type: "horizontalRule" });
      continue;
    }

    const blockquoteMatch = /^>\s?(.*)$/.exec(trimmed);

    if (blockquoteMatch) {
      flushParagraph();
      flushList();
      content.push({
        type: "blockquote",
        content: [textParagraph(blockquoteMatch[1])]
      });
      continue;
    }

    const taskMatch = /^-\s\[( |x|X)\]\s+(.+)$/.exec(trimmed);

    if (taskMatch) {
      flushParagraph();

      if (listType !== "taskList") {
        flushList();
        listType = "taskList";
      }

      listItems.push({
        type: "taskItem",
        attrs: {
          checked: /x/i.test(taskMatch[1])
        },
        content: [textParagraph(taskMatch[2])]
      });
      continue;
    }

    const bulletMatch = /^[-*]\s+(.+)$/.exec(trimmed);

    if (bulletMatch) {
      flushParagraph();

      if (listType !== "bulletList") {
        flushList();
        listType = "bulletList";
      }

      listItems.push({
        type: "listItem",
        content: [textParagraph(bulletMatch[1])]
      });
      continue;
    }

    const orderedMatch = /^\d+\.\s+(.+)$/.exec(trimmed);

    if (orderedMatch) {
      flushParagraph();

      if (listType !== "orderedList") {
        flushList();
        listType = "orderedList";
      }

      listItems.push({
        type: "listItem",
        content: [textParagraph(orderedMatch[1])]
      });
      continue;
    }

    flushList();
    paragraphLines.push(trimmed);
  }

  if (inCodeBlock) {
    flushCodeBlock();
  }

  flushParagraph();
  flushList();

  return {
    type: "doc",
    content: content.length > 0 ? content : clone(EMPTY_DOC.content)
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

function jsonResponseSafe(text) {
  if (!text) {
    return {};
  }

  try {
    return JSON.parse(text);
  } catch {
    return {};
  }
}

async function requestJson(url, { body, headers = {}, method = "GET", timeoutMs = 20000 } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      body: body === undefined ? undefined : JSON.stringify(body),
      headers: {
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
        ...headers
      },
      method,
      signal: controller.signal
    });
    const text = await response.text();
    const payload = jsonResponseSafe(text);

    if (!response.ok) {
      const message =
        payload?.error?.message ||
        payload?.error ||
        payload?.message ||
        text ||
        `${response.status} ${response.statusText}`;
      throw httpError(message, 502);
    }

    return payload;
  } catch (error) {
    if (error?.name === "AbortError") {
      throw httpError("요청 시간이 초과되었습니다.", 504);
    }

    throw error;
  } finally {
    clearTimeout(timer);
  }
}

async function requestFormData(url, { formData, headers = {}, method = "POST", timeoutMs = 30000 } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      body: formData,
      headers,
      method,
      signal: controller.signal
    });
    const text = await response.text();
    const payload = jsonResponseSafe(text);

    if (!response.ok) {
      const message =
        payload?.error?.message ||
        payload?.error ||
        payload?.message ||
        text ||
        `${response.status} ${response.statusText}`;
      throw httpError(message, 502);
    }

    return payload;
  } catch (error) {
    if (error?.name === "AbortError") {
      throw httpError("요청 시간이 초과되었습니다.", 504);
    }

    throw error;
  } finally {
    clearTimeout(timer);
  }
}

function requestSessionToken(req) {
  const authHeader = req.headers.authorization || "";
  const requestUrl = new URL(req.url || "/", "http://localhost");

  if (authHeader.startsWith("Bearer ")) {
    return authHeader.slice("Bearer ".length).trim();
  }

  const authParam = requestUrl.searchParams.get("auth") || "";
  if (authParam) {
    return authParam;
  }

  const cookies = parseCookies(req.headers.cookie || "");
  return cookies[sessionCookieName] || "";
}

function openAiCodexSessionScopeKey(req) {
  const sessionToken = requestSessionToken(req);
  const session = readSessionToken(sessionToken);

  if (!session || !req.currentUser) {
    return null;
  }

  return `${req.currentUser.id}:${crypto.createHash("sha256").update(sessionToken).digest("hex")}`;
}

function openAiCodexFlowKey(state) {
  return String(state || "").trim();
}

function clearOpenAiCodexOAuthFlowsForSession(sessionScopeKey) {
  for (const [state, flow] of openAiCodexOAuthFlows.entries()) {
    if (flow.sessionScopeKey === sessionScopeKey) {
      clearOpenAiCodexOAuthFlow(state);
    }
  }
}

function setOpenAiCodexOAuthEvent(sessionScopeKey, patch = {}) {
  if (!sessionScopeKey) {
    return null;
  }

  const current = openAiCodexOAuthEvents.get(sessionScopeKey) || {
    connected: false,
    message: "",
    providerId: OPENAI_CODEX_PROVIDER_ID,
    updatedAt: null
  };
  const next = {
    ...current,
    ...patch,
    providerId: OPENAI_CODEX_PROVIDER_ID,
    updatedAt: nowIso()
  };

  openAiCodexOAuthEvents.set(sessionScopeKey, next);
  return next;
}

function clearOpenAiCodexOAuthEvent(sessionScopeKey) {
  if (!sessionScopeKey) {
    return;
  }

  openAiCodexOAuthEvents.delete(sessionScopeKey);
}

function closeOpenAiCodexLoopbackServerIfIdle() {
  if (openAiCodexOAuthFlows.size > 0 || !openAiCodexLoopbackServer) {
    return;
  }

  const server = openAiCodexLoopbackServer;
  openAiCodexLoopbackServer = null;
  openAiCodexLoopbackServerPromise = null;
  server.close();
}

function clearOpenAiCodexOAuthFlow(state) {
  const key = openAiCodexFlowKey(state);
  const flow = openAiCodexOAuthFlows.get(key);

  if (flow?.timeout) {
    clearTimeout(flow.timeout);
  }

  openAiCodexOAuthFlows.delete(key);
  closeOpenAiCodexLoopbackServerIfIdle();
}

async function ensureOpenAiCodexLoopbackServer() {
  if (openAiCodexLoopbackServer) {
    return openAiCodexLoopbackServer;
  }

  if (!openAiCodexLoopbackServerPromise) {
    openAiCodexLoopbackServerPromise = new Promise((resolve, reject) => {
      const listener = app.listen(OPENAI_CODEX_CALLBACK_PORT, OPENAI_CODEX_CALLBACK_HOST, () => {
        openAiCodexLoopbackServer = listener;
        openAiCodexLoopbackServerPromise = null;
        resolve(listener);
      });

      listener.once("error", (error) => {
        openAiCodexLoopbackServer = null;
        openAiCodexLoopbackServerPromise = null;
        reject(
          httpError(
            `OpenAI Codex OAuth callback listener를 localhost:${OPENAI_CODEX_CALLBACK_PORT} 에 열지 못했습니다. 다른 프로세스가 포트를 사용 중인지 확인하세요.`,
            500
          )
        );
      });
    });
  }

  return openAiCodexLoopbackServerPromise;
}

function getOpenAiCodexOAuthFlowByState(state) {
  return openAiCodexOAuthFlows.get(openAiCodexFlowKey(state)) || null;
}

function createOpenAiCodexPkce() {
  const verifier = crypto.randomBytes(32).toString("base64url");
  const challenge = crypto.createHash("sha256").update(verifier).digest("base64url");

  return { challenge, verifier };
}

function buildOpenAiCodexAuthorizeUrl({ callbackUrl, state, challenge }) {
  const url = new URL(OPENAI_CODEX_AUTHORIZE_URL);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", OPENAI_CODEX_CLIENT_ID);
  url.searchParams.set("redirect_uri", callbackUrl);
  url.searchParams.set("scope", OPENAI_CODEX_SCOPE);
  url.searchParams.set("code_challenge", challenge);
  url.searchParams.set("code_challenge_method", "S256");
  url.searchParams.set("state", state);
  url.searchParams.set("id_token_add_organizations", "true");
  url.searchParams.set("codex_cli_simplified_flow", "true");
  url.searchParams.set("originator", "pi");

  return url.toString();
}

async function requestOpenAiCodexTokens({ code, codeVerifier, redirectUri, grantType = "authorization_code", refreshToken = "" }) {
  const body = new URLSearchParams({
    client_id: OPENAI_CODEX_CLIENT_ID,
    grant_type: grantType
  });

  if (grantType === "authorization_code") {
    body.set("code", code);
    body.set("code_verifier", codeVerifier);
    body.set("redirect_uri", redirectUri);
  } else {
    body.set("refresh_token", refreshToken);
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20000);

  try {
    const response = await fetch(OPENAI_CODEX_TOKEN_URL, {
      body,
      headers: {
        "Content-Type": "application/x-www-form-urlencoded"
      },
      method: "POST",
      signal: controller.signal
    });

    const text = await response.text();
    const payload = jsonResponseSafe(text);

    if (!response.ok) {
      const message =
        payload?.error?.message ||
        payload?.error_description ||
        payload?.error ||
        text ||
        `${response.status} ${response.statusText}`;
      throw httpError(`OpenAI Codex OAuth 토큰 교환에 실패했습니다. ${message}`, 502);
    }

    const access = typeof payload.access_token === "string" ? payload.access_token : "";
    const refresh = typeof payload.refresh_token === "string" ? payload.refresh_token : "";
    const expiresIn = Number(payload.expires_in);

    if (!access || !refresh || !Number.isFinite(expiresIn)) {
      throw httpError("OpenAI Codex OAuth 응답 형식이 올바르지 않습니다.", 502);
    }

    return {
      access,
      expiresAt: nowMs() + expiresIn * 1000,
      refresh
    };
  } catch (error) {
    if (error?.name === "AbortError") {
      throw httpError("OpenAI Codex OAuth 요청 시간이 초과되었습니다.", 504);
    }

    throw error;
  } finally {
    clearTimeout(timer);
  }
}

function resolveOpenAiCodexUrl(baseUrl) {
  const raw = String(baseUrl || "").trim() || OPENAI_CODEX_BASE_URL;
  const normalized = raw.replace(/\/+$/, "");

  if (normalized.endsWith("/codex/responses")) {
    return normalized;
  }

  if (normalized.endsWith("/codex")) {
    return `${normalized}/responses`;
  }

  return `${normalized}/codex/responses`;
}

function buildOpenAiCodexUserAgent() {
  return `pi (${process.platform} ${process.arch})`;
}

function buildOpenAiCodexHeaders({ accessToken, accountId }) {
  return {
    accept: "text/event-stream",
    Authorization: `Bearer ${accessToken}`,
    "chatgpt-account-id": accountId,
    "content-type": "application/json",
    "OpenAI-Beta": "responses=experimental",
    originator: "pi",
    "User-Agent": buildOpenAiCodexUserAgent()
  };
}

async function parseOpenAiCodexErrorResponse(response) {
  const raw = await response.text().catch(() => "");
  let message = raw || response.statusText || "OpenAI Codex request failed";

  try {
    const parsed = JSON.parse(raw);
    const err = parsed?.error;

    if (err) {
      const code = err.code || err.type || "";

      if (/usage_limit_reached|usage_not_included|rate_limit_exceeded/i.test(code) || response.status === 429) {
        const plan = err.plan_type ? ` (${String(err.plan_type).toLowerCase()} plan)` : "";
        message = `You have hit your ChatGPT usage limit${plan}.`;
      } else {
        message = err.message || message;
      }
    }
  } catch {}

  return message;
}

async function* parseOpenAiCodexSseEvents(response) {
  if (!response.body) {
    return;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();

      if (done) {
        break;
      }

      buffer += decoder.decode(value, { stream: true });
      let boundaryIndex = buffer.indexOf("\n\n");

      while (boundaryIndex !== -1) {
        const chunk = buffer.slice(0, boundaryIndex);
        buffer = buffer.slice(boundaryIndex + 2);
        const dataLines = chunk
          .split("\n")
          .filter((line) => line.startsWith("data:"))
          .map((line) => line.slice(5).trim());

        if (dataLines.length > 0) {
          const data = dataLines.join("\n").trim();

          if (data && data !== "[DONE]") {
            try {
              yield JSON.parse(data);
            } catch {}
          }
        }

        boundaryIndex = buffer.indexOf("\n\n");
      }
    }
  } finally {
    try {
      await reader.cancel();
    } catch {}

    try {
      reader.releaseLock();
    } catch {}
  }
}

async function maybeRefreshOpenAiCodexCredentials(state) {
  const stored = getOpenAiCodexStoredOAuth(state);

  if (!stored?.connected) {
    throw httpError("OpenAI Codex OAuth 연결이 필요합니다.");
  }

  if (stored.expiresAt && stored.expiresAt > nowMs() + 30_000) {
    return stored;
  }

  if (!stored.refresh) {
    throw httpError("OpenAI Codex OAuth refresh token 이 없습니다. 다시 로그인하세요.");
  }

  const refreshed = await requestOpenAiCodexTokens({
    grantType: "refresh_token",
    redirectUri: OPENAI_CODEX_CALLBACK_PUBLIC_URL,
    refreshToken: stored.refresh
  });

  await persistOpenAiCodexOAuthCredentials(refreshed);

  return {
    access: refreshed.access,
    accountId: openAiCodexAccountIdFromAccessToken(refreshed.access) || "",
    connected: true,
    expiresAt: refreshed.expiresAt,
    refresh: refreshed.refresh
  };
}

async function generateOpenAiCodexText(runtimeConfig, prompt, state) {
  const stored = await maybeRefreshOpenAiCodexCredentials(state);
  const accountId = stored.accountId || openAiCodexAccountIdFromAccessToken(stored.access);

  if (!accountId) {
    throw httpError("OpenAI Codex access token 에서 accountId 를 읽지 못했습니다. 다시 로그인하세요.", 502);
  }

  const body = {
    include: ["reasoning.encrypted_content"],
    input: [
      {
        content: [
          {
            text: prompt.user,
            type: "input_text"
          }
        ],
        role: "user"
      }
    ],
    instructions: prompt.system,
    model: runtimeConfig.model,
    parallel_tool_calls: true,
    store: false,
    stream: true,
    text: {
      verbosity: "medium"
    },
    tool_choice: "auto"
  };

  const response = await fetch(resolveOpenAiCodexUrl(runtimeConfig.baseUrl), {
    body: JSON.stringify(body),
    headers: buildOpenAiCodexHeaders({
      accessToken: stored.access,
      accountId
    }),
    method: "POST"
  });

  if (!response.ok) {
    const message = await parseOpenAiCodexErrorResponse(response);
    throw httpError(`OpenAI Codex 요청에 실패했습니다. ${message}`, response.status === 429 ? 429 : 502);
  }

  let text = "";

  for await (const event of parseOpenAiCodexSseEvents(response)) {
    const type = typeof event?.type === "string" ? event.type : "";

    if (type === "error") {
      const code = event.code || "";
      const message = event.message || "";
      throw httpError(`OpenAI Codex error: ${message || code || JSON.stringify(event)}`, 502);
    }

    if (type === "response.failed") {
      const message = event.response?.error?.message || "OpenAI Codex response failed";
      throw httpError(message, 502);
    }

    if (type === "response.output_text.delta" || type === "response.refusal.delta") {
      text += event.delta || "";
      continue;
    }

    if (type === "response.output_item.done" && !text) {
      const item = event.item;

      if (item?.type === "message" && Array.isArray(item.content)) {
        text = item.content
          .map((entry) => {
            if (entry?.type === "output_text") {
              return entry.text || "";
            }

            if (entry?.type === "refusal") {
              return entry.refusal || "";
            }

            return "";
          })
          .join("");
      }
    }

    if (type === "response.completed" || type === "response.done" || type === "response.incomplete") {
      break;
    }
  }

  if (!text.trim()) {
    throw httpError("OpenAI Codex 응답에서 텍스트를 추출하지 못했습니다.", 502);
  }

  return text.trim();
}

function getOpenAiCodexStoredOAuth(state) {
  const settings = normalizeAiSettings(state.aiSettings);
  const config = settings.providers[OPENAI_CODEX_PROVIDER_ID];

  if (!config) {
    return null;
  }

  const access = config.oauthAccessEncrypted ? decryptAiSecret(config.oauthAccessEncrypted) : "";
  const refresh = config.oauthRefreshEncrypted ? decryptAiSecret(config.oauthRefreshEncrypted) : "";
  const accountId = config.oauthAccountIdEncrypted ? decryptAiSecret(config.oauthAccountIdEncrypted) : "";
  const expiresRaw = config.oauthExpiresEncrypted ? decryptAiSecret(config.oauthExpiresEncrypted) : "";
  const expiresAt = Number(expiresRaw);

  return {
    access,
    accountId: typeof accountId === "string" ? accountId : "",
    connected: Boolean(access || refresh),
    expiresAt: Number.isFinite(expiresAt) ? expiresAt : null,
    refresh
  };
}

async function persistOpenAiCodexOAuthCredentials(credentials) {
  const state = await loadState();
  const next = normalizeAiSettings(state.aiSettings);
  const current = next.providers[OPENAI_CODEX_PROVIDER_ID];

  if (!current) {
    return next;
  }

  const accountId = openAiCodexAccountIdFromAccessToken(credentials.access) || credentials.accountId || "";

  next.providers[OPENAI_CODEX_PROVIDER_ID] = {
    ...current,
    oauthAccessEncrypted: encryptAiSecret(credentials.access),
    oauthAccountIdEncrypted: encryptAiSecret(accountId),
    oauthExpiresEncrypted: encryptAiSecret(String(credentials.expiresAt)),
    oauthRefreshEncrypted: encryptAiSecret(credentials.refresh),
    updatedAt: nowIso()
  };

  await writeJson(files.aiSettings, next);
  return next;
}

async function clearOpenAiCodexOAuthCredentials() {
  const state = await loadState();
  const next = normalizeAiSettings(state.aiSettings);
  const current = next.providers[OPENAI_CODEX_PROVIDER_ID];

  if (!current) {
    return next;
  }

  next.providers[OPENAI_CODEX_PROVIDER_ID] = {
    ...current,
    oauthAccessEncrypted: null,
    oauthAccountIdEncrypted: null,
    oauthExpiresEncrypted: null,
    oauthRefreshEncrypted: null,
    updatedAt: nowIso()
  };

  await writeJson(files.aiSettings, next);
  return next;
}

function openAiCodexOauthStatus(state, req) {
  const stored = getOpenAiCodexStoredOAuth(state);
  const sessionScopeKey = openAiCodexSessionScopeKey(req);
  const flow = [...openAiCodexOAuthFlows.values()].find((entry) => entry.sessionScopeKey === sessionScopeKey);
  const event = sessionScopeKey ? openAiCodexOAuthEvents.get(sessionScopeKey) || null : null;

  return {
    accountIdHint: maskAccountIdHint(stored?.accountId || ""),
    connected: Boolean(stored?.connected),
    expiresAt: stored?.expiresAt || null,
    message:
      event?.message ||
      (stored?.connected
        ? "ChatGPT OAuth 연결이 완료되었습니다."
        : flow
          ? "ChatGPT OAuth 인증을 기다리는 중입니다."
          : ""),
    pending: Boolean(flow),
    stateExpiresAt: flow?.expiresAt || null,
    updatedAt: event?.updatedAt || null,
    providerId: OPENAI_CODEX_PROVIDER_ID
  };
}

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function buildOpenAiCodexOAuthHtml(title, message, tone = "success") {
  const palette =
    tone === "error"
      ? { bg: "#fef2f2", border: "#fecaca", text: "#b91c1c" }
      : { bg: "#f0fdf4", border: "#bbf7d0", text: "#166534" };

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(title)}</title>
  <style>
    body { font-family: ui-sans-serif, system-ui, sans-serif; margin: 0; padding: 32px; background: #f8fafc; color: #0f172a; }
    main { max-width: 560px; margin: 0 auto; padding: 24px; border: 1px solid ${palette.border}; background: ${palette.bg}; color: ${palette.text}; }
    h1 { margin: 0 0 12px; font-size: 1.25rem; }
    p { margin: 0; line-height: 1.6; }
  </style>
</head>
<body>
  <main>
    <h1>${escapeHtml(title)}</h1>
    <p>${escapeHtml(message)}</p>
  </main>
  <script>
    try {
      window.opener?.postMessage({ type: "openai-codex-oauth", ok: ${tone !== "error"} }, window.location.origin);
    } catch {}
    setTimeout(() => window.close(), 1500);
  </script>
</body>
</html>`;
}

function providerSupportsProfile(providerId, profileId) {
  return Boolean(aiProfileCatalog[profileId]?.providers.includes(providerId));
}

function currentProviderConfig(state, providerId) {
  const settings = normalizeAiSettings(state.aiSettings);
  const config = settings.providers[providerId];

  if (!config) {
    throw httpError("지원하지 않는 provider 입니다.", 404);
  }

  return config;
}

function runtimeProviderConfig(state, providerId, draft = {}) {
  const config = currentProviderConfig(state, providerId);
  const isOpenAiCodex = providerId === OPENAI_CODEX_PROVIDER_ID;
  const merged = {
    ...config,
    ...draft,
    baseUrl: isOpenAiCodex
      ? aiProviderCatalog[providerId].defaultBaseUrl
      : stripTrailingSlash(draft.baseUrl || config.baseUrl || aiProviderCatalog[providerId].defaultBaseUrl)
  };

  const apiKey =
    typeof draft.apiKey === "string" && draft.apiKey.trim()
      ? draft.apiKey.trim()
      : decryptAiSecret(config.apiKeyEncrypted);

  return {
    ...merged,
    apiKey,
    providerId
  };
}

function ensureProviderAccess(runtimeConfig) {
  if (!runtimeConfig.baseUrl) {
    throw httpError("Base URL 이 필요합니다.");
  }

  if (runtimeConfig.providerId !== "ollama" && !runtimeConfig.apiKey) {
    throw httpError("API key 가 설정되지 않았습니다.");
  }
}

function openAiCompatibleHeaders(runtimeConfig) {
  return {
    Authorization: `Bearer ${runtimeConfig.apiKey}`
  };
}

function normalizeOpenAiModelEntry(providerId, entry) {
  const modelId = typeof entry?.id === "string" ? entry.id : "";
  const lower = modelId.toLowerCase();
  const supportsSpeechToText = /transcribe|whisper/.test(lower);

  return normalizeAiModelEntry({
    description: "",
    id: modelId,
    label: modelId,
    provider: providerId,
    supportsSpeechToText,
    supportsTextGeneration: !supportsSpeechToText
  });
}

async function listOllamaModels(runtimeConfig) {
  const payload = await requestJson(`${runtimeConfig.baseUrl}/tags`);

  return (payload.models || [])
    .map((entry) =>
      normalizeAiModelEntry({
        contextWindow: null,
        description: entry?.details?.family || "",
        id: entry?.model || entry?.name || "",
        label: entry?.name || entry?.model || "",
        provider: "ollama",
        supportsSpeechToText: false,
        supportsTextGeneration: true
      })
    )
    .filter((model) => model.id);
}

async function listOpenAiModels(runtimeConfig) {
  const payload = await requestJson(`${runtimeConfig.baseUrl}/models`, {
    headers: openAiCompatibleHeaders(runtimeConfig)
  });

  return (payload.data || []).map((entry) => normalizeOpenAiModelEntry("openai", entry)).filter((model) => model.id);
}

async function listAnthropicModels(runtimeConfig) {
  const payload = await requestJson(`${runtimeConfig.baseUrl}/v1/models`, {
    headers: {
      "anthropic-version": "2023-06-01",
      "X-Api-Key": runtimeConfig.apiKey
    }
  });

  return (payload.data || [])
    .map((entry) =>
      normalizeAiModelEntry({
        contextWindow: entry?.max_input_tokens || null,
        description: "",
        id: entry?.id || "",
        label: entry?.display_name || entry?.id || "",
        provider: "claude",
        supportsSpeechToText: false,
        supportsTextGeneration: true
      })
    )
    .filter((model) => model.id);
}

async function listGeminiModels(runtimeConfig) {
  const payload = await requestJson(`${runtimeConfig.baseUrl}/models?key=${encodeURIComponent(runtimeConfig.apiKey)}`);

  return (payload.models || [])
    .map((entry) => {
      const methods = Array.isArray(entry?.supportedGenerationMethods)
        ? entry.supportedGenerationMethods
        : [];
      const id = entry?.baseModelId || String(entry?.name || "").replace(/^models\//, "");

      return normalizeAiModelEntry({
        contextWindow: entry?.inputTokenLimit || null,
        description: entry?.description || "",
        id,
        label: entry?.displayName || id,
        provider: "gemini",
        supportsSpeechToText: false,
        supportsTextGeneration: methods.includes("generateContent")
      });
    })
    .filter((model) => model.id);
}

async function listOpenRouterModels(runtimeConfig) {
  const payload = await requestJson(`${runtimeConfig.baseUrl}/models`, {
    headers: openAiCompatibleHeaders(runtimeConfig)
  });

  return (payload.data || [])
    .map((entry) =>
      normalizeAiModelEntry({
        contextWindow: entry?.context_length || null,
        description: entry?.description || "",
        id: entry?.id || "",
        label: entry?.name || entry?.id || "",
        provider: "openrouter",
        supportsSpeechToText: false,
        supportsTextGeneration:
          Array.isArray(entry?.architecture?.output_modalities)
            ? entry.architecture.output_modalities.includes("text")
            : true
      })
    )
    .filter((model) => model.id);
}

async function listModelsForProvider(runtimeConfig) {
  if (runtimeConfig.providerId === OPENAI_CODEX_PROVIDER_ID) {
    return openAiCodexStaticModels();
  }

  ensureProviderAccess(runtimeConfig);

  if (runtimeConfig.providerId === "ollama") {
    return listOllamaModels(runtimeConfig);
  }

  if (runtimeConfig.providerId === "openai") {
    return listOpenAiModels(runtimeConfig);
  }

  if (runtimeConfig.providerId === "claude") {
    return listAnthropicModels(runtimeConfig);
  }

  if (runtimeConfig.providerId === "gemini") {
    return listGeminiModels(runtimeConfig);
  }

  if (runtimeConfig.providerId === "openrouter") {
    return listOpenRouterModels(runtimeConfig);
  }

  throw httpError("지원하지 않는 provider 입니다.", 404);
}

function filterModelsForProfile(models, profileId) {
  if (profileId === "speechToText") {
    return models.filter((model) => model.supportsSpeechToText);
  }

  return models.filter((model) => model.supportsTextGeneration);
}

function providerPromptText(systemPrompt, userPrompt) {
  return `${systemPrompt.trim()}\n\n${userPrompt.trim()}`;
}

async function generateOllamaText(runtimeConfig, prompt) {
  const payload = await requestJson(`${runtimeConfig.baseUrl}/chat`, {
    body: {
      messages: [
        {
          content: prompt.system,
          role: "system"
        },
        {
          content: prompt.user,
          role: "user"
        }
      ],
      model: runtimeConfig.model,
      options: {
        temperature: 0.2
      },
      stream: false
    },
    method: "POST"
  });

  return payload?.message?.content || "";
}

async function generateOpenAiCompatibleText(runtimeConfig, prompt) {
  const payload = await requestJson(`${runtimeConfig.baseUrl}/chat/completions`, {
    body: {
      messages: [
        {
          content: prompt.system,
          role: "system"
        },
        {
          content: prompt.user,
          role: "user"
        }
      ],
      model: runtimeConfig.model,
      temperature: 0.2
    },
    headers: openAiCompatibleHeaders(runtimeConfig),
    method: "POST"
  });

  return payload?.choices?.[0]?.message?.content || "";
}

async function generateAnthropicText(runtimeConfig, prompt) {
  const payload = await requestJson(`${runtimeConfig.baseUrl}/v1/messages`, {
    body: {
      max_tokens: 4096,
      messages: [
        {
          content: prompt.user,
          role: "user"
        }
      ],
      model: runtimeConfig.model,
      system: prompt.system,
      temperature: 0.2
    },
    headers: {
      "anthropic-version": "2023-06-01",
      "X-Api-Key": runtimeConfig.apiKey
    },
    method: "POST"
  });

  return (payload?.content || [])
    .filter((entry) => entry?.type === "text")
    .map((entry) => entry.text)
    .join("\n");
}

async function generateGeminiText(runtimeConfig, prompt) {
  const payload = await requestJson(
    `${runtimeConfig.baseUrl}/models/${encodeURIComponent(runtimeConfig.model)}:generateContent?key=${encodeURIComponent(runtimeConfig.apiKey)}`,
    {
      body: {
        contents: [
          {
            parts: [{ text: prompt.user }],
            role: "user"
          }
        ],
        generationConfig: {
          temperature: 0.2
        },
        systemInstruction: {
          parts: [{ text: prompt.system }]
        }
      },
      method: "POST"
    }
  );

  return (payload?.candidates?.[0]?.content?.parts || [])
    .map((part) => part?.text || "")
    .join("\n");
}

async function generateTextForProfile(state, profileId, prompt) {
  const settings = normalizeAiSettings(state.aiSettings);
  const profile = settings.profiles[profileId];

  if (!profile || !profile.provider) {
    throw httpError("AI profile 이 설정되지 않았습니다.");
  }

  if (!providerSupportsProfile(profile.provider, profileId)) {
    throw httpError("선택한 provider 는 이 profile 을 지원하지 않습니다.");
  }

  const runtimeConfig = runtimeProviderConfig(state, profile.provider);

  if (!profile.model) {
    throw httpError("AI model 이 선택되지 않았습니다.");
  }

  runtimeConfig.model = profile.model;

  if (runtimeConfig.providerId === OPENAI_CODEX_PROVIDER_ID) {
    return generateOpenAiCodexText(runtimeConfig, prompt, state);
  }

  ensureProviderAccess(runtimeConfig);

  if (runtimeConfig.providerId === "ollama") {
    return generateOllamaText(runtimeConfig, prompt);
  }

  if (runtimeConfig.providerId === "openai" || runtimeConfig.providerId === "openrouter") {
    return generateOpenAiCompatibleText(runtimeConfig, prompt);
  }

  if (runtimeConfig.providerId === "claude") {
    return generateAnthropicText(runtimeConfig, prompt);
  }

  if (runtimeConfig.providerId === "gemini") {
    return generateGeminiText(runtimeConfig, prompt);
  }

  throw httpError("지원하지 않는 provider 입니다.", 404);
}

async function transcribeForSpeechProfile(state, file) {
  const settings = normalizeAiSettings(state.aiSettings);
  const profile = settings.profiles.speechToText;

  if (!profile?.provider) {
    throw httpError("Speech-to-text profile 이 설정되지 않았습니다.");
  }

  if (profile.provider !== "openai") {
    throw httpError("현재 speech-to-text 는 OpenAI provider 만 지원합니다.");
  }

  const runtimeConfig = runtimeProviderConfig(state, profile.provider);
  runtimeConfig.model = profile.model || aiProfileCatalog.speechToText.defaultModel;
  ensureProviderAccess(runtimeConfig);

  const formData = new FormData();
  formData.set(
    "file",
    new Blob([file.buffer], {
      type: file.mimetype || "audio/webm"
    }),
    file.originalname || "audio.webm"
  );
  formData.set("model", runtimeConfig.model);
  formData.set("response_format", "json");

  const payload = await requestFormData(`${runtimeConfig.baseUrl}/audio/transcriptions`, {
    formData,
    headers: openAiCompatibleHeaders(runtimeConfig)
  });

  return {
    model: runtimeConfig.model,
    text: typeof payload?.text === "string" ? payload.text.trim() : ""
  };
}

function extractFirstJsonObject(rawText) {
  const text = String(rawText || "").trim();

  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text);
  } catch {}

  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");

  if (start < 0 || end <= start) {
    return null;
  }

  try {
    return JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }
}

function hashFingerprint(value) {
  return crypto.createHash("sha256").update(String(value || "")).digest("hex");
}

function nowPlusMs(durationMs) {
  return new Date(nowMs() + durationMs).toISOString();
}

function cleanupAiPreviews() {
  const currentMs = nowMs();

  for (const [previewId, preview] of aiPreviewCache.entries()) {
    if (preview.expiresAtMs <= currentMs) {
      aiPreviewCache.delete(previewId);
    }
  }
}

function storeAiPreview(preview) {
  cleanupAiPreviews();
  const previewId = crypto.randomUUID();
  const expiresAtMs = nowMs() + aiPreviewTtlMs;

  aiPreviewCache.set(previewId, {
    ...preview,
    expiresAtMs
  });

  return {
    expiresAt: new Date(expiresAtMs).toISOString(),
    previewId
  };
}

function loadAiPreview(previewId, currentUser, kind) {
  cleanupAiPreviews();
  const preview = aiPreviewCache.get(previewId);

  if (!preview || preview.kind !== kind) {
    throw httpError("미리보기를 찾을 수 없습니다.", 404);
  }

  if (preview.userId !== currentUser?.id) {
    throw httpError("다른 사용자의 미리보기는 적용할 수 없습니다.", 403);
  }

  return preview;
}

function currentCollaborationDoc(projectId, pageId) {
  return collabDocs.get(collaborationRoomName(projectId, pageId)) || null;
}

function pageJsonFromCollaborationDoc(doc) {
  return normalizeStoredRichDocContent(yDocToProsemirrorJSON(doc));
}

function replaceCollaborationDocContent(doc, nextContent) {
  const normalized = normalizeStoredRichDocContent(nextContent);
  const sourceDoc = prosemirrorJSONToYDoc(collaborationSchema, normalized);
  const sourceFragment = sourceDoc.getXmlFragment("prosemirror");
  const targetFragment = doc.getXmlFragment("prosemirror");

  doc.transact(() => {
    targetFragment.delete(0, targetFragment.length);
    targetFragment.insert(0, sourceFragment.toArray().map((node) => node.clone()));

    const markdownText = doc.getText("markdown");
    const nextMarkdown = markdownFromRichDoc(normalized);

    if (markdownText.length > 0) {
      markdownText.delete(0, markdownText.length);
    }

    if (nextMarkdown) {
      markdownText.insert(0, nextMarkdown);
    }
  }, { source: "ai-apply" });

  sourceDoc.destroy();
}

async function currentPageSnapshot(projectId, pageId) {
  const state = await loadState({ includeRevisions: true });
  const page = state.pages.find((entry) => entry.projectId === projectId && entry.id === pageId);

  if (!page) {
    throw httpError("페이지를 찾을 수 없습니다.", 404);
  }

  const activeDoc = currentCollaborationDoc(projectId, pageId);
  const content =
    activeDoc && activeDoc.initialized
      ? pageJsonFromCollaborationDoc(activeDoc)
      : collaborationDocJsonFromPage(page);
  const markdown = markdownFromRichDoc(content);

  return {
    activeDoc,
    content,
    fingerprint: hashFingerprint(JSON.stringify({ markdown, pageId, projectId })),
    markdown,
    page,
    state
  };
}

function diffSummary(previousText, nextText) {
  const parts = diffWordsWithSpace(previousText, nextText);
  let addedChars = 0;
  let removedChars = 0;

  for (const part of parts) {
    if (part.added) {
      addedChars += part.value.length;
    } else if (part.removed) {
      removedChars += part.value.length;
    }
  }

  return {
    addedChars,
    changed: previousText !== nextText,
    removedChars
  };
}

async function applyMarkdownToPage({ actor, markdown, projectId, pageId }) {
  const state = await loadState({ includeRevisions: true });
  const page = state.pages.find((entry) => entry.projectId === projectId && entry.id === pageId);

  if (!page) {
    throw httpError("페이지를 찾을 수 없습니다.", 404);
  }

  const nextContent = proseDocFromMarkdown(markdown);
  const activeDoc = currentCollaborationDoc(projectId, pageId);

  if (activeDoc && activeDoc.initialized) {
    activeDoc._zeeumLastActor = actor;
    replaceCollaborationDocContent(activeDoc, nextContent);
    clearTimeout(collabWriteTimers.get(activeDoc.name));
    collabWriteTimers.delete(activeDoc.name);
    await writeCollaborationState(activeDoc);
    const refreshed = await loadState({ includeRevisions: true });
    return refreshed.pages.find((entry) => entry.projectId === projectId && entry.id === pageId) || page;
  }

  const previousPage = clone(page);
  page.content = normalizeStoredRichDocContent(nextContent);
  page.contentFormat = "tiptap-json";
  page.updatedAt = nowIso();

  const nextProjects = touchProject(state.projects, page.projectId);
  const nextRevisions = appendRevision(
    state.revisions,
    createRevision({
      actor,
      nextPage: page,
      previousPage
    })
  );

  await Promise.all([
    writeJson(files.pages, state.pages),
    writeJson(files.projects, nextProjects),
    writeJson(files.revisions, nextRevisions)
  ]);

  return page;
}

function editorPreviewPrompt(page, markdown, instruction) {
  return {
    system:
      "You edit a workspace document. Return strict JSON only with keys summary and content. content must be the full revised markdown document.",
    user: [
      `Page title: ${page.title}`,
      "",
      "User instruction:",
      instruction.trim(),
      "",
      "Current markdown:",
      "```markdown",
      markdown || "",
      "```",
      "",
      "Return JSON with this shape:",
      '{"summary":"one short sentence","content":"full revised markdown"}'
    ].join("\n")
  };
}

function editorSummaryPrompt(page, markdown, focus) {
  return {
    system: "Summarize the document in concise Korean. Prefer bullet points only when clearly useful.",
    user: [
      `Page title: ${page.title}`,
      focus ? `Focus: ${focus.trim()}` : "",
      "",
      "Document markdown:",
      "```markdown",
      markdown || "",
      "```"
    ]
      .filter(Boolean)
      .join("\n")
  };
}

function navigationTreeContext(pages, projectId) {
  return byProject(projectId, pages)
    .sort((left, right) => {
      if ((left.parentId || "") === (right.parentId || "")) {
        return left.position - right.position;
      }

      return (left.parentId || "").localeCompare(right.parentId || "");
    })
    .map((page) => {
      return [
        `id=${page.id}`,
        `title=${JSON.stringify(page.title)}`,
        `type=${isFolderPage(page) ? "folder" : "page"}`,
        `parentId=${page.parentId || "null"}`,
        `position=${page.position}`
      ].join(" ");
    })
    .join("\n");
}

function normalizeNavigationOperations(rawOperations, pages, projectId) {
  if (!Array.isArray(rawOperations)) {
    return [];
  }

  const pagesById = new Map(
    byProject(projectId, pages).map((page) => [page.id, page])
  );

  return rawOperations
    .map((entry) => {
      const type = typeof entry?.type === "string" ? entry.type : "";
      const pageId = typeof entry?.pageId === "string" ? entry.pageId : "";
      const title = typeof entry?.title === "string" ? makeTitle(entry.title, "") : "";
      const parentId =
        typeof entry?.parentId === "string" && entry.parentId.trim()
          ? entry.parentId
          : null;

      if (["create_folder", "create_page"].includes(type)) {
        if (!title) {
          return null;
        }

        if (parentId && !pagesById.has(parentId)) {
          return null;
        }

        return {
          parentId,
          title,
          type
        };
      }

      if (!pageId || !pagesById.has(pageId)) {
        return null;
      }

      if (type === "rename_page" && title) {
        return { pageId, title, type };
      }

      if (type === "move_page") {
        if (parentId && !pagesById.has(parentId)) {
          return null;
        }

        return { pageId, parentId, type };
      }

      if (type === "delete_page") {
        return { pageId, type };
      }

      return null;
    })
    .filter(Boolean)
    .slice(0, 25);
}

function navigationPrompt(pages, projectId, instruction, selectedPageIds = []) {
  return {
    system: [
      "You organize a page tree.",
      "Return strict JSON only with keys summary and operations.",
      "Allowed operation types: create_folder, create_page, rename_page, move_page, delete_page.",
      "Never invent page IDs. Use existing IDs exactly. parentId may be null.",
      "Keep operations conservative and avoid deleting unless the instruction clearly asks for deletion."
    ].join(" "),
    user: [
      "Current tree:",
      navigationTreeContext(pages, projectId),
      "",
      selectedPageIds.length > 0 ? `Selected page IDs: ${selectedPageIds.join(", ")}` : "Selected page IDs: none",
      "",
      "User instruction:",
      instruction.trim(),
      "",
      "Return JSON with this shape:",
      '{"summary":"one short sentence","operations":[{"type":"rename_page","pageId":"...","title":"..."}]}'
    ].join("\n")
  };
}

function navigationFingerprint(pages, projectId) {
  return hashFingerprint(
    JSON.stringify(
      byProject(projectId, pages).map((page) => ({
        id: page.id,
        icon: page.icon,
        parentId: page.parentId,
        position: page.position,
        title: page.title,
        updatedAt: page.updatedAt
      }))
    )
  );
}

function applyNavigationOperationsToState(state, projectId, operations, actor) {
  let changed = false;

  for (const operation of operations) {
    if (operation.type === "create_folder" || operation.type === "create_page") {
      const parentResolution = resolveRequestedParentId(
        state.pages,
        projectId,
        operation.parentId,
        { icon: operation.type === "create_folder" ? "folder_open" : "file-text" }
      );

      if (parentResolution.error) {
        continue;
      }

      const page = makePage(
        {
          content: clone(EMPTY_DOC),
          contentFormat: "tiptap-json",
          icon: operation.type === "create_folder" ? "folder_open" : "file-text",
          parentId: parentResolution.parentId,
          projectId,
          title: operation.title
        },
        state.pages
      );

      state.pages.push(page);
      state.revisions = appendRevision(
        state.revisions,
        createRevision({
          actor,
          nextPage: page
        })
      );
      reindexSiblings(state.pages, projectId, parentResolution.parentId);
      changed = true;
      continue;
    }

    const page = state.pages.find((entry) => entry.projectId === projectId && entry.id === operation.pageId);

    if (!page) {
      continue;
    }

    if (operation.type === "rename_page") {
      const previousPage = clone(page);
      page.title = makeUniqueSiblingTitle(state.pages, {
        excludePageId: page.id,
        parentId: page.parentId ?? null,
        projectId,
        title: operation.title
      });
      page.updatedAt = nowIso();
      state.revisions = appendRevision(
        state.revisions,
        createRevision({
          actor,
          nextPage: page,
          previousPage
        })
      );
      changed = true;
      continue;
    }

    if (operation.type === "move_page") {
      const parentResolution = resolveRequestedParentId(
        state.pages,
        projectId,
        operation.parentId,
        page
      );

      if (parentResolution.error || !canMovePage(state.pages, page.id, parentResolution.parentId, projectId)) {
        continue;
      }

      const currentParentId = page.parentId ?? null;
      const siblings = state.pages
        .filter(
          (entry) =>
            entry.projectId === projectId &&
            entry.id !== page.id &&
            (entry.parentId ?? null) === (parentResolution.parentId ?? null)
        )
        .sort((left, right) => left.position - right.position);

      page.parentId = parentResolution.parentId;
      page.position = siblings.length;
      page.updatedAt = nowIso();
      reindexSiblings(state.pages, projectId, currentParentId);
      reindexSiblings(state.pages, projectId, parentResolution.parentId);
      changed = true;
      continue;
    }

    if (operation.type === "delete_page") {
      const idsToDelete = new Set([page.id, ...collectDescendantIds(state.pages, page.id, projectId)]);
      state.pages = state.pages.filter((entry) => !(entry.projectId === projectId && idsToDelete.has(entry.id)));
      reindexSiblings(state.pages, projectId, page.parentId ?? null);
      changed = true;
    }
  }

  if (!changed) {
    return { changed: false };
  }

  const nextProjects = touchProject(state.projects, projectId).map((project) => {
    if (project.id !== projectId) {
      return project;
    }

    const projectPages = byProject(project.id, state.pages);

    return {
      ...project,
      homePageId:
        project.homePageId && projectPages.some((page) => page.id === project.homePageId)
          ? project.homePageId
          : projectPages[0]?.id || null
    };
  });

  state.projects = nextProjects;
  return { changed: true };
}

function applyAiSettingsUpdate(currentSettings, payload = {}) {
  const next = normalizeAiSettings(currentSettings);
  const timestamp = nowIso();

  for (const providerId of Object.keys(aiProviderCatalog)) {
    const incoming = payload.providers?.[providerId] || null;

    if (!incoming || typeof incoming !== "object") {
      continue;
    }

    const current = next.providers[providerId];
    const isOpenAiCodex = providerId === OPENAI_CODEX_PROVIDER_ID;
    const updated = {
      ...current,
      baseUrl: isOpenAiCodex
        ? current.baseUrl
        : typeof incoming.baseUrl === "string" && incoming.baseUrl.trim()
          ? stripTrailingSlash(incoming.baseUrl.trim())
          : current.baseUrl,
      enabled: typeof incoming.enabled === "boolean" ? incoming.enabled : current.enabled,
      updatedAt: timestamp
    };

    if (!isOpenAiCodex && incoming.clearApiKey === true) {
      updated.apiKeyEncrypted = null;
      updated.apiKeyHint = null;
    } else if (!isOpenAiCodex && typeof incoming.apiKey === "string" && incoming.apiKey.trim()) {
      updated.apiKeyEncrypted = encryptAiSecret(incoming.apiKey.trim());
      updated.apiKeyHint = maskApiKeyHint(incoming.apiKey.trim());
    }

    next.providers[providerId] = updated;
  }

  for (const profileId of Object.keys(aiProfileCatalog)) {
    const incoming = payload.profiles?.[profileId] || null;

    if (!incoming || typeof incoming !== "object") {
      continue;
    }

    const current = next.profiles[profileId];
    const allowedProviders = aiProfileCatalog[profileId].providers;
    const provider =
      typeof incoming.provider === "string" && allowedProviders.includes(incoming.provider)
        ? incoming.provider
        : current.provider;

    next.profiles[profileId] = {
      model: typeof incoming.model === "string" ? incoming.model.trim() : current.model,
      provider,
      updatedAt: timestamp
    };
  }

  return next;
}

async function persistProviderDiagnostics(providerId, patch) {
  const state = await loadState();
  const next = normalizeAiSettings(state.aiSettings);
  const current = next.providers[providerId];

  if (!current) {
    return next;
  }

  next.providers[providerId] = {
    ...current,
    ...patch,
    lastTest: {
      ...current.lastTest,
      ...(patch.lastTest || {})
    },
    modelCache: {
      ...current.modelCache,
      ...(patch.modelCache || {})
    },
    updatedAt: patch.updatedAt || current.updatedAt
  };

  await writeJson(files.aiSettings, next);
  return next;
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
  const page = pages.find((entry) => entry.projectId === projectId && entry.id === pageId);

  if (!page) {
    return false;
  }

  if (!nextParentId) {
    return true;
  }

  const nextParent = pages.find(
    (page) => page.projectId === projectId && page.id === nextParentId
  );

  if (!nextParent || !canParentAcceptChild(nextParent, page)) {
    return false;
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

function fileTypeFromName(filename) {
  const extension = path.extname(filename || "").toLowerCase();

  if ([".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg", ".avif"].includes(extension)) {
    return "image";
  }

  if ([".mp4", ".mov", ".webm", ".m4v", ".avi"].includes(extension)) {
    return "video";
  }

  return "file";
}

function sumBytes(entries, key = "size") {
  return entries.reduce((total, entry) => total + Number(entry?.[key] || 0), 0);
}

async function listStoreFiles() {
  const targets = Array.from(new Set(Object.values(files)));
  const entries = await Promise.all(
    targets.map(async (filePath) => {
      try {
        const stats = await fs.stat(filePath);

        if (!stats.isFile()) {
          return null;
        }

        return {
          category: "store",
          name: path.basename(filePath),
          path: path.relative(rootDir, filePath).replaceAll(path.sep, "/"),
          size: stats.size,
          updatedAt: stats.mtime.toISOString()
        };
      } catch {
        return null;
      }
    })
  );

  return entries.filter(Boolean).sort((left, right) => left.name.localeCompare(right.name));
}

async function listUploadFiles() {
  let filenames = [];

  try {
    filenames = await fs.readdir(uploadDir);
  } catch {
    filenames = [];
  }

  const uploads = await Promise.all(
    filenames.map(async (filename) => {
      try {
        const filePath = path.join(uploadDir, filename);
        const stats = await fs.stat(filePath);

        if (!stats.isFile()) {
          return null;
        }

        return {
          createdAt: stats.birthtime.toISOString(),
          filename,
          path: path.relative(rootDir, filePath).replaceAll(path.sep, "/"),
          size: stats.size,
          type: fileTypeFromName(filename),
          updatedAt: stats.mtime.toISOString(),
          url: mediaUrl(filename)
        };
      } catch {
        return null;
      }
    })
  );

  return uploads
    .filter(Boolean)
    .sort((left, right) => new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime());
}

async function buildAdminConsolePayload() {
  const state = await loadState({ includeRevisions: true });
  const storeFiles = await listStoreFiles();
  const uploads = await listUploadFiles();
  const projectRows = [...state.projects]
    .sort((left, right) => new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime())
    .map((project) => ({
      ...projectSummary(project, state.pages, state.groups),
      homePageTitle:
        state.pages.find((page) => page.projectId === project.id && page.id === project.homePageId)?.title || null
    }));

  const uploadTypeTotals = uploads.reduce(
    (totals, upload) => {
      totals[upload.type] = (totals[upload.type] || 0) + 1;
      return totals;
    },
    { file: 0, image: 0, video: 0 }
  );

  return {
    ai: sanitizeAiSettingsForClient(state.aiSettings),
    files: {
      storeFiles,
      uploads
    },
    members: state.users.map(publicUser),
    overview: {
      backend: {
        engine: "filesystem",
        label: "JSON file store",
        location: "data/*.json + data/uploads",
        status: "connected"
      },
      recentUploads: uploads.slice(0, 5),
      storage: {
        dataBytes: sumBytes(storeFiles),
        totalBytes: sumBytes(storeFiles) + sumBytes(uploads),
        uploadBytes: sumBytes(uploads),
        uploadTypeTotals
      },
      totals: {
        admins: state.users.filter((user) => user.role === "admin").length,
        files: uploads.length,
        groups: state.groups.length,
        members: state.users.length,
        pages: state.pages.length,
        projects: state.projects.length,
        revisions: state.revisions.length
      }
    },
    projects: projectRows
  };
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

app.get("/api/admin/console", requireAdmin, async (_req, res, next) => {
  try {
    res.json(await buildAdminConsolePayload());
  } catch (error) {
    next(error);
  }
});

app.get("/api/admin/ai/settings", requireAdmin, async (_req, res, next) => {
  try {
    const state = await loadState();
    res.json({
      ai: sanitizeAiSettingsForClient(state.aiSettings)
    });
  } catch (error) {
    next(error);
  }
});

app.put("/api/admin/ai/settings", requireAdmin, async (req, res, next) => {
  try {
    const state = await loadState();
    const nextSettings = applyAiSettingsUpdate(state.aiSettings, req.body || {});
    await writeJson(files.aiSettings, nextSettings);

    res.json({
      ai: sanitizeAiSettingsForClient(nextSettings)
    });
  } catch (error) {
    next(error);
  }
});

app.post("/api/admin/ai/providers/:providerId/oauth/start", requireAdmin, async (req, res, next) => {
  try {
    const providerId = req.params.providerId;

    if (providerId !== OPENAI_CODEX_PROVIDER_ID) {
      res.status(404).json({ error: "지원하지 않는 provider 입니다." });
      return;
    }

    const sessionScopeKey = openAiCodexSessionScopeKey(req);

    if (!sessionScopeKey) {
      res.status(401).json({ error: "로그인이 필요합니다." });
      return;
    }

    clearOpenAiCodexOAuthFlowsForSession(sessionScopeKey);
    setOpenAiCodexOAuthEvent(sessionScopeKey, {
      connected: false,
      message: "ChatGPT OAuth 창을 열었습니다. 브라우저에서 인증을 완료하세요."
    });

    await ensureOpenAiCodexLoopbackServer();

    const { challenge, verifier } = createOpenAiCodexPkce();
    const state = crypto.randomBytes(16).toString("hex");
    const callbackUrl = OPENAI_CODEX_CALLBACK_PUBLIC_URL;
    const authorizeUrl = buildOpenAiCodexAuthorizeUrl({
      callbackUrl,
      challenge,
      state
    });
    const expiresAt = nowMs() + OPENAI_CODEX_OAUTH_TTL_MS;

    openAiCodexOAuthFlows.set(state, {
      callbackUrl,
      createdAt: nowIso(),
      expiresAt,
      sessionScopeKey,
      state,
      timeout: setTimeout(() => {
        clearOpenAiCodexOAuthFlow(state);
      }, OPENAI_CODEX_OAUTH_TTL_MS),
      userId: req.currentUser.id,
      verifier
    });

    res.json({
      authorizeUrl,
      callbackUrl,
      expiresAt,
      providerId
    });
  } catch (error) {
    next(error);
  }
});

app.get("/api/admin/ai/providers/:providerId/oauth/status", requireAdmin, async (req, res, next) => {
  try {
    const providerId = req.params.providerId;

    if (providerId !== OPENAI_CODEX_PROVIDER_ID) {
      res.status(404).json({ error: "지원하지 않는 provider 입니다." });
      return;
    }

    const state = await loadState();
    res.json(openAiCodexOauthStatus(state, req));
  } catch (error) {
    next(error);
  }
});

app.post("/api/admin/ai/providers/:providerId/oauth/disconnect", requireAdmin, async (req, res, next) => {
  try {
    const providerId = req.params.providerId;

    if (providerId !== OPENAI_CODEX_PROVIDER_ID) {
      res.status(404).json({ error: "지원하지 않는 provider 입니다." });
      return;
    }

    const sessionScopeKey = openAiCodexSessionScopeKey(req);

    if (sessionScopeKey) {
      clearOpenAiCodexOAuthFlowsForSession(sessionScopeKey);
    }

    await clearOpenAiCodexOAuthCredentials();
    setOpenAiCodexOAuthEvent(sessionScopeKey, {
      connected: false,
      message: "ChatGPT OAuth 연결을 해제했습니다."
    });
    const nextSettings = await persistProviderDiagnostics(OPENAI_CODEX_PROVIDER_ID, {
      lastTest: {
        checkedAt: nowIso(),
        message: "ChatGPT OAuth 연결을 해제했습니다.",
        ok: false
      },
      modelCache: {
        error: null,
        fetchedAt: nowIso(),
        models: openAiCodexStaticModels()
      }
    });

    res.json({
      ai: sanitizeAiSettingsForClient(nextSettings),
      providerId
    });
  } catch (error) {
    next(error);
  }
});

app.get(OPENAI_CODEX_CALLBACK_PATH, async (req, res) => {
  const state = String(req.query.state || "").trim();
  const code = String(req.query.code || "").trim();
  const flow = getOpenAiCodexOAuthFlowByState(state);

  if (!flow) {
    res.status(400).type("html").send(
      buildOpenAiCodexOAuthHtml(
        "OpenAI Codex OAuth failed",
        "The OAuth session expired or could not be found.",
        "error"
      )
    );
    return;
  }

  if (flow.expiresAt <= nowMs()) {
    setOpenAiCodexOAuthEvent(flow.sessionScopeKey, {
      connected: false,
      message: "OAuth 세션이 만료되어 인증을 완료하지 못했습니다."
    });
    clearOpenAiCodexOAuthFlow(state);
    res.status(400).type("html").send(
      buildOpenAiCodexOAuthHtml(
        "OpenAI Codex OAuth failed",
        "The OAuth session expired before the callback was received.",
        "error"
      )
    );
    return;
  }

  if (!code) {
    setOpenAiCodexOAuthEvent(flow.sessionScopeKey, {
      connected: false,
      message: "OAuth callback 에 authorization code 가 없습니다."
    });
    clearOpenAiCodexOAuthFlow(state);
    res.status(400).type("html").send(
      buildOpenAiCodexOAuthHtml(
        "OpenAI Codex OAuth failed",
        "Missing authorization code.",
        "error"
      )
    );
    return;
  }

  try {
    const tokens = await requestOpenAiCodexTokens({
      code,
      codeVerifier: flow.verifier,
      redirectUri: flow.callbackUrl
    });

    clearOpenAiCodexOAuthFlow(state);

    await persistOpenAiCodexOAuthCredentials(tokens);
    setOpenAiCodexOAuthEvent(flow.sessionScopeKey, {
      connected: true,
      message: "ChatGPT OAuth 연결이 완료되었습니다."
    });
    await persistProviderDiagnostics(OPENAI_CODEX_PROVIDER_ID, {
      lastTest: {
        checkedAt: nowIso(),
        message: "ChatGPT OAuth 연결이 완료되었습니다.",
        ok: true
      },
      modelCache: {
        error: null,
        fetchedAt: nowIso(),
        models: openAiCodexStaticModels()
      }
    });

    res
      .status(200)
      .type("html")
      .send(
        buildOpenAiCodexOAuthHtml(
          "OpenAI Codex OAuth complete",
          "You can close this window and return to Zeeum Note."
        )
      );
  } catch (error) {
    setOpenAiCodexOAuthEvent(flow.sessionScopeKey, {
      connected: false,
      message: error?.message || "OAuth 토큰 교환에 실패했습니다."
    });
    clearOpenAiCodexOAuthFlow(state);
    res.status(error?.statusCode || 502).type("html").send(
      buildOpenAiCodexOAuthHtml(
        "OpenAI Codex OAuth failed",
        error?.message || "Unable to complete the OAuth exchange.",
        "error"
      )
    );
  }
});

app.post("/api/admin/ai/providers/:providerId/test", requireAdmin, async (req, res, next) => {
  try {
    const providerId = req.params.providerId;

    if (!aiProviderCatalog[providerId]) {
      res.status(404).json({ error: "지원하지 않는 provider 입니다." });
      return;
    }

    const state = await loadState();

    if (providerId === OPENAI_CODEX_PROVIDER_ID) {
      const status = openAiCodexOauthStatus(state, req);

      if (!status.connected) {
        res.status(400).json({ error: "ChatGPT OAuth 연결이 필요합니다." });
        return;
      }

      const models = openAiCodexStaticModels();
      const profileId =
        typeof req.body?.profileId === "string" && aiProfileCatalog[req.body.profileId]
          ? req.body.profileId
          : null;
      const filteredModels = profileId ? filterModelsForProfile(models, profileId) : models;
      const message =
        filteredModels.length > 0
          ? "ChatGPT OAuth 연결이 확인되었습니다."
          : "연결은 확인했지만 조건에 맞는 모델이 없습니다.";

      if (!req.body?.providerConfig) {
        await persistProviderDiagnostics(providerId, {
          lastTest: {
            checkedAt: nowIso(),
            message,
            ok: true
          },
          modelCache: {
            error: null,
            fetchedAt: nowIso(),
            models: filteredModels
          }
        });
      }

      res.json({
        message,
        models: filteredModels,
        ok: true,
        providerId
      });
      return;
    }

    const runtimeConfig = runtimeProviderConfig(state, providerId, req.body?.providerConfig || {});
    const models = await listModelsForProvider(runtimeConfig);
    const profileId =
      typeof req.body?.profileId === "string" && aiProfileCatalog[req.body.profileId]
        ? req.body.profileId
        : null;
    const filteredModels = profileId ? filterModelsForProfile(models, profileId) : models;
    const message =
      filteredModels.length > 0
        ? `${filteredModels.length}개 모델을 확인했습니다.`
        : "연결은 성공했지만 조건에 맞는 모델이 없습니다.";
    const diagnostics = {
      checkedAt: nowIso(),
      message,
      ok: true
    };

    if (!req.body?.providerConfig) {
      await persistProviderDiagnostics(providerId, {
        lastTest: diagnostics
      });
    }

    res.json({
      message,
      models: filteredModels,
      ok: true,
      providerId
    });
  } catch (error) {
    next(error);
  }
});

app.post("/api/admin/ai/providers/:providerId/models", requireAdmin, async (req, res, next) => {
  try {
    const providerId = req.params.providerId;

    if (!aiProviderCatalog[providerId]) {
      res.status(404).json({ error: "지원하지 않는 provider 입니다." });
      return;
    }

    const state = await loadState();
    const runtimeConfig = runtimeProviderConfig(state, providerId, req.body?.providerConfig || {});
    const models = await listModelsForProvider(runtimeConfig);
    const profileId =
      typeof req.body?.profileId === "string" && aiProfileCatalog[req.body.profileId]
        ? req.body.profileId
        : null;
    const filteredModels = profileId ? filterModelsForProfile(models, profileId) : models;

    if (!req.body?.providerConfig) {
      await persistProviderDiagnostics(providerId, {
        modelCache: {
          error: null,
          fetchedAt: nowIso(),
          models: filteredModels
        }
      });
    }

    res.json({
      fetchedAt: nowIso(),
      models: filteredModels,
      providerId
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

app.delete("/api/admin/projects/:projectId", requireAdmin, async (req, res, next) => {
  try {
    const state = await loadState({ includeRevisions: true });
    const project = getProjectOr404(state.projects, req.params.projectId, res);

    if (!project) {
      return;
    }

    const nextProjects = state.projects.filter((entry) => entry.id !== project.id);
    const nextPages = state.pages.filter((entry) => entry.projectId !== project.id);
    const nextGroups = state.groups.filter((entry) => entry.projectId !== project.id);
    const nextRevisions = state.revisions.filter((entry) => entry.projectId !== project.id);

    await Promise.all([
      writeJson(files.projects, nextProjects),
      writeJson(files.pages, nextPages),
      writeJson(files.groups, nextGroups),
      writeJson(files.revisions, nextRevisions)
    ]);

    res.status(204).end();
  } catch (error) {
    next(error);
  }
});

app.delete("/api/admin/files/:filename", requireAdmin, async (req, res, next) => {
  try {
    const filename = path.basename(req.params.filename || "");

    if (!filename) {
      res.status(400).json({ error: "삭제할 파일 이름이 필요합니다." });
      return;
    }

    const filePath = path.join(uploadDir, filename);
    await fs.unlink(filePath);
    res.status(204).end();
  } catch (error) {
    if (error?.code === "ENOENT") {
      res.status(404).json({ error: "파일을 찾을 수 없습니다." });
      return;
    }

    next(error);
  }
});

app.post("/api/ai/editor/summary", requireAuth, async (req, res, next) => {
  try {
    const projectId = typeof req.body?.projectId === "string" ? req.body.projectId : "";
    const pageId = typeof req.body?.pageId === "string" ? req.body.pageId : "";
    const focus = typeof req.body?.focus === "string" ? req.body.focus : "";
    const snapshot = await currentPageSnapshot(projectId, pageId);
    const summary = await generateTextForProfile(
      snapshot.state,
      "textGeneration",
      editorSummaryPrompt(snapshot.page, snapshot.markdown, focus)
    );

    res.json({
      summary: summary.trim()
    });
  } catch (error) {
    next(error);
  }
});

app.post("/api/ai/editor/preview", requireAuth, async (req, res, next) => {
  try {
    const projectId = typeof req.body?.projectId === "string" ? req.body.projectId : "";
    const pageId = typeof req.body?.pageId === "string" ? req.body.pageId : "";
    const instruction = typeof req.body?.instruction === "string" ? req.body.instruction.trim() : "";

    if (!instruction) {
      res.status(400).json({ error: "편집 지시를 입력하세요." });
      return;
    }

    const snapshot = await currentPageSnapshot(projectId, pageId);
    const raw = await generateTextForProfile(
      snapshot.state,
      "textGeneration",
      editorPreviewPrompt(snapshot.page, snapshot.markdown, instruction)
    );
    const parsed = extractFirstJsonObject(raw) || {};
    const nextMarkdown =
      typeof parsed.content === "string" && parsed.content.trim()
        ? parsed.content.trim()
        : raw.trim();

    if (!nextMarkdown) {
      res.status(502).json({ error: "AI 응답에서 수정된 문서를 만들지 못했습니다." });
      return;
    }

    const summary =
      typeof parsed.summary === "string" && parsed.summary.trim()
        ? parsed.summary.trim()
        : "문서 수정안이 준비되었습니다.";
    const diff = diffSummary(snapshot.markdown, nextMarkdown);
    const previewMeta = storeAiPreview({
      afterMarkdown: nextMarkdown,
      beforeMarkdown: snapshot.markdown,
      fingerprint: snapshot.fingerprint,
      kind: "editor",
      pageId,
      projectId,
      userId: req.currentUser.id
    });

    res.json({
      afterMarkdown: nextMarkdown,
      beforeMarkdown: snapshot.markdown,
      diff,
      expiresAt: previewMeta.expiresAt,
      previewId: previewMeta.previewId,
      summary
    });
  } catch (error) {
    next(error);
  }
});

app.post("/api/ai/editor/apply", requireAuth, async (req, res, next) => {
  try {
    const previewId = typeof req.body?.previewId === "string" ? req.body.previewId : "";
    const preview = loadAiPreview(previewId, req.currentUser, "editor");
    const snapshot = await currentPageSnapshot(preview.projectId, preview.pageId);

    if (snapshot.fingerprint !== preview.fingerprint) {
      res.status(409).json({ error: "문서가 변경되어 미리보기가 만료되었습니다. 다시 생성하세요." });
      return;
    }

    const page = await applyMarkdownToPage({
      actor: {
        ...req.currentUser,
        name: `${req.currentUser.name} (AI)`
      },
      markdown: preview.afterMarkdown,
      pageId: preview.pageId,
      projectId: preview.projectId
    });

    aiPreviewCache.delete(previewId);
    res.json({
      page
    });
  } catch (error) {
    next(error);
  }
});

app.post("/api/ai/editor/insert-transcript", requireAuth, async (req, res, next) => {
  try {
    const projectId = typeof req.body?.projectId === "string" ? req.body.projectId : "";
    const pageId = typeof req.body?.pageId === "string" ? req.body.pageId : "";
    const text = typeof req.body?.text === "string" ? req.body.text.trim() : "";
    const mode = req.body?.mode === "replace" ? "replace" : "append";

    if (!text) {
      res.status(400).json({ error: "삽입할 전사 텍스트가 없습니다." });
      return;
    }

    const snapshot = await currentPageSnapshot(projectId, pageId);
    const nextMarkdown =
      mode === "replace"
        ? text
        : [snapshot.markdown, text].filter(Boolean).join("\n\n");
    const page = await applyMarkdownToPage({
      actor: {
        ...req.currentUser,
        name: `${req.currentUser.name} (AI)`
      },
      markdown: nextMarkdown,
      pageId,
      projectId
    });

    res.json({
      page
    });
  } catch (error) {
    next(error);
  }
});

app.post("/api/ai/navigation/preview", requireAuth, async (req, res, next) => {
  try {
    const projectId = typeof req.body?.projectId === "string" ? req.body.projectId : "";
    const instruction = typeof req.body?.instruction === "string" ? req.body.instruction.trim() : "";
    const selectedPageIds = Array.isArray(req.body?.selectedPageIds)
      ? req.body.selectedPageIds.filter((pageId) => typeof pageId === "string")
      : [];

    if (!instruction) {
      res.status(400).json({ error: "정리 지시를 입력하세요." });
      return;
    }

    const state = await loadState({ includeRevisions: true });
    const project = state.projects.find((entry) => entry.id === projectId);

    if (!project) {
      res.status(404).json({ error: "프로젝트를 찾을 수 없습니다." });
      return;
    }

    const raw = await generateTextForProfile(
      state,
      "textGeneration",
      navigationPrompt(state.pages, projectId, instruction, selectedPageIds)
    );
    const parsed = extractFirstJsonObject(raw) || {};
    const operations = normalizeNavigationOperations(parsed.operations, state.pages, projectId);
    const previewMeta = storeAiPreview({
      fingerprint: navigationFingerprint(state.pages, projectId),
      kind: "navigation",
      operations,
      projectId,
      userId: req.currentUser.id
    });

    res.json({
      expiresAt: previewMeta.expiresAt,
      operations,
      previewId: previewMeta.previewId,
      summary:
        typeof parsed.summary === "string" && parsed.summary.trim()
          ? parsed.summary.trim()
          : operations.length > 0
            ? `${operations.length}개 트리 작업을 제안했습니다.`
            : "적용할 트리 작업이 없습니다."
    });
  } catch (error) {
    next(error);
  }
});

app.post("/api/ai/navigation/apply", requireAuth, async (req, res, next) => {
  try {
    const previewId = typeof req.body?.previewId === "string" ? req.body.previewId : "";
    const preview = loadAiPreview(previewId, req.currentUser, "navigation");
    const state = await loadState({ includeRevisions: true });

    if (navigationFingerprint(state.pages, preview.projectId) !== preview.fingerprint) {
      res.status(409).json({ error: "페이지 트리가 변경되어 미리보기가 만료되었습니다. 다시 생성하세요." });
      return;
    }

    const result = applyNavigationOperationsToState(
      state,
      preview.projectId,
      preview.operations,
      {
        ...req.currentUser,
        name: `${req.currentUser.name} (AI)`
      }
    );

    if (!result.changed) {
      res.status(400).json({ error: "적용할 작업이 없습니다." });
      return;
    }

    await Promise.all([
      writeJson(files.pages, state.pages),
      writeJson(files.projects, state.projects),
      writeJson(files.revisions, state.revisions)
    ]);

    aiPreviewCache.delete(previewId);
    res.json({
      operationsApplied: preview.operations.length,
      project: state.projects.find((entry) => entry.id === preview.projectId) || null
    });
  } catch (error) {
    next(error);
  }
});

app.post("/api/ai/stt/transcribe", requireAuth, (req, res, next) => {
  audioUpload.single("file")(req, res, async (error) => {
    if (error) {
      next(error);
      return;
    }

    try {
      if (!req.file) {
        res.status(400).json({ error: "전사할 오디오 파일이 없습니다." });
        return;
      }

      const state = await loadState();
      const transcript = await transcribeForSpeechProfile(state, req.file);
      res.json({
        transcript
      });
    } catch (requestError) {
      next(requestError);
    }
  });
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

    const parentResolution = resolveRequestedParentId(
      state.pages,
      project.id,
      req.body?.parentId || null,
      { icon: req.body?.icon }
    );

    if (parentResolution.error) {
      res.status(400).json({ error: parentResolution.error });
      return;
    }

    const parentId = parentResolution.parentId;

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

    const parentResolution = resolveRequestedParentId(
      state.pages,
      page.projectId,
      req.body?.parentId || null,
      page
    );

    if (parentResolution.error) {
      res.status(400).json({ error: parentResolution.error });
      return;
    }

    const nextParentId = parentResolution.parentId;

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
  const statusCode = Number(error?.statusCode || error?.status || 500);
  const message =
    typeof error?.message === "string" && error.message.trim()
      ? error.message
      : "서버에서 오류가 발생했습니다.";
  res.status(statusCode).json({ error: message });
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
