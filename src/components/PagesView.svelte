<script>
  import { createEventDispatcher } from "svelte";
  import { formatFullDate, formatRelativeDate } from "../lib/format.js";
  import { breadcrumbTrail, buildPageTree, childPages, isDescendant, pageExcerpt, pageText, pageWordCount } from "../lib/page-tree.js";

  export let loadingPage = false;
  export let pageDirty = false;
  export let pageDraft = null;
  export let pages = [];
  export let savingPage = false;
  export let searchQuery = "";
  export let selectedPage = null;
  export let showInspector = true;

  const dispatch = createEventDispatcher();

  const iconOptions = [
    { value: "file-text", label: "File" },
    { value: "book-open", label: "Guide" },
    { value: "check-square", label: "Checklist" },
    { value: "layers", label: "Spec" }
  ];

  function withDraft(page) {
    if (!selectedPage || page.id !== selectedPage.id) {
      return page;
    }

    return {
      ...page,
      content: pageDraft.content,
      contentFormat: pageDraft.contentFormat,
      icon: pageDraft.icon,
      title: pageDraft.title
    };
  }

  $: renderedPages = pages.map(withDraft);
  $: tree = buildPageTree(renderedPages).filter((page) => {
    const query = searchQuery.trim().toLowerCase();

    if (!query) {
      return true;
    }

    return `${page.title} ${pageExcerpt(page)}`.toLowerCase().includes(query);
  });
  $: breadcrumbs = selectedPage ? breadcrumbTrail(renderedPages, selectedPage.id) : [];
  $: selectedText = pageDraft ? pageText(pageDraft) : "";
  $: wordCount = pageDraft ? pageWordCount(pageDraft) : 0;
  $: childOptions = renderedPages.filter((page) => {
    if (!selectedPage) {
      return true;
    }

    return page.id !== selectedPage.id && !isDescendant(renderedPages, selectedPage.id, page.id);
  });
  $: siblingChildren = selectedPage ? childPages(renderedPages, selectedPage.id) : [];

  function moveParent(event) {
    if (!selectedPage) {
      return;
    }

    dispatch("movePage", {
      pageId: selectedPage.id,
      parentId: event.currentTarget.value || null
    });
  }

  const richEditorLoader = import("./RichTextEditor.svelte");
</script>

