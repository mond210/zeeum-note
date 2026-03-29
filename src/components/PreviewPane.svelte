<script>
  import { countLines, formatFullDate } from "../lib/format.js";

  export let charCount = 0;
  export let createdAt = "";
  export let hasNote = false;
  export let html = "";
  export let title = "";
  export let updatedAt = "";
  export let wordCount = 0;
  export let text = "";
</script>

<aside class="glass-panel flex min-h-[24rem] flex-col overflow-hidden rounded-[1.75rem] border border-stone-200/80">
  <div class="border-b border-stone-200/80 px-5 py-5">
    <p class="text-[0.7rem] font-semibold uppercase tracking-[0.28em] text-cyan-700">Preview</p>
    <h2 class="mt-2 font-serif text-[1.75rem] font-semibold tracking-[-0.05em] text-slate-950">
      Live document
    </h2>
    <p class="mt-2 text-sm leading-6 text-slate-500">
      렌더링 결과와 문서 메타데이터를 함께 확인하는 패널입니다.
    </p>
  </div>

  {#if hasNote}
    <div class="grid grid-cols-2 gap-3 border-b border-stone-200/80 px-5 py-5">
      <div class="rounded-2xl border border-stone-200 bg-white/80 px-4 py-3">
        <p class="text-[0.65rem] font-semibold uppercase tracking-[0.2em] text-slate-400">Words</p>
        <p class="mt-2 font-serif text-2xl font-semibold text-slate-950">{wordCount}</p>
      </div>
      <div class="rounded-2xl border border-stone-200 bg-white/80 px-4 py-3">
        <p class="text-[0.65rem] font-semibold uppercase tracking-[0.2em] text-slate-400">Lines</p>
        <p class="mt-2 font-serif text-2xl font-semibold text-slate-950">{countLines(text)}</p>
      </div>
      <div class="rounded-2xl border border-stone-200 bg-white/80 px-4 py-3">
        <p class="text-[0.65rem] font-semibold uppercase tracking-[0.2em] text-slate-400">Chars</p>
        <p class="mt-2 font-serif text-2xl font-semibold text-slate-950">{charCount}</p>
      </div>
      <div class="rounded-2xl border border-stone-200 bg-white/80 px-4 py-3">
        <p class="text-[0.65rem] font-semibold uppercase tracking-[0.2em] text-slate-400">Title</p>
        <p class="mt-2 truncate text-sm font-semibold text-slate-700">{title}</p>
      </div>
    </div>

    <div class="border-b border-stone-200/80 px-5 py-4 text-sm leading-6 text-slate-500">
      <p><span class="font-semibold text-slate-700">Created:</span> {formatFullDate(createdAt)}</p>
      <p><span class="font-semibold text-slate-700">Updated:</span> {formatFullDate(updatedAt)}</p>
    </div>

    <div class="fancy-scrollbar flex-1 overflow-y-auto px-5 py-5">
      <div class="markdown-body rounded-[1.5rem] border border-stone-200 bg-white px-5 py-5">
        {@html html}
      </div>
    </div>
  {:else}
    <div class="grid flex-1 place-items-center px-6 py-12">
      <div class="max-w-sm rounded-[1.75rem] border border-dashed border-stone-300 bg-white/70 px-8 py-10 text-center">
        <p class="font-serif text-2xl font-semibold tracking-[-0.04em] text-slate-950">
          프리뷰가 비어 있습니다.
        </p>
        <p class="mt-3 text-sm leading-6 text-slate-500">
          문서를 선택하면 이 패널에 렌더링 결과와 문서 통계가 표시됩니다.
        </p>
      </div>
    </div>
  {/if}
</aside>
