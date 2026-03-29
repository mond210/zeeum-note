<script>
  import { createEventDispatcher } from "svelte";
  import { formatRelativeDate } from "../lib/format.js";

  export let groups = [];
  export let pages = [];
  export let preferences = null;
  export let recent = [];
  export let workspace = null;

  const dispatch = createEventDispatcher();

  let description = "";
  let homePageId = "";
  let name = "";
  let snapshotKey = "";

  $: nextKey = workspace ? `${workspace.name}:${workspace.description}:${workspace.homePageId || ""}` : "";
  $: if (workspace && nextKey !== snapshotKey) {
    snapshotKey = nextKey;
    description = workspace.description || "";
    homePageId = workspace.homePageId || "";
    name = workspace.name || "";
  }

  function handleSubmit() {
    dispatch("save", {
      description,
      homePageId: homePageId || null,
      name
    });
  }
</script>

<section class="space-y-4">
  <div class="glass-panel rounded-[1.8rem] border border-stone-200/80 px-6 py-6">
    <p class="text-[0.68rem] font-semibold uppercase tracking-[0.28em] text-cyan-700">Workspace</p>
    <div class="mt-4 grid gap-4 xl:grid-cols-[1.3fr_0.9fr]">
      <div class="space-y-4">
        <div>
          <h2 class="font-serif text-[2.6rem] font-semibold tracking-[-0.06em] text-slate-950">
            {workspace?.name}
          </h2>
          <p class="mt-3 max-w-2xl text-sm leading-7 text-slate-500">
            {workspace?.description}
          </p>
        </div>

        <div class="grid gap-3 sm:grid-cols-3">
          <div class="rounded-[1.4rem] border border-stone-200 bg-white/75 px-4 py-4">
            <p class="text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-slate-400">Pages</p>
            <p class="mt-3 font-serif text-4xl font-semibold tracking-[-0.05em] text-slate-950">
              {pages.length}
            </p>
          </div>
          <div class="rounded-[1.4rem] border border-stone-200 bg-white/75 px-4 py-4">
            <p class="text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-slate-400">Groups</p>
            <p class="mt-3 font-serif text-4xl font-semibold tracking-[-0.05em] text-slate-950">
              {groups.length}
            </p>
          </div>
          <div class="rounded-[1.4rem] border border-stone-200 bg-white/75 px-4 py-4">
            <p class="text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-slate-400">Landing</p>
            <p class="mt-3 text-lg font-semibold text-slate-700">{preferences?.landingView}</p>
          </div>
        </div>
      </div>

      <div class="rounded-[1.5rem] border border-stone-200 bg-white/85 px-5 py-5">
        <div class="flex items-center justify-between">
          <h3 class="font-serif text-2xl font-semibold tracking-[-0.04em] text-slate-950">
            Workspace details
          </h3>
          <button
            type="button"
            class="rounded-full bg-cyan-700 px-4 py-2 text-sm font-semibold text-white transition hover:-translate-y-0.5 hover:bg-cyan-800"
            on:click={handleSubmit}
          >
            Save
          </button>
        </div>

        <div class="mt-5 space-y-4">
          <label class="block">
            <span class="mb-2 block text-xs font-semibold uppercase tracking-[0.22em] text-slate-400">Workspace name</span>
            <input class="w-full rounded-2xl border border-stone-200 bg-stone-50 px-4 py-3 text-sm text-slate-700 outline-none focus:border-cyan-500 focus:ring-4 focus:ring-cyan-100" bind:value={name} />
          </label>

          <label class="block">
            <span class="mb-2 block text-xs font-semibold uppercase tracking-[0.22em] text-slate-400">Description</span>
            <textarea class="min-h-[7rem] w-full rounded-2xl border border-stone-200 bg-stone-50 px-4 py-3 text-sm leading-6 text-slate-700 outline-none focus:border-cyan-500 focus:ring-4 focus:ring-cyan-100" bind:value={description}></textarea>
          </label>

          <label class="block">
            <span class="mb-2 block text-xs font-semibold uppercase tracking-[0.22em] text-slate-400">Home page</span>
            <select class="w-full rounded-2xl border border-stone-200 bg-stone-50 px-4 py-3 text-sm text-slate-700 outline-none focus:border-cyan-500 focus:ring-4 focus:ring-cyan-100" bind:value={homePageId}>
              <option value="">No home page</option>
              {#each pages as page}
                <option value={page.id}>{page.title}</option>
              {/each}
            </select>
          </label>
        </div>
      </div>
    </div>
  </div>

  <div class="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
    <div class="glass-panel rounded-[1.8rem] border border-stone-200/80 px-6 py-6">
      <div class="flex items-center justify-between">
        <div>
          <p class="text-[0.68rem] font-semibold uppercase tracking-[0.28em] text-cyan-700">Recent pages</p>
          <h3 class="mt-2 font-serif text-[2rem] font-semibold tracking-[-0.04em] text-slate-950">
            Pick up where you left off
          </h3>
        </div>
        <button
          type="button"
          class="rounded-full border border-stone-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:-translate-y-0.5 hover:border-cyan-400 hover:text-cyan-700"
          on:click={() => dispatch("openPages")}
        >
          Open pages
        </button>
      </div>

      <div class="mt-5 space-y-3">
        {#each recent as page}
          <button
            type="button"
            class="w-full rounded-[1.35rem] border border-stone-200 bg-white/80 px-4 py-4 text-left transition hover:border-cyan-300 hover:bg-white"
            on:click={() => dispatch("openPage", page.id)}
          >
            <div class="flex items-center justify-between gap-3">
              <p class="font-serif text-xl font-semibold tracking-[-0.03em] text-slate-900">{page.title}</p>
              <span class="text-xs font-semibold uppercase tracking-[0.22em] text-slate-400">
                {formatRelativeDate(page.updatedAt)}
              </span>
            </div>
            <p class="mt-2 text-sm leading-6 text-slate-500">{page.excerpt || "No excerpt yet."}</p>
          </button>
        {/each}
      </div>
    </div>

    <div class="glass-panel rounded-[1.8rem] border border-stone-200/80 px-6 py-6">
      <p class="text-[0.68rem] font-semibold uppercase tracking-[0.28em] text-cyan-700">Quick routes</p>
      <div class="mt-4 space-y-3">
        <button type="button" class="w-full rounded-[1.35rem] border border-stone-200 bg-white/80 px-4 py-4 text-left transition hover:border-cyan-300" on:click={() => dispatch("openPages")}>
          <p class="font-semibold text-slate-900">Pages</p>
          <p class="mt-1 text-sm leading-6 text-slate-500">Jump into the page tree and start editing.</p>
        </button>
        <button type="button" class="w-full rounded-[1.35rem] border border-stone-200 bg-white/80 px-4 py-4 text-left transition hover:border-cyan-300" on:click={() => dispatch("openGroups")}>
          <p class="font-semibold text-slate-900">Groups</p>
          <p class="mt-1 text-sm leading-6 text-slate-500">Manage ownership and local team structures.</p>
        </button>
        <button type="button" class="w-full rounded-[1.35rem] border border-stone-200 bg-white/80 px-4 py-4 text-left transition hover:border-cyan-300" on:click={() => dispatch("openPreferences")}>
          <p class="font-semibold text-slate-900">Preferences</p>
          <p class="mt-1 text-sm leading-6 text-slate-500">Change density, landing view, and inspector behavior.</p>
        </button>
      </div>
    </div>
  </div>
</section>
