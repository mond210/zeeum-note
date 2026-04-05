<svelte:head>
  <title>{headTitle}</title>
</svelte:head>

<script>
  import AccountMenu from "./components/AccountMenu.svelte";
  import { onMount } from "svelte";
  import AdminConsoleView from "./components/AdminConsoleView.svelte";
  import LandingView from "./components/LandingView.svelte";
  import MovePagesDialog from "./components/MovePagesDialog.svelte";
  import PageEditorView from "./components/PageEditorView.svelte";
  import ProjectHomeView from "./components/ProjectHomeView.svelte";
  import ProjectLauncherView from "./components/ProjectLauncherView.svelte";
  import ProjectSettingsView from "./components/ProjectSettingsView.svelte";
  import ProjectSidebar from "./components/ProjectSidebar.svelte";
  import { scrollbarActivity } from "./lib/scrollbar-activity.js";
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

  function handleSelectPage(pageId) {
    appStore.selectPage(pageId);
  }

  function openMoveDialog(pageIds) {
    moveDialogPageIds = Array.isArray(pageIds) ? [...pageIds] : [];
  }

  function closeMoveDialog() {
    moveDialogPageIds = [];
  }

  function pageIconGlyph(value) {
    const map = {
      "book-open": "menu_book",
      "check-square": "checklist",
      "file-text": "description",
      layers: "inventory_2"
    };

    return map[value] || value || "description";
  }

  function handleDeletePages(event) {
    if (window.confirm(`선택한 ${event.detail.pageIds.length}개 항목을 삭제할까요? 하위 페이지도 함께 삭제됩니다.`)) {
      appStore.deletePages(event.detail.pageIds);
    }
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
  $: openEditorPages = $appStore.openPageIds
    .map((pageId) => $appStore.pages.find((page) => page.id === pageId))
    .filter(Boolean);
  $: shellLayoutClass =
    $appStore.route === "page"
      ? "flex min-h-0 flex-1 w-full gap-0"
      : "mx-auto flex max-w-[1280px] gap-6 px-6 pt-6 sm:px-8 sm:pt-8 lg:px-12 lg:pt-8 xl:px-16";
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
    <div class={$appStore.route === "page" ? "flex h-screen flex-col overflow-hidden" : "min-h-screen"}>
      <header class="sticky top-0 z-20 w-full border-b border-slate-200/80 bg-white/88 backdrop-blur-md">
        {#if $appStore.route === "page"}
          <div class="flex h-[3.25rem] min-w-0 w-full items-stretch">
            <div class="scroll-thin flex min-w-0 flex-1 items-stretch overflow-x-auto" use:scrollbarActivity>
              {#each openEditorPages as page}
                <div
                  class={`group flex min-w-0 max-w-[260px] shrink-0 items-center gap-2 border-r border-slate-200/80 px-4 py-2 text-left transition ${
                    $appStore.selectedPageId === page.id
                      ? "bg-white text-slate-950"
                      : "text-slate-500 hover:bg-white/70 hover:text-slate-900"
                  }`}
                >
                  <button
                    type="button"
                    class="flex min-w-0 flex-1 items-center gap-2"
                    aria-current={$appStore.selectedPageId === page.id ? "page" : undefined}
                    on:click={() => appStore.selectPage(page.id)}
                  >
                    <span class="material-symbols-rounded shrink-0 text-[18px] text-slate-500">
                      {pageIconGlyph(page.icon)}
                    </span>
                    <span class="truncate text-sm font-medium">{page.title}</span>
                    {#if $appStore.selectedPageId === page.id && $appStore.pageDirty}
                      <span class="h-2.5 w-2.5 shrink-0 rounded-full bg-sky-500"></span>
                    {/if}
                  </button>
                  <button
                    type="button"
                    class={`grid h-6 w-6 shrink-0 place-items-center rounded-full text-slate-400 transition ${
                      $appStore.selectedPageId === page.id
                        ? "hover:bg-slate-100 hover:text-slate-700"
                        : "hover:bg-slate-200/70 hover:text-slate-700"
                    }`}
                    aria-label={`Close ${page.title}`}
                    on:click={() => appStore.closeOpenPage(page.id)}
                  >
                    <span class="material-symbols-rounded text-[16px]">close</span>
                  </button>
                </div>
              {/each}

              <button
                type="button"
                class="grid h-full w-10 shrink-0 place-items-center border-r border-slate-200/80 text-slate-500 transition hover:bg-white hover:text-slate-900"
                aria-label="Create new root page"
                title="Create new root page"
                on:click={() => appStore.createPage()}
              >
                <span class="material-symbols-rounded text-[18px]">add</span>
              </button>
            </div>
          </div>
        {:else}
          <div class="mx-auto flex min-h-[4.5rem] max-w-[1280px] flex-wrap items-center justify-end gap-4 px-6 py-3 sm:px-8 lg:px-12 xl:px-16">
            <div class="flex min-w-0 items-center gap-3">
              <AccountMenu
                align="right"
                borderlessTrigger={true}
                currentUser={$appStore.currentUser}
                showAdminLink={$appStore.currentUser?.role === "admin"}
                on:logout={() => appStore.logout()}
                on:openAdmin={() => appStore.openAdminConsole("dashboard")}
              />
            </div>
          </div>
        {/if}
      </header>

      <div class={shellLayoutClass}>
        {#if $appStore.route === "page"}
          <aside class="min-h-0 w-[320px] shrink-0">
            <div class="h-full">
              <ProjectSidebar
                currentUser={$appStore.currentUser}
                docked={true}
                pages={$appStore.pages}
                searchQuery={$appStore.searchQuery}
                selectedPageId={$appStore.selectedPageId}
                showAdminLink={$appStore.currentUser?.role === "admin"}
                on:createFolder={(event) => appStore.createFolder(event.detail.parentId)}
                on:createPage={(event) => appStore.createPage(event.detail.parentId)}
                on:deletePages={handleDeletePages}
                on:duplicatePages={(event) => appStore.duplicatePages(event.detail.pageIds)}
                on:movePages={(event) =>
                  appStore.movePages(event.detail.pageIds, event.detail.parentId, event.detail.position)}
                on:aiApplied={() => appStore.refreshActiveProject()}
                on:logout={() => appStore.logout()}
                on:openAdmin={() => appStore.openAdminConsole("dashboard")}
                on:openMoveDialog={(event) => openMoveDialog(event.detail.pageIds)}
                on:renamePage={(event) => appStore.renamePage(event.detail.pageId, event.detail.title)}
                on:search={(event) => appStore.setSearchQuery(event.detail)}
                on:selectPage={(event) => handleSelectPage(event.detail)}
              />
            </div>
          </aside>
        {/if}

        <main class="flex min-h-0 min-w-0 flex-1 flex-col">
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
              on:aiApplied={() => appStore.refreshActiveProject()}
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
