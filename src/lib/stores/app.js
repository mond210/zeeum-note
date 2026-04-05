import { get, writable } from "svelte/store";
import { api } from "../api.js";
import { normalizeTitle } from "../format.js";
import { buildPageTree, isDescendant } from "../page-tree.js";
import { EMPTY_DOC } from "../rich-doc.js";

const emptyDraft = () => ({
  content: EMPTY_DOC,
  contentFormat: "tiptap-json",
  icon: "file-text",
  title: ""
});

const emptyAdminConsole = () => ({
  ai: null,
  files: {
    storeFiles: [],
    uploads: []
  },
  members: [],
  overview: {
    backend: {
      engine: "filesystem",
      label: "JSON file store",
      location: "data/*.json + data/uploads",
      status: "connected"
    },
    recentUploads: [],
    storage: {
      dataBytes: 0,
      totalBytes: 0,
      uploadBytes: 0,
      uploadTypeTotals: { file: 0, image: 0, video: 0 }
    },
    totals: {
      admins: 0,
      files: 0,
      groups: 0,
      members: 0,
      pages: 0,
      projects: 0,
      revisions: 0
    }
  },
  projects: []
});

const initialState = {
  activeProject: null,
  activeProjectId: null,
  adminConsole: emptyAdminConsole(),
  adminLoading: false,
  adminSection: "dashboard",
  authenticated: false,
  booting: true,
  currentUser: null,
  groups: [],
  loadingPage: false,
  loadingProject: false,
  memberDirectory: [],
  members: [],
  openPageIds: [],
  pageDirty: false,
  pageDraft: emptyDraft(),
  pages: [],
  preferences: null,
  projects: [],
  recentProjects: [],
  route: "landing",
  savingPage: false,
  searchQuery: "",
  selectedPage: null,
  selectedPageId: null,
  status: { message: "Preparing projects...", tone: "pending" }
};

function parseLocation(pathname) {
  const normalizedPath = pathname || "/";

  if (normalizedPath === "/") {
    return { route: "launcher" };
  }

  if (normalizedPath === "/admin" || normalizedPath.startsWith("/admin/")) {
    const section = normalizedPath.split("/").filter(Boolean)[1] || "dashboard";
    const allowed = ["dashboard", "projects", "files", "members", "ai"];
    return {
      route: "admin",
      section: allowed.includes(section) ? section : "dashboard"
    };
  }

  if (normalizedPath.startsWith("/projects/")) {
    const parts = normalizedPath.split("/").filter(Boolean);
    const projectId = parts[1] || null;

    if (parts[2] === "pages" && parts[3]) {
      return { route: "page", projectId, pageId: parts[3] };
    }

    if (parts[2] === "settings") {
      return { route: "settings", projectId };
    }

    return { route: "project-home", projectId };
  }

  if (normalizedPath.startsWith("/pages/")) {
    return { route: "legacy-page", pageId: normalizedPath.split("/")[2] || null };
  }

  if (normalizedPath.startsWith("/pages")) {
    return { route: "legacy-pages" };
  }

  if (normalizedPath.startsWith("/groups")) {
    return { route: "legacy-groups" };
  }

  if (normalizedPath.startsWith("/preferences")) {
    return { route: "legacy-preferences" };
  }

  if (normalizedPath.startsWith("/workspace")) {
    return { route: "legacy-workspace" };
  }

  return { route: "launcher" };
}

function routePath(route, projectId = null, pageId = null, section = null) {
  if (route === "admin") {
    return !section || section === "dashboard" ? "/admin" : `/admin/${section}`;
  }

  if (route === "project-home" && projectId) {
    return `/projects/${projectId}`;
  }

  if (route === "page" && projectId && pageId) {
    return `/projects/${projectId}/pages/${pageId}`;
  }

  if (route === "settings" && projectId) {
    return `/projects/${projectId}/settings`;
  }

  return "/";
}

function sortProjects(projects) {
  return [...projects].sort((left, right) => left.name.localeCompare(right.name));
}

function sortRecentProjects(projects) {
  return [...projects].sort((left, right) => {
    return (
      new Date(right.lastOpenedAt || right.updatedAt).getTime() -
      new Date(left.lastOpenedAt || left.updatedAt).getTime()
    );
  });
}

function upsertProject(list, project) {
  const next = list.some((entry) => entry.id === project.id)
    ? list.map((entry) => (entry.id === project.id ? project : entry))
    : [...list, project];

  return next;
}

function rootSelection(pageIds, pages) {
  const selected = Array.from(new Set(pageIds));

  return selected.filter((pageId) => {
    return !selected.some((candidate) => candidate !== pageId && isDescendant(pages, candidate, pageId));
  });
}

function orderedRootSelection(pageIds, pages) {
  const roots = rootSelection(pageIds, pages);
  const order = new Map(buildPageTree(pages).map((page, index) => [page.id, index]));

  return [...roots].sort((left, right) => (order.get(left) ?? 0) - (order.get(right) ?? 0));
}

