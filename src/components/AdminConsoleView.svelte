<script>
  import AccountMenu from "./AccountMenu.svelte";
  import { createEventDispatcher } from "svelte";
  import AdminAiSettingsView from "./AdminAiSettingsView.svelte";
  import AdminMembersView from "./AdminMembersView.svelte";
  import { formatFileSize, formatFullDate, formatRelativeDate } from "../lib/format.js";

  export let adminConsole = null;
  export let adminSection = "dashboard";
  export let currentUser = null;
  export let loading = false;
  export let status = null;

  const dispatch = createEventDispatcher();

  const sections = [
    { id: "dashboard", label: "Dashboard", icon: "dashboard" },
    { id: "projects", label: "Projects", icon: "folder_open" },
    { id: "files", label: "Files", icon: "folder_data" },
    { id: "members", label: "Members", icon: "group" },
    { id: "ai", label: "AI", icon: "auto_awesome" }
  ];

  $: consoleState = adminConsole || {
    ai: null,
    files: { storeFiles: [], uploads: [] },
    members: [],
    overview: {
      backend: {
        engine: "filesystem",
        label: "JSON file store",
        location: "data/*.json + data/uploads",
        status: "connected"
      },
      recentUploads: [],
      storage: {
        dataBytes: 0,
        totalBytes: 0,
        uploadBytes: 0,
        uploadTypeTotals: { file: 0, image: 0, video: 0 }
      },
      totals: {
        admins: 0,
        files: 0,
        groups: 0,
        members: 0,
        pages: 0,
        projects: 0,
        revisions: 0
      }
    },
    projects: []
  };
  $: overview = consoleState.overview;
  $: storeFiles = consoleState.files?.storeFiles || [];
  $: uploads = consoleState.files?.uploads || [];
  $: members = consoleState.members || [];
  $: projects = consoleState.projects || [];
  $: aiSettings = consoleState.ai || null;
  $: statusClass =
    status?.tone === "error"
      ? "border-rose-200 bg-rose-50 text-rose-700"
      : status?.tone === "success"
        ? "border-emerald-200 bg-emerald-50 text-emerald-700"
        : status?.tone === "pending"
          ? "border-sky-200 bg-sky-50 text-sky-700"
          : "border-slate-200 bg-slate-50 text-slate-600";
</script>

