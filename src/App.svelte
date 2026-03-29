<svelte:head>
  <title>zeeum-note</title>
</svelte:head>

<script>
  import { onMount } from "svelte";
  import EditorPane from "./components/EditorPane.svelte";
  import PreviewPane from "./components/PreviewPane.svelte";
  import Sidebar from "./components/Sidebar.svelte";
  import { notesApi } from "./lib/api.js";
  import { countWords, normalizeTitle, sortNotes } from "./lib/format.js";

  let currentPanel = "editor";
  let dirty = false;
  let draftContent = "";
  let draftTitle = "";
  let isLoading = true;
  let isRendering = false;
  let isSaving = false;
  let notes = [];
  let previewHtml = "";
  let previewTimer;
  let renderToken = 0;
  let saveTimer;
  let searchQuery = "";
  let selectedId = null;
  let status = {
    message: "Loading",
    tone: "pending"
  };

  const mobilePanels = [
    { key: "manager", label: "Manager" },
    { key: "editor", label: "Editor" },
    { key: "preview", label: "Preview" }
  ];

  $: selectedNote = notes.find((note) => note.id === selectedId) || null;
  $: filteredNotes = notes.filter((note) => {
    const query = searchQuery.trim().toLowerCase();

    if (!query) {
      return true;
    }

    return `${note.title} ${note.content}`.toLowerCase().includes(query);
  });
  $: wordCount = countWords(draftContent);
  $: charCount = draftContent.length;

  function setStatus(message, tone = "idle") {
    status = { message, tone };
  }

  function setPanel(panel) {
    currentPanel = panel;
  }

  function syncDraft(note) {
    draftTitle = note?.title || "";
    draftContent = note?.content || "";
    dirty = false;
    queueRender(true);
  }

  function patchLocalNote(title, content) {
    if (!selectedId) {
      return;
    }

    notes = notes.map((note) => {
      if (note.id !== selectedId) {
        return note;
      }

      return {
        ...note,
        title: normalizeTitle(title),
        content
      };
    });
  }

  async function loadNotes(preferredId) {
    isLoading = true;
    setStatus("문서를 불러오는 중...", "pending");

    try {
      const loadedNotes = sortNotes(await notesApi.list());
      notes = loadedNotes;
      selectedId =
        preferredId && loadedNotes.some((note) => note.id === preferredId)
          ? preferredId
          : loadedNotes[0]?.id || null;

      syncDraft(notes.find((note) => note.id === selectedId) || null);
      setStatus("Workspace ready", "success");
    } catch (error) {
      setStatus(error.message, "error");
    } finally {
      isLoading = false;
    }
  }

  function queueRender(immediate = false) {
    clearTimeout(previewTimer);

    const task = async () => {
      isRendering = true;
      const requestId = ++renderToken;

      try {
        const payload = await notesApi.render(draftContent);

        if (requestId !== renderToken) {
          return;
        }

        previewHtml = payload.html || "";
      } catch (error) {
        previewHtml = `<p>${error.message}</p>`;
      } finally {
        if (requestId === renderToken) {
          isRendering = false;
        }
      }
    };

    if (immediate) {
      task();
      return;
    }

    previewTimer = setTimeout(task, 120);
  }

  async function saveSelected({ forced = false } = {}) {
    clearTimeout(saveTimer);

    if (!selectedId) {
      return;
    }

    if (!dirty && !forced) {
      return;
    }

    const noteId = selectedId;
    const title = normalizeTitle(draftTitle);
    const content = draftContent;
    const snapshot = `${noteId}:${title}:${content}`;

    isSaving = true;
    setStatus("Saving changes...", "pending");

    try {
      const savedNote = await notesApi.update(noteId, { title, content });
      notes = sortNotes(notes.map((note) => (note.id === savedNote.id ? savedNote : note)));

      if (`${selectedId}:${normalizeTitle(draftTitle)}:${draftContent}` === snapshot) {
        dirty = false;
        draftTitle = savedNote.title;
        draftContent = savedNote.content;
      }

      selectedId = savedNote.id;
      setStatus("All changes saved", "success");
    } catch (error) {
      setStatus(error.message, "error");
    } finally {
      isSaving = false;
    }
  }

  function queueSave() {
    dirty = true;
    clearTimeout(saveTimer);
    setStatus("Autosave pending...", "pending");
    saveTimer = setTimeout(() => {
      saveSelected();
    }, 500);
  }

  async function handleSelect(noteId) {
    if (noteId === selectedId) {
      return;
    }

    if (dirty) {
      await saveSelected();
    }

    selectedId = noteId;
    syncDraft(notes.find((note) => note.id === noteId) || null);
    setStatus("Document loaded", "success");

    if (window.innerWidth < 1280) {
      setPanel("editor");
    }
  }

  async function handleCreate() {
    if (dirty) {
      await saveSelected();
    }

    setStatus("새 문서를 만드는 중...", "pending");

    try {
      const created = await notesApi.create({
        title: "새 문서",
        content: "# 새 문서\n\n여기서부터 내용을 작성하세요."
      });

      notes = sortNotes([created, ...notes]);
      selectedId = created.id;
      syncDraft(created);
      setPanel("editor");
      setStatus("새 문서를 만들었습니다.", "success");
    } catch (error) {
      setStatus(error.message, "error");
    }
  }

  async function handleDelete(noteId) {
    const note = notes.find((entry) => entry.id === noteId);

    if (!note) {
      return;
    }

    if (!window.confirm(`"${note.title}" 문서를 삭제할까요?`)) {
      return;
    }

    setStatus("문서를 삭제하는 중...", "pending");

    try {
      await notesApi.delete(noteId);
      notes = sortNotes(notes.filter((entry) => entry.id !== noteId));

      if (selectedId === noteId) {
        selectedId = notes[0]?.id || null;
        syncDraft(notes[0] || null);
      }

      setStatus("문서를 삭제했습니다.", "success");
    } catch (error) {
      setStatus(error.message, "error");
    }
  }

  function handleTitleInput(event) {
    draftTitle = event.detail;
    patchLocalNote(draftTitle, draftContent);
    queueSave();
  }

  function handleContentInput(event) {
    draftContent = event.detail;
    patchLocalNote(draftTitle, draftContent);
    queueRender();
    queueSave();
  }

  function handleGlobalSave(event) {
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s") {
      event.preventDefault();
      saveSelected({ forced: true });
    }
  }

  onMount(() => {
    currentPanel = window.innerWidth < 768 ? "manager" : "editor";
    loadNotes();
    window.addEventListener("keydown", handleGlobalSave);

    return () => {
      clearTimeout(previewTimer);
      clearTimeout(saveTimer);
      window.removeEventListener("keydown", handleGlobalSave);
    };
  });
