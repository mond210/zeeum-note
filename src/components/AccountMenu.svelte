<script>
  import { createEventDispatcher } from "svelte";
  import { clickOutside } from "../lib/click-outside.js";

  export let currentUser = null;
  export let align = "left";
  export let borderlessTrigger = false;
  export let menuDirection = "down";
  export let showAdminLink = false;
  export let showWorkspaceLink = false;
  export let triggerMode = "icon";

  const dispatch = createEventDispatcher();

  let open = false;

  function toggleMenu() {
    open = !open;
  }

  function closeMenu() {
    open = false;
  }

  function roleLabel(role) {
    return role === "admin" ? "관리자" : "멤버";
  }

  function triggerMeta() {
    if (currentUser?.email) {
      return `${currentUser.email} · ${roleLabel(currentUser?.role)}`;
    }

    return roleLabel(currentUser?.role);
  }

  $: menuPositionClass = align === "right" ? "right-0" : "left-0";
  $: menuDirectionClass =
    menuDirection === "up" ? "bottom-[calc(100%+0.6rem)]" : "top-[calc(100%+0.6rem)]";
  $: triggerClass =
    triggerMode === "sidebar"
      ? "flex w-full items-center gap-3 px-3 py-3 text-left transition hover:bg-slate-50"
      : borderlessTrigger
        ? "grid h-11 w-11 place-items-center rounded-full bg-white text-slate-600 transition hover:bg-slate-100 hover:text-sky-700"
        : "grid h-11 w-11 place-items-center rounded-full border border-slate-200 bg-white text-slate-600 transition hover:border-sky-300 hover:text-sky-700";
</script>

<svelte:window
  on:keydown={(event) => {
    if (event.key === "Escape") {
      closeMenu();
    }
  }}
/>

<div class="relative" use:clickOutside={open} on:clickoutside={closeMenu}>
  <button
    type="button"
    class={triggerClass}
    aria-label="Account menu"
    title="Account menu"
    aria-expanded={open}
    on:click={toggleMenu}
  >
    {#if triggerMode === "sidebar"}
      <span class="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-slate-100 text-slate-600">
        <span class="material-symbols-rounded">person</span>
      </span>
      <span class="min-w-0 flex-1">
        <span class="block truncate text-sm font-semibold text-slate-950">
          {currentUser?.name || "Unknown user"}
        </span>
        <span class="mt-1 block truncate text-xs text-slate-500">{triggerMeta()}</span>
      </span>
      <span class="material-symbols-rounded shrink-0 text-[18px] text-slate-400">
        {open ? "expand_less" : "expand_more"}
      </span>
    {:else}
      <span class="material-symbols-rounded">person</span>
    {/if}
  </button>

  {#if open}
    <div class={`absolute ${menuPositionClass} ${menuDirectionClass} z-40 w-[280px] rounded-[1.4rem] border border-slate-200 bg-white p-2 shadow-[0_22px_56px_rgba(15,23,42,0.16)]`}>
      <div class="rounded-[1.1rem] bg-slate-50 px-4 py-4">
        <p class="text-sm font-semibold text-slate-950">{currentUser?.name || "Unknown user"}</p>
        <p class="mt-1 text-sm text-slate-500">{currentUser?.email || ""}</p>
        <p class="mt-3 text-[0.72rem] font-semibold uppercase tracking-[0.18em] text-slate-400">
          {roleLabel(currentUser?.role)}
        </p>
      </div>

      <div class="mt-2 space-y-1">
        {#if showWorkspaceLink}
          <button
            type="button"
            class="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-sm font-medium text-slate-700 transition hover:bg-slate-100"
            on:click={() => {
              closeMenu();
              dispatch("openWorkspace");
            }}
          >
            <span class="material-symbols-rounded text-[18px]">description</span>
            <span>작업공간</span>
          </button>
        {/if}

        {#if showAdminLink}
          <button
            type="button"
            class="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-sm font-medium text-slate-700 transition hover:bg-slate-100"
            on:click={() => {
              closeMenu();
              dispatch("openAdmin");
            }}
          >
            <span class="material-symbols-rounded text-[18px]">admin_panel_settings</span>
            <span>관리자 설정</span>
          </button>
        {/if}

        <button
          type="button"
          class="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-sm font-medium text-rose-700 transition hover:bg-rose-50"
          on:click={() => {
            closeMenu();
            dispatch("logout");
          }}
        >
          <span class="material-symbols-rounded text-[18px]">logout</span>
          <span>로그아웃</span>
        </button>
      </div>
    </div>
  {/if}
</div>
