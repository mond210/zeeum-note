<svelte:head>
  <title>{headTitle}</title>
</svelte:head>

<script>
  import { onMount } from "svelte";
  import { fade, fly } from "svelte/transition";
import LandingView from "./components/LandingView.svelte";
import PageEditorView from "./components/PageEditorView.svelte";
  import ProjectHomeView from "./components/ProjectHomeView.svelte";
  import ProjectLauncherView from "./components/ProjectLauncherView.svelte";
  import ProjectSettingsView from "./components/ProjectSettingsView.svelte";
  import ProjectSidebar from "./components/ProjectSidebar.svelte";
  import { appStore } from "./lib/stores/app.js";

  const themeClass = {
    light: "theme-light",
    sepia: "theme-sepia",
    slate: "theme-slate"
  };

  const densityClass = {
    comfortable: "density-comfortable",
    compact: "density-compact"
  };

  let pagesPanelOpen = false;

  function handleGlobalSave(event) {
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s") {
      event.preventDefault();
      appStore.savePage({ force: true });
    }
  }

  function handleBeforeUnload(event) {
    if (!$appStore.pageDirty) {
      return;
    }

    event.preventDefault();
    event.returnValue = "";
  }

  function closePagesPanel() {
    pagesPanelOpen = false;
  }

  onMount(() => {
    appStore.bootstrap();
    window.addEventListener("keydown", handleGlobalSave);
    window.addEventListener("beforeunload", handleBeforeUnload);

    return () => {
      window.removeEventListener("keydown", handleGlobalSave);
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  });

  $: theme = themeClass[$appStore.preferences?.theme] || "theme-light";
  $: density = densityClass[$appStore.preferences?.density] || "density-comfortable";
  $: headTitle =
    $appStore.route === "launcher"
      ? "Projects · zeeum-note"
      : $appStore.route === "page" && $appStore.selectedPage
        ? `${$appStore.selectedPage.title} · ${$appStore.activeProject?.name} · zeeum-note`
        : `${$appStore.activeProject?.name || "zeeum-note"} · zeeum-note`;
</script>

<div class={`min-h-screen ${theme} ${density}`}>
  {#if $appStore.booting}
    <div class="mx-auto grid min-h-screen max-w-[980px] place-items-center px-8 py-10 lg:px-12">
      <div class="text-center">
        <p class="text-[0.72rem] font-semibold uppercase tracking-[0.32em] text-sky-700">zeeum-note</p>
        <h1 class="mt-4 text-5xl font-semibold tracking-[-0.06em] text-slate-950">
          Preparing your projects
        </h1>
        <p class="mx-auto mt-4 max-w-xl text-sm leading-7 text-slate-500">
          Migrating workspace data, building launcher summaries, and restoring the last known navigation state.
        </p>
      </div>
    </div>
  {:else if $appStore.route === "launcher"}
    <ProjectLauncherView
      projects={$appStore.projects}
      recentProjects={$appStore.recentProjects}
      on:createProject={(event) => appStore.createProject(event.detail)}
      on:openProject={(event) =>
        appStore.enterProject(event.detail, {
          route: "project-home"
        })}
    />
  {:else if $appStore.route === "landing" || !$appStore.authenticated}
    <LandingView
      status={$appStore.status}
      on:login={(event) => appStore.login(event.detail)}
      on:signup={(event) => appStore.signup(event.detail)}
    />
  {:else if $appStore.activeProject}
    <div class="min-h-screen">
      <header class="w-full border-b border-slate-200/80 bg-white/88">
        <div class="mx-auto flex min-h-[4.5rem] max-w-[1280px] flex-wrap items-center justify-between gap-4 px-6 py-3 sm:px-8 lg:px-12 xl:px-16">
          <div class="flex min-w-0 items-center gap-4">
            <button
              type="button"
              class="grid h-10 w-10 place-items-center rounded-full border border-slate-200 bg-white text-slate-600 transition hover:border-sky-300 hover:text-sky-700"
              aria-label={pagesPanelOpen ? "Hide pages list" : "Show pages list"}
              title={pagesPanelOpen ? "Hide pages list" : "Show pages list"}
              on:click={() => (pagesPanelOpen = !pagesPanelOpen)}
            >
              <span class="material-symbols-rounded">{pagesPanelOpen ? "left_panel_close" : "left_panel_open"}</span>
            </button>
            <button
              type="button"
              class="text-sm font-semibold text-slate-950 transition hover:text-sky-700"
              on:click={() => appStore.openLauncher()}
            >
              zeeum-note
            </button>
            <span class="text-slate-300">/</span>
            <button
              type="button"
              class="min-w-0 truncate text-sm font-medium text-slate-600 transition hover:text-slate-950"
              on:click={() =>
                appStore.enterProject($appStore.activeProjectId, {
                  markOpened: false,
                  route: "project-home"
                })}
            >
              {$appStore.activeProject.name}
            </button>
          </div>

          <div class="flex items-center gap-4">
            {#if $appStore.route === "page" && $appStore.selectedPage}
              <p class="max-w-[24rem] truncate text-sm text-slate-400">{$appStore.selectedPage.title}</p>
            {/if}
            <span class="text-sm text-slate-500">{$appStore.currentUser?.name}</span>
            <button
              type="button"
              class="rounded-full border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-600 transition hover:border-slate-300 hover:text-slate-950"
              on:click={() => appStore.logout()}
            >
              Log out
            </button>
          </div>
        </div>
      </header>

      <div class="mx-auto flex max-w-[1280px] flex-1 px-6 pt-6 sm:px-8 sm:pt-8 lg:px-12 lg:pt-8 xl:px-16">
        <main class="min-h-0 flex-1">
          {#if $appStore.route === "project-home"}
            <ProjectHomeView
              groups={$appStore.groups}
              pages={$appStore.pages}
              project={$appStore.activeProject}
              on:createPage={() => appStore.createPage()}
              on:openPage={(event) => appStore.selectPage(event.detail)}
              on:openSettings={() =>
                appStore.enterProject($appStore.activeProjectId, {
                  markOpened: false,
                  route: "settings"
                })}
            />
          {:else if $appStore.route === "page"}
            <PageEditorView
              currentUser={$appStore.currentUser}
              loadingPage={$appStore.loadingPage}
              pages={$appStore.pages}
              pageDraft={$appStore.pageDraft}
              project={$appStore.activeProject}
              savingPage={$appStore.savingPage}
              selectedPage={$appStore.selectedPage}
              on:draft={(event) => appStore.updatePageDraft(event.detail)}
            />
          {:else if $appStore.route === "settings"}
            <ProjectSettingsView
              currentUser={$appStore.currentUser}
              groups={$appStore.groups}
              memberDirectory={$appStore.memberDirectory}
              members={$appStore.members}
              pages={$appStore.pages}
              preferences={$appStore.preferences}
              project={$appStore.activeProject}
              on:createGroup={async (event) => {
                await appStore.createGroup(event.detail);
              }}
              on:deleteGroup={(event) => {
                if (window.confirm("이 그룹을 삭제할까요?")) {
                  appStore.deleteGroup(event.detail);
                }
              }}
              on:saveGroup={async (event) => {
                const { groupId, payload } = event.detail;
                await appStore.saveGroup(groupId, payload);
                await appStore.saveGroupMembers(groupId, payload.memberIds);
              }}
              on:savePreferences={(event) => appStore.savePreferences(event.detail)}
              on:saveProject={(event) => appStore.saveProject(event.detail)}
              on:deleteMember={(event) => appStore.deleteMember(event.detail)}
              on:updateMember={(event) =>
                appStore.updateMember(event.detail.memberId, event.detail.payload)}
            />
          {/if}
        </main>
      </div>

      {#if pagesPanelOpen}
        <button
          type="button"
          class="fixed inset-0 z-30 bg-black/35"
          aria-label="Close pages panel"
          on:click={closePagesPanel}
          transition:fade={{ duration: 140 }}
        ></button>

        <div
          class="fixed inset-y-0 left-0 z-40 w-[320px] max-w-[88vw] bg-white shadow-[0_24px_60px_rgba(15,23,42,0.18)]"
          in:fly={{ x: -24, duration: 180 }}
          out:fly={{ x: -24, duration: 140 }}
        >
          <div class="flex h-full min-h-0 flex-col px-4 py-5">
            <ProjectSidebar
              pages={$appStore.pages}
              searchQuery={$appStore.searchQuery}
              selectedPageId={$appStore.selectedPageId}
              on:search={(event) => appStore.setSearchQuery(event.detail)}
              on:selectPage={(event) => {
                closePagesPanel();
                appStore.selectPage(event.detail);
              }}
            />
          </div>
        </div>
      {/if}
    </div>
  {/if}
</div>
