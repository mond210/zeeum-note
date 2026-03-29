<script>
  import { createEventDispatcher } from "svelte";
  import { formatFullDate, formatRelativeDate } from "../lib/format.js";

  export let revisions = [];

  const dispatch = createEventDispatcher();

  const pastel = [
    "bg-amber-100",
    "bg-emerald-100",
    "bg-sky-100",
    "bg-pink-100",
    "bg-violet-100"
  ];

  let selectedRevisionId = "";

  $: if (!selectedRevisionId && revisions.length > 0) {
    selectedRevisionId = revisions[0].id;
  }

  $: selectedIndex = revisions.findIndex((revision) => revision.id === selectedRevisionId);
  $: selectedRevision = revisions[selectedIndex] || null;
  $: previousRevision = selectedIndex >= 0 ? revisions[selectedIndex + 1] || null : null;
  $: highlightedSegments = diffSegments(previousRevision?.text || "", selectedRevision?.text || "");

  function colorFor(name = "") {
    let sum = 0;

    for (const char of name) {
      sum += char.charCodeAt(0);
    }

    return pastel[sum % pastel.length];
  }

  function diffSegments(previousText, nextText) {
    if (!nextText) {
      return [];
    }

    if (!previousText) {
      return [{ added: true, value: nextText }];
    }

    const previousWords = previousText.split(/(\s+)/);
    const nextWords = nextText.split(/(\s+)/);
    const segments = [];
    let cursor = 0;

    for (const token of nextWords) {
      const matched = previousWords[cursor] === token;

      segments.push({
        added: !matched && token.trim() !== "",
        value: token
      });

      if (matched) {
        cursor += 1;
      }
    }

    return segments;
  }
</script>

<div class="fixed inset-0 z-50 bg-black/30 backdrop-blur-[2px]">
  <div class="mx-auto grid h-full max-w-[1320px] grid-cols-[320px_minmax(0,1fr)] gap-0 bg-white shadow-[0_24px_80px_rgba(15,23,42,0.16)]">
    <aside class="border-r border-slate-200/80 px-5 py-6">
      <div class="flex items-start justify-between gap-3">
        <div>
          <p class="text-[0.72rem] font-semibold uppercase tracking-[0.18em] text-sky-700">History</p>
          <h2 class="mt-2 text-[1.8rem] font-semibold tracking-[-0.05em] text-slate-950">
            Revision activity
          </h2>
        </div>
        <button
          type="button"
          class="rounded-full border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-600 transition hover:border-slate-300 hover:text-slate-950"
          on:click={() => dispatch("close")}
        >
          Close
        </button>
      </div>

      <div class="mt-6 space-y-2 overflow-y-auto">
        {#each revisions as revision}
          <button
            type="button"
            class={`w-full border-l-2 px-3 py-3 text-left transition ${
              revision.id === selectedRevisionId
                ? "border-sky-600 bg-slate-50"
                : "border-transparent hover:bg-slate-50"
            }`}
            on:click={() => (selectedRevisionId = revision.id)}
          >
            <div class="flex items-center justify-between gap-3">
              <p class="text-sm font-semibold text-slate-950">{revision.authorName}</p>
              <span class="text-xs text-slate-400">{formatRelativeDate(revision.createdAt)}</span>
            </div>
            <p class="mt-2 text-xs uppercase tracking-[0.16em] text-slate-400">
              +{revision.diff.addedChars} / -{revision.diff.removedChars}
            </p>
          </button>
        {/each}
      </div>
    </aside>

    <section class="overflow-y-auto px-8 py-6">
      {#if selectedRevision}
        <div class="border-b border-slate-200 pb-5">
          <p class="text-sm font-semibold text-slate-950">{selectedRevision.authorName}</p>
          <p class="mt-1 text-sm text-slate-500">{formatFullDate(selectedRevision.createdAt)}</p>
          <p class="mt-3 text-xs uppercase tracking-[0.16em] text-slate-400">
            Added {selectedRevision.diff.addedChars} chars · Removed {selectedRevision.diff.removedChars} chars
          </p>
        </div>

        <div class="mt-8 whitespace-pre-wrap text-[15px] leading-8 text-slate-700">
          {#each highlightedSegments as segment}
            {#if segment.added}
              <mark class={`rounded px-1 ${colorFor(selectedRevision.authorName)}`}>{segment.value}</mark>
            {:else}
              <span>{segment.value}</span>
            {/if}
          {/each}
        </div>
      {:else}
        <div class="grid min-h-[20rem] place-items-center text-center">
          <div>
            <p class="text-lg font-semibold text-slate-950">No revisions yet</p>
            <p class="mt-2 text-sm text-slate-500">Changes will appear here after autosave creates revision entries.</p>
          </div>
        </div>
      {/if}
    </section>
  </div>
</div>