function pruneOpenPageIds(openPageIds, pages) {
  const validPageIds = new Set((pages || []).map((page) => page.id));

  return Array.from(new Set((openPageIds || []).filter((pageId) => validPageIds.has(pageId))));
}

function includeOpenPageId(openPageIds, pageId) {
  if (!pageId) {
    return Array.from(new Set(openPageIds || []));
  }

  return Array.from(new Set([...(openPageIds || []), pageId]));
}

function adjacentOpenPageId(openPageIds, closingPageId) {
  const index = (openPageIds || []).indexOf(closingPageId);

  if (index < 0) {
    return Array.isArray(openPageIds) && openPageIds.length > 0
      ? openPageIds[openPageIds.length - 1]
      : null;
  }

  return openPageIds[index + 1] || openPageIds[index - 1] || null;
}

function firstMatchingPageId(candidateIds, pages) {
  const validPageIds = new Set((pages || []).map((page) => page.id));

  return (candidateIds || []).find((pageId) => pageId && validPageIds.has(pageId)) || null;
}

function collectDeletedPageIds(pages, rootPageIds) {
  return (pages || [])
    .filter((page) => {
      return (rootPageIds || []).some((rootPageId) => {
        return page.id === rootPageId || isDescendant(pages, rootPageId, page.id);
      });
    })
    .map((page) => page.id);
}

function reindexLocalSiblings(pages, projectId, parentId) {
  pages
    .filter((page) => page.projectId === projectId && (page.parentId ?? null) === (parentId ?? null))
    .sort((left, right) => left.position - right.position)
    .forEach((page, index) => {
      page.position = index;
    });
}

