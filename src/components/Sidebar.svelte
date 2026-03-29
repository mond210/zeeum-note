<script>
  import { createEventDispatcher } from "svelte";
  import NoteListItem from "./NoteListItem.svelte";

  export let loading = false;
  export let notes = [];
  export let searchQuery = "";
  export let selectedId = null;
  export let totalCount = 0;

  const dispatch = createEventDispatcher();

  function handleSearch(event) {
    dispatch("search", event.currentTarget.value);
  }
</script>

<aside class="glass-panel fancy-scrollbar flex min-h-[24rem] flex-col overflow-hidden rounded-[1.75rem] border border-stone-200/80">
  <div class="border-b border-stone-200/80 px-5 py-5">
    <p class="text-[0.7rem] font-semibold uppercase tracking-[0.28em] text-cyan-700">Workspace</p>
    <div class="mt-3 flex items-center justify-between gap-3">
      <div>
        <h2 class="font-serif text-[1.65rem] font-semibold tracking-[-0.04em] text-slate-900">
          Text Manager
        </h2>
        <p class="mt-1 text-sm leading-6 text-slate-500">
          빠르게 문서를 찾고, 만들고, 정리하는 사이드바입니다.
        </p>
      </div>
      <button
        type="button"
        class="rounded-full bg-cyan-700 px-4 py-2 text-sm font-semibold text-white shadow-[0_14px_30px_rgba(14,116,144,0.2)] transition hover:-translate-y-0.5 hover:bg-cyan-800"
        on:click={() => dispatch("create")}
      >
        새 문서
      </button>
    </div>

    <label class="mt-5 block">
      <span class="mb-2 block text-xs font-semibold uppercase tracking-[0.22em] text-slate-400">
        Search notes
      </span>
      <input
        type="search"
        value={searchQuery}
        placeholder="제목 또는 내용을 검색"
        class="w-full rounded-2xl border border-stone-200 bg-white px-4 py-3 text-sm text-slate-700 outline-none transition placeholder:text-slate-400 focus:border-cyan-500 focus:ring-4 focus:ring-cyan-100"
        on:input={handleSearch}
      />
    </label>

    <div class="mt-4 flex items-center justify-between text-xs font-semibold uppercase tracking-[0.22em] text-slate-400">
      <span>{notes.length} visible</span>
      <span>{totalCount} total</span>
    </div>
  </div>

  <div class="fancy-scrollbar flex-1 overflow-y-auto px-4 py-4">
    {#if loading}
      <div class="rounded-[1.35rem] border border-dashed border-stone-300 bg-white/60 px-4 py-8 text-center text-sm text-slate-500">
        문서 목록을 불러오는 중입니다.
      </div>
    {:else if notes.length === 0}
      <div class="rounded-[1.35rem] border border-dashed border-stone-300 bg-white/60 px-4 py-8 text-center">
        <p class="font-serif text-xl font-semibold tracking-[-0.03em] text-slate-900">
          문서가 비어 있습니다.
        </p>
        <p class="mt-2 text-sm leading-6 text-slate-500">
          새 문서를 만든 뒤 이 공간에서 빠르게 이동할 수 있습니다.
        </p>
      </div>
    {:else}
      <div class="space-y-3">
        {#each notes as note (note.id)}
          <NoteListItem
            note={note}
            active={note.id === selectedId}
            on:delete={(event) => dispatch("delete", event.detail)}
            on:select={(event) => dispatch("select", event.detail)}
          />
        {/each}
      </div>
    {/if}
  </div>
</aside>
