<script>
  import { createEventDispatcher } from "svelte";
  import { buildPageTree, isDescendant } from "../lib/page-tree.js";

  export let pageIds = [];
  export let pages = [];

  const dispatch = createEventDispatcher();

  let targetParentId = "";

  function rowIsFolder(page) {
    return page?.icon === "folder_open";
  }

  function canParentAcceptChild(parent, child) {
    if (!parent) {
      return true;
    }

    if (rowIsFolder(parent)) {
      return true;
    }

    return !rowIsFolder(child);
  }

  function resolvePages(ids) {
    return ids
      .map((pageId) => pages.find((entry) => entry.id === pageId))
      .filter(Boolean);
  }

  function canDropIntoParent(parentId, ids) {
    if (!Array.isArray(ids) || ids.length === 0) {
      return false;
    }

    const targetParent = parentId ? pages.find((page) => page.id === parentId) || null : null;
    const movingPages = resolvePages(ids);

    if (movingPages.length !== ids.length) {
      return false;
    }

    return movingPages.every((page) => {
      if (targetParent && (page.id === targetParent.id || isDescendant(pages, page.id, targetParent.id))) {
        return false;
      }

      return canParentAcceptChild(targetParent, page);
    });
  }

  function canMoveInto(page) {
    return canDropIntoParent(page.id, pageIds);
  }

  function closeDialog() {
    dispatch("close");
  }

  function submitMove() {
    dispatch("submit", {
      pageIds,
      parentId: targetParentId || null
    });
  }

  $: selectedCount = pageIds.length;
  $: availableMoveTargets = buildPageTree(pages)
    .filter((page) => canMoveInto(page))
    .map((page) => ({
      ...page,
      isFolder: rowIsFolder(page)
    }));
  $: targetParentId = availableMoveTargets.some((page) => page.id === targetParentId) ? targetParentId : "";
</script>

<svelte:window
  on:keydown={(event) => {
    if (event.key === "Escape") {
      closeDialog();
    }
  }}
/>

<button
  type="button"
  class="fixed inset-0 z-[120] bg-slate-950/18 backdrop-blur-[1px]"
  aria-label="Close move dialog"
  on:click={closeDialog}
></button>
<div class="fixed inset-0 z-[130] grid place-items-center px-4">
  <div
    class="dialog-surface w-full max-w-[420px] rounded-[1.5rem] border border-slate-200 px-6 py-6"
    data-testid="move-pages-dialog"
  >
    <p class="text-xs font-semibold uppercase tracking-[0.18em] text-sky-700">Move</p>
    <h3 class="mt-2 text-[1.7rem] font-semibold tracking-[-0.05em] text-slate-950">선택한 항목 이동</h3>
    <p class="mt-2 text-sm leading-6 text-slate-500">{selectedCount}개 항목을 새 위치로 옮깁니다.</p>

    <label class="mt-5 block">
      <span class="mb-2 block text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Destination</span>
      <select
        class="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700 outline-none transition focus:border-sky-500 focus:ring-4 focus:ring-sky-100"
        bind:value={targetParentId}
      >
        <option value="">Root</option>
        {#each availableMoveTargets as page}
          <option value={page.id}>
            {"  ".repeat(page.depth)}{page.title}
          </option>
        {/each}
      </select>
    </label>

    <div class="mt-6 flex justify-end gap-2">
      <button
        type="button"
        class="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-300"
        on:click={closeDialog}
      >
        취소
      </button>
      <button
        type="button"
        class="rounded-full bg-sky-700 px-4 py-2 text-sm font-semibold text-white transition hover:bg-sky-800"
        on:click={submitMove}
      >
        이동
      </button>
    </div>
  </div>
</div>
