<script>
  import { createEventDispatcher } from "svelte";

  export let groupCount = 0;
  export let pageCount = 0;
  export let route = "workspace";
  export let workspace = null;

  const dispatch = createEventDispatcher();

  const routes = [
    { key: "workspace", label: "Workspace", caption: "Overview and home" },
    { key: "pages", label: "Pages", caption: "Structure and editor" },
    { key: "groups", label: "Groups", caption: "Teams and ownership" },
    { key: "preferences", label: "Preferences", caption: "Appearance and behavior" }
  ];
</script>

<aside class="glass-panel flex min-h-[calc(100vh-2rem)] flex-col rounded-[1.8rem] border border-stone-200/80 px-4 py-5">
  <div class="border-b border-stone-200/80 px-2 pb-4">
    <p class="text-[0.68rem] font-semibold uppercase tracking-[0.28em] text-cyan-700">Workspace</p>
    <h1 class="mt-3 font-serif text-[2rem] font-semibold tracking-[-0.05em] text-slate-950">
      {workspace?.name || "Zeeum"}
    </h1>
    <p class="mt-2 text-sm leading-6 text-slate-500">
      {workspace?.description || "Single-user doc space inspired by Docmost."}
    </p>
  </div>

  <nav class="mt-5 space-y-2">
    {#each routes as item}
      <button
        type="button"
        class={`w-full rounded-[1.35rem] px-4 py-3 text-left transition ${
          route === item.key
            ? "bg-cyan-700 text-white shadow-[0_14px_30px_rgba(14,116,144,0.18)]"
            : "bg-white/70 text-slate-700 hover:bg-white"
        }`}
        on:click={() => dispatch("navigate", item.key)}
      >
        <div class="flex items-center justify-between gap-3">
          <span class="font-semibold">{item.label}</span>
          {#if item.key === "pages"}
            <span class={`rounded-full px-2 py-1 text-[0.7rem] ${route === item.key ? "bg-white/15 text-white" : "bg-stone-100 text-slate-500"}`}>
              {pageCount}
            </span>
          {:else if item.key === "groups"}
            <span class={`rounded-full px-2 py-1 text-[0.7rem] ${route === item.key ? "bg-white/15 text-white" : "bg-stone-100 text-slate-500"}`}>
              {groupCount}
            </span>
          {/if}
        </div>
        <p class={`mt-1 text-xs leading-5 ${route === item.key ? "text-white/70" : "text-slate-400"}`}>
          {item.caption}
        </p>
      </button>
    {/each}
  </nav>

  <div class="mt-6 rounded-[1.45rem] border border-stone-200 bg-white/80 px-4 py-4">
    <p class="text-[0.68rem] font-semibold uppercase tracking-[0.28em] text-slate-400">Quick action</p>
    <button
      type="button"
      class="mt-3 w-full rounded-full bg-cyan-700 px-4 py-3 text-sm font-semibold text-white transition hover:-translate-y-0.5 hover:bg-cyan-800"
      on:click={() => dispatch("createPage")}
    >
      New page
    </button>
  </div>

  <div class="mt-auto space-y-2 rounded-[1.45rem] border border-stone-200 bg-white/70 px-4 py-4 text-sm text-slate-500">
    <p class="font-semibold text-slate-700">Status</p>
    <p>{pageCount} pages in the workspace</p>
    <p>{groupCount} groups mapped to local members</p>
  </div>
</aside>
