<script>
  import { createEventDispatcher } from "svelte";
  import { formatRelativeDate } from "../lib/format.js";
  import { recentPages } from "../lib/page-tree.js";

  export let groups = [];
  export let pages = [];
  export let project = null;

  const dispatch = createEventDispatcher();

  $: projectRecentPages = recentPages(pages, 6);
  $: homePage = pages.find((page) => page.id === project?.homePageId) || null;

  const actionButtons = [
    {
      action: "create",
      icon: "add_notes",
      label: "New page"
    },
    {
      action: "settings",
      icon: "settings",
      label: "Settings"
    }
  ];
</script>

<section>
  <div class="px-1 py-2 sm:px-0">
    <div class="flex flex-wrap items-start justify-between gap-5">
      <div>
        <p class="text-[0.72rem] font-semibold uppercase tracking-[0.28em] text-sky-700">Overview</p>
        <h1 class="mt-4 text-[clamp(2rem,4vw,3.2rem)] font-semibold tracking-[-0.07em] text-slate-950">
          {project?.name}
        </h1>
        <p class="mt-4 max-w-2xl text-sm leading-7 text-slate-500">{project?.description}</p>
      </div>

      <div class="flex flex-wrap gap-2">
        {#each actionButtons as button}
          <button
            type="button"
            class="grid h-11 w-11 place-items-center rounded-full border border-slate-200 bg-white text-slate-600 transition hover:border-sky-300 hover:text-sky-700"
            aria-label={button.label}
            title={button.label}
            on:click={() =>
              button.action === "create" ? dispatch("createPage") : dispatch("openSettings")}
          >
            <span class="material-symbols-rounded">{button.icon}</span>
          </button>
        {/each}
      </div>
    </div>
  </div>

  <div class="section-rule mt-8">
    <div class="px-1 py-8 sm:px-0">
      <div class="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-slate-500">
        <span>{pages.length} pages</span>
        <span>{groups.length} groups</span>
        <span>Last opened {formatRelativeDate(project?.lastOpenedAt)}</span>
        {#if homePage}
          <span>{homePage.title}</span>
        {/if}
      </div>

      <div class="mt-8">
        <p class="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Recently updated</p>
        {#if projectRecentPages.length > 0}
          <div class="mt-4 divide-y divide-slate-200">
            {#each projectRecentPages as page}
              <button
                type="button"
                class="flex w-full items-start justify-between gap-4 py-4 text-left transition hover:bg-slate-50/70"
                on:click={() => dispatch("openPage", page.id)}
              >
                <div class="min-w-0">
                  <p class="truncate text-base font-semibold text-slate-950">{page.title}</p>
                  <p class="mt-1 line-clamp-1 text-sm leading-6 text-slate-500">
                    {page.excerpt || "No excerpt yet."}
                  </p>
                </div>
                <span class="shrink-0 pt-1 text-xs font-medium text-slate-400">
                  {formatRelativeDate(page.updatedAt)}
                </span>
              </button>
            {/each}
          </div>
        {:else}
          <p class="mt-4 text-sm text-slate-500">No updated pages yet.</p>
        {/if}
      </div>
    </div>
  </div>
</section>
