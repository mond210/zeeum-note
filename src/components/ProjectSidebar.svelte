<script>
  import { createEventDispatcher } from "svelte";
  import { buildPageTree } from "../lib/page-tree.js";

  export let pages = [];
  export let searchQuery = "";
  export let selectedPageId = null;

  const dispatch = createEventDispatcher();

  $: query = searchQuery.trim().toLowerCase();
  $: tree = buildPageTree(pages).filter((page) => {
    if (!query) {
      return true;
    }

    return `${page.title} ${page.excerpt || ""}`.toLowerCase().includes(query);
  });
</script>

<aside class="flex min-h-0 flex-col border-r border-slate-200/80 pr-4">
  <div class="px-2 pb-3">
    <p class="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Pages</p>
  </div>

  <div class="border-b border-slate-200/80 px-2 py-4">
    <label class="block">
      <span class="mb-2 block text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Search</span>
      <input
        class="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700 outline-none transition focus:border-sky-500 focus:ring-4 focus:ring-sky-100"
        value={searchQuery}
        placeholder="Filter by title or excerpt"
        on:input={(event) => dispatch("search", event.currentTarget.value)}
      />
    </label>
  </div>

  <div class="scroll-thin flex-1 overflow-y-auto px-0 py-2">
    {#if tree.length > 0}
      <div class="space-y-0.5">
        {#each tree as page}
          <button
            type="button"
            class={`w-full border-l-2 px-3 py-2.5 text-left transition ${
              selectedPageId === page.id
                ? "border-sky-600 bg-slate-50 text-slate-950"
                : "border-transparent text-slate-700 hover:bg-slate-50"
            }`}
            style={`padding-left: ${page.depth * 18 + 12}px`}
            on:click={() => dispatch("selectPage", page.id)}
          >
            <div class="flex items-center justify-between gap-3">
              <span class="truncate text-sm font-medium">{page.title}</span>
              <span class="text-[0.7rem] font-semibold uppercase tracking-[0.18em] text-slate-400">
                {page.icon}
              </span>
            </div>
            <p class="mt-1 truncate text-xs text-slate-400">
              {page.excerpt || "No excerpt yet."}
            </p>
          </button>
        {/each}
      </div>
    {:else}
      <div class="border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-center">
        <p class="text-sm font-semibold text-slate-900">No pages match the current filter</p>
        <p class="mt-2 text-xs leading-5 text-slate-500">Clear the search or create a page from the center panel.</p>
      </div>
    {/if}
  </div>
</aside>
