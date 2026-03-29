const state = {
  dirty: false,
  notes: [],
  renderToken: 0,
  saveTimer: null,
  previewTimer: null,
  screen: "editor",
  searchQuery: "",
  selectedId: null
};

const elements = {
  createButton: document.querySelector("#createButton"),
  editorInput: document.querySelector("#editorInput"),
  editorStats: document.querySelector("#editorStats"),
  emptyCreateButton: document.querySelector("#emptyCreateButton"),
  emptyEditor: document.querySelector("#emptyEditor"),
  noteCount: document.querySelector("#noteCount"),
  noteStamp: document.querySelector("#noteStamp"),
  noteTitle: document.querySelector("#noteTitle"),
  notesList: document.querySelector("#notesList"),
  previewPane: document.querySelector("#previewPane"),
  refreshButton: document.querySelector("#refreshButton"),
  saveButton: document.querySelector("#saveButton"),
  searchInput: document.querySelector("#searchInput"),
  statusPill: document.querySelector("#statusPill"),
  toggleButtons: [...document.querySelectorAll("[data-screen-button]")]
};

function setStatus(message, tone = "idle") {
  elements.statusPill.textContent = message;
  elements.statusPill.dataset.tone = tone;
}

function setScreen(screen) {
  state.screen = screen;
  document.body.dataset.screen = screen;

  for (const button of elements.toggleButtons) {
    button.setAttribute("aria-pressed", String(button.dataset.screenButton === screen));
  }
}

function formatDate(isoDate) {
  return new Intl.DateTimeFormat("ko-KR", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(isoDate));
}

function summarize(text) {
  return text.replace(/\s+/g, " ").trim().slice(0, 120) || "내용이 아직 없습니다.";
}

function countWords(text) {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function getSelectedNote() {
  return state.notes.find((note) => note.id === state.selectedId) || null;
}

async function api(path, options = {}) {
  const request = {
    ...options,
    headers: {
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...(options.headers || {})
    }
  };

  if (options.body) {
    request.body = JSON.stringify(options.body);
  }

  const response = await fetch(path, request);

  if (!response.ok) {
    try {
      const payload = await response.json();
      throw new Error(payload.error || "요청에 실패했습니다.");
    } catch (error) {
      throw error instanceof Error ? error : new Error("요청에 실패했습니다.");
    }
  }

  if (response.status === 204) {
    return null;
  }

  return response.json();
}

function sortNotes() {
  state.notes.sort((left, right) => {
    return new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime();
  });
}

function updateCounters() {
  elements.noteCount.textContent = `${state.notes.length} notes`;
}

function renderNotesList() {
  elements.notesList.textContent = "";
  updateCounters();

  const query = state.searchQuery.trim().toLowerCase();
  const notes = state.notes.filter((note) => {
    if (!query) {
      return true;
    }

    return `${note.title} ${note.content}`.toLowerCase().includes(query);
  });

  if (!notes.length) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.innerHTML = "<strong>조건에 맞는 노트가 없습니다.</strong><span>검색어를 바꾸거나 새 노트를 만들어 보세요.</span>";
    elements.notesList.append(empty);
    return;
  }

  for (const note of notes) {
    const card = document.createElement("article");
    card.className = `note-card${note.id === state.selectedId ? " is-active" : ""}`;

    const openButton = document.createElement("button");
    openButton.type = "button";
    openButton.className = "note-open";
    openButton.dataset.noteId = note.id;

    const titleRow = document.createElement("div");
    titleRow.className = "note-title-row";

    const title = document.createElement("span");
    title.className = "note-title-text";
    title.textContent = note.title;

    const time = document.createElement("span");
    time.className = "note-time";
    time.textContent = formatDate(note.updatedAt);

    const excerpt = document.createElement("p");
    excerpt.className = "note-excerpt";
    excerpt.textContent = summarize(note.content);

    titleRow.append(title, time);
    openButton.append(titleRow, excerpt);

    const deleteButton = document.createElement("button");
    deleteButton.type = "button";
    deleteButton.className = "note-delete";
    deleteButton.dataset.deleteId = note.id;
    deleteButton.textContent = "삭제";

    card.append(openButton, deleteButton);
    elements.notesList.append(card);
  }
}

function renderSelectedNote() {
  const note = getSelectedNote();
  const hasNote = Boolean(note);

  elements.noteTitle.disabled = !hasNote;
  elements.editorInput.disabled = !hasNote;
  elements.saveButton.disabled = !hasNote;
  elements.emptyEditor.hidden = hasNote;

  if (!hasNote) {
    elements.noteTitle.value = "";
    elements.editorInput.value = "";
    elements.noteStamp.textContent = "노트를 선택하세요.";
    elements.editorStats.textContent = "0 words · 0 chars";
    elements.previewPane.innerHTML = '<div class="empty-preview">노트를 선택하면 미리보기가 여기에 표시됩니다.</div>';
    return;
  }

  elements.noteTitle.value = note.title;
  elements.editorInput.value = note.content;
  elements.noteStamp.textContent = `마지막 저장 ${formatDate(note.updatedAt)}`;
  elements.editorStats.textContent = `${countWords(note.content)} words · ${note.content.length} chars`;
  schedulePreview(note.content, true);
}

function replaceSelectedNote(nextNote) {
  const index = state.notes.findIndex((note) => note.id === nextNote.id);

  if (index !== -1) {
    state.notes[index] = nextNote;
  }
}

async function loadNotes(preferredId) {
  setStatus("노트를 불러오는 중...", "pending");

  const notes = await api("/api/notes");
  state.notes = notes;
  sortNotes();

  const targetId = preferredId && notes.some((note) => note.id === preferredId) ? preferredId : notes[0]?.id || null;
  state.selectedId = targetId;

  renderNotesList();
  renderSelectedNote();
  setStatus("준비됨", "success");
}

