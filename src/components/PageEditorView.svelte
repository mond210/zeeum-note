<script>
  import { api } from "../lib/api.js";
  import { createEventDispatcher } from "svelte";
  import { fade, scale } from "svelte/transition";
  import { clickOutside } from "../lib/click-outside.js";
  import { formatRelativeDate } from "../lib/format.js";
  import { breadcrumbTrail } from "../lib/page-tree.js";
  import { markdownFromDoc } from "../lib/rich-doc.js";
  import { scrollbarActivity } from "../lib/scrollbar-activity.js";
  import EditorAiDialog from "./EditorAiDialog.svelte";
  import PageHistoryPanel from "./PageHistoryPanel.svelte";
  import RichTextEditor from "./RichTextEditor.svelte";

  export let loadingPage = false;
  export let currentUser = null;
  export let pageDraft = null;
  export let pages = [];
  export let project = null;
  export let savingPage = false;
  export let selectedPage = null;

  const dispatch = createEventDispatcher();
  let aiDialogOpen = false;
  let editorToolbarItems = [];
  let historyOpen = false;
  let iconPickerOpen = false;
  let settingsMenuOpen = false;
  let revisions = [];

  const iconOptions = [
    { value: "description", label: "Document" },
    { value: "article", label: "Article" },
    { value: "menu_book", label: "Guide" },
    { value: "checklist", label: "Checklist" },
    { value: "folder_open", label: "Folder" },
    { value: "lightbulb", label: "Idea" },
    { value: "code_blocks", label: "Code" },
    { value: "bolt", label: "Task" },
    { value: "calendar_month", label: "Calendar" },
    { value: "forum", label: "Discussion" },
    { value: "design_services", label: "Design" },
    { value: "inventory_2", label: "Asset" }
  ];

  $: breadcrumbs = selectedPage ? breadcrumbTrail(pages, selectedPage.id).slice(0, -1) : [];
  $: editorInstanceKey = `${selectedPage?.id || ""}:${pageDraft?.contentFormat || ""}`;

  function iconGlyph(value) {
    const map = {
      "book-open": "menu_book",
      "check-square": "checklist",
      "file-text": "description",
      layers: "inventory_2"
    };

    return map[value] || value || "description";
  }

  async function openHistory() {
    if (!project?.id || !selectedPage?.id) {
      return;
    }

    const result = await api.getPageHistory(project.id, selectedPage.id);
    revisions = result.revisions || [];
    historyOpen = true;
  }

  function closeOverlays() {
    iconPickerOpen = false;
    settingsMenuOpen = false;
  }

  function openIconPicker() {
    settingsMenuOpen = false;
    iconPickerOpen = true;
  }

  function selectIcon(icon) {
    dispatch("draft", { icon });
    iconPickerOpen = false;
  }

</script>

<svelte:window
  on:keydown={(event) => {
    if (event.key === "Escape") {
      closeOverlays();
    }
  }}
/>

