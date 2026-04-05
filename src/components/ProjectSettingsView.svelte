<script>
  import { createEventDispatcher } from "svelte";
  import { colorClass } from "../lib/format.js";

export let groups = [];
export let currentUser = null;
export let members = [];
export let pages = [];
export let preferences = null;
export let project = null;

  const dispatch = createEventDispatcher();

  const sections = [
    { id: "general", label: "General", icon: "tune" },
    { id: "preferences", label: "Preferences", icon: "palette" },
    { id: "groups", label: "Groups", icon: "groups" },
    { id: "members", label: "Members", icon: "person" }
  ];

  let activeSection = "general";

  let icon = "";
  let description = "";
  let homePageId = "";
  let name = "";
  let projectSnapshot = "";

  let density = "comfortable";
  let theme = "light";
  let preferencesSnapshot = "";

  let color = "cyan";
  let groupDescription = "";
  let groupName = "";
  let memberIds = [];
  let selectedGroupId = "";
  let groupSnapshot = "";
  let groupCountSnapshot = 0;

  $: nextProjectSnapshot = project
    ? `${project.name}:${project.description}:${project.homePageId || ""}:${project.icon || ""}`
    : "";
  $: if (project && nextProjectSnapshot !== projectSnapshot) {
    projectSnapshot = nextProjectSnapshot;
    icon = project.icon || "";
    description = project.description || "";
    homePageId = project.homePageId || "";
    name = project.name || "";
  }

  $: nextPreferencesSnapshot = preferences
    ? `${preferences.theme}:${preferences.density}`
    : "";
  $: if (preferences && nextPreferencesSnapshot !== preferencesSnapshot) {
    preferencesSnapshot = nextPreferencesSnapshot;
    density = preferences.density;
    theme = preferences.theme;
  }

  $: if (!selectedGroupId && groups.length > 0) {
    selectedGroupId = groups[0].id;
  }

  $: if (groups.length !== groupCountSnapshot) {
    if (groupCountSnapshot > 0 && groups.length > groupCountSnapshot) {
      selectedGroupId = groups[groups.length - 1]?.id || selectedGroupId;
    } else if (!groups.some((group) => group.id === selectedGroupId)) {
      selectedGroupId = groups[0]?.id || "";
    }

    groupCountSnapshot = groups.length;
  }

  $: selectedGroup = groups.find((group) => group.id === selectedGroupId) || null;
  $: nextGroupSnapshot = selectedGroup
    ? `${selectedGroup.id}:${selectedGroup.name}:${selectedGroup.description}:${selectedGroup.color}:${selectedGroup.memberIds.join(",")}`
    : "";
  $: if (selectedGroup && nextGroupSnapshot !== groupSnapshot) {
    groupSnapshot = nextGroupSnapshot;
    color = selectedGroup.color;
    groupDescription = selectedGroup.description;
    groupName = selectedGroup.name;
    memberIds = [...selectedGroup.memberIds];
  }

  function toggleMember(memberId) {
    memberIds = memberIds.includes(memberId)
      ? memberIds.filter((entry) => entry !== memberId)
      : [...memberIds, memberId];
  }

  function handleCreateGroup() {
    dispatch("createGroup", {
      color: "cyan",
      description: "Describe the purpose of this group.",
      memberIds: ["member-owner"],
      name: "New group"
    });
  }
</script>