function createAppStore() {
  const { subscribe, set, update } = writable(initialState);
  let autosaveTimer = null;

  const snapshot = () => get({ subscribe });

  function storeAuthToken(token) {
    if (typeof window === "undefined") {
      return;
    }

    if (token) {
      window.localStorage.setItem("zeeum_auth_token", token);
    } else {
      window.localStorage.removeItem("zeeum_auth_token");
    }
  }

  async function bootstrapWithToken(token) {
    const response = await fetch("/api/bootstrap", {
      credentials: "include",
      headers: {
        Authorization: `Bearer ${token}`
      }
    });

    if (!response.ok) {
      let message = "부트스트랩 요청에 실패했습니다.";

      try {
        const payload = await response.json();
        message = payload.error || message;
      } catch {}

      throw new Error(message);
    }

    return response.json();
  }

  function draftSignature(draft) {
    return JSON.stringify({
      content: draft.content,
      contentFormat: draft.contentFormat,
      icon: draft.icon,
      title: draft.title
    });
  }

  function clearAutosaveTimer() {
    if (autosaveTimer) {
      clearTimeout(autosaveTimer);
      autosaveTimer = null;
    }
  }

  function scheduleAutosave() {
    clearAutosaveTimer();

    autosaveTimer = setTimeout(() => {
      void savePage();
    }, 700);
  }

  function setStatus(message, tone = "idle") {
    update((state) => ({
      ...state,
      status: { message, tone }
    }));
  }

  function applyLauncherData(payload) {
    update((state) => ({
      ...state,
      authenticated: payload.authenticated ?? state.authenticated,
      currentUser: payload.currentUser ?? state.currentUser,
      memberDirectory: payload.memberDirectory ?? state.memberDirectory,
      members: payload.members ?? state.members,
      preferences: payload.preferences ?? state.preferences,
      projects: payload.projects ? sortProjects(payload.projects) : state.projects,
      recentProjects: payload.recentProjects
        ? sortRecentProjects(payload.recentProjects)
        : state.recentProjects
    }));
  }

  async function applyAuthenticatedBootstrap(payload) {
    set({
      ...initialState,
      authenticated: true,
      booting: true,
      currentUser: payload.currentUser,
      memberDirectory: payload.memberDirectory || [],
      members: payload.members,
      preferences: payload.preferences,
      projects: sortProjects(payload.projects),
      recentProjects: sortRecentProjects(payload.recentProjects),
      status: { message: "Projects loaded", tone: "success" }
    });

    await resolveInitialRoute(payload);
  }

  function applyAuthenticatedLauncher(payload) {
    set({
      ...initialState,
      authenticated: true,
      booting: false,
      currentUser: payload.currentUser,
      memberDirectory: payload.memberDirectory || [],
      members: payload.members,
      preferences: payload.preferences,
      projects: sortProjects(payload.projects),
      recentProjects: sortRecentProjects(payload.recentProjects),
      route: "launcher",
      status: { message: "Signed in", tone: "success" }
    });
    history.replaceState({}, "", "/");
  }

  function mergeProject(project) {
    update((state) => ({
      ...state,
      activeProject:
        state.activeProjectId === project.id ? project : state.activeProject,
      projects: sortProjects(upsertProject(state.projects, project)),
      recentProjects: sortRecentProjects(upsertProject(state.recentProjects, project))
    }));
  }

  function clearPageSelection({ clearOpenPages = false } = {}) {
    clearAutosaveTimer();
    update((state) => ({
      ...state,
      loadingPage: false,
      openPageIds: clearOpenPages ? [] : state.openPageIds,
      pageDirty: false,
      pageDraft: emptyDraft(),
      selectedPage: null,
      selectedPageId: null
    }));
  }

  async function refreshLauncherData() {
    const payload = await api.bootstrap();
    applyLauncherData(payload);
    return payload;
  }

  async function refreshAdminConsole() {
    const payload = await api.adminConsole();
    update((state) => ({
      ...state,
      adminConsole: payload,
      adminLoading: false,
      memberDirectory: payload.members
    }));
    return payload;
  }

  async function refreshProjectContext() {
    const state = snapshot();

    if (!state.activeProjectId) {
      return null;
    }

    const payload = await api.getProject(state.activeProjectId);
    const projectPages = payload.pages || [];
    const selectedSummary = state.selectedPageId
      ? projectPages.find((page) => page.id === state.selectedPageId) || null
      : null;

    update((current) => ({
      ...current,
      activeProject: payload.project,
      groups: payload.groups,
      openPageIds: pruneOpenPageIds(current.openPageIds, projectPages),
      pageDraft:
        selectedSummary && !current.pageDirty
          ? {
              ...current.pageDraft,
              contentFormat: selectedSummary.contentFormat,
              icon: selectedSummary.icon,
              title: selectedSummary.title
            }
          : current.pageDraft,
      pages: projectPages,
      selectedPage: selectedSummary || current.selectedPage
    }));
    mergeProject(payload.project);

    if (state.selectedPageId && !projectPages.some((page) => page.id === state.selectedPageId)) {
      clearPageSelection();
      update((current) => ({
        ...current,
        route: "project-home"
      }));
      history.replaceState({}, "", routePath("project-home", state.activeProjectId));
    }

    return payload;
  }

  async function loadPage(projectId, pageId) {
    if (!pageId) {
      clearPageSelection();
      return null;
    }

    update((state) => ({ ...state, loadingPage: true }));

    try {
      const payload = await api.getPage(projectId, pageId);

      update((state) => ({
        ...state,
        loadingPage: false,
        openPageIds: includeOpenPageId(state.openPageIds, payload.page.id),
        pageDirty: false,
        pageDraft: {
          content: payload.page.content,
          contentFormat: payload.page.contentFormat,
          icon: payload.page.icon,
          title: payload.page.title
        },
        selectedPage: payload.page,
        selectedPageId: payload.page.id
      }));

      return payload.page;
    } catch (error) {
      update((state) => ({ ...state, loadingPage: false }));
      throw error;
    }
  }

  async function maybeSaveDirtyPage(targetRoute, targetProjectId = null, targetPageId = null) {
    const state = snapshot();
    const leavingPage =
      state.route === "page" &&
      (targetRoute !== "page" ||
        targetProjectId !== state.activeProjectId ||
        targetPageId !== state.selectedPageId);

    if (state.pageDirty && leavingPage) {
      await savePage();
    }
  }

  async function enterProject(projectId, options = {}) {
    const {
      pageId = null,
      replace = false,
      route = "project-home",
      markOpened = true
    } = options;
    const state = snapshot();

    if (!state.authenticated) {
      return;
    }

    await maybeSaveDirtyPage(route, projectId, pageId);

    update((state) => ({
      ...state,
      loadingProject: true
    }));

    try {
      if (markOpened) {
        const openPayload = await api.openProject(projectId);
        mergeProject(openPayload.project);
        update((state) => ({
          ...state,
          recentProjects: sortRecentProjects(openPayload.recentProjects)
        }));
      }

      const payload = await api.getProject(projectId);
      const projectChanged = state.activeProjectId !== payload.project.id;
      const projectPages = payload.pages || [];
      const nextPageId =
        route === "page"
          ? pageId || payload.project.homePageId || projectPages[0]?.id || null
          : null;
      const selectedSummary =
        route === "page" && nextPageId
          ? projectPages.find((page) => page.id === nextPageId) || null
          : null;
      const nextOpenPageIds =
        route === "page" && nextPageId
          ? includeOpenPageId(
              pruneOpenPageIds(projectChanged ? [] : state.openPageIds, projectPages),
              nextPageId
            )
          : projectChanged
            ? []
            : pruneOpenPageIds(state.openPageIds, projectPages);

      update((state) => ({
        ...state,
        activeProject: payload.project,
        activeProjectId: payload.project.id,
        groups: payload.groups,
        loadingProject: false,
        loadingPage: route === "page" && !!nextPageId,
        openPageIds: nextOpenPageIds,
        pageDraft:
          route === "page" && nextPageId
            ? {
                content: EMPTY_DOC,
                contentFormat: selectedSummary?.contentFormat || "tiptap-json",
                icon: selectedSummary?.icon || "file-text",
                title: selectedSummary?.title || ""
              }
            : state.pageDraft,
        pages: projectPages,
        route,
        searchQuery: route === "project-home" ? "" : state.searchQuery,
        selectedPage: selectedSummary,
        selectedPageId: nextPageId
      }));

      mergeProject(payload.project);

      if (route === "page" && nextPageId) {
        await loadPage(projectId, nextPageId);
      } else {
        clearPageSelection();
      }

      const method = replace ? "replaceState" : "pushState";
      history[method]({}, "", routePath(route, projectId, nextPageId));

      setStatus(route === "page" ? "Page loaded" : "Project ready", "success");
    } catch (error) {
      update((state) => ({
        ...state,
        loadingProject: false
      }));
      setStatus(error.message, "error");
    }
  }

  async function openLauncher({ replace = false } = {}) {
    const state = snapshot();

    if (!state.authenticated) {
      update((state) => ({ ...state, route: "landing" }));
      history[replace ? "replaceState" : "pushState"]({}, "", "/");
      return;
    }

    const preferredProject = state.recentProjects[0]?.id || state.projects[0]?.id || null;

    if (preferredProject) {
      await enterProject(preferredProject, {
        replace,
        route: "page",
        markOpened: false
      });
      return;
    }

    await maybeSaveDirtyPage("launcher");
    clearPageSelection();
    update((state) => ({
      ...state,
      activeProject: null,
      activeProjectId: null,
      adminConsole: emptyAdminConsole(),
      adminLoading: false,
      adminSection: "dashboard",
      groups: [],
      openPageIds: [],
      pages: [],
      route: "launcher",
      searchQuery: ""
    }));

    history[replace ? "replaceState" : "pushState"]({}, "", "/");
    setStatus("Workspace home ready", "success");
  }

  async function openAdminConsole(section = "dashboard", { replace = false } = {}) {
    const state = snapshot();

    if (!state.authenticated) {
      return;
    }

    if (state.currentUser?.role !== "admin") {
      await openLauncher({ replace });
      setStatus("관리자 권한이 필요합니다.", "error");
      return;
    }

    await maybeSaveDirtyPage("admin");
    update((current) => ({
      ...current,
      adminLoading: true,
      adminSection: section,
      route: "admin"
    }));

    try {
      const [launcherPayload, consolePayload] = await Promise.all([api.bootstrap(), api.adminConsole()]);
      applyLauncherData(launcherPayload);

      update((current) => ({
        ...current,
        adminConsole: consolePayload,
        adminLoading: false,
        adminSection: section,
        currentUser: launcherPayload.currentUser ?? current.currentUser,
        memberDirectory: consolePayload.members,
        route: "admin"
      }));

      history[replace ? "replaceState" : "pushState"]({}, "", routePath("admin", null, null, section));
      setStatus("Admin console ready", "success");
    } catch (error) {
      update((current) => ({
        ...current,
        adminLoading: false
      }));
      setStatus(error.message, "error");
    }
  }

  function preferredProjectId(payload) {
    return payload.recentProjects?.[0]?.id || payload.projects?.[0]?.id || null;
  }

  async function resolveInitialRoute(payload) {
    const location = parseLocation(window.location.pathname);
    const fallbackProjectId = preferredProjectId(payload);

    try {
      if (location.route === "launcher") {
        await openLauncher({ replace: true });
        return;
      }

      if (location.route === "admin") {
        await openAdminConsole(location.section, { replace: true });
        return;
      }

      if (location.route === "page" || location.route === "project-home" || location.route === "settings") {
        await enterProject(location.projectId, {
          pageId: location.pageId,
          replace: true,
          route: location.route
        });
        return;
      }

      if (location.route === "legacy-page" && location.pageId) {
        try {
          const locator = await api.locatePage(location.pageId);
          await enterProject(locator.projectId, {
            pageId: locator.pageId,
            replace: true,
            route: "page"
          });
          return;
        } catch {
          if (!fallbackProjectId) {
            await openLauncher({ replace: true });
            return;
          }
        }
      }

      if (!fallbackProjectId) {
        await openLauncher({ replace: true });
        return;
      }

      const legacyRoute =
        location.route === "legacy-groups" || location.route === "legacy-preferences"
          ? "settings"
          : "page";

      await enterProject(fallbackProjectId, {
        replace: true,
        route: legacyRoute
      });
    } finally {
      update((state) => ({ ...state, booting: false }));
    }
  }

  async function bootstrap() {
    set(initialState);

    try {
      const payload = await api.bootstrap();

      if (!payload.authenticated) {
        storeAuthToken("");
        set({
          ...initialState,
          authenticated: false,
          booting: false,
          currentUser: null,
          route: "landing",
          status: { message: "Sign in to continue", tone: "idle" }
        });
        history.replaceState({}, "", "/");
        return;
      }

      await applyAuthenticatedBootstrap(payload);
    } catch (error) {
      set({
        ...initialState,
        booting: false,
        status: { message: error.message, tone: "error" }
      });
    }
  }

  async function navigate(route, options = {}) {
    const state = snapshot();

    if (!state.authenticated) {
      return;
    }

    if (route === "launcher") {
      await openLauncher(options);
      return;
    }

    if (route === "admin") {
      await openAdminConsole(options.section || snapshot().adminSection, options);
      return;
    }

    if (!state.activeProjectId) {
      return;
    }

    await enterProject(state.activeProjectId, {
      ...options,
      route
    });
  }

  function setSearchQuery(searchQuery) {
    update((state) => ({ ...state, searchQuery }));
  }

  function updatePageDraft(patch) {
    update((state) => ({
      ...state,
      pageDirty: true,
      pageDraft: {
        ...state.pageDraft,
        ...patch
      }
    }));

    scheduleAutosave();
  }

  async function savePage({ force = false } = {}) {
    const state = snapshot();

    if (!state.activeProjectId || !state.selectedPageId) {
      return;
    }

    if (!state.pageDirty && !force) {
      return;
    }

    if (state.savingPage) {
      return;
    }

    clearAutosaveTimer();
    const savingSignature = draftSignature(state.pageDraft);

    update((current) => ({ ...current, savingPage: true }));
    setStatus("Saving page...", "pending");

    try {
      const requestBody = {
        icon: state.pageDraft.icon,
        title: normalizeTitle(state.pageDraft.title, "Untitled page")
      };

      if (state.pageDraft.contentFormat === "markdown") {
        requestBody.content = state.pageDraft.content;
        requestBody.contentFormat = "markdown";
      }

      const payload = await api.updatePage(state.activeProjectId, state.selectedPageId, requestBody);

      await refreshProjectContext();

      update((current) => ({
        ...current,
        savingPage: false,
        pageDirty:
          current.selectedPageId !== payload.page.id ||
          draftSignature(current.pageDraft) !== savingSignature,
        pageDraft:
          current.selectedPageId === payload.page.id &&
          draftSignature(current.pageDraft) === savingSignature
            ? {
                content: payload.page.content,
                contentFormat: payload.page.contentFormat,
                icon: payload.page.icon,
                title: payload.page.title
              }
            : current.pageDraft,
        selectedPage:
          current.selectedPageId === payload.page.id ? payload.page : current.selectedPage,
        selectedPageId: current.selectedPageId
      }));

      if (snapshot().pageDirty) {
        scheduleAutosave();
      }

      setStatus("All changes saved", "success");
    } catch (error) {
      update((current) => ({ ...current, savingPage: false }));
      setStatus(error.message, "error");
    }
  }

  async function selectPage(pageId, { replace = false } = {}) {
    const state = snapshot();

    if (!state.activeProjectId || pageId === state.selectedPageId) {
      return;
    }

    await enterProject(state.activeProjectId, {
      pageId,
      replace,
      route: "page"
    });
  }

  async function closeOpenPage(pageId) {
    const state = snapshot();

    if (!state.activeProjectId || !state.openPageIds.includes(pageId)) {
      return;
    }

    const remainingOpenPageIds = state.openPageIds.filter((openPageId) => openPageId !== pageId);

    if (pageId !== state.selectedPageId) {
      update((current) => ({
        ...current,
        openPageIds: remainingOpenPageIds
      }));
      return;
    }

    const nextPageId = adjacentOpenPageId(state.openPageIds, pageId);

    if (nextPageId && remainingOpenPageIds.includes(nextPageId)) {
      await enterProject(state.activeProjectId, {
        pageId: nextPageId,
        replace: true,
        route: "page",
        markOpened: false
      });

      update((current) => ({
        ...current,
        openPageIds: current.openPageIds.filter((openPageId) => openPageId !== pageId)
      }));
      return;
    }

    await enterProject(state.activeProjectId, {
      replace: true,
      route: "project-home",
      markOpened: false
    });

    update((current) => ({
      ...current,
      openPageIds: []
    }));
  }

  async function createPageRecord({
    parentId = null,
    title = "new page",
    icon = "file-text",
    content = EMPTY_DOC,
    contentFormat = "tiptap-json",
    selectAfter = true
  } = {}) {
    const state = snapshot();

    if (!state.activeProjectId) {
      return null;
    }

    const payload = await api.createPage(state.activeProjectId, {
      content,
      contentFormat,
      icon,
      parentId,
      title
    });

    await refreshProjectContext();

    if (selectAfter) {
      await enterProject(state.activeProjectId, {
        pageId: payload.page.id,
        replace: true,
        route: "page",
        markOpened: false
      });
    }

    return payload.page;
  }

  async function createPage(parentId = null) {
    const state = snapshot();

    if (!state.activeProjectId) {
      return null;
    }

    await maybeSaveDirtyPage("page", state.activeProjectId);
    setStatus("Creating page...", "pending");

    try {
      const page = await createPageRecord({
        parentId,
        title: "new page"
      });
      setStatus("Page created", "success");
      return page;
    } catch (error) {
      setStatus(error.message, "error");
      return null;
    }
  }

  async function createFolder(parentId = null) {
    const state = snapshot();

    if (!state.activeProjectId) {
      return null;
    }

    await maybeSaveDirtyPage("page", state.activeProjectId);
    setStatus("Creating folder...", "pending");

    try {
      const page = await createPageRecord({
        icon: "folder_open",
        parentId,
        selectAfter: false,
        title: "New folder"
      });
      setStatus("Folder created", "success");
      return page;
    } catch (error) {
      setStatus(error.message, "error");
      return null;
    }
  }

  async function deletePage(pageId) {
    const state = snapshot();

    if (!state.activeProjectId) {
      return;
    }

    await api.deletePage(state.activeProjectId, pageId);
    const payload = await refreshProjectContext();
    const remainingPages = payload?.pages || [];
    const remainingOpenPageIds = pruneOpenPageIds(
      state.openPageIds.filter((openPageId) => openPageId !== pageId),
      remainingPages
    );
    const nextPageId = firstMatchingPageId(
      [
        adjacentOpenPageId(state.openPageIds, pageId),
        ...remainingOpenPageIds,
        payload?.project.homePageId,
        remainingPages[0]?.id
      ],
      remainingPages
    );
    const selectedPageStillExists = remainingPages.some((page) => page.id === state.selectedPageId);

    if (state.selectedPageId && state.selectedPageId !== pageId && selectedPageStillExists) {
      setStatus("Page deleted", "success");
      return;
    }

    if (nextPageId) {
      await enterProject(state.activeProjectId, {
        pageId: nextPageId,
        replace: true,
        route: "page",
        markOpened: false
      });
    } else {
      clearPageSelection({ clearOpenPages: true });
      update((current) => ({
        ...current,
        route: "project-home"
      }));
      history.replaceState({}, "", routePath("project-home", state.activeProjectId));
    }

    setStatus("Page deleted", "success");
  }

  async function renamePage(pageId, title) {
    const state = snapshot();

    if (!state.activeProjectId) {
      return null;
    }

    const result = await api.updatePage(state.activeProjectId, pageId, {
      title
    });

    await refreshProjectContext();

    if (state.selectedPageId === pageId) {
      update((current) => ({
        ...current,
        pageDraft: {
          ...current.pageDraft,
          title: result.page.title
        },
        selectedPage:
          current.selectedPageId === pageId
            ? {
                ...current.selectedPage,
                title: result.page.title
              }
            : current.selectedPage
      }));
    }

    setStatus("Page renamed", "success");
    return result.page;
  }

  async function movePages(pageIds, parentId = null, position = null) {
    const state = snapshot();

    if (!state.activeProjectId || !Array.isArray(pageIds) || pageIds.length === 0) {
      return;
    }

    const roots = orderedRootSelection(pageIds, state.pages);

    if (roots.length === 0) {
      return;
    }

    setStatus("Moving pages...", "pending");

    try {
      const workingPages = state.pages.map((page) => ({ ...page }));
      let nextPosition = Number.isFinite(position) ? position : null;

      for (const pageId of roots) {
        const page = workingPages.find((entry) => entry.id === pageId);

        if (!page) {
          continue;
        }

        const nextParentId = parentId ?? null;
        const currentParentId = page.parentId ?? null;
        const siblings = workingPages
          .filter(
            (entry) =>
              entry.id !== page.id &&
              entry.projectId === page.projectId &&
              (entry.parentId ?? null) === nextParentId
          )
          .sort((left, right) => left.position - right.position);
        const normalizedPosition =
          nextPosition === null ? siblings.length : Math.max(0, Math.min(nextPosition, siblings.length));

        await api.movePage(state.activeProjectId, pageId, {
          parentId: nextParentId,
          position: normalizedPosition
        });

        page.parentId = nextParentId;
        page.position = normalizedPosition;
        reindexLocalSiblings(workingPages, page.projectId, currentParentId);
        reindexLocalSiblings(workingPages, page.projectId, nextParentId);
        nextPosition = nextPosition === null ? null : normalizedPosition + 1;
      }

      await refreshProjectContext();
      setStatus("Pages moved", "success");
    } catch (error) {
      setStatus(error.message, "error");
    }
  }

  async function duplicatePages(pageIds) {
    const state = snapshot();

    if (!state.activeProjectId || !Array.isArray(pageIds) || pageIds.length === 0) {
      return [];
    }

    const roots = orderedRootSelection(pageIds, state.pages);

    if (roots.length === 0) {
      return [];
    }

    setStatus("Copying pages...", "pending");

    const pagesById = new Map(state.pages.map((page) => [page.id, page]));

    async function duplicateTree(sourceId, targetParentId = null, titleOverride = null) {
      const source = pagesById.get(sourceId);

      if (!source) {
        return null;
      }

      const detail = await api.getPage(state.activeProjectId, source.id);
      const created = await createPageRecord({
        content: detail.page.content,
        contentFormat: detail.page.contentFormat,
        icon: detail.page.icon,
        parentId: targetParentId,
        selectAfter: false,
        title: titleOverride || source.title
      });

      const children = state.pages
        .filter((page) => page.parentId === source.id)
        .sort((left, right) => left.position - right.position);

      for (const child of children) {
        await duplicateTree(child.id, created.id, child.title);
      }

      return created;
    }

    try {
      const duplicates = [];

      for (const sourceId of roots) {
        const source = pagesById.get(sourceId);
        const duplicated = await duplicateTree(
          sourceId,
          source?.parentId ?? null,
          `${source?.title || "Untitled"} copy`
        );

        if (duplicated) {
          duplicates.push(duplicated);
        }
      }

      await refreshProjectContext();
      setStatus("Pages copied", "success");
      return duplicates;
    } catch (error) {
      setStatus(error.message, "error");
      return [];
    }
  }

  async function deletePages(pageIds) {
    const state = snapshot();

    if (!state.activeProjectId || !Array.isArray(pageIds) || pageIds.length === 0) {
      return;
    }

    const roots = orderedRootSelection(pageIds, state.pages);

    if (roots.length === 0) {
      return;
    }

    setStatus("Deleting pages...", "pending");

    try {
      const deletedPageIds = collectDeletedPageIds(state.pages, roots);

      for (const pageId of roots) {
        await api.deletePage(state.activeProjectId, pageId);
      }

      const payload = await refreshProjectContext();
      const remainingPages = payload?.pages || [];
      const remainingOpenPageIds = pruneOpenPageIds(
        state.openPageIds.filter((pageId) => !deletedPageIds.includes(pageId)),
        remainingPages
      );
      const nextPageId = firstMatchingPageId(
        [
          adjacentOpenPageId(state.openPageIds, state.selectedPageId),
          ...remainingOpenPageIds,
          payload?.project.homePageId,
          remainingPages[0]?.id
        ],
        remainingPages
      );
      const selectedPageDeleted =
        !!state.selectedPageId && deletedPageIds.includes(state.selectedPageId);
      const selectedPageStillExists = remainingPages.some((page) => page.id === state.selectedPageId);

      if (state.selectedPageId && !selectedPageDeleted && selectedPageStillExists) {
        setStatus("Pages deleted", "success");
        return;
      }

      if (nextPageId) {
        await enterProject(state.activeProjectId, {
          pageId: nextPageId,
          replace: true,
          route: "page",
          markOpened: false
        });
      } else {
        clearPageSelection({ clearOpenPages: true });
        update((current) => ({
          ...current,
          route: "project-home"
        }));
        history.replaceState({}, "", routePath("project-home", state.activeProjectId));
      }

      setStatus("Pages deleted", "success");
    } catch (error) {
      setStatus(error.message, "error");
    }
  }

  async function createProject(payload) {
    if (!snapshot().authenticated) {
      return null;
    }

    setStatus("Creating project...", "pending");

    try {
      const result = await api.createProject(payload);
      await refreshLauncherData();
      await enterProject(result.project.id, {
        replace: false,
        route: "page",
        markOpened: false
      });
      setStatus("Project created", "success");
      return result.project;
    } catch (error) {
      setStatus(error.message, "error");
      return null;
    }
  }

  async function saveProject(payload) {
    const state = snapshot();

    if (!state.activeProjectId) {
      return null;
    }

    const result = await api.updateProject(state.activeProjectId, payload);
    update((current) => ({
      ...current,
      activeProject: result.project
    }));
    mergeProject(result.project);
    setStatus("Project settings saved", "success");
    return result.project;
  }

  async function savePreferences(payload) {
    const result = await api.updatePreferences(payload);
    update((state) => ({ ...state, preferences: result.preferences }));
    setStatus("Preferences saved", "success");
  }

  async function createGroup(payload) {
    const state = snapshot();

    if (!state.activeProjectId) {
      return null;
    }

    const result = await api.createGroup(state.activeProjectId, payload);
    await refreshProjectContext();
    setStatus("Group created", "success");
    return result.group;
  }

  async function saveGroup(groupId, payload) {
    const state = snapshot();

    if (!state.activeProjectId) {
      return null;
    }

    const result = await api.updateGroup(state.activeProjectId, groupId, payload);
    await refreshProjectContext();
    setStatus("Group updated", "success");
    return result.group;
  }

  async function saveGroupMembers(groupId, memberIds) {
    const state = snapshot();

    if (!state.activeProjectId) {
      return null;
    }

    const result = await api.updateGroupMembers(state.activeProjectId, groupId, memberIds);
    await refreshProjectContext();
    setStatus("Group members updated", "success");
    return result.group;
  }

  async function deleteGroup(groupId) {
    const state = snapshot();

    if (!state.activeProjectId) {
      return;
    }

    await api.deleteGroup(state.activeProjectId, groupId);
    await refreshProjectContext();
    setStatus("Group deleted", "success");
  }

  async function login(credentials) {
    setStatus("Signing in...", "pending");

    try {
      const result = await api.authLogin(credentials);
      storeAuthToken(result.sessionToken);
      const payload = await bootstrapWithToken(result.sessionToken);
      await applyAuthenticatedBootstrap(payload);
      return true;
    } catch (error) {
      setStatus(error.message, "error");
      return false;
    }
  }

  async function signup(payload) {
    setStatus("Creating account...", "pending");

    try {
      const result = await api.authSignup(payload);
      storeAuthToken(result.sessionToken);
      const nextPayload = await bootstrapWithToken(result.sessionToken);
      await applyAuthenticatedBootstrap(nextPayload);
      return true;
    } catch (error) {
      setStatus(error.message, "error");
      return false;
    }
  }

  async function logout() {
    await api.authLogout();
    storeAuthToken("");
    set({
      ...initialState,
      authenticated: false,
      booting: false,
      route: "landing",
      status: { message: "Signed out", tone: "idle" }
    });
    history.replaceState({}, "", "/");
  }

  async function updateMember(memberId, payload) {
    const result = await api.adminUpdateMember(memberId, payload);
    update((state) => ({
      ...state,
      memberDirectory: result.members
    }));
    await Promise.all([refreshLauncherData(), refreshAdminConsole()]);
    setStatus("Member updated", "success");
    return result.member;
  }

  async function deleteMember(memberId) {
    await api.adminDeleteMember(memberId);
    await Promise.all([refreshLauncherData(), refreshAdminConsole()]);
    setStatus("Member removed", "success");
  }

  async function deleteProjectAsAdmin(projectId) {
    await api.adminDeleteProject(projectId);

    update((state) => {
      if (state.activeProjectId !== projectId) {
        return state;
      }

      return {
        ...state,
        activeProject: null,
        activeProjectId: null,
        groups: [],
        pages: []
      };
    });

    clearPageSelection({ clearOpenPages: true });
    await Promise.all([refreshLauncherData(), refreshAdminConsole()]);
    setStatus("Project removed", "success");
  }

  async function deleteUpload(filename) {
    await api.adminDeleteUpload(filename);
    await refreshAdminConsole();
    setStatus("File removed", "success");
  }

  async function refreshActiveProject() {
    return refreshProjectContext();
  }

  window.addEventListener("popstate", async () => {
    const location = parseLocation(window.location.pathname);

    if (location.route === "launcher") {
      await openLauncher({ replace: true });
      return;
    }

    if (location.route === "admin") {
      await openAdminConsole(location.section, { replace: true });
      return;
    }

    if (location.route === "page" || location.route === "project-home" || location.route === "settings") {
      await enterProject(location.projectId, {
        pageId: location.pageId,
        replace: true,
        route: location.route
      });
      return;
    }

    const payload = snapshot();
    const fallbackProjectId =
      payload.recentProjects[0]?.id || payload.projects[0]?.id || null;

    if (!fallbackProjectId) {
      await openLauncher({ replace: true });
      return;
    }

    if (location.route === "legacy-page" && location.pageId) {
      try {
        const locator = await api.locatePage(location.pageId);
        await enterProject(locator.projectId, {
          pageId: locator.pageId,
          replace: true,
          route: "page"
        });
        return;
      } catch {
        await enterProject(fallbackProjectId, {
          replace: true,
          route: "page"
        });
        return;
      }
    }

    await enterProject(fallbackProjectId, {
      replace: true,
      route:
        location.route === "legacy-groups" || location.route === "legacy-preferences"
          ? "settings"
          : "page"
    });
  });

  return {
    bootstrap,
    createGroup,
    createPage,
    createFolder,
    createProject,
    closeOpenPage,
    deleteProjectAsAdmin,
    deleteUpload,
    deleteGroup,
    deletePage,
    deletePages,
    deleteMember,
    duplicatePages,
    enterProject,
    login,
    movePages,
    navigate,
    openAdminConsole,
    openLauncher,
    logout,
    renamePage,
    refreshActiveProject,
    saveGroup,
    saveGroupMembers,
    savePage,
    savePreferences,
    saveProject,
    selectPage,
    setSearchQuery,
    signup,
    subscribe,
    updateMember,
    updatePageDraft
  };
}

export const appStore = createAppStore();
