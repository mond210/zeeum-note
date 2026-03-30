import { get, writable } from "svelte/store";
import { api } from "../api.js";
import { normalizeTitle } from "../format.js";
import { EMPTY_DOC } from "../rich-doc.js";

const emptyDraft = () => ({
  content: EMPTY_DOC,
  contentFormat: "tiptap-json",
  icon: "file-text",
  title: ""
});

const initialState = {
  activeProject: null,
  activeProjectId: null,
  authenticated: false,
  booting: true,
  currentUser: null,
  groups: [],
  loadingPage: false,
  loadingProject: false,
  memberDirectory: [],
  members: [],
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

function routePath(route, projectId = null, pageId = null) {
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

  function clearPageSelection() {
    clearAutosaveTimer();
    update((state) => ({
      ...state,
      loadingPage: false,
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

  async function refreshProjectContext() {
    const state = snapshot();

    if (!state.activeProjectId) {
      return null;
    }

    const payload = await api.getProject(state.activeProjectId);
    update((current) => ({
      ...current,
      activeProject: payload.project,
      groups: payload.groups,
      pages: payload.pages
    }));
    mergeProject(payload.project);

    if (state.selectedPageId && !payload.pages.some((page) => page.id === state.selectedPageId)) {
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

    if (!snapshot().authenticated) {
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
      const nextPageId =
        route === "page"
          ? pageId || payload.project.homePageId || payload.pages[0]?.id || null
          : null;
      const selectedSummary =
        route === "page" && nextPageId
          ? payload.pages.find((page) => page.id === nextPageId) || null
          : null;

      update((state) => ({
        ...state,
        activeProject: payload.project,
        activeProjectId: payload.project.id,
        groups: payload.groups,
        loadingProject: false,
        loadingPage: route === "page" && !!nextPageId,
        pageDraft:
          route === "page" && nextPageId
            ? {
                content: EMPTY_DOC,
                contentFormat: selectedSummary?.contentFormat || "tiptap-json",
                icon: selectedSummary?.icon || "file-text",
                title: selectedSummary?.title || ""
              }
            : state.pageDraft,
        pages: payload.pages,
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
    if (!snapshot().authenticated) {
      update((state) => ({ ...state, route: "landing" }));
      history[replace ? "replaceState" : "pushState"]({}, "", "/");
      return;
    }

    await maybeSaveDirtyPage("launcher");
    clearPageSelection();
    update((state) => ({
      ...state,
      activeProject: null,
      activeProjectId: null,
      groups: [],
      pages: [],
      route: "launcher",
      searchQuery: ""
    }));

    history[replace ? "replaceState" : "pushState"]({}, "", "/");
    setStatus("Project launcher ready", "success");
  }

  function preferredProjectId(payload) {
    return payload.recentProjects?.[0]?.id || payload.projects?.[0]?.id || null;
  }

  async function resolveInitialRoute(payload) {
    const location = parseLocation(window.location.pathname);
    const fallbackProjectId = preferredProjectId(payload);

    if (location.route === "launcher") {
      update((state) => ({ ...state, booting: false, route: "launcher" }));
      history.replaceState({}, "", "/");
      return;
    }

    if (location.route === "page" || location.route === "project-home" || location.route === "settings") {
      update((state) => ({ ...state, booting: false }));
      await enterProject(location.projectId, {
        pageId: location.pageId,
        replace: true,
        route: location.route
      });
      return;
    }

    update((state) => ({ ...state, booting: false }));

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
        : "project-home";

    await enterProject(fallbackProjectId, {
      replace: true,
      route: legacyRoute
    });
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

  async function createPage(parentId = null) {
    const state = snapshot();

    if (!state.activeProjectId) {
      return null;
    }

    await maybeSaveDirtyPage("page", state.activeProjectId);
    setStatus("Creating page...", "pending");

    try {
      const payload = await api.createPage(state.activeProjectId, {
        content: EMPTY_DOC,
        contentFormat: "tiptap-json",
        parentId,
        title: parentId ? "New child page" : "New page"
      });

      await refreshProjectContext();
      await enterProject(state.activeProjectId, {
        pageId: payload.page.id,
        replace: true,
        route: "page",
        markOpened: false
      });
      setStatus("Page created", "success");
      return payload.page;
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
    const nextPageId =
      payload?.project.homePageId || payload?.pages[0]?.id || null;

    if (nextPageId) {
      await enterProject(state.activeProjectId, {
        pageId: nextPageId,
        replace: true,
        route: "page",
        markOpened: false
      });
    } else {
      clearPageSelection();
      update((current) => ({
        ...current,
        route: "project-home"
      }));
      history.replaceState({}, "", routePath("project-home", state.activeProjectId));
    }

    setStatus("Page deleted", "success");
  }

  async function movePage(pageId, parentId) {
    const state = snapshot();

    if (!state.activeProjectId) {
      return;
    }

    await api.movePage(state.activeProjectId, pageId, { parentId, position: 999 });
    await refreshProjectContext();
    setStatus("Page moved", "success");
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
        route: "project-home",
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
      applyAuthenticatedLauncher(payload);
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
      applyAuthenticatedLauncher(nextPayload);
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
    await refreshLauncherData();
    setStatus("Member updated", "success");
    return result.member;
  }

  async function deleteMember(memberId) {
    await api.adminDeleteMember(memberId);
    const result = await api.adminListMembers();
    update((state) => ({
      ...state,
      memberDirectory: result.members
    }));
    await refreshLauncherData();
    setStatus("Member removed", "success");
  }

  window.addEventListener("popstate", async () => {
    const location = parseLocation(window.location.pathname);

    if (location.route === "launcher") {
      await openLauncher({ replace: true });
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
          route: "project-home"
        });
        return;
      }
    }

    await enterProject(fallbackProjectId, {
      replace: true,
      route:
        location.route === "legacy-groups" || location.route === "legacy-preferences"
          ? "settings"
          : "project-home"
    });
  });

  return {
    bootstrap,
    createGroup,
    createPage,
    createProject,
    deleteGroup,
    deletePage,
    deleteMember,
    enterProject,
    login,
    navigate,
    openLauncher,
    logout,
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
    updatePageDraft,
    movePage
  };
}

export const appStore = createAppStore();