<div class="min-h-screen bg-white">
  <header class="w-full border-b border-slate-200/80 bg-white">
    <div class="mx-auto flex min-h-[4.5rem] max-w-[1280px] flex-wrap items-center justify-between gap-3 px-6 sm:px-8 lg:px-12">
      <div class="flex items-center gap-3">
        <AccountMenu
          currentUser={currentUser}
          showAdminLink={currentUser?.role === "admin"}
          showWorkspaceLink={true}
          on:logout={() => dispatch("logout")}
          on:openAdmin={() => dispatch("navigateSection", "dashboard")}
          on:openWorkspace={() => dispatch("openLauncher")}
        />
        <div>
          <p class="text-sm font-semibold text-slate-950">zeeum-note</p>
          <p class="text-xs text-slate-400">Admin console</p>
        </div>
      </div>

      <p class="hidden text-sm text-slate-400 sm:block">운영 현황, 프로젝트, 파일, 회원을 한곳에서 관리합니다.</p>
    </div>
  </header>

  <main class="mx-auto grid max-w-[1280px] gap-8 px-6 py-8 sm:px-8 lg:grid-cols-[220px_minmax(0,1fr)] lg:px-12">
    <aside class="border-b border-slate-200/80 pb-6 lg:border-b-0 lg:border-r lg:pb-0 lg:pr-8">
      <div class="pb-4">
        <p class="text-[0.72rem] font-semibold uppercase tracking-[0.28em] text-sky-700">Administration</p>
        <h1 class="mt-3 text-[2rem] font-semibold tracking-[-0.06em] text-slate-950">Admin</h1>
        <p class="mt-2 text-sm leading-6 text-slate-500">운영 현황과 관리 메뉴를 단순한 구조로 정리했습니다.</p>
      </div>

      <nav class="space-y-1 border-t border-slate-200/80 pt-4">
        {#each sections as section}
          <button
            type="button"
            class={`flex w-full items-center gap-3 border-l-2 px-3 py-2.5 text-left text-sm transition ${
              adminSection === section.id
                ? "border-slate-950 bg-slate-100 text-slate-950"
                : "border-transparent text-slate-600 hover:bg-slate-50 hover:text-slate-950"
            }`}
            on:click={() => dispatch("navigateSection", section.id)}
          >
            <span class="material-symbols-rounded text-[18px]">{section.icon}</span>
            <span class="font-medium">{section.label}</span>
          </button>
        {/each}
      </nav>
    </aside>

    <section class="min-w-0">
      {#if status?.message}
        <p class={`mb-6 border px-4 py-3 text-sm ${statusClass}`}>{status.message}</p>
      {/if}

      {#if loading}
        <div class="grid min-h-[20rem] place-items-center border border-dashed border-slate-300 px-6 py-10 text-center">
          <div>
            <p class="text-lg font-semibold text-slate-950">관리자 콘솔 불러오는 중</p>
            <p class="mt-2 text-sm leading-6 text-slate-500">대시보드, 프로젝트, 파일, 회원 정보를 동기화하고 있습니다.</p>
          </div>
        </div>
      {:else if adminSection === "dashboard"}
        <div class="space-y-8">
          <section class="border-b border-slate-200/80 pb-6">
            <p class="text-[0.72rem] font-semibold uppercase tracking-[0.28em] text-sky-700">Dashboard</p>
            <div class="mt-4 flex flex-wrap items-start justify-between gap-5">
              <div>
                <h2 class="text-[2.4rem] font-semibold tracking-[-0.06em] text-slate-950">관리자 대시보드</h2>
                <p class="mt-3 max-w-3xl text-sm leading-7 text-slate-500 sm:text-base">
                  현재 저장소 상태, 프로젝트 수, 파일 점유량, 스토리지 백엔드를 한 번에 확인합니다.
                </p>
              </div>
              <div class="border-l border-slate-200 pl-4">
                <p class="text-[0.72rem] font-semibold uppercase tracking-[0.18em] text-slate-400">Connected backend</p>
                <p class="mt-2 text-lg font-semibold text-slate-950">{overview.backend?.label}</p>
                <p class="mt-1 text-sm text-slate-500">{overview.backend?.location}</p>
                <p class="mt-3 text-xs uppercase tracking-[0.18em] text-emerald-700">{overview.backend?.status}</p>
              </div>
            </div>

            <div class="mt-6 grid gap-px bg-slate-200 md:grid-cols-2 xl:grid-cols-4">
              <div class="bg-white px-4 py-4">
                <p class="text-[0.72rem] font-semibold uppercase tracking-[0.18em] text-slate-400">Projects</p>
                <p class="mt-3 text-3xl font-semibold tracking-[-0.05em] text-slate-950">{overview.totals?.projects || 0}</p>
                <p class="mt-2 text-sm text-slate-500">{overview.totals?.pages || 0} pages · {overview.totals?.groups || 0} groups</p>
              </div>
              <div class="bg-white px-4 py-4">
                <p class="text-[0.72rem] font-semibold uppercase tracking-[0.18em] text-slate-400">Members</p>
                <p class="mt-3 text-3xl font-semibold tracking-[-0.05em] text-slate-950">{overview.totals?.members || 0}</p>
                <p class="mt-2 text-sm text-slate-500">{overview.totals?.admins || 0} admins</p>
              </div>
              <div class="bg-white px-4 py-4">
                <p class="text-[0.72rem] font-semibold uppercase tracking-[0.18em] text-slate-400">Storage</p>
                <p class="mt-3 text-3xl font-semibold tracking-[-0.05em] text-slate-950">{formatFileSize(overview.storage?.totalBytes)}</p>
                <p class="mt-2 text-sm text-slate-500">JSON {formatFileSize(overview.storage?.dataBytes)} · Uploads {formatFileSize(overview.storage?.uploadBytes)}</p>
              </div>
              <div class="bg-white px-4 py-4">
                <p class="text-[0.72rem] font-semibold uppercase tracking-[0.18em] text-slate-400">Files</p>
                <p class="mt-3 text-3xl font-semibold tracking-[-0.05em] text-slate-950">{overview.totals?.files || 0}</p>
                <p class="mt-2 text-sm text-slate-500">
                  이미지 {overview.storage?.uploadTypeTotals?.image || 0} · 비디오 {overview.storage?.uploadTypeTotals?.video || 0}
                </p>
              </div>
            </div>
          </section>

          <div class="grid gap-8 xl:grid-cols-[minmax(0,1fr)_360px]">
            <section class="border-t border-slate-200/80 pt-6">
              <div class="flex items-center justify-between gap-4">
                <div>
                  <p class="text-sm font-semibold text-slate-950">데이터 저장 파일</p>
                  <p class="mt-1 text-sm text-slate-500">현재 앱이 직접 읽고 쓰는 JSON 스토어 파일입니다.</p>
                </div>
              </div>

              <div class="mt-5 overflow-x-auto">
                <table class="min-w-full text-sm">
                  <thead class="text-left text-slate-400">
                    <tr>
                      <th class="pb-3 font-semibold">File</th>
                      <th class="pb-3 font-semibold">Size</th>
                      <th class="pb-3 font-semibold">Updated</th>
                    </tr>
                  </thead>
                  <tbody class="divide-y divide-slate-200">
                    {#each storeFiles as file}
                      <tr>
                        <td class="py-3">
                          <p class="font-semibold text-slate-950">{file.name}</p>
                          <p class="mt-1 text-xs text-slate-500">{file.path}</p>
                        </td>
                        <td class="py-3 text-slate-600">{formatFileSize(file.size)}</td>
                        <td class="py-3 text-slate-600">{formatFullDate(file.updatedAt)}</td>
                      </tr>
                    {/each}
                  </tbody>
                </table>
              </div>
            </section>

            <section class="border-t border-slate-200/80 pt-6">
              <div>
                <p class="text-sm font-semibold text-slate-950">최근 업로드</p>
                <p class="mt-1 text-sm text-slate-500">파일 관리자에서 바로 열거나 삭제할 수 있습니다.</p>
              </div>

              {#if overview.recentUploads?.length > 0}
                <div class="mt-5 divide-y divide-slate-200 border-t border-slate-200">
                  {#each overview.recentUploads as upload}
                    <div class="py-4">
                      <div class="flex items-center justify-between gap-3">
                        <p class="truncate text-sm font-semibold text-slate-950">{upload.filename}</p>
                        <span class="border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-600">
                          {upload.type}
                        </span>
                      </div>
                      <p class="mt-2 text-xs text-slate-500">{formatFileSize(upload.size)} · {formatRelativeDate(upload.updatedAt)}</p>
                    </div>
                  {/each}
                </div>
              {:else}
                <p class="mt-5 text-sm text-slate-500">업로드된 파일이 아직 없습니다.</p>
              {/if}
            </section>
          </div>
        </div>
      {:else if adminSection === "projects"}
        <section>
          <div class="border-b border-slate-200/80 pb-6">
            <p class="text-[0.72rem] font-semibold uppercase tracking-[0.28em] text-sky-700">Projects</p>
            <h2 class="mt-4 text-[2.3rem] font-semibold tracking-[-0.06em] text-slate-950">프로젝트 관리자</h2>
            <p class="mt-3 max-w-3xl text-sm leading-7 text-slate-500 sm:text-base">
              전체 프로젝트를 확인하고, 필요한 경우 바로 열거나 관리자 권한으로 정리할 수 있습니다.
            </p>
          </div>

          <div class="mt-6 divide-y divide-slate-200 border-t border-slate-200">
            {#each projects as project}
              <article class="px-0 py-5">
                <div class="flex flex-wrap items-start justify-between gap-4">
                  <div class="min-w-0">
                    <div class="flex flex-wrap items-center gap-3">
                      <div class="grid h-10 w-10 place-items-center bg-slate-900 text-sm font-semibold text-white">
                        {project.icon}
                      </div>
                      <div class="min-w-0">
                        <h3 class="truncate text-lg font-semibold text-slate-950">{project.name}</h3>
                        <p class="mt-1 text-sm text-slate-500">{project.description}</p>
                      </div>
                    </div>
                    <div class="mt-4 flex flex-wrap gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">
                      <span>{project.pageCount} pages</span>
                      <span>{project.groupCount} groups</span>
                      {#if project.homePageTitle}
                        <span>Home {project.homePageTitle}</span>
                      {/if}
                    </div>
                    {#if project.recentPages?.length > 0}
                      <p class="mt-3 text-sm text-slate-500">
                        Recent: {project.recentPages.map((page) => page.title).join(" · ")}
                      </p>
                    {/if}
                  </div>

                  <div class="flex flex-wrap items-center gap-2">
                    <span class="text-xs text-slate-400">{formatFullDate(project.updatedAt)}</span>
                    <button
                      type="button"
                      class="border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-sky-300 hover:text-sky-700"
                      on:click={() => dispatch("openProject", project.id)}
                    >
                      열기
                    </button>
                    <button
                      type="button"
                      class="border border-rose-200 px-4 py-2 text-sm font-semibold text-rose-700 transition hover:bg-rose-50"
                      on:click={() => dispatch("deleteProject", project.id)}
                    >
                      삭제
                    </button>
                  </div>
                </div>
              </article>
            {/each}
          </div>
        </section>
      {:else if adminSection === "files"}
        <div class="space-y-6">
          <section class="border-b border-slate-200/80 pb-6">
            <p class="text-[0.72rem] font-semibold uppercase tracking-[0.28em] text-sky-700">Files</p>
            <h2 class="mt-4 text-[2.3rem] font-semibold tracking-[-0.06em] text-slate-950">파일 관리자</h2>
            <p class="mt-3 max-w-3xl text-sm leading-7 text-slate-500 sm:text-base">
              업로드된 이미지와 비디오를 보고, 용량을 확인하고, 필요 없는 파일을 바로 정리할 수 있습니다.
            </p>
          </section>

          <section class="border-t border-slate-200/80 pt-6">
            <div class="flex flex-wrap items-center justify-between gap-4">
              <div>
                <p class="text-sm font-semibold text-slate-950">업로드 라이브러리</p>
                <p class="mt-1 text-sm text-slate-500">{uploads.length} files · {formatFileSize(overview.storage?.uploadBytes)}</p>
              </div>
            </div>

            {#if uploads.length > 0}
              <div class="mt-5 divide-y divide-slate-200 border-t border-slate-200">
                {#each uploads as upload}
                  <div class="px-0 py-4">
                    <div class="flex flex-wrap items-start justify-between gap-4">
                      <div class="min-w-0">
                        <p class="truncate text-sm font-semibold text-slate-950">{upload.filename}</p>
                        <p class="mt-1 text-xs text-slate-500">{upload.path}</p>
                        <p class="mt-2 text-xs text-slate-500">
                          {upload.type} · {formatFileSize(upload.size)} · {formatFullDate(upload.updatedAt)}
                        </p>
                      </div>

                      <div class="flex flex-wrap gap-2">
                        <a
                          href={upload.url}
                          target="_blank"
                          rel="noreferrer"
                          class="border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-sky-300 hover:text-sky-700"
                        >
                          열기
                        </a>
                        <button
                          type="button"
                          class="border border-rose-200 px-4 py-2 text-sm font-semibold text-rose-700 transition hover:bg-rose-50"
                          on:click={() => dispatch("deleteFile", upload.filename)}
                        >
                          삭제
                        </button>
                      </div>
                    </div>
                  </div>
                {/each}
              </div>
            {:else}
              <p class="mt-5 text-sm text-slate-500">업로드된 파일이 없습니다.</p>
            {/if}
          </section>

          <section class="border-t border-slate-200/80 pt-6">
            <p class="text-sm font-semibold text-slate-950">스토어 파일</p>
            <p class="mt-1 text-sm text-slate-500">앱 데이터 JSON 파일은 여기서 읽기 전용으로 표시합니다.</p>
            <div class="mt-5 overflow-x-auto">
              <table class="min-w-full text-sm">
                <thead class="text-left text-slate-400">
                  <tr>
                    <th class="pb-3 font-semibold">File</th>
                    <th class="pb-3 font-semibold">Size</th>
                    <th class="pb-3 font-semibold">Updated</th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-slate-200">
                  {#each storeFiles as file}
                    <tr>
                      <td class="py-3">
                        <p class="font-semibold text-slate-950">{file.name}</p>
                        <p class="mt-1 text-xs text-slate-500">{file.path}</p>
                      </td>
                      <td class="py-3 text-slate-600">{formatFileSize(file.size)}</td>
                      <td class="py-3 text-slate-600">{formatFullDate(file.updatedAt)}</td>
                    </tr>
                  {/each}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      {:else if adminSection === "members"}
        <AdminMembersView
          currentUser={currentUser}
          memberDirectory={members}
          status={null}
          on:deleteMember={(event) => dispatch("deleteMember", event.detail)}
          on:updateMember={(event) => dispatch("updateMember", event.detail)}
        />
      {:else if adminSection === "ai"}
        <AdminAiSettingsView settings={aiSettings} />
      {/if}
    </section>
  </main>
</div>
