<script>
  import { createEventDispatcher } from "svelte";
  import { fade, scale } from "svelte/transition";
  import { formatRelativeDate } from "../lib/format.js";

  export let projects = [];
  export let recentProjects = [];

  const dispatch = createEventDispatcher();

  let description = "";
  let icon = "";
  let name = "";
  let showCreateDialog = false;

  $: draftIcon = (icon || name).trim().slice(0, 2).toUpperCase() || "PR";

  function openCreateDialog() {
    showCreateDialog = true;
  }

  function closeCreateDialog() {
    showCreateDialog = false;
  }

  function handleSubmit() {
    dispatch("createProject", {
      description,
      icon: (icon || name).trim().slice(0, 2).toUpperCase(),
      name
    });

    closeCreateDialog();
    description = "";
    icon = "";
    name = "";
  }

  function handleEscape(event) {
    if (event.key === "Escape" && showCreateDialog) {
      closeCreateDialog();
    }
  }
</script>

<svelte:window on:keydown={handleEscape} />

<div class="min-h-screen">
  <section class="w-full border-b border-slate-200/80 bg-white/88">
    <div class="mx-auto flex min-h-[4.25rem] max-w-[1040px] items-center justify-between px-6 sm:px-10 lg:px-14">
      <div class="flex items-center gap-3">
        <div class="grid h-9 w-9 place-items-center rounded-xl bg-slate-900 text-xs font-semibold text-white">
          ZE
        </div>
        <div>
          <p class="text-sm font-semibold text-slate-950">zeeum-note</p>
          <p class="text-xs text-slate-400">Projects</p>
        </div>
      </div>
    </div>
  </section>

  <div class="mx-auto max-w-[1040px] px-6 pb-10 pt-8 sm:px-10 lg:px-14 lg:pb-12 lg:pt-10">
    <section class="px-1 sm:px-0">
      <div>
        <div class="flex items-center justify-between gap-3">
          <div>
            <p class="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Accessible projects</p>
            <p class="mt-2 text-sm text-slate-500">{projects.length} available right now</p>
          </div>
          <button
            type="button"
            class="grid h-10 w-10 place-items-center rounded-full border border-slate-200 bg-white text-slate-600 transition hover:border-sky-300 hover:text-sky-700"
            aria-label="Create project"
            title="Create project"
            on:click={openCreateDialog}
          >
            <span class="material-symbols-rounded">add</span>
          </button>
        </div>

        <div class="mt-6 divide-y divide-slate-200">
          {#each projects as project}
            <button
              type="button"
              class="group -mx-3 flex w-[calc(100%+1.5rem)] items-start gap-4 rounded-xl px-3 py-4 text-left transition hover:bg-white hover:shadow-[0_1px_0_rgba(15,23,42,0.04),0_8px_24px_rgba(15,23,42,0.06)] focus-visible:bg-white focus-visible:shadow-[0_1px_0_rgba(15,23,42,0.04),0_8px_24px_rgba(15,23,42,0.06)]"
              on:click={() => dispatch("openProject", project.id)}
            >
              <div class="mt-0.5 grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-slate-900 text-sm font-semibold text-white transition group-hover:bg-sky-700">
                {project.icon}
              </div>

              <div class="min-w-0 flex-1">
                <div class="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <p class="truncate text-base font-semibold text-slate-950">{project.name}</p>
                  <span class="text-xs font-medium text-slate-400">
                    {project.pageCount} pages
                  </span>
                  <span class="text-xs font-medium text-slate-400">
                    {project.groupCount} groups
                  </span>
                </div>
                <p class="mt-1 line-clamp-2 text-sm leading-6 text-slate-500">{project.description}</p>
                {#if project.recentPages?.length > 0}
                  <p class="mt-2 text-xs text-slate-400">
                    Recent: {project.recentPages.map((page) => page.title).join(" · ")}
                  </p>
                {/if}
              </div>

              <div class="shrink-0 pt-1 text-right">
                <p class="text-xs font-medium text-slate-400">{formatRelativeDate(project.updatedAt)}</p>
                <p class="mt-2 text-sm font-semibold text-slate-300 transition group-hover:text-sky-700">Open</p>
              </div>
            </button>
          {/each}
        </div>
      </div>
    </section>

    <section class="section-rule mt-8 px-1 pt-8 sm:px-0">
      <div>
        <p class="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Recently opened</p>
      </div>

      {#if recentProjects.length > 0}
        <div class="mt-5 divide-y divide-slate-200">
          {#each recentProjects as project}
            <button
              type="button"
              class="group -mx-3 flex w-[calc(100%+1.5rem)] items-start gap-4 rounded-xl px-3 py-4 text-left transition hover:bg-white hover:shadow-[0_1px_0_rgba(15,23,42,0.04),0_8px_24px_rgba(15,23,42,0.06)] focus-visible:bg-white focus-visible:shadow-[0_1px_0_rgba(15,23,42,0.04),0_8px_24px_rgba(15,23,42,0.06)]"
              on:click={() => dispatch("openProject", project.id)}
            >
              <div class="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-slate-100 text-xs font-semibold text-slate-700 transition group-hover:bg-sky-100 group-hover:text-sky-700">
                {project.icon}
              </div>
              <div class="min-w-0 flex-1">
                <p class="truncate text-sm font-semibold text-slate-950">{project.name}</p>
                <p class="mt-1 line-clamp-1 text-sm text-slate-500">{project.description}</p>
              </div>
              <span class="shrink-0 text-xs font-medium text-slate-400">
                {formatRelativeDate(project.lastOpenedAt)}
              </span>
            </button>
          {/each}
        </div>
      {:else}
        <p class="mt-5 text-sm text-slate-500">No recent projects yet.</p>
      {/if}
    </section>
  </div>

  {#if showCreateDialog}
    <button
      type="button"
      class="fixed inset-0 z-30 bg-slate-950/22 backdrop-blur-[2px]"
      aria-label="Close project creation dialog"
      on:click={closeCreateDialog}
      transition:fade={{ duration: 140 }}
    ></button>
    <div class="fixed inset-0 z-40 grid place-items-center px-4">
      <div
        class="dialog-surface w-full max-w-[500px] rounded-[1.4rem] border border-slate-200/90 px-6 py-6 sm:px-7"
        transition:scale={{ duration: 180, start: 0.96 }}
      >
        <div class="flex items-start justify-between gap-4">
          <div class="flex items-start gap-4">
            <div class="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-slate-900 text-sm font-semibold text-white">
              {draftIcon}
            </div>
            <div>
              <p class="text-xs font-semibold uppercase tracking-[0.18em] text-sky-700">New project</p>
              <h2 class="mt-2 text-[1.9rem] font-semibold tracking-[-0.06em] text-slate-950">
                Create a clean workspace
              </h2>
              <p class="mt-2 text-sm leading-6 text-slate-500">
                Name it, give it a compact mark, and drop into the project shell immediately.
              </p>
            </div>
          </div>

          <button
            type="button"
            class="rounded-full border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-500 transition hover:border-slate-300 hover:text-slate-800"
            on:click={closeCreateDialog}
          >
            Close
          </button>
        </div>

        <div class="mt-7 grid gap-4 sm:grid-cols-[minmax(0,1fr)_110px]">
          <label class="block">
            <span class="mb-2 block text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Project name</span>
            <input
              class="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700 outline-none transition focus:border-sky-500 focus:ring-4 focus:ring-sky-100"
              bind:value={name}
              placeholder="Product planning"
            />
          </label>

          <label class="block">
            <span class="mb-2 block text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Mark</span>
            <input
              class="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-center text-sm font-semibold uppercase text-slate-700 outline-none transition focus:border-sky-500 focus:ring-4 focus:ring-sky-100"
              bind:value={icon}
              maxlength="2"
              placeholder="PP"
            />
          </label>
        </div>

        <label class="mt-4 block">
          <span class="mb-2 block text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Description</span>
          <textarea
            class="min-h-[8.5rem] w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm leading-6 text-slate-700 outline-none transition focus:border-sky-500 focus:ring-4 focus:ring-sky-100"
            bind:value={description}
            placeholder="Shared specs, execution notes, and ownership live here."
          ></textarea>
        </label>

        <div class="mt-6 flex items-center justify-between gap-4 border-t border-slate-200 pt-5">
          <p class="text-xs leading-5 text-slate-400">
            The project is created with starter pages and opens immediately.
          </p>

          <div class="flex justify-end gap-2">
            <button
              type="button"
              class="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-300"
              on:click={closeCreateDialog}
            >
              Cancel
            </button>
            <button
              type="button"
              class="rounded-full bg-sky-700 px-4 py-2 text-sm font-semibold text-white transition hover:bg-sky-800 disabled:cursor-not-allowed disabled:opacity-60"
              disabled={!name.trim()}
              on:click={handleSubmit}
            >
              Create project
            </button>
          </div>
        </div>
      </div>
    </div>
  {/if}
</div>