<section class="flex min-h-0 flex-1 flex-col bg-white">
  <div class="flex min-h-0 flex-1 flex-col px-4 py-6 sm:px-5 lg:px-6">
    {#if selectedPage && pageDraft}
      <div class="flex min-h-0 flex-1 flex-col">
        <div class="flex items-start justify-between gap-4">
          <div class="min-w-0">
            {#if breadcrumbs.length > 0}
              <div class="flex flex-wrap items-center gap-2 text-sm text-slate-400">
                {#each breadcrumbs as item, index}
                  {#if index > 0}
                    <span>/</span>
                  {/if}
                  <span>{item.title}</span>
                {/each}
              </div>
            {/if}

            <p class={`${breadcrumbs.length > 0 ? "mt-2" : ""} text-sm leading-6 text-slate-500`}>
              {savingPage ? "Autosaving…" : `Last saved ${formatRelativeDate(selectedPage.updatedAt)}`}
            </p>
          </div>

          <div
            class="relative shrink-0"
            use:clickOutside={settingsMenuOpen}
            on:clickoutside={() => (settingsMenuOpen = false)}
          >
            <button
              type="button"
              class="grid h-9 w-9 place-items-center text-slate-600 transition hover:bg-slate-100 hover:text-sky-700"
              aria-label="More"
              title="More"
              on:click={() => {
                iconPickerOpen = false;
                settingsMenuOpen = !settingsMenuOpen;
              }}
            >
              <span class="material-symbols-rounded">more_vert</span>
            </button>

            {#if settingsMenuOpen}
              <div
                class="absolute right-0 top-[calc(100%+0.5rem)] z-30 min-w-[240px] rounded-2xl border border-slate-200 bg-white p-2 shadow-[0_18px_40px_rgba(15,23,42,0.12)]"
                transition:fade={{ duration: 120 }}
              >
                <button
                  type="button"
                  class="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-sm font-medium text-slate-700 transition hover:bg-slate-100"
                  on:click={openIconPicker}
                >
                  <span class="material-symbols-rounded">{iconGlyph(pageDraft.icon)}</span>
                  <span>Change icon</span>
                </button>
                <button
                  type="button"
                  class="mt-1 flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-sm font-medium text-slate-700 transition hover:bg-slate-100"
                  on:click={() => {
                    closeOverlays();
                    openHistory();
                  }}
                >
                  <span class="material-symbols-rounded">history</span>
                  <span>History</span>
                </button>
                <button
                  type="button"
                  class="mt-1 flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-sm font-medium text-slate-700 transition hover:bg-slate-100"
                  on:click={() => {
                    closeOverlays();
                    const blob = new Blob([markdownFromDoc(pageDraft?.content) || ""], { type: "text/markdown;charset=utf-8" });
                    const url = URL.createObjectURL(blob);
                    const anchor = document.createElement("a");
                    anchor.href = url;
                    anchor.download = `${pageDraft.title || "untitled"}.md`;
                    anchor.click();
                    URL.revokeObjectURL(url);
                  }}
                >
                  <span class="material-symbols-rounded">download</span>
                  <span>Export</span>
                </button>
                <button
                  type="button"
                  class="mt-1 flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-sm font-medium text-rose-700 transition hover:bg-rose-50"
                  on:click={() => {
                    closeOverlays();
                    dispatch("deletePage", selectedPage.id);
                  }}
                >
                  <span class="material-symbols-rounded">delete</span>
                  <span>Delete page</span>
                </button>
              </div>
            {/if}
          </div>
        </div>

        <div class="mt-4 flex shrink-0 items-center gap-4 border-y border-slate-200/80 py-2">
          <div class="scroll-thin flex min-w-0 flex-1 items-center gap-x-1 overflow-x-auto" use:scrollbarActivity>
            {#each editorToolbarItems as item, index}
              {#if index === 3 || index === 5 || index === 9}
                <div class="mx-2 hidden h-5 w-px bg-slate-200 sm:block"></div>
              {/if}
              <button
                type="button"
                class={`grid h-9 w-9 shrink-0 place-items-center text-sm transition ${
                  item.active
                    ? "text-sky-700"
                    : "text-slate-500 hover:bg-slate-100 hover:text-slate-950"
                }`}
                aria-label={item.label}
                title={item.label}
                on:click={item.action}
              >
                <span class={`material-symbols-rounded ${item.active ? "is-filled" : ""}`}>{item.icon}</span>
              </button>
            {/each}
          </div>

          <button
            type="button"
            class="grid h-9 w-9 shrink-0 place-items-center text-slate-600 transition hover:bg-slate-100 hover:text-sky-700"
            aria-label="AI tools"
            title="AI tools"
            on:click={() => {
              closeOverlays();
              aiDialogOpen = true;
            }}
          >
            <span class="material-symbols-rounded">auto_awesome</span>
          </button>
        </div>

        <div class="mt-8 flex shrink-0 items-center gap-4">
          <button
            type="button"
            class="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-slate-100 text-slate-600 transition hover:bg-slate-200 hover:text-slate-900"
            aria-label="Change page icon"
            title="Change page icon"
            on:click={() => {
              settingsMenuOpen = false;
              iconPickerOpen = true;
            }}
          >
            <span class="material-symbols-rounded">{iconGlyph(pageDraft.icon)}</span>
          </button>
          <input
            class="h-12 w-full bg-transparent text-slate-950 outline-none placeholder:text-slate-300"
            style="font-family: var(--font-serif); font-size: clamp(1.5rem, 2.4vw, 2rem); line-height: 1; font-weight: 600; letter-spacing: -0.05em;"
            value={pageDraft.title}
            placeholder="Untitled"
            on:input={(event) => dispatch("draft", { title: event.currentTarget.value })}
          />
        </div>

        <div class="scroll-thin mt-5 min-h-0 flex-1 overflow-y-auto" use:scrollbarActivity>
        {#if loadingPage}
            <div class="grid min-h-[26rem] place-items-center rounded-[1.4rem] border border-dashed border-slate-300 bg-slate-50 text-sm text-slate-500">
              Loading page content...
            </div>
          {:else}
            {#key editorInstanceKey}
              <RichTextEditor
                bind:toolbarItems={editorToolbarItems}
                content={pageDraft.content}
                contentFormat={pageDraft.contentFormat}
                currentUser={currentUser}
                documentId={selectedPage.id}
                projectId={project?.id}
                on:change={(event) => dispatch("draft", event.detail)}
              />
            {/key}
          {/if}
        </div>
      </div>
    {:else}
      <div class="grid min-h-0 flex-1 place-items-center border border-dashed border-slate-300 bg-slate-50 px-8 py-12 text-center">
        <div>
          <p class="text-3xl font-semibold tracking-[-0.05em] text-slate-950">Pick a page from the sidebar</p>
          <p class="mt-3 text-sm leading-6 text-slate-500">
            페이지를 선택하면 바로 편집을 시작할 수 있습니다.
          </p>
        </div>
      </div>
    {/if}
  </div>

  {#if historyOpen}
    <PageHistoryPanel revisions={revisions} on:close={() => (historyOpen = false)} />
  {/if}

  {#if aiDialogOpen && project?.id && selectedPage?.id}
    <EditorAiDialog
      pageId={selectedPage.id}
      pageTitle={pageDraft?.title || selectedPage.title}
      projectId={project.id}
      on:applied={() => dispatch("aiApplied")}
      on:close={() => (aiDialogOpen = false)}
    />
  {/if}

  {#if iconPickerOpen}
    <button
      type="button"
      class="fixed inset-0 z-40 bg-black/18"
      aria-label="Close icon picker"
      on:click={closeOverlays}
      transition:fade={{ duration: 140 }}
    ></button>
    <div class="fixed inset-0 z-50 grid place-items-center px-4">
      <div
        class="dialog-surface w-full max-w-[520px] rounded-[1.4rem] border border-slate-200/90 px-6 py-6 sm:px-7"
        transition:scale={{ duration: 170, start: 0.96 }}
      >
        <div class="flex items-start justify-between gap-4">
          <div>
            <p class="text-xs font-semibold uppercase tracking-[0.18em] text-sky-700">Page icon</p>
            <h3 class="mt-2 text-[1.7rem] font-semibold tracking-[-0.05em] text-slate-950">
              Choose one icon
            </h3>
          </div>
          <button
            type="button"
            class="rounded-full border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-500 transition hover:border-slate-300 hover:text-slate-800"
            on:click={closeOverlays}
          >
            Close
          </button>
        </div>

        <div class="mt-6 grid grid-cols-4 gap-2 sm:grid-cols-6">
          {#each iconOptions as option}
            <button
              type="button"
              class={`grid h-14 place-items-center rounded-2xl text-slate-600 transition ${
                iconGlyph(pageDraft.icon) === option.value
                  ? "bg-sky-100 text-sky-700"
                  : "hover:bg-slate-100"
              }`}
              aria-label={option.label}
              title={option.label}
              on:click={() => selectIcon(option.value)}
            >
              <span class="material-symbols-rounded text-[24px]">{option.value}</span>
            </button>
          {/each}
        </div>
      </div>
    </div>
  {/if}
</section>
