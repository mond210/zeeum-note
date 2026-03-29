async function request(path, options = {}) {
  const init = { ...options };

  if (options.body) {
    init.body = JSON.stringify(options.body);
    init.headers = {
      "Content-Type": "application/json",
      ...(options.headers || {})
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

export const notesApi = {
  create(payload) {
    return request("/api/notes", {
      method: "POST",
      body: payload
    });
  },
  delete(noteId) {
    return request(`/api/notes/${noteId}`, {
      method: "DELETE"
    });
  },
  health() {
    return request("/api/health");
  },
  list() {
    return request("/api/notes");
  },
  render(markdown) {
    return request("/api/render", {
      method: "POST",
      body: { markdown }
    });
  },
  update(noteId, payload) {
    return request(`/api/notes/${noteId}`, {
      method: "PUT",
      body: payload
    });
  }
};
