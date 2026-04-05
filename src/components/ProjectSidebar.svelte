<script>
  import AccountMenu from "./AccountMenu.svelte";
  import { tick } from "svelte";
  import { createEventDispatcher } from "svelte";
  import { buildPageTree, isDescendant } from "../lib/page-tree.js";
  import { scrollbarActivity } from "../lib/scrollbar-activity.js";
  import SidebarAiDialog from "./SidebarAiDialog.svelte";

  export let currentUser = null;
  export let docked = true;
  export let pages = [];
  export let searchQuery = "";
  export let showAdminLink = false;
  export let selectedPageId = null;

  const dispatch = createEventDispatcher();
  const DROP_AFTER = "after";
  const DROP_BEFORE = "before";
  const DROP_INSIDE = "inside";
  const ROOT_DROP_TARGET_ID = "__root__";

  let collapsedIds = new Set();
  let contextMenu = null;
  let draggedIds = [];
  let dropInstruction = null;
  let lastSelectedId = null;
  let pointerDrag = null;
  let aiDialogOpen = false;
  let renamingId = null;
  let renameValue = "";
  let searchInput;
  let searchOpen = false;
  let selectedIds = [];

  function iconGlyph(value, isFolder = false) {
    const map = {
      article: "article",
      bolt: "bolt",
      "book-open": "menu_book",
      calendar_month: "calendar_month",
      "check-square": "checklist",
      checklist: "checklist",
      code_blocks: "code_blocks",
      description: "description",
      design_services: "design_services",
      "file-text": "description",
      file_text: "description",
      folder_open: "folder",
      forum: "forum",
      inventory_2: "inventory_2",
      lightbulb: "lightbulb",
      menu_book: "menu_book"
    };

    if (isFolder) {
      return "folder";
    }

    return map[value] || value || "description";
  }

  function rowIsFolder(page) {
    return page.icon === "folder_open";
  }

  function rowHasChildren(pageId) {
    return pages.some((entry) => entry.parentId === pageId);
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

  function resolvePages(pageIds) {
    return pageIds
      .map((pageId) => pages.find((entry) => entry.id === pageId))
      .filter(Boolean);
  }

  function canDropIntoParent(parentId, pageIds) {
    if (!Array.isArray(pageIds) || pageIds.length === 0) {
      return false;
    }

    const targetParent = parentId ? pages.find((page) => page.id === parentId) || null : null;
    const movingPages = resolvePages(pageIds);

    if (movingPages.length !== pageIds.length) {
      return false;
    }

    return movingPages.every((page) => {
      if (targetParent && (page.id === targetParent.id || isDescendant(pages, page.id, targetParent.id))) {
        return false;
      }

      return canParentAcceptChild(targetParent, page);
    });
  }

  function buildRows(parentId = null, depth = 0, collapsed = collapsedIds) {
    return pages
      .filter((page) => (page.parentId ?? null) === parentId)
      .sort((left, right) => left.position - right.position)
      .flatMap((page) => {
        const row = {
          ...page,
          depth,
          hasChildren: rowHasChildren(page.id),
          isFolder: rowIsFolder(page)
        };

        if (!row.hasChildren || collapsed.has(page.id)) {
          return [row];
        }

        return [row, ...buildRows(page.id, depth + 1, collapsed)];
      });
  }

  function siblingsForParent(parentId) {
    return pages
      .filter((page) => (page.parentId ?? null) === (parentId ?? null))
      .sort((left, right) => left.position - right.position);
  }

  function bindRowPage(node, pageId) {
    node.__pageId = pageId;

    return {
      destroy() {
        delete node.__pageId;
      },
      update(nextPageId) {
        node.__pageId = nextPageId;
      }
    };
  }

  function currentSelectedRoots() {
    const roots = selectedIds.filter((pageId) => {
      return !selectedIds.some((candidate) => candidate !== pageId && isDescendant(pages, candidate, pageId));
    });
    const order = new Map(rows.map((row, index) => [row.id, index]));

    return [...roots].sort((left, right) => (order.get(left) ?? 0) - (order.get(right) ?? 0));
  }

  function updateSelection(nextSelection) {
    selectedIds = Array.from(new Set(nextSelection));
  }

  function dragPreviewLabel(pageList) {
    if (!Array.isArray(pageList) || pageList.length === 0) {
      return "";
    }

    if (pageList.length === 1) {
      return pageList[0].title;
    }

    return `${pageList[0].title} 외 ${pageList.length - 1}개`;
  }

  function selectSingle(pageId, openPage = true) {
    updateSelection(openPage ? [] : [pageId]);
    lastSelectedId = pageId;

    if (openPage) {
      dispatch("selectPage", pageId);
    }
  }

  function toggleSelection(pageId) {
    if (selectedIds.includes(pageId)) {
      updateSelection(selectedIds.filter((entry) => entry !== pageId));
    } else {
      updateSelection([...selectedIds, pageId]);
    }

    lastSelectedId = pageId;
  }

  function selectRange(pageId) {
    const orderedIds = rows.map((row) => row.id);
    const start = orderedIds.indexOf(lastSelectedId);
    const end = orderedIds.indexOf(pageId);

    if (start < 0 || end < 0) {
      selectSingle(pageId);
      return;
    }

    const [from, to] = start < end ? [start, end] : [end, start];
    updateSelection(orderedIds.slice(from, to + 1));
    lastSelectedId = pageId;
  }

  function handleRowClick(page, event) {
    if (event.shiftKey && lastSelectedId) {
      selectRange(page.id);
      return;
    }

    if (event.metaKey || event.ctrlKey) {
      toggleSelection(page.id);
      return;
    }

    if (page.isFolder) {
      updateSelection([]);
      lastSelectedId = page.id;
      toggleCollapsed(page.id);
      return;
    }

    selectSingle(page.id);
  }

  function handleContextMenu(page, event) {
    event.preventDefault();

    if (!selectedIds.includes(page.id)) {
      selectSingle(page.id, false);
    }

    contextMenu = {
      pageId: page.id,
      x: event.clientX,
      y: event.clientY
    };
  }

  function closeContextMenu() {
    contextMenu = null;
  }

  function toggleCollapsed(pageId) {
    const next = new Set(collapsedIds);

    if (next.has(pageId)) {
      next.delete(pageId);
    } else {
      next.add(pageId);
    }

    collapsedIds = next;
  }

  function startRename(page) {
    selectSingle(page.id, false);
    renamingId = page.id;
    renameValue = page.title;
    closeContextMenu();
  }

  function cancelRename() {
    renamingId = null;
    renameValue = "";
  }

  function submitRename() {
    if (!renamingId || !renameValue.trim()) {
      cancelRename();
      return;
    }

    dispatch("renamePage", {
      pageId: renamingId,
      title: renameValue.trim()
    });
    cancelRename();
  }

  function openMoveDialog() {
    dispatch("openMoveDialog", {
      pageIds: currentSelectedRoots()
    });
    closeContextMenu();
  }

  function createPageAt(parentId = null) {
    dispatch("createPage", { parentId });
    closeContextMenu();
  }

  function createFolderAt(parentId = null) {
    dispatch("createFolder", { parentId });
    closeContextMenu();
  }

  function clearDragState() {
    draggedIds = [];
    dropInstruction = null;
  }

  function startPointerDrag(page, event) {
    if (event.button !== 0) {
      return;
    }

    const selectedRoots = currentSelectedRoots();
    const nextDraggedIds =
      selectedIds.includes(page.id) && selectedRoots.length > 0 ? selectedRoots : [page.id];

    if (!selectedIds.includes(page.id)) {
      updateSelection([page.id]);
      lastSelectedId = page.id;
    }

    closeContextMenu();
    clearDragState();
    pointerDrag = {
      active: false,
      clientX: event.clientX,
      clientY: event.clientY,
      pageIds: nextDraggedIds,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY
    };
  }

  function clearPointerDrag() {
    pointerDrag = null;
    clearDragState();
  }

  function buildRootDropInstruction(pageIds) {
    if (!canDropIntoParent(null, pageIds)) {
      return null;
    }

    return {
      pageId: ROOT_DROP_TARGET_ID,
      parentId: null,
      placement: DROP_INSIDE,
      position: siblingsForParent(null).filter((page) => !pageIds.includes(page.id)).length
    };
  }

  function buildPlacementInstruction(page, placement, pageIds) {
    if (!page) {
      return null;
    }

    if (placement === DROP_INSIDE) {
      if (!canDropIntoParent(page.id, pageIds)) {
        return null;
      }

      return {
        pageId: page.id,
        parentId: page.id,
        placement,
        position: siblingsForParent(page.id).filter((entry) => !pageIds.includes(entry.id)).length
      };
    }

    const parentId = page.parentId ?? null;

    if (!canDropIntoParent(parentId, pageIds)) {
      return null;
    }

    const siblings = siblingsForParent(parentId).filter((entry) => !pageIds.includes(entry.id));
    const targetIndex = siblings.findIndex((entry) => entry.id === page.id);

    if (targetIndex < 0) {
      return null;
    }

    return {
      pageId: page.id,
      parentId,
      placement,
      position: targetIndex + (placement === DROP_AFTER ? 1 : 0)
    };
  }

  function resolveDropInstruction(page, event) {
    const bounds = event.currentTarget.getBoundingClientRect();
    const offsetY = event.clientY - bounds.top;
    const beforeCutoff = bounds.height * 0.28;
    const afterCutoff = bounds.height * 0.72;
    const placementOrder =
      offsetY <= beforeCutoff
        ? [DROP_BEFORE, DROP_INSIDE, DROP_AFTER]
        : offsetY >= afterCutoff
          ? [DROP_AFTER, DROP_INSIDE, DROP_BEFORE]
          : offsetY < bounds.height / 2
            ? [DROP_INSIDE, DROP_BEFORE, DROP_AFTER]
            : [DROP_INSIDE, DROP_AFTER, DROP_BEFORE];

    return placementOrder
      .map((placement) => buildPlacementInstruction(page, placement, draggedIds))
      .find(Boolean);
  }

  function applyDropInstruction(nextInstruction) {
    if (!nextInstruction) {
      return;
    }

    if (nextInstruction.placement === DROP_INSIDE && nextInstruction.pageId !== ROOT_DROP_TARGET_ID) {
      const next = new Set(collapsedIds);
      next.delete(nextInstruction.pageId);
      collapsedIds = next;
    }

    dispatch("movePages", {
      pageIds: draggedIds,
      parentId: nextInstruction.parentId,
      position: nextInstruction.position
    });
    clearPointerDrag();
  }

  function activatePointerDrag() {
    if (!pointerDrag || pointerDrag.active) {
      return;
    }

    draggedIds = pointerDrag.pageIds;
    dropInstruction = null;
    pointerDrag = {
      ...pointerDrag,
      active: true
    };
  }

  function updatePointerDropTarget(clientX, clientY) {
    if (!pointerDrag?.active) {
      return;
    }

    const hit = document.elementFromPoint(clientX, clientY);
    const rowElement = hit?.closest?.(".tree-row");

    if (rowElement) {
      const pageId = rowElement.__pageId || rowElement.getAttribute("data-page-id");
      const page = pageId ? pages.find((entry) => entry.id === pageId) || null : null;
      const nextInstruction = page
        ? resolveDropInstruction(page, {
            clientY,
            currentTarget: rowElement
          })
        : null;

      dropInstruction = nextInstruction;
      return;
    }

    if (hit?.closest?.(".tree-root-drop-zone")) {
      dropInstruction = buildRootDropInstruction(draggedIds);
      return;
    }

    dropInstruction = null;
  }

  function handlePointerMove(event) {
    if (!pointerDrag || event.pointerId !== pointerDrag.pointerId) {
      return;
    }

    const delta = Math.hypot(event.clientX - pointerDrag.startX, event.clientY - pointerDrag.startY);

    if (!pointerDrag.active) {
      if (delta < 4) {
        return;
      }

      activatePointerDrag();
    }

    pointerDrag = {
      ...pointerDrag,
      clientX: event.clientX,
      clientY: event.clientY
    };
    updatePointerDropTarget(event.clientX, event.clientY);
  }

  function finishPointerDrag(event) {
    if (!pointerDrag || event.pointerId !== pointerDrag.pointerId) {
      return;
    }

    if (pointerDrag.active && dropInstruction) {
      applyDropInstruction(dropInstruction);
      return;
    }

    clearPointerDrag();
  }

  function duplicateSelected() {
    dispatch("duplicatePages", { pageIds: currentSelectedRoots() });
    closeContextMenu();
  }

  function deleteSelected() {
    dispatch("deletePages", { pageIds: currentSelectedRoots() });
    closeContextMenu();
  }

  async function toggleSearch() {
    if (searchOpen && !searchQuery.trim()) {
      searchOpen = false;
      return;
    }

    searchOpen = true;
    await tick();
    searchInput?.focus();
    searchInput?.select?.();
  }

  $: query = searchQuery.trim().toLowerCase();
  $: allRows = buildPageTree(pages).map((page) => ({
    ...page,
    hasChildren: rowHasChildren(page.id),
    isFolder: rowIsFolder(page)
  }));
  $: rows = query
    ? allRows.filter((page) => `${page.title} ${page.excerpt || ""}`.toLowerCase().includes(query))
    : buildRows(null, 0, collapsedIds);
  $: selectedCount = selectedIds.length;
  $: activeContextPage = contextMenu
    ? (() => {
        const page = pages.find((entry) => entry.id === contextMenu.pageId) || null;
        return page ? { ...page, isFolder: rowIsFolder(page) } : null;
      })()
    : null;
  $: selectedFolderId =
    selectedIds.length === 1 && rowIsFolder(pages.find((page) => page.id === selectedIds[0]) || {})
      ? selectedIds[0]
      : null;
  $: dragPreviewPages = draggedIds.length > 0 ? resolvePages(draggedIds) : [];
  $: dragPreviewLead = dragPreviewPages[0] || null;
  $: dragPreviewTitle = dragPreviewLabel(dragPreviewPages);
  $: if (searchQuery.trim()) {
    searchOpen = true;
  }
</script>

<svelte:window
  on:click={closeContextMenu}
  on:keydown={(event) => {
    if (event.key === "Escape") {
      closeContextMenu();
      cancelRename();
      clearPointerDrag();
    }
  }}
  on:pointermove={handlePointerMove}
  on:pointerup={finishPointerDrag}
  on:pointercancel={finishPointerDrag}
/>

<aside class={`flex h-full min-h-0 flex-col ${docked ? "border-r border-slate-200/80" : ""}`}>
  <div class="border-b border-slate-200/80 px-2 py-2.5">
    <div class="scroll-thin flex min-h-8 items-center gap-1.5 overflow-x-auto">
        <button
          type="button"
          class="grid h-8 w-8 shrink-0 place-items-center rounded-xl text-slate-500 transition hover:bg-slate-100 hover:text-slate-900"
          aria-label="Search"
          title="Search"
          on:click={toggleSearch}
        >
          <span class="material-symbols-rounded text-[18px]">{searchOpen ? "search_off" : "search"}</span>
        </button>
        <button
          type="button"
          class="grid h-8 w-8 shrink-0 place-items-center rounded-xl text-slate-500 transition hover:bg-slate-100 hover:text-sky-700"
          aria-label="AI organize"
          title="AI organize"
          on:click={() => {
            aiDialogOpen = true;
            closeContextMenu();
          }}
        >
          <span class="material-symbols-rounded text-[18px]">auto_awesome</span>
        </button>
        <button
          type="button"
          class="grid h-8 w-8 shrink-0 place-items-center rounded-xl text-slate-500 transition hover:bg-slate-100 hover:text-slate-900"
          aria-label="New page"
          title="New page"
          on:click={() => createPageAt(selectedFolderId)}
        >
          <span class="material-symbols-rounded text-[18px]">note_add</span>
        </button>
        <button
          type="button"
          class="grid h-8 w-8 shrink-0 place-items-center rounded-xl text-slate-500 transition hover:bg-slate-100 hover:text-slate-900"
          aria-label="New folder"
          title="New folder"
          on:click={() => createFolderAt(selectedFolderId)}
        >
          <span class="material-symbols-rounded text-[18px]">create_new_folder</span>
        </button>
        <button
          type="button"
          class="grid h-8 w-8 shrink-0 place-items-center rounded-xl text-slate-500 transition hover:bg-slate-100 hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-40"
          aria-label="Rename"
          title="Rename"
          disabled={selectedCount !== 1}
          on:click={() => {
            const page = pages.find((entry) => entry.id === selectedIds[0]);

            if (page) {
              startRename(page);
            }
          }}
        >
          <span class="material-symbols-rounded text-[18px]">drive_file_rename_outline</span>
        </button>
        <button
          type="button"
          class="grid h-8 w-8 shrink-0 place-items-center rounded-xl text-slate-500 transition hover:bg-slate-100 hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-40"
          aria-label="Move"
          title="Move"
          disabled={selectedCount === 0}
          on:click={openMoveDialog}
        >
          <span class="material-symbols-rounded text-[18px]">drive_file_move</span>
        </button>
        <button
          type="button"
          class="grid h-8 w-8 shrink-0 place-items-center rounded-xl text-slate-500 transition hover:bg-slate-100 hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-40"
          aria-label="Copy"
          title="Copy"
          disabled={selectedCount === 0}
          on:click={duplicateSelected}
        >
          <span class="material-symbols-rounded text-[18px]">content_copy</span>
        </button>
        <button
          type="button"
          class="grid h-8 w-8 shrink-0 place-items-center rounded-xl text-rose-700 transition hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-40"
          aria-label="Delete"
          title="Delete"
          disabled={selectedCount === 0}
          on:click={deleteSelected}
        >
          <span class="material-symbols-rounded text-[18px]">delete</span>
        </button>
    </div>

    {#if searchOpen}
      <div class="mt-2">
        <input
          bind:this={searchInput}
          class="w-full border border-slate-200 bg-transparent px-3 py-2.5 text-sm text-slate-700 outline-none transition focus:border-sky-500"
          value={searchQuery}
          placeholder="파일 또는 폴더 검색"
          on:input={(event) => dispatch("search", event.currentTarget.value)}
        />
      </div>
    {/if}
  </div>

  <div class="scroll-thin flex-1 overflow-y-auto px-0 py-2" use:scrollbarActivity>
    {#if draggedIds.length > 0}
      <div
        class={`mx-2 mb-2 rounded-xl border border-dashed px-3 py-2 text-xs font-medium transition ${
          dropInstruction?.pageId === ROOT_DROP_TARGET_ID
            ? "border-sky-400 bg-sky-50 text-sky-700"
            : "border-slate-300 text-slate-500"
        }`}
        class:tree-root-drop-zone={draggedIds.length > 0}
        data-drop-root="true"
        aria-label="Move dragged items to root"
        role="region"
      >
        루트 끝으로 이동
      </div>
    {/if}

    {#if rows.length > 0}
      <div class="space-y-0">
        {#each rows as page}
          <div
            class={`group relative border-l-2 px-2 py-1.5 transition ${
              dropInstruction?.pageId === page.id && dropInstruction.placement === DROP_INSIDE
                ? "border-sky-500 bg-sky-50/80"
                : selectedIds.includes(page.id)
                ? "border-sky-600 bg-slate-50"
                : "border-transparent hover:bg-slate-50"
            } ${pointerDrag?.active && draggedIds.includes(page.id) ? "opacity-40" : ""}`}
            class:tree-row={true}
            data-page-id={page.id}
            use:bindRowPage={page.id}
            role="presentation"
            on:contextmenu={(event) => handleContextMenu(page, event)}
          >
            {#if dropInstruction?.pageId === page.id && dropInstruction.placement === DROP_BEFORE}
              <div class="pointer-events-none absolute inset-x-2 top-0 h-[2px] rounded-full bg-sky-500"></div>
            {/if}
            {#if dropInstruction?.pageId === page.id && dropInstruction.placement === DROP_AFTER}
              <div class="pointer-events-none absolute inset-x-2 bottom-0 h-[2px] rounded-full bg-sky-500"></div>
            {/if}

            <div class="flex items-center gap-2" style={`padding-left: ${page.depth * 18}px`}>
              {#if page.hasChildren}
                <button
                  type="button"
                  class="grid h-6 w-6 place-items-center text-slate-400 transition hover:text-slate-700"
                  aria-label={collapsedIds.has(page.id) ? "Expand children" : "Collapse children"}
                  on:click={() => toggleCollapsed(page.id)}
                >
                  <span class="material-symbols-rounded text-[18px]">
                    {collapsedIds.has(page.id) ? "chevron_right" : "expand_more"}
                  </span>
                </button>
              {:else}
                <span class="inline-block h-6 w-6"></span>
              {/if}

              <button
                type="button"
                class={`grid h-7 w-7 shrink-0 place-items-center rounded-full transition ${
                  selectedIds.includes(page.id)
                    ? "cursor-grab touch-none text-slate-400 hover:bg-slate-200/70 hover:text-slate-700 active:cursor-grabbing"
                    : "cursor-grab touch-none text-slate-300 opacity-0 group-hover:opacity-100 hover:bg-slate-200/70 hover:text-slate-600 active:cursor-grabbing"
                }`}
                data-drag-handle="true"
                aria-label="Drag item"
                title="Drag item"
                on:click|preventDefault|stopPropagation
                on:pointerdown|preventDefault|stopPropagation={(event) => startPointerDrag(page, event)}
              >
                <span class="material-symbols-rounded text-[18px]">drag_indicator</span>
              </button>

              <button
                type="button"
                class={`flex min-w-0 flex-1 items-center gap-2 px-2 py-1.5 text-left ${
                  selectedIds.length > 0
                    ? selectedIds.includes(page.id)
                      ? "bg-transparent"
                      : ""
                    : selectedPageId === page.id
                      ? "bg-transparent"
                      : ""
                }`}
                on:click={(event) => handleRowClick(page, event)}
              >
                <span class="material-symbols-rounded text-[18px] text-slate-500">
                  {iconGlyph(page.icon, page.isFolder)}
                </span>

                <div class="min-w-0 flex-1">
                  {#if renamingId === page.id}
                    <input
                      class="w-full border border-sky-300 bg-white px-2 py-1 text-sm font-medium text-slate-900 outline-none"
                      bind:value={renameValue}
                      on:blur={submitRename}
                      on:keydown={(event) => {
                        if (event.key === "Enter") {
                          submitRename();
                        } else if (event.key === "Escape") {
                          cancelRename();
                        }
                      }}
                    />
                  {:else}
                    <p class="truncate text-sm font-medium text-slate-800">{page.title}</p>
                  {/if}
                </div>
              </button>
            </div>
          </div>
        {/each}
      </div>
    {:else}
      <div class="border border-dashed border-slate-300 px-4 py-6 text-center">
        <p class="text-sm font-semibold text-slate-900">검색 결과가 없습니다</p>
        <p class="mt-2 text-xs leading-5 text-slate-500">다른 이름으로 검색하거나 새 페이지/폴더를 만드세요.</p>
      </div>
    {/if}
  </div>

  <div class="shrink-0 border-t border-slate-200/80">
    <AccountMenu
      align="left"
      currentUser={currentUser}
      menuDirection="up"
      showAdminLink={showAdminLink}
      triggerMode="sidebar"
      on:logout={() => dispatch("logout")}
      on:openAdmin={() => dispatch("openAdmin")}
    />
  </div>
</aside>

{#if contextMenu && activeContextPage}
  <div
    class="fixed z-50 min-w-[220px] rounded-2xl border border-slate-200 bg-white p-2 shadow-[0_24px_60px_rgba(15,23,42,0.18)]"
    role="menu"
    tabindex="-1"
    style={`left: min(${contextMenu.x}px, calc(100vw - 240px)); top: min(${contextMenu.y}px, calc(100vh - 280px));`}
    on:mousedown|stopPropagation
  >
    {#if !activeContextPage.isFolder}
      <button
        type="button"
        class="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-sm font-medium text-slate-700 transition hover:bg-slate-100"
        on:click={() => {
          selectSingle(activeContextPage.id);
          closeContextMenu();
        }}
      >
        <span class="material-symbols-rounded text-[18px]">open_in_new</span>
        <span>열기</span>
      </button>
    {:else}
      <button
        type="button"
        class="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-sm font-medium text-slate-700 transition hover:bg-slate-100"
        on:click={() => {
          toggleCollapsed(activeContextPage.id);
          closeContextMenu();
        }}
      >
        <span class="material-symbols-rounded text-[18px]">
          {collapsedIds.has(activeContextPage.id) ? "folder_open" : "folder"}
        </span>
        <span>{collapsedIds.has(activeContextPage.id) ? "폴더 펼치기" : "폴더 접기"}</span>
      </button>
    {/if}
    {#if activeContextPage.isFolder}
      <button
        type="button"
        class="mt-1 flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-sm font-medium text-slate-700 transition hover:bg-slate-100"
        on:click={() => createPageAt(activeContextPage.id)}
      >
        <span class="material-symbols-rounded text-[18px]">note_add</span>
        <span>하위 페이지 만들기</span>
      </button>
      <button
        type="button"
        class="mt-1 flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-sm font-medium text-slate-700 transition hover:bg-slate-100"
        on:click={() => createFolderAt(activeContextPage.id)}
      >
        <span class="material-symbols-rounded text-[18px]">create_new_folder</span>
        <span>하위 폴더 만들기</span>
      </button>
    {/if}
    <button
      type="button"
      class="mt-1 flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-sm font-medium text-slate-700 transition hover:bg-slate-100"
      on:click={() => startRename(activeContextPage)}
    >
      <span class="material-symbols-rounded text-[18px]">drive_file_rename_outline</span>
      <span>이름 바꾸기</span>
    </button>
    <button
      type="button"
      class="mt-1 flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-sm font-medium text-slate-700 transition hover:bg-slate-100"
      on:click={openMoveDialog}
    >
      <span class="material-symbols-rounded text-[18px]">drive_file_move</span>
      <span>이동</span>
    </button>
    <button
      type="button"
      class="mt-1 flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-sm font-medium text-slate-700 transition hover:bg-slate-100"
      on:click={duplicateSelected}
    >
      <span class="material-symbols-rounded text-[18px]">content_copy</span>
      <span>복사</span>
    </button>
    <button
      type="button"
      class="mt-1 flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-sm font-medium text-rose-700 transition hover:bg-rose-50"
      on:click={deleteSelected}
    >
      <span class="material-symbols-rounded text-[18px]">delete</span>
      <span>삭제</span>
    </button>
  </div>
{/if}

{#if pointerDrag?.active && dragPreviewLead}
  <div
    class="pointer-events-none fixed z-[95] max-w-[280px] min-w-[180px] rounded-2xl border border-slate-200/90 bg-white/78 px-3 py-2 shadow-[0_18px_40px_rgba(15,23,42,0.14)] backdrop-blur-md"
    style={`left: ${pointerDrag.clientX + 18}px; top: ${pointerDrag.clientY + 18}px;`}
  >
    <div class="flex items-center gap-2">
      <span class="material-symbols-rounded text-[18px] text-slate-500">
        {iconGlyph(dragPreviewLead.icon, rowIsFolder(dragPreviewLead))}
      </span>
      <div class="min-w-0 flex-1">
        <p class="truncate text-sm font-medium text-slate-900">{dragPreviewTitle}</p>
      </div>
      {#if dragPreviewPages.length > 1}
        <span class="rounded-full bg-slate-900/8 px-2 py-0.5 text-[11px] font-semibold text-slate-600">
          {dragPreviewPages.length}
        </span>
      {/if}
    </div>
  </div>
{/if}

{#if aiDialogOpen}
  <SidebarAiDialog
    pages={pages}
    projectId={pages[0]?.projectId || null}
    selectedPageIds={currentSelectedRoots()}
    on:applied={() => dispatch("aiApplied")}
    on:close={() => (aiDialogOpen = false)}
  />
{/if}