<section class="grid gap-10 xl:grid-cols-[220px_minmax(0,1fr)]">
  <aside class="border-r border-slate-200/80 pr-5">
    <div class="px-2 pb-5">
      <p class="text-[0.72rem] font-semibold uppercase tracking-[0.28em] text-sky-700">Settings</p>
      <h1 class="mt-3 text-[2rem] font-semibold tracking-[-0.06em] text-slate-950">
        {project?.name}
      </h1>
    </div>

    <nav class="space-y-1">
      {#each sections as section}
        <button
          type="button"
          class={`flex w-full items-center gap-3 border-l-2 px-3 py-2.5 text-left text-sm transition ${
            activeSection === section.id
              ? "border-sky-600 bg-slate-50 text-slate-950"
              : "border-transparent text-slate-600 hover:bg-slate-50 hover:text-slate-950"
          }`}
          on:click={() => (activeSection = section.id)}
        >
          <span class="material-symbols-rounded text-[18px]">{section.icon}</span>
          <span class="font-medium">{section.label}</span>
        </button>
      {/each}
    </nav>
  </aside>

  <div class="min-w-0">
    {#if activeSection === "general"}
      <section>
        <div class="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p class="text-[0.72rem] font-semibold uppercase tracking-[0.28em] text-sky-700">General</p>
            <h2 class="mt-3 text-[2.2rem] font-semibold tracking-[-0.06em] text-slate-950">
              Project details
            </h2>
            <p class="mt-3 max-w-2xl text-sm leading-7 text-slate-500">
              Edit the basic identity of this project and choose the page that should represent it by default.
            </p>
          </div>

          <button
            type="button"
            class="rounded-full bg-sky-700 px-4 py-2 text-sm font-semibold text-white transition hover:bg-sky-800"
            on:click={() =>
              dispatch("saveProject", {
                description,
                homePageId: homePageId || null,
                icon,
                name
              })}
          >
            Save
          </button>
        </div>

        <div class="mt-8 grid gap-5 md:grid-cols-[minmax(0,1fr)_120px]">
          <label class="block">
            <span class="mb-2 block text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Project name</span>
            <input
              class="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700 outline-none transition focus:border-sky-500 focus:ring-4 focus:ring-sky-100"
              bind:value={name}
            />
          </label>

          <label class="block">
            <span class="mb-2 block text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Mark</span>
            <input
              class="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-center text-sm font-semibold uppercase text-slate-700 outline-none transition focus:border-sky-500 focus:ring-4 focus:ring-sky-100"
              bind:value={icon}
              maxlength="2"
            />
          </label>
        </div>

        <label class="mt-5 block">
          <span class="mb-2 block text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Description</span>
          <textarea
            class="min-h-[10rem] w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm leading-6 text-slate-700 outline-none transition focus:border-sky-500 focus:ring-4 focus:ring-sky-100"
            bind:value={description}
          ></textarea>
        </label>

        <label class="mt-5 block">
          <span class="mb-2 block text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Default page</span>
          <select
            class="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700 outline-none transition focus:border-sky-500 focus:ring-4 focus:ring-sky-100"
            bind:value={homePageId}
          >
            <option value="">No default page</option>
            {#each pages as page}
              <option value={page.id}>{page.title}</option>
            {/each}
          </select>
        </label>
      </section>
    {:else if activeSection === "preferences"}
      <section>
        <div class="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p class="text-[0.72rem] font-semibold uppercase tracking-[0.28em] text-sky-700">Preferences</p>
            <h2 class="mt-3 text-[2.2rem] font-semibold tracking-[-0.06em] text-slate-950">
              Appearance and behavior
            </h2>
            <p class="mt-3 max-w-2xl text-sm leading-7 text-slate-500">
              Control how the project shell looks and whether the editor shows the right-side inspector.
            </p>
          </div>

          <button
            type="button"
            class="rounded-full bg-sky-700 px-4 py-2 text-sm font-semibold text-white transition hover:bg-sky-800"
            on:click={() =>
            dispatch("savePreferences", {
              density,
              theme
            })}
          >
            Save
          </button>
        </div>

        <div class="mt-8 grid gap-5 md:grid-cols-2">
          <label class="block">
            <span class="mb-2 block text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Theme</span>
            <select
              class="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700 outline-none transition focus:border-sky-500 focus:ring-4 focus:ring-sky-100"
              bind:value={theme}
            >
              <option value="light">light</option>
              <option value="sepia">sepia</option>
              <option value="slate">slate</option>
            </select>
          </label>

          <label class="block">
            <span class="mb-2 block text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Density</span>
            <select
              class="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700 outline-none transition focus:border-sky-500 focus:ring-4 focus:ring-sky-100"
              bind:value={density}
            >
              <option value="comfortable">comfortable</option>
              <option value="compact">compact</option>
            </select>
          </label>
        </div>

      </section>
    {:else if activeSection === "groups"}
      <section>
        <div class="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p class="text-[0.72rem] font-semibold uppercase tracking-[0.28em] text-sky-700">Groups</p>
            <h2 class="mt-3 text-[2.2rem] font-semibold tracking-[-0.06em] text-slate-950">
              Ownership groups
            </h2>
            <p class="mt-3 max-w-2xl text-sm leading-7 text-slate-500">
              Organize people by responsibility and keep project ownership editable from one place.
            </p>
          </div>

          <button
            type="button"
            class="rounded-full bg-slate-950 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800"
            on:click={handleCreateGroup}
          >
            New group
          </button>
        </div>

        <div class="mt-8 grid gap-6 lg:grid-cols-[240px_minmax(0,1fr)]">
          <div class="divide-y divide-slate-200 border-r border-slate-200/80 pr-5">
            {#each groups as group}
              <button
                type="button"
                class={`w-full border-l-2 px-3 py-4 text-left transition ${
                  group.id === selectedGroupId
                    ? "border-sky-600 bg-slate-50"
                    : "border-transparent hover:bg-slate-50"
                }`}
                on:click={() => (selectedGroupId = group.id)}
              >
                <div class="flex items-center justify-between gap-3">
                  <p class="truncate text-sm font-semibold text-slate-900">{group.name}</p>
                  <span class={`rounded-full px-2 py-1 text-[0.7rem] font-semibold ring-1 ${colorClass(group.color)}`}>
                    {group.color}
                  </span>
                </div>
                <p class="mt-2 line-clamp-2 text-xs leading-5 text-slate-500">{group.description}</p>
              </button>
            {/each}
          </div>

          <div>
            {#if selectedGroup}
              <div class="space-y-5">
                <label class="block">
                  <span class="mb-2 block text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Name</span>
                  <input
                    class="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700 outline-none transition focus:border-sky-500 focus:ring-4 focus:ring-sky-100"
                    bind:value={groupName}
                  />
                </label>

                <label class="block">
                  <span class="mb-2 block text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Description</span>
                  <textarea
                    class="min-h-[9rem] w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm leading-6 text-slate-700 outline-none transition focus:border-sky-500 focus:ring-4 focus:ring-sky-100"
                    bind:value={groupDescription}
                  ></textarea>
                </label>

                <label class="block">
                  <span class="mb-2 block text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Color</span>
                  <select
                    class="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700 outline-none transition focus:border-sky-500 focus:ring-4 focus:ring-sky-100"
                    bind:value={color}
                  >
                    <option value="cyan">cyan</option>
                    <option value="emerald">emerald</option>
                    <option value="amber">amber</option>
                    <option value="orange">orange</option>
                    <option value="violet">violet</option>
                    <option value="rose">rose</option>
                  </select>
                </label>

                <div>
                  <p class="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Members</p>
                  <div class="space-y-2">
                    {#each members as member}
                      <label class="flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                        <input type="checkbox" checked={memberIds.includes(member.id)} on:change={() => toggleMember(member.id)} />
                        <div>
                          <p class="text-sm font-semibold text-slate-900">{member.name}</p>
                          <p class="text-xs text-slate-500">{member.role} · {member.email}</p>
                        </div>
                      </label>
                    {/each}
                  </div>
                </div>

                <div class="flex flex-wrap gap-2">
                  <button
                    type="button"
                    class="rounded-full border border-rose-200 bg-rose-50 px-4 py-2 text-sm font-semibold text-rose-700 transition hover:-translate-y-0.5"
                    on:click={() => dispatch("deleteGroup", selectedGroup.id)}
                  >
                    Delete
                  </button>
                  <button
                    type="button"
                    class="rounded-full bg-sky-700 px-4 py-2 text-sm font-semibold text-white transition hover:bg-sky-800"
                    on:click={() =>
                      dispatch("saveGroup", {
                        groupId: selectedGroup.id,
                        payload: {
                          color,
                          description: groupDescription,
                          memberIds,
                          name: groupName
                        }
                      })}
                  >
                    Save
                  </button>
                </div>
              </div>
            {:else}
              <div class="grid min-h-[18rem] place-items-center border border-dashed border-slate-300 bg-slate-50 px-6 py-8 text-center">
                <div>
                  <p class="text-lg font-semibold text-slate-950">No group selected</p>
                  <p class="mt-2 text-sm leading-6 text-slate-500">Create a group to define ownership inside this project.</p>
                </div>
              </div>
            {/if}
          </div>
        </div>
      </section>
    {:else if activeSection === "members"}
      <section>
        <div class="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p class="text-[0.72rem] font-semibold uppercase tracking-[0.28em] text-sky-700">Members</p>
            <h2 class="mt-3 text-[2.2rem] font-semibold tracking-[-0.06em] text-slate-950">
              Workspace members
            </h2>
            <p class="mt-3 max-w-2xl text-sm leading-7 text-slate-500">
              프로젝트 설정에서는 멤버 현황만 요약하고, 실제 역할 변경과 계정 관리는 전용 관리자 페이지에서 처리합니다.
            </p>
          </div>
        </div>

        <div class="mt-8 grid gap-4 lg:grid-cols-[minmax(0,1fr)_280px]">
          <div class="rounded-[1.5rem] border border-slate-200/80 bg-white px-5 py-5 shadow-[0_14px_36px_rgba(15,23,42,0.05)]">
            <div class="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p class="text-sm font-semibold text-slate-950">현재 멤버</p>
                <p class="mt-2 text-sm leading-6 text-slate-500">
                  전체 워크스페이스 계정을 전용 관리자 페이지에서 관리할 수 있습니다.
                </p>
              </div>

              {#if currentUser?.role === "admin"}
                <button
                  type="button"
                  class="rounded-full bg-sky-700 px-4 py-2 text-sm font-semibold text-white transition hover:bg-sky-800"
                  on:click={() => dispatch("openAdminConsole")}
                >
                  관리자 페이지 열기
                </button>
              {/if}
            </div>

            <div class="mt-6 divide-y divide-slate-200">
              {#each members as member}
                <div class="flex items-center justify-between gap-3 py-3">
                  <div class="min-w-0">
                    <p class="truncate text-sm font-semibold text-slate-950">{member.name}</p>
                    <p class="truncate text-xs text-slate-500">{member.email}</p>
                  </div>
                  <span class="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-600">
                    {member.role}
                  </span>
                </div>
              {/each}
            </div>
          </div>

          <div class="rounded-[1.5rem] border border-slate-200/80 bg-slate-50 px-5 py-5">
            <p class="text-sm font-semibold text-slate-950">관리자 전용 기능</p>
            <ul class="mt-4 space-y-3 text-sm leading-6 text-slate-500">
              <li>Role 변경</li>
              <li>로그인 허용 및 차단</li>
              <li>이름 수정과 비밀번호 재설정</li>
              <li>회원 탈퇴 처리</li>
            </ul>
            {#if currentUser?.role !== "admin"}
              <p class="mt-4 text-xs leading-5 text-slate-400">현재 계정은 읽기 전용으로 멤버 현황만 볼 수 있습니다.</p>
            {/if}
          </div>
        </div>
      </section>
    {/if}
  </div>
</section>