async function saveSelectedNote({ forced = false } = {}) {
  const note = getSelectedNote();

  clearTimeout(state.saveTimer);

  if (!note) {
    return;
  }

  if (!state.dirty && forced) {
    setStatus("이미 최신 상태입니다.", "success");
    return;
  }

  if (!state.dirty) {
    return;
  }

  setStatus("저장 중...", "pending");

  try {
    const saved = await api(`/api/notes/${note.id}`, {
      method: "PUT",
      body: {
        title: note.title,
        content: note.content
      }
    });

    replaceSelectedNote(saved);
    sortNotes();
    state.selectedId = saved.id;
    state.dirty = false;

    renderNotesList();
    elements.noteStamp.textContent = `마지막 저장 ${formatDate(saved.updatedAt)}`;
    setStatus("저장 완료", "success");
  } catch (error) {
    setStatus(error.message, "error");
  }
}

function scheduleSave() {
  state.dirty = true;
  setStatus("변경사항 저장 대기 중...", "pending");
  clearTimeout(state.saveTimer);
  state.saveTimer = setTimeout(() => {
    saveSelectedNote();
  }, 450);
}

async function schedulePreview(markdownText, immediate = false) {
  clearTimeout(state.previewTimer);

  const run = async () => {
    const requestId = ++state.renderToken;

    try {
      const payload = await api("/api/render", {
        method: "POST",
        body: { markdown: markdownText }
      });

      if (requestId !== state.renderToken) {
        return;
      }

      elements.previewPane.innerHTML = payload.html || '<div class="empty-preview">내용이 비어 있습니다.</div>';
    } catch (error) {
      elements.previewPane.innerHTML = `<div class="empty-preview">${error.message}</div>`;
    }
  };

  if (immediate) {
    await run();
    return;
  }

  state.previewTimer = setTimeout(run, 120);
}

function syncInputsToState() {
  const note = getSelectedNote();

  if (!note) {
    return;
  }

  note.title = elements.noteTitle.value.trim() || "Untitled note";
  note.content = elements.editorInput.value;
  note.updatedAt = new Date().toISOString();

  elements.editorStats.textContent = `${countWords(note.content)} words · ${note.content.length} chars`;
  renderNotesList();
  schedulePreview(note.content);
  scheduleSave();
}

async function createNote() {
  if (state.dirty) {
    await saveSelectedNote();
  }

  setStatus("새 노트를 만드는 중...", "pending");

  try {
    const note = await api("/api/notes", {
      method: "POST",
      body: {
        title: "새 노트",
        content: ""
      }
    });

    state.notes.unshift(note);
    sortNotes();
    state.selectedId = note.id;

    renderNotesList();
    renderSelectedNote();
    setScreen("editor");
    setStatus("새 노트를 만들었습니다.", "success");
    elements.noteTitle.focus();
    elements.noteTitle.select();
  } catch (error) {
    setStatus(error.message, "error");
  }
}

async function deleteNote(noteId) {
  const note = state.notes.find((entry) => entry.id === noteId);

  if (!note) {
    return;
  }

  const accepted = window.confirm(`"${note.title}" 노트를 삭제할까요?`);

  if (!accepted) {
    return;
  }

  setStatus("노트를 삭제하는 중...", "pending");

  try {
    await api(`/api/notes/${noteId}`, { method: "DELETE" });
    state.notes = state.notes.filter((entry) => entry.id !== noteId);

    if (state.selectedId === noteId) {
      state.selectedId = state.notes[0]?.id || null;
      state.dirty = false;
    }

    renderNotesList();
    renderSelectedNote();
    setStatus("노트를 삭제했습니다.", "success");
  } catch (error) {
    setStatus(error.message, "error");
  }
}

async function selectNote(noteId) {
  if (state.selectedId === noteId) {
    return;
  }

  if (state.dirty) {
    await saveSelectedNote();
  }

  state.selectedId = noteId;
  renderNotesList();
  renderSelectedNote();

  if (window.innerWidth <= 760) {
    setScreen("editor");
  }
}

function bindEvents() {
  elements.createButton.addEventListener("click", createNote);
  elements.emptyCreateButton.addEventListener("click", createNote);
  elements.refreshButton.addEventListener("click", () => loadNotes(state.selectedId));
  elements.saveButton.addEventListener("click", () => saveSelectedNote({ forced: true }));

  elements.searchInput.addEventListener("input", (event) => {
    state.searchQuery = event.target.value;
    renderNotesList();
  });

  elements.noteTitle.addEventListener("input", syncInputsToState);
  elements.editorInput.addEventListener("input", syncInputsToState);

  elements.notesList.addEventListener("click", (event) => {
    const deleteButton = event.target.closest("[data-delete-id]");

    if (deleteButton) {
      deleteNote(deleteButton.dataset.deleteId);
      return;
    }

    const openButton = event.target.closest("[data-note-id]");

    if (openButton) {
      selectNote(openButton.dataset.noteId);
    }
  });

  for (const button of elements.toggleButtons) {
    button.addEventListener("click", () => {
      setScreen(button.dataset.screenButton);
    });
  }

  document.addEventListener("keydown", (event) => {
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s") {
      event.preventDefault();
      saveSelectedNote({ forced: true });
    }
  });

  window.addEventListener("beforeunload", (event) => {
    if (!state.dirty) {
      return;
    }

    event.preventDefault();
    event.returnValue = "";
  });
}

async function start() {
  setScreen(window.innerWidth <= 760 ? "manager" : "editor");
  bindEvents();

  try {
    await loadNotes();
  } catch (error) {
    setStatus(error.message, "error");
  }
}

start();