<section class={`grid gap-4 ${showInspector ? "2xl:grid-cols-[320px_minmax(0,1fr)_320px]" : "xl:grid-cols-[320px_minmax(0,1fr)]"}`}>
  <aside class="glass-panel rounded-[1.8rem] border border-stone-200/80 px-5 py-5">
    <div class="flex items-center justify-between gap-3">
      <div>
        <p class="text-[0.68rem] font-semibold uppercase tracking-[0.28em] text-cyan-700">Pages</p>
        <h2 class="mt-2 font-serif text-[2rem] font-semibold tracking-[-0.04em] text-slate-950">
          Content tree
        </h2>
      </div>
      <button
        type="button"
        class="rounded-full bg-cyan-700 px-4 py-2 text-sm font-semibold text-white transition hover:-translate-y-0.5 hover:bg-cyan-800"
        on:click={() => dispatch("createPage", null)}
      >
        Root page
      </button>
    </div>

    <label class="mt-5 block">
      <span class="mb-2 block text-xs font-semibold uppercase tracking-[0.22em] text-slate-400">Search pages</span>
      <input
        class="w-full rounded-2xl border border-stone-200 bg-white px-4 py-3 text-sm text-slate-700 outline-none focus:border-cyan-500 focus:ring-4 focus:ring-cyan-100"
        value={searchQuery}
        placeholder="Filter by title or excerpt"
        on:input={(event) => dispatch("search", event.currentTarget.value)}
      />
    </label>

    <div class="mt-5 space-y-2">
      {#each tree as page}
        <button
          type="button"
          class={`w-full rounded-[1.2rem] px-4 py-3 text-left transition ${
            selectedPage?.id === page.id
              ? "bg-cyan-700 text-white shadow-[0_14px_30px_rgba(14,116,144,0.18)]"
              : "bg-white/75 text-slate-700 hover:bg-white"
          }`}
          style={`padding-left: ${page.depth * 18 + 16}px`}
          on:click={() => dispatch("selectPage", page.id)}
        >
          <div class="flex items-center justify-between gap-3">
            <p class="truncate font-medium">{page.title}</p>
            <span class={`text-[0.68rem] font-semibold uppercase tracking-[0.18em] ${selectedPage?.id === page.id ? "text-white/70" : "text-slate-400"}`}>
              {page.icon}
            </span>
          </div>
          <p class={`mt-1 truncate text-xs ${selectedPage?.id === page.id ? "text-white/70" : "text-slate-400"}`}>
            {pageExcerpt(page)}
          </p>
        </button>
      {/each}
    </div>
  </aside>

  <div class="glass-panel rounded-[1.8rem] border border-stone-200/80 px-6 py-6">
    {#if selectedPage && pageDraft}
      <div class="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p class="text-[0.68rem] font-semibold uppercase tracking-[0.28em] text-cyan-700">Editor</p>
          <div class="mt-3 flex flex-wrap items-center gap-2 text-sm text-slate-400">
            <span>Workspace</span>
            {#each breadcrumbs as item}
              <span>/</span>
              <span>{item.title}</span>
            {/each}
          </div>
          <p class="mt-2 text-sm leading-6 text-slate-500">
            Last saved {formatRelativeDate(selectedPage.updatedAt)}
          </p>
        </div>

        <div class="flex flex-wrap items-center gap-2">
          <button
            type="button"
            class="rounded-full border border-stone-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:-translate-y-0.5 hover:border-cyan-400 hover:text-cyan-700"
            on:click={() => dispatch("createPage", selectedPage.id)}
          >
            New child
          </button>
          <button
            type="button"
            class="rounded-full bg-cyan-700 px-4 py-2 text-sm font-semibold text-white transition hover:-translate-y-0.5 hover:bg-cyan-800"
            on:click={() => dispatch("savePage")}
          >
            {savingPage ? "Saving..." : pageDirty ? "Save changes" : "Saved"}
          </button>
        </div>
      </div>

      <div class="mt-6 grid gap-4 md:grid-cols-[120px_minmax(0,1fr)]">
        <label class="block">
          <span class="mb-2 block text-xs font-semibold uppercase tracking-[0.22em] text-slate-400">Icon</span>
          <select
            class="w-full rounded-2xl border border-stone-200 bg-stone-50 px-4 py-3 text-sm text-slate-700 outline-none focus:border-cyan-500 focus:ring-4 focus:ring-cyan-100"
            value={pageDraft.icon}
            on:change={(event) => dispatch("draft", { icon: event.currentTarget.value })}
          >
            {#each iconOptions as option}
              <option value={option.value}>{option.label}</option>
            {/each}
          </select>
        </label>

        <label class="block">
          <span class="mb-2 block text-xs font-semibold uppercase tracking-[0.22em] text-slate-400">Title</span>
          <input
            class="w-full rounded-2xl border border-stone-200 bg-stone-50 px-5 py-4 font-serif text-[2rem] font-semibold tracking-[-0.05em] text-slate-950 outline-none focus:border-cyan-500 focus:ring-4 focus:ring-cyan-100"
            value={pageDraft.title}
            placeholder="Page title"
            on:input={(event) => dispatch("draft", { title: event.currentTarget.value })}
          />
        </label>
      </div>

      <div class="mt-5">
        {#if loadingPage}
          <div class="grid min-h-[24rem] place-items-center rounded-[1.5rem] border border-dashed border-stone-300 bg-white/70 text-sm text-slate-500">
            Loading page content...
          </div>
        {:else}
          {#await richEditorLoader then module}
            <svelte:component
              this={module.default}
              documentId={selectedPage.id}
              content={pageDraft.content}
              contentFormat={pageDraft.contentFormat}
              on:change={(event) => dispatch("draft", event.detail)}
            />
          {:catch error}
            <div class="grid min-h-[24rem] place-items-center rounded-[1.5rem] border border-dashed border-red-200 bg-red-50/70 px-6 py-8 text-center text-sm text-red-700">
              Failed to load the editor: {error.message}
            </div>
          {/await}
        {/if}
      </div>
    {:else}
      <div class="grid min-h-[30rem] place-items-center rounded-[1.6rem] border border-dashed border-stone-300 bg-white/70 px-8 py-12 text-center">
        <div>
          <p class="font-serif text-3xl font-semibold tracking-[-0.04em] text-slate-950">Pick a page</p>
          <p class="mt-3 text-sm leading-6 text-slate-500">
            Open a page from the left tree or create a new root page to start editing.
          </p>
        </div>
      </div>
    {/if}
  </div>

  {#if showInspector}
    <aside class="glass-panel rounded-[1.8rem] border border-stone-200/80 px-5 py-5">
      {#if selectedPage && pageDraft}
        <p class="text-[0.68rem] font-semibold uppercase tracking-[0.28em] text-cyan-700">Inspector</p>
        <h3 class="mt-2 font-serif text-[2rem] font-semibold tracking-[-0.04em] text-slate-950">
          {pageDraft.title}
        </h3>

        <div class="mt-5 grid gap-3">
          <div class="rounded-[1.35rem] border border-stone-200 bg-white/80 px-4 py-4">
            <p class="text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-slate-400">Created</p>
            <p class="mt-2 text-sm text-slate-700">{formatFullDate(selectedPage.createdAt)}</p>
          </div>
          <div class="rounded-[1.35rem] border border-stone-200 bg-white/80 px-4 py-4">
            <p class="text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-slate-400">Updated</p>
            <p class="mt-2 text-sm text-slate-700">{formatFullDate(selectedPage.updatedAt)}</p>
          </div>
          <div class="rounded-[1.35rem] border border-stone-200 bg-white/80 px-4 py-4">
            <p class="text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-slate-400">Words</p>
            <p class="mt-2 text-sm text-slate-700">{wordCount} words · {selectedText.length} chars</p>
          </div>
        </div>

        <label class="mt-5 block">
          <span class="mb-2 block text-xs font-semibold uppercase tracking-[0.22em] text-slate-400">Parent page</span>
          <select
            class="w-full rounded-2xl border border-stone-200 bg-stone-50 px-4 py-3 text-sm text-slate-700 outline-none focus:border-cyan-500 focus:ring-4 focus:ring-cyan-100"
            value={selectedPage.parentId || ""}
            on:change={moveParent}
          >
            <option value="">Root</option>
            {#each childOptions as page}
              <option value={page.id}>{page.title}</option>
            {/each}
          </select>
        </label>

        <div class="mt-5 rounded-[1.35rem] border border-stone-200 bg-white/80 px-4 py-4">
          <p class="text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-slate-400">Child pages</p>
          {#if siblingChildren.length > 0}
            <div class="mt-3 space-y-2">
              {#each siblingChildren as page}
                <button type="button" class="w-full rounded-xl border border-stone-200 px-3 py-2 text-left text-sm text-slate-700 transition hover:border-cyan-300 hover:bg-cyan-50/40" on:click={() => dispatch("selectPage", page.id)}>
                  {page.title}
                </button>
              {/each}
            </div>
          {:else}
            <p class="mt-3 text-sm text-slate-500">No child pages yet.</p>
          {/if}
        </div>

        <div class="mt-5 rounded-[1.35rem] border border-stone-200 bg-white/80 px-4 py-4">
          <p class="text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-slate-400">Excerpt</p>
          <p class="mt-3 text-sm leading-6 text-slate-500">{pageExcerpt(pageDraft)}</p>
        </div>

        <button
          type="button"
          class="mt-5 w-full rounded-full border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700 transition hover:-translate-y-0.5"
          on:click={() => dispatch("deletePage", selectedPage.id)}
        >
          Delete page
        </button>
      {:else}
        <div class="grid min-h-[24rem] place-items-center rounded-[1.6rem] border border-dashed border-stone-300 bg-white/70 px-8 py-12 text-center">
          <div>
            <p class="font-serif text-3xl font-semibold tracking-[-0.04em] text-slate-950">Inspector ready</p>
            <p class="mt-3 text-sm leading-6 text-slate-500">
              Select a page to inspect hierarchy, metadata, and structure.
            </p>
          </div>
        </div>
      {/if}
    </aside>
  {/if}
</section>
