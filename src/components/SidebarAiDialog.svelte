<script>
  import { createEventDispatcher } from "svelte";
  import { fade, scale } from "svelte/transition";
  import { api } from "../lib/api.js";

  export let pages = [];
  export let projectId = null;
  export let selectedPageIds = [];

  const dispatch = createEventDispatcher();

  let instruction = "";
  let loading = false;
  let message = "";
  let messageTone = "idle";
  let preview = null;

  function setMessage(nextMessage, tone = "idle") {
    message = nextMessage;
    messageTone = tone;
  }

  function pageTitle(pageId) {
    return pages.find((page) => page.id === pageId)?.title || pageId;
  }

  async function createPreview() {
    if (!instruction.trim()) {
      setMessage("정리 지시를 입력하세요.", "error");
      return;
    }

    loading = true;
    setMessage("페이지 트리 정리안을 생성하는 중...", "pending");

    try {
      preview = await api.aiNavigationPreview({
        instruction,
        projectId,
        selectedPageIds
      });
      setMessage("트리 미리보기가 준비되었습니다.", "success");
    } catch (error) {
      setMessage(error.message, "error");
    } finally {
      loading = false;
    }
  }

  async function applyPreview() {
    if (!preview?.previewId) {
      return;
    }

    loading = true;
    setMessage("트리 변경안을 적용하는 중...", "pending");

    try {
      await api.aiNavigationApply(preview.previewId);
      dispatch("applied");
      dispatch("close");
    } catch (error) {
      setMessage(error.message, "error");
    } finally {
      loading = false;
    }
  }

  function operationLabel(operation) {
    if (operation.type === "create_folder") {
      return `Create folder "${operation.title}"`;
    }

    if (operation.type === "create_page") {
      return `Create page "${operation.title}"`;
    }

    if (operation.type === "rename_page") {
      return `Rename ${pageTitle(operation.pageId)} -> ${operation.title}`;
    }

    if (operation.type === "move_page") {
      return `Move ${pageTitle(operation.pageId)} into ${operation.parentId ? pageTitle(operation.parentId) : "root"}`;
    }

    if (operation.type === "delete_page") {
      return `Delete ${pageTitle(operation.pageId)}`;
    }

    return operation.type;
  }

  $: messageClass =
    messageTone === "error"
      ? "border-rose-200 bg-rose-50 text-rose-700"
      : messageTone === "success"
        ? "border-emerald-200 bg-emerald-50 text-emerald-700"
        : messageTone === "pending"
          ? "border-sky-200 bg-sky-50 text-sky-700"
          : "border-slate-200 bg-slate-50 text-slate-600";
</script>

<button
  type="button"
  class="fixed inset-0 z-40 bg-black/22"
  aria-label="Close AI tree dialog"
  on:click={() => dispatch("close")}
  transition:fade={{ duration: 140 }}
></button>

<div class="fixed inset-0 z-50 overflow-y-auto px-4 py-8">
  <div class="mx-auto w-full max-w-[880px] border border-slate-200 bg-white" transition:scale={{ duration: 170, start: 0.98 }}>
    <div class="border-b border-slate-200 px-6 py-5">
      <div class="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p class="text-[0.72rem] font-semibold uppercase tracking-[0.28em] text-sky-700">AI navigation</p>
          <h3 class="mt-2 text-[1.9rem] font-semibold tracking-[-0.05em] text-slate-950">Organize page tree</h3>
          <p class="mt-2 text-sm text-slate-500">현재 프로젝트 트리를 기준으로 폴더 생성, 이름 변경, 이동, 삭제 제안을 만듭니다.</p>
        </div>

        <button
          type="button"
          class="border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-600 transition hover:border-slate-300 hover:text-slate-900"
          on:click={() => dispatch("close")}
        >
          Close
        </button>
      </div>

      {#if message}
        <p class={`mt-5 border px-4 py-3 text-sm ${messageClass}`}>{message}</p>
      {/if}
    </div>

    <div class="grid gap-6 px-6 py-6 lg:grid-cols-[360px_minmax(0,1fr)]">
      <div class="space-y-4">
        <div>
          <p class="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Selection</p>
          <p class="mt-2 text-sm leading-6 text-slate-600">
            {#if selectedPageIds.length > 0}
              {selectedPageIds.map((pageId) => pageTitle(pageId)).join(" · ")}
            {:else}
              선택한 항목이 없으면 전체 트리를 기준으로 제안합니다.
            {/if}
          </p>
        </div>

        <label class="block">
          <span class="mb-2 block text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Instruction</span>
          <textarea
            class="min-h-[240px] w-full border border-slate-200 bg-slate-50 px-3 py-3 text-sm leading-6 text-slate-700 outline-none transition focus:border-sky-500"
            bind:value={instruction}
            placeholder="예: 회의록 폴더를 만들고, planning 관련 문서를 그 아래로 옮긴 뒤, 불필요한 빈 폴더는 삭제해줘"
          ></textarea>
        </label>

        <button
          type="button"
          class="border border-slate-950 bg-slate-950 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:opacity-60"
          disabled={loading}
          on:click={createPreview}
        >
          {loading ? "Generating..." : "Create preview"}
        </button>
      </div>

      <div class="min-w-0">
        {#if preview}
          <div class="space-y-4">
            <div class="border border-slate-200 bg-slate-50 px-4 py-4">
              <p class="text-sm font-semibold text-slate-950">Preview summary</p>
              <p class="mt-2 text-sm leading-6 text-slate-600">{preview.summary}</p>
            </div>

            <div class="border border-slate-200 bg-white px-4 py-4">
              <p class="text-sm font-semibold text-slate-950">Operations</p>

              {#if preview.operations?.length > 0}
                <ul class="mt-4 space-y-2 text-sm text-slate-700">
                  {#each preview.operations as operation}
                    <li class="border-b border-slate-100 pb-2">{operationLabel(operation)}</li>
                  {/each}
                </ul>
              {:else}
                <p class="mt-3 text-sm text-slate-500">적용할 작업이 없습니다.</p>
              {/if}
            </div>

            <button
              type="button"
              class="border border-sky-700 bg-sky-700 px-4 py-2 text-sm font-semibold text-white transition hover:bg-sky-800 disabled:opacity-60"
              disabled={loading || !preview.operations?.length}
              on:click={applyPreview}
            >
              Apply preview
            </button>
          </div>
        {:else}
          <div class="grid min-h-[360px] place-items-center border border-dashed border-slate-300 bg-slate-50 px-6 py-8 text-center">
            <div>
              <p class="text-lg font-semibold text-slate-950">No preview yet</p>
              <p class="mt-2 text-sm leading-6 text-slate-500">지시를 입력한 뒤 트리 미리보기를 생성하세요.</p>
            </div>
          </div>
        {/if}
      </div>
    </div>
  </div>
</div>
