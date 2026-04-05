function authToken() {
  if (typeof window === "undefined") {
    return "";
  }

  return window.localStorage.getItem("zeeum_auth_token") || "";
}

async function request(path, options = {}) {
  const token = options.tokenOverride ?? (options.withoutAuth ? "" : authToken());
  const init = {
    credentials: "include",
    ...options
  };

  init.headers = {
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(options.headers || {})
  };

  if (options.body !== undefined) {
    init.body = JSON.stringify(options.body);
    init.headers = {
      "Content-Type": "application/json",
      ...init.headers
    };
  }

  const response = await fetch(path, init);

  if (!response.ok) {
    let message = "요청에 실패했습니다.";

    try {
      const payload = await response.json();
      message = payload.error || message;
    } catch {
      message = response.statusText || message;
    }

    throw new Error(message);
  }

  if (response.status === 204) {
    return null;
  }

  return response.json();
}

async function upload(path, formData) {
  const token = authToken();
  const response = await fetch(path, {
    body: formData,
    credentials: "include",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    method: "POST"
  });

  if (!response.ok) {
    let message = "요청에 실패했습니다.";

    try {
      const payload = await response.json();
      message = payload.error || message;
    } catch {
      message = response.statusText || message;
    }

    throw new Error(message);
  }

  return response.json();
}

export const api = {
  adminAiSettings() {
    return request("/api/admin/ai/settings");
  },
  adminAiProviderOauthDisconnect(providerId) {
    return request(`/api/admin/ai/providers/${providerId}/oauth/disconnect`, {
      method: "POST"
    });
  },
  adminAiProviderOauthStart(providerId) {
    return request(`/api/admin/ai/providers/${providerId}/oauth/start`, {
      method: "POST"
    });
  },
  adminAiProviderOauthStatus(providerId) {
    return request(`/api/admin/ai/providers/${providerId}/oauth/status`);
  },
  adminListAiModels(providerId, payload) {
    return request(`/api/admin/ai/providers/${providerId}/models`, {
      body: payload,
      method: "POST"
    });
  },
  adminSaveAiSettings(payload) {
    return request("/api/admin/ai/settings", {
      body: payload,
      method: "PUT"
    });
  },
  adminTestAiProvider(providerId, payload) {
    return request(`/api/admin/ai/providers/${providerId}/test`, {
      body: payload,
      method: "POST"
    });
  },
  adminConsole() {
    return request("/api/admin/console");
  },
  adminDeleteMember(memberId) {
    return request(`/api/admin/members/${memberId}`, {
      method: "DELETE"
    });
  },
  adminDeleteProject(projectId) {
    return request(`/api/admin/projects/${projectId}`, {
      method: "DELETE"
    });
  },
  adminDeleteUpload(filename) {
    return request(`/api/admin/files/${encodeURIComponent(filename)}`, {
      method: "DELETE"
    });
  },
  adminListMembers() {
    return request("/api/admin/members");
  },
  adminUpdateMember(memberId, payload) {
    return request(`/api/admin/members/${memberId}`, {
      method: "PUT",
      body: payload
    });
  },
  authLogin(payload) {
    return request("/api/auth/login", {
      method: "POST",
      withoutAuth: true,
      body: payload
    });
  },
  authLogout() {
    return request("/api/auth/logout", {
      method: "POST"
    });
  },
  authSignup(payload) {
    return request("/api/auth/signup", {
      method: "POST",
      withoutAuth: true,
      body: payload
    });
  },
  aiEditorApply(previewId) {
    return request("/api/ai/editor/apply", {
      body: { previewId },
      method: "POST"
    });
  },
  aiEditorPreview(payload) {
    return request("/api/ai/editor/preview", {
      body: payload,
      method: "POST"
    });
  },
  aiEditorSummary(payload) {
    return request("/api/ai/editor/summary", {
      body: payload,
      method: "POST"
    });
  },
  aiInsertTranscript(payload) {
    return request("/api/ai/editor/insert-transcript", {
      body: payload,
      method: "POST"
    });
  },
  aiNavigationApply(previewId) {
    return request("/api/ai/navigation/apply", {
      body: { previewId },
      method: "POST"
    });
  },
  aiNavigationPreview(payload) {
    return request("/api/ai/navigation/preview", {
      body: payload,
      method: "POST"
    });
  },
  aiTranscribeAudio(file) {
    const formData = new FormData();
    formData.append("file", file);
    return upload("/api/ai/stt/transcribe", formData);
  },
  bootstrap(tokenOverride) {
    return request("/api/bootstrap", {
      tokenOverride
    });
  },
  createGroup(projectId, payload) {
    return request(`/api/projects/${projectId}/groups`, {
      method: "POST",
      body: payload
    });
  },
  createPage(projectId, payload) {
    return request(`/api/projects/${projectId}/pages`, {
      method: "POST",
      body: payload
    });
  },
  createProject(payload) {
    return request("/api/projects", {
      method: "POST",
      body: payload
    });
  },
  deleteGroup(projectId, groupId) {
    return request(`/api/projects/${projectId}/groups/${groupId}`, {
      method: "DELETE"
    });
  },
  deletePage(projectId, pageId) {
    return request(`/api/projects/${projectId}/pages/${pageId}`, {
      method: "DELETE"
    });
  },
  getPage(projectId, pageId) {
    return request(`/api/projects/${projectId}/pages/${pageId}`);
  },
  getPageHistory(projectId, pageId) {
    return request(`/api/projects/${projectId}/pages/${pageId}/history`);
  },
  getProject(projectId) {
    return request(`/api/projects/${projectId}`);
  },
  locatePage(pageId) {
    return request(`/api/page-locator/${pageId}`);
  },
  movePage(projectId, pageId, payload) {
    return request(`/api/projects/${projectId}/pages/${pageId}/move`, {
      method: "POST",
      body: payload
    });
  },
  openProject(projectId) {
    return request(`/api/projects/${projectId}/open`, {
      method: "POST"
    });
  },
  updateGroup(projectId, groupId, payload) {
    return request(`/api/projects/${projectId}/groups/${groupId}`, {
      method: "PUT",
      body: payload
    });
  },
  updateGroupMembers(projectId, groupId, memberIds) {
    return request(`/api/projects/${projectId}/groups/${groupId}/members`, {
      method: "PUT",
      body: { memberIds }
    });
  },
  updatePage(projectId, pageId, payload) {
    return request(`/api/projects/${projectId}/pages/${pageId}`, {
      method: "PUT",
      body: payload
    });
  },
  updatePreferences(payload) {
    return request("/api/preferences", {
      method: "PUT",
      body: payload
    });
  },
  updateProject(projectId, payload) {
    return request(`/api/projects/${projectId}`, {
      method: "PUT",
      body: payload
    });
  }
};
