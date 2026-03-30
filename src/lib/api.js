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

export const api = {
  adminDeleteMember(memberId) {
    return request(`/api/admin/members/${memberId}`, {
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
  authSession() {
    return request("/api/auth/session");
  },
  authSignup(payload) {
    return request("/api/auth/signup", {
      method: "POST",
      withoutAuth: true,
      body: payload
    });
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
  getHealth() {
    return request("/api/health");
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
  },
  movePage(projectId, pageId, payload) {
    return request(`/api/projects/${projectId}/pages/${pageId}/move`, {
      method: "POST",
      body: payload
    });
  }
};