</script>

<div class="min-h-screen px-3 py-3 text-slate-900 sm:px-4 sm:py-4 lg:px-6 lg:py-6">
  <div class="mx-auto flex min-h-[calc(100vh-1.5rem)] max-w-[1800px] flex-col gap-4">
    <header class="app-surface rounded-[1.9rem] border border-stone-200/80 px-5 py-5 sm:px-6">
      <div class="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
        <div class="max-w-3xl">
          <p class="text-[0.74rem] font-semibold uppercase tracking-[0.28em] text-cyan-700">
            Doc workspace
          </p>
          <h1 class="mt-3 font-serif text-[clamp(2.5rem,5vw,5rem)] font-semibold tracking-[-0.07em] text-slate-950">
            zeeum-note
          </h1>
          <p class="mt-3 max-w-2xl text-sm leading-7 text-slate-500 sm:text-base">
            `docmost` 문서 화면의 흐름을 참고해 사이드바, 메인 에디터, 라이브 프리뷰를 분리한
            Svelte 기반 마크다운 워크스페이스입니다.
          </p>
        </div>

        <div class="flex flex-col gap-3 xl:items-end">
          <div class="inline-flex flex-wrap items-center gap-2 rounded-full border border-stone-200 bg-white/75 p-2">
            {#each mobilePanels as panel}
              <button
                type="button"
                class={`rounded-full px-4 py-2 text-sm font-semibold transition ${
                  currentPanel === panel.key
                    ? "bg-cyan-700 text-white shadow-[0_12px_24px_rgba(14,116,144,0.22)]"
                    : "text-slate-500 hover:bg-stone-100"
                } xl:hidden`}
                on:click={() => setPanel(panel.key)}
              >
                {panel.label}
              </button>
            {/each}

            <span
              class={`rounded-full px-4 py-2 text-sm font-semibold ${
                status.tone === "error"
                  ? "bg-red-50 text-red-700"
                  : status.tone === "pending"
                    ? "bg-amber-50 text-amber-700"
                    : "bg-emerald-50 text-emerald-700"
              }`}
            >
              {status.message}
            </span>

            <button
              type="button"
              class="rounded-full bg-cyan-700 px-4 py-2 text-sm font-semibold text-white shadow-[0_14px_30px_rgba(14,116,144,0.22)] transition hover:-translate-y-0.5 hover:bg-cyan-800"
              on:click={handleCreate}
            >
              새 문서
            </button>
          </div>

          <div class="flex flex-wrap gap-2 text-xs font-semibold uppercase tracking-[0.22em] text-slate-400">
            <span class="rounded-full bg-white/80 px-3 py-2">{notes.length} notes</span>
            <span class="rounded-full bg-white/80 px-3 py-2">{wordCount} words</span>
            <span class="rounded-full bg-white/80 px-3 py-2">{isRendering ? "Rendering" : "Live preview"}</span>
          </div>
        </div>
      </div>
    </header>

    <div class="grid flex-1 grid-cols-1 gap-4 xl:grid-cols-[320px_minmax(0,1fr)_360px]">
      <div class={`${currentPanel !== "manager" ? "hidden xl:block" : ""}`}>
        <Sidebar
          notes={filteredNotes}
          loading={isLoading}
          searchQuery={searchQuery}
          selectedId={selectedId}
          totalCount={notes.length}
          on:create={handleCreate}
          on:delete={(event) => handleDelete(event.detail)}
          on:search={(event) => (searchQuery = event.detail)}
          on:select={(event) => handleSelect(event.detail)}
        />
      </div>

      <div class={`${currentPanel !== "editor" ? "hidden xl:block" : ""}`}>
        <EditorPane
          charCount={charCount}
          dirty={dirty}
          draftContent={draftContent}
          draftTitle={draftTitle}
          hasNote={Boolean(selectedNote)}
          saving={isSaving}
          selectedCreatedAt={selectedNote?.createdAt}
          selectedUpdatedAt={selectedNote?.updatedAt}
          wordCount={wordCount}
          on:contentInput={handleContentInput}
          on:create={handleCreate}
          on:save={() => saveSelected({ forced: true })}
          on:titleInput={handleTitleInput}
        />
      </div>

      <div class={`${currentPanel !== "preview" ? "hidden xl:block" : ""}`}>
        <PreviewPane
          charCount={charCount}
          createdAt={selectedNote?.createdAt}
          hasNote={Boolean(selectedNote)}
          html={previewHtml}
          text={draftContent}
          title={normalizeTitle(draftTitle)}
          updatedAt={selectedNote?.updatedAt}
          wordCount={wordCount}
        />
      </div>
    </div>
  </div>
</div>
