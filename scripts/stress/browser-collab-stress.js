const { chromium } = require("playwright");

const BASE_URL = process.env.BASE_URL || "http://127.0.0.1:3000";
const CLIENTS = Number(process.env.CLIENTS || 10);

const EMPTY_DOC = {
  type: "doc",
  content: [{ type: "paragraph" }]
};

async function api(path, { token, method = "GET", body } = {}) {
  const response = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body ? { "Content-Type": "application/json" } : {})
    },
    body: body ? JSON.stringify(body) : undefined
  });

  if (!response.ok) {
    throw new Error(`${method} ${path} failed: ${response.status} ${response.statusText}`);
  }

  if (response.status === 204) {
    return null;
  }

  return response.json();
}

async function createStressPage(token) {
  const boot = await api("/api/bootstrap", { token });
  const projectId = boot.projects[0]?.id;

  if (!projectId) {
    throw new Error("No project available for stress test");
  }

  const created = await api(`/api/projects/${projectId}/pages`, {
    token,
    method: "POST",
    body: {
      title: `Stress ${Date.now()}`,
      content: EMPTY_DOC,
      contentFormat: "tiptap-json"
    }
  });

  return {
    pageId: created.page.id,
    projectId
  };
}

async function deleteStressPage(token, projectId, pageId) {
  await api(`/api/projects/${projectId}/pages/${pageId}`, {
    token,
    method: "DELETE"
  });
}

async function loginToken() {
  const payload = await api("/api/auth/login", {
    method: "POST",
    body: {
      email: "admin@zeeum.local",
      password: "admin1234!"
    }
  });

  return payload.sessionToken;
}

async function prepareClient(browser, token, url, index) {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1200 }
  });

  await context.addInitScript((sessionToken) => {
    window.localStorage.setItem("zeeum_auth_token", sessionToken);
  }, token);

  const page = await context.newPage();
  const issues = [];

  page.on("console", (message) => {
    if (message.type() === "error") {
      issues.push({ type: "console", text: message.text() });
    }
  });

  page.on("pageerror", (error) => {
    issues.push({ type: "pageerror", text: error.message });
  });

  page.on("requestfailed", (request) => {
    issues.push({
      type: "requestfailed",
      text: `${request.url()} ${request.failure()?.errorText || ""}`.trim()
    });
  });

  await page.goto(url, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1500);
  await page.locator(".ProseMirror").waitFor({ state: "visible", timeout: 30000 });
  await page.locator('[data-collab-ready="true"] .ProseMirror').waitFor({ state: "visible", timeout: 30000 });

  return { context, issues, mode: "styled", page };
}

async function typeToken(client, token) {
  await client.page.locator('[data-collab-ready="true"] .ProseMirror').waitFor({ state: "visible", timeout: 30000 });
  for (let attempt = 0; attempt < 3; attempt += 1) {
    await client.page.locator(".ProseMirror").click();
    await client.page.keyboard.press("End");
    await client.page.keyboard.type(` ${token}`, { delay: 0 });
    await client.page.waitForTimeout(120);

    const inserted = await client.page
      .locator(".ProseMirror")
      .evaluate((el, expected) => el.textContent.includes(expected), token)
      .catch(() => false);

    if (inserted) {
      return true;
    }
  }

  client.issues.push({ type: "local-insert-missed", text: token });
  return false;
}

async function collectClientState(client, tokens) {
  return client.page.evaluate((expectedTokens) => {
    const textarea = document.querySelector("textarea");
    const prose = document.querySelector(".ProseMirror");
    const text = textarea?.value || prose?.textContent || "";

    return {
      href: location.href,
      hasLanding: document.body.innerText.includes("LANDING"),
      hasProjects: document.body.innerText.includes("ACCESSIBLE PROJECTS"),
      missingTokens: expectedTokens.filter((token) => !text.includes(token)),
      textLength: text.length
    };
  }, tokens);
}

(async () => {
  const token = await loginToken();
  const { pageId, projectId } = await createStressPage(token);
  const url = `${BASE_URL}/projects/${projectId}/pages/${pageId}`;
  const browser = await chromium.launch({
    headless: true,
    executablePath: "/usr/bin/google-chrome",
    args: ["--no-sandbox"]
  });

  const clients = [];
  const tokens = Array.from({ length: CLIENTS }, (_, index) => `CLIENT-${index}-${Date.now()}`);
  const result = {
    baseUrl: BASE_URL,
    clients: CLIENTS,
    issues: [],
    metrics: {},
    pageId,
    projectId
  };

  try {
    const openStarted = Date.now();
    const preparedClients = await Promise.all(
      Array.from({ length: CLIENTS }, (_, index) => prepareClient(browser, token, url, index))
    );
    result.metrics.openMs = Date.now() - openStarted;
    clients.push(...preparedClients);

    const typingStarted = Date.now();
    const typingResults = await Promise.all(
      clients.map((client, index) =>
        (async () => {
          await client.page.waitForTimeout(index * 40);
          return typeToken(client, tokens[index]);
        })()
      )
    );
    result.metrics.concurrentTypingMs = Date.now() - typingStarted;
    result.metrics.localInsertFailures = typingResults
      .map((value, index) => ({ index, ok: value !== false }))
      .filter((entry) => !entry.ok);

    await Promise.all(clients.map((client) => client.page.waitForTimeout(2500)));

    const states = await Promise.all(clients.map((client) => collectClientState(client, tokens)));
    result.clientStates = states;
    result.issues.push(
      ...clients.flatMap((client) => client.issues)
    );

    result.metrics.anyLandingFallback = states.some((state) => state.hasLanding);
    result.metrics.anyProjectsFallback = states.some((state) => state.hasProjects);
    result.metrics.missingTokenClients = states
      .map((state, index) => ({ index, missing: state.missingTokens.length }))
      .filter((entry) => entry.missing > 0);
  } finally {
    await Promise.all(clients.map((client) => client.context.close().catch(() => {})));
    await browser.close();
    await deleteStressPage(token, projectId, pageId).catch(() => {});
  }

  console.log(JSON.stringify(result, null, 2));
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
