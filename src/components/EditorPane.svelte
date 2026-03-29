<script>
  import { createEventDispatcher } from "svelte";
  import { formatFullDate } from "../lib/format.js";

  export let charCount = 0;
  export let dirty = false;
  export let draftContent = "";
  export let draftTitle = "";
  export let hasNote = false;
  export let saving = false;
  export let selectedCreatedAt = "";
  export let selectedUpdatedAt = "";
  export let wordCount = 0;

  const dispatch = createEventDispatcher();

  function handleTitleInput(event) {
    dispatch("titleInput", event.currentTarget.value);
  }

  function handleContentInput(event) {
    dispatch("contentInput", event.currentTarget.value);
  }
</script>

<section class="glass-panel flex min-h-[38rem] flex-col overflow-hidden rounded-[1.75rem] border border-stone-200/80">
  <div class="border-b border-stone-200/80 px-5 py-5">
    <div class="flex flex-wrap items-start justify-between gap-4">
      <div>
        <p class="text-[0.7rem] font-semibold uppercase tracking-[0.28em] text-cyan-700">Document</p>
        <h2 class="mt-2 font-serif text-[2rem] font-semibold tracking-[-0.05em] text-slate-950">
          Markdown Editor
        </h2>
        <p class="mt-2 max-w-2xl text-sm leading-6 text-slate-500">
          `docmost` 문서 화면처럼 넓은 편집 캔버스와 메타 정보를 분리했습니다.
        </p>
      </div>

      <div class="flex flex-wrap items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em]">
        <span class={`rounded-full px-3 py-2 ${saving ? "bg-amber-50 text-amber-700" : "bg-emerald-50 text-emerald-700"}`}>
          {saving ? "Saving" : dirty ? "Pending" : "Synced"}
        </span>
        <button
          type="button"
          class="rounded-full border border-stone-200 bg-white px-4 py-2 text-slate-700 transition hover:-translate-y-0.5 hover:border-cyan-500"
          on:click={() => dispatch("save")}
          disabled={!hasNote}
        >
          Save now
        </button>
      </div>
    </div>

    {#if hasNote}
      <div class="mt-5 grid gap-3 md:grid-cols-3">
        <div class="rounded-2xl border border-stone-200 bg-white/70 px-4 py-3">
          <p class="text-[0.7rem] font-semibold uppercase tracking-[0.22em] text-slate-400">Created</p>
          <p class="mt-2 text-sm font-medium text-slate-700">{formatFullDate(selectedCreatedAt)}</p>
        </div>
        <div class="rounded-2xl border border-stone-200 bg-white/70 px-4 py-3">
          <p class="text-[0.7rem] font-semibold uppercase tracking-[0.22em] text-slate-400">Updated</p>
          <p class="mt-2 text-sm font-medium text-slate-700">{formatFullDate(selectedUpdatedAt)}</p>
        </div>
        <div class="rounded-2xl border border-stone-200 bg-white/70 px-4 py-3">
          <p class="text-[0.7rem] font-semibold uppercase tracking-[0.22em] text-slate-400">Stats</p>
          <p class="mt-2 text-sm font-medium text-slate-700">{wordCount} words · {charCount} chars</p>
        </div>
      </div>
    {/if}
  </div>

  {#if hasNote}
    <div class="flex flex-1 flex-col px-5 py-5">
      <input
        type="text"
        value={draftTitle}
        maxlength="120"
        placeholder="문서 제목"
        class="w-full border-0 bg-transparent px-0 py-0 font-serif text-4xl font-semibold tracking-[-0.06em] text-slate-950 outline-none placeholder:text-slate-300"
        on:input={handleTitleInput}
      />

      <div class="mt-4 flex flex-wrap gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
        <span class="rounded-full bg-stone-100 px-3 py-1.5">Markdown</span>
        <span class="rounded-full bg-stone-100 px-3 py-1.5">Autosave</span>
        <span class="rounded-full bg-stone-100 px-3 py-1.5">Cmd/Ctrl + S</span>
      </div>

      <textarea
        value={draftContent}
        class="fancy-scrollbar mt-5 min-h-[28rem] flex-1 resize-none rounded-[1.5rem] border border-stone-200 bg-white px-5 py-5 font-mono text-[0.95rem] leading-7 text-slate-700 outline-none transition placeholder:text-slate-300 focus:border-cyan-500 focus:ring-4 focus:ring-cyan-100"
        placeholder="# 문서를 시작하세요"
        spellcheck="false"
        on:input={handleContentInput}
      ></textarea>
    </div>
  {:else}
    <div class="grid flex-1 place-items-center px-6 py-12">
      <div class="max-w-md rounded-[1.75rem] border border-dashed border-stone-300 bg-white/70 px-8 py-10 text-center">
        <p class="font-serif text-2xl font-semibold tracking-[-0.04em] text-slate-950">
          선택된 문서가 없습니다.
        </p>
        <p class="mt-3 text-sm leading-6 text-slate-500">
          왼쪽 매니저에서 문서를 선택하거나 새 문서를 만들어 편집을 시작하세요.
        </p>
        <button
          type="button"
          class="mt-6 rounded-full bg-cyan-700 px-5 py-3 text-sm font-semibold text-white transition hover:-translate-y-0.5 hover:bg-cyan-800"
          on:click={() => dispatch("create")}
        >
          새 문서 만들기
        </button>
      </div>
    </div>
  {/if}
</section>
