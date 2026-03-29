<script>
  import { createEventDispatcher } from "svelte";
  import { formatRelativeDate, summarize } from "../lib/format.js";

  export let active = false;
  export let note;

  const dispatch = createEventDispatcher();

  function handleSelect() {
    dispatch("select", note.id);
  }

  function handleDelete(event) {
    event.stopPropagation();
    dispatch("delete", note.id);
  }
</script>

<article
  class={`group rounded-[1.35rem] border px-4 py-4 transition duration-200 ${
    active
      ? "border-cyan-200 bg-cyan-50/80 shadow-[0_16px_30px_rgba(8,145,178,0.08)]"
      : "border-stone-200 bg-white/85 hover:border-stone-300 hover:bg-white"
  }`}
>
  <div class="flex items-start gap-3">
    <button
      type="button"
      class="min-w-0 flex-1 text-left"
      on:click={handleSelect}
      aria-current={active ? "true" : "false"}
    >
      <div class="flex items-start justify-between gap-3">
        <div class="min-w-0">
          <p class="truncate font-serif text-[1.08rem] font-semibold tracking-[-0.03em] text-slate-900">
            {note.title}
          </p>
          <p class="mt-1 text-xs font-medium uppercase tracking-[0.22em] text-slate-400">
            {formatRelativeDate(note.updatedAt)}
          </p>
        </div>
        <div
          class={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${
            active ? "bg-cyan-500" : "bg-stone-300 group-hover:bg-stone-400"
          }`}
        ></div>
      </div>
      <p class="mt-3 line-clamp-3 text-sm leading-6 text-slate-500">{summarize(note.content)}</p>
    </button>

    <button
      type="button"
      class="rounded-full border border-stone-200 px-3 py-1.5 text-xs font-semibold tracking-[0.18em] text-stone-500 uppercase transition hover:border-red-200 hover:text-red-600"
      on:click={handleDelete}
    >
      Del
    </button>
  </div>
</article>
