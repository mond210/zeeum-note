<svelte:head>
  <title>{headTitle}</title>
</svelte:head>

<script>
  import AccountMenu from "./components/AccountMenu.svelte";
  import { onMount } from "svelte";
  import { fade, fly } from "svelte/transition";
  import AdminConsoleView from "./components/AdminConsoleView.svelte";
  import LandingView from "./components/LandingView.svelte";
  import MovePagesDialog from "./components/MovePagesDialog.svelte";
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
  let sidebarHidden = false;
  let moveDialogPageIds = [];

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

  function toggleSidebar() {
    if (window.innerWidth >= 1024) {
      sidebarHidden = !sidebarHidden;
      return;
    }

    pagesPanelOpen = !pagesPanelOpen;
  }

  function openMoveDialog(pageIds) {
    moveDialogPageIds = Array.isArray(pageIds) ? [...pageIds] : [];
  }

  function closeMoveDialog() {
    moveDialogPageIds = [];
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
    $appStore.route === "admin"
      ? `Admin · zeeum-note`
      : $appStore.route === "launcher"
      ? "Workspace · zeeum-note"
      : $appStore.route === "page" && $appStore.selectedPage
        ? `${$appStore.selectedPage.title} · zeeum-note`
        : `zeeum-note`;
</script>

<div
  class={`min-h-screen ${theme} ${density}`}
  data-move-dialog-open={moveDialogPageIds.length > 0 ? "true" : "false"}
>
  {#if $appStore.booting}
    <div class="mx-auto grid min-h-screen max-w-[980px] place-items-center px-8 py-10 lg:px-12">
      <div class="text-center">
        <p class="text-[0.72rem] font-semibold uppercase tracking-[0.32em] text-sky-700">zeeum-note</p>
        <h1 class="mt-4 text-5xl font-semibold tracking-[-0.06em] text-slate-950">
          Preparing your workspace
        </h1>
        <p class="mx-auto mt-4 max-w-xl text-sm leading-7 text-slate-500">
          Restoring pages, syncing your workspace data, and preparing the editor shell.
        </p>
      </div>
    </div>
  {:else if $appStore.route === "launcher"}
    <ProjectLauncherView
      currentUser={$appStore.currentUser}
      projects={$appStore.projects}
      recentProjects={$appStore.recentProjects}
      on:createProject={(event) => appStore.createProject(event.detail)}
      on:openProject={(event) =>
        appStore.enterProject(event.detail, {
          route: "page"
        })}
      on:openAdminConsole={() => appStore.openAdminConsole("dashboard")}
      on:logout={() => appStore.logout()}
    />
  {:else if $appStore.route === "landing" || !$appStore.authenticated}
    <LandingView
      status={$appStore.status}
      on:login={(event) => appStore.login(event.detail)}
      on:signup={(event) => appStore.signup(event.detail)}
    />
  {:else if $appStore.route === "admin"}
    <AdminConsoleView
      adminConsole={$appStore.adminConsole}
      adminSection={$appStore.adminSection}
      currentUser={$appStore.currentUser}
      loading={$appStore.adminLoading}
      status={$appStore.status}
      on:deleteMember={(event) => {
        if (window.confirm("이 계정을 탈퇴 처리할까요? 이 작업은 되돌릴 수 없습니다.")) {
          appStore.deleteMember(event.detail);
        }
      }}
      on:deleteFile={(event) => {
        if (window.confirm("이 파일을 삭제할까요? 문서 안의 참조는 자동으로 정리되지 않습니다.")) {
          appStore.deleteUpload(event.detail);
        }
      }}
      on:deleteProject={(event) => {
        if (window.confirm("이 프로젝트를 삭제할까요? 페이지, 그룹, 리비전도 함께 제거됩니다.")) {
          appStore.deleteProjectAsAdmin(event.detail);
        }
      }}
      on:logout={() => appStore.logout()}
      on:openLauncher={() => appStore.openLauncher()}
      on:openProject={(event) =>
        appStore.enterProject(event.detail, {
          route: "page"
        })}
      on:navigateSection={(event) => appStore.openAdminConsole(event.detail)}
      on:updateMember={(event) =>
        appStore.updateMember(event.detail.memberId, event.detail.payload)}
    />
  {:else if $appStore.activeProject}
    <div class="min-h-screen">
      <header class="sticky top-0 z-20 w-full border-b border-slate-200/80 bg-white/88 backdrop-blur-md">
        <div class="mx-auto flex min-h-[4.5rem] max-w-[1280px] flex-wrap items-center justify-between gap-4 px-6 py-3 sm:px-8 lg:px-12 xl:px-16">
          <div class="flex min-w-0 items-center gap-3">
            <button
              type="button"
              class="grid h-10 w-10 place-items-center rounded-full border border-slate-200 bg-white text-slate-600 transition hover:border-sky-300 hover:text-sky-700"
              aria-label={pagesPanelOpen || !sidebarHidden ? "Hide files" : "Show files"}
              title={pagesPanelOpen || !sidebarHidden ? "Hide files" : "Show files"}
              on:click={toggleSidebar}
            >
              <span class="material-symbols-rounded">
                {pagesPanelOpen || !sidebarHidden ? "left_panel_close" : "left_panel_open"}
              </span>
            </button>
            <button
              type="button"
              class="text-sm font-semibold text-slate-950 transition hover:text-sky-700"
              on:click={() => appStore.openLauncher()}
            >
              zeeum-note
            </button>
          </div>

          <div class="flex min-w-0 items-center gap-3">
            <AccountMenu
              align="right"
              currentUser={$appStore.currentUser}
              showAdminLink={$appStore.currentUser?.role === "admin"}
              on:logout={() => appStore.logout()}
              on:openAdmin={() => appStore.openAdminConsole("dashboard")}
            />
          </div>
        </div>
      </header>

      <div class="mx-auto flex max-w-[1280px] gap-6 px-6 pt-6 sm:px-8 sm:pt-8 lg:px-12 lg:pt-8 xl:px-16">
        <aside class={`${sidebarHidden ? "hidden" : "hidden lg:block"} min-h-0 w-[320px] shrink-0`}>
          <div class="sticky top-[6.25rem]">
            <ProjectSidebar
              pages={$appStore.pages}
              searchQuery={$appStore.searchQuery}
              selectedPageId={$appStore.selectedPageId}
              on:createFolder={(event) => appStore.createFolder(event.detail.parentId)}
              on:createPage={(event) => appStore.createPage(event.detail.parentId)}
              on:deletePages={(event) => {
                if (window.confirm(`선택한 ${event.detail.pageIds.length}개 항목을 삭제할까요? 하위 페이지도 함께 삭제됩니다.`)) {
                  appStore.deletePages(event.detail.pageIds);
                }
              }}
              on:duplicatePages={(event) => appStore.duplicatePages(event.detail.pageIds)}
              on:movePages={(event) =>
                appStore.movePages(event.detail.pageIds, event.detail.parentId, event.detail.position)}
              on:openMoveDialog={(event) => openMoveDialog(event.detail.pageIds)}
              on:renamePage={(event) => appStore.renamePage(event.detail.pageId, event.detail.title)}
              on:search={(event) => appStore.setSearchQuery(event.detail)}
              on:selectPage={(event) => appStore.selectPage(event.detail)}
              on:toggleSidebar={() => {
                sidebarHidden = true;
              }}
            />
          </div>
        </aside>

        <main class="min-h-0 min-w-0 flex-1">
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
              on:createPage={(event) => appStore.createPage(event.detail)}
              on:deletePage={(event) => {
                if (window.confirm("이 페이지를 삭제할까요? 하위 페이지도 함께 삭제됩니다.")) {
                  appStore.deletePage(event.detail);
                }
              }}
              on:draft={(event) => appStore.updatePageDraft(event.detail)}
            />
          {:else if $appStore.route === "settings"}
            <ProjectSettingsView
              currentUser={$appStore.currentUser}
              groups={$appStore.groups}
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
              on:openAdminConsole={() => appStore.openAdminConsole("members")}
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
              on:createFolder={(event) => appStore.createFolder(event.detail.parentId)}
              on:createPage={(event) => appStore.createPage(event.detail.parentId)}
              on:deletePages={(event) => {
                if (window.confirm(`선택한 ${event.detail.pageIds.length}개 항목을 삭제할까요? 하위 페이지도 함께 삭제됩니다.`)) {
                  closePagesPanel();
                  appStore.deletePages(event.detail.pageIds);
                }
              }}
              on:duplicatePages={(event) => appStore.duplicatePages(event.detail.pageIds)}
              on:movePages={(event) =>
                appStore.movePages(event.detail.pageIds, event.detail.parentId, event.detail.position)}
              on:openMoveDialog={(event) => openMoveDialog(event.detail.pageIds)}
              on:renamePage={(event) => appStore.renamePage(event.detail.pageId, event.detail.title)}
              on:search={(event) => appStore.setSearchQuery(event.detail)}
              on:selectPage={(event) => {
                closePagesPanel();
                appStore.selectPage(event.detail);
              }}
              on:toggleSidebar={closePagesPanel}
            />
          </div>
        </div>
      {/if}

      {#if moveDialogPageIds.length > 0}
        <MovePagesDialog
          pageIds={moveDialogPageIds}
          pages={$appStore.pages}
          on:close={closeMoveDialog}
          on:submit={(event) => {
            closeMoveDialog();
            appStore.movePages(event.detail.pageIds, event.detail.parentId);
          }}
        />
      {/if}
    </div>
  {/if}
</div>
