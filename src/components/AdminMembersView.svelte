<script>
  import { createEventDispatcher } from "svelte";
  import { formatFullDate } from "../lib/format.js";

  export let currentUser = null;
  export let memberDirectory = [];
  export let status = null;

  const dispatch = createEventDispatcher();

  let drafts = {};
  let draftSnapshot = "";
  let searchQuery = "";

  function roleLabel(role) {
    return role === "admin" ? "관리자" : "멤버";
  }

  function updateDraft(memberId, patch) {
    drafts = {
      ...drafts,
      [memberId]: {
        ...(drafts[memberId] || {}),
        ...patch
      }
    };
  }

  function payloadFor(member) {
    const draft = drafts[member.id] || {};
    const payload = {};
    const nextName = (draft.name || "").trim();
    const nextPassword = (draft.password || "").trim();

    if (nextName && nextName !== member.name) {
      payload.name = nextName;
    }

    if (draft.role && draft.role !== member.role) {
      payload.role = draft.role;
    }

    if (nextPassword) {
      payload.password = nextPassword;
    }

    return payload;
  }

  function passwordValid(member) {
    const password = (drafts[member.id]?.password || "").trim();
    return password.length === 0 || password.length >= 8;
  }

  function dirty(member) {
    return Object.keys(payloadFor(member)).length > 0;
  }

  function saveMember(member) {
    if (!passwordValid(member)) {
      return;
    }

    const payload = payloadFor(member);

    if (Object.keys(payload).length === 0) {
      return;
    }

    dispatch("updateMember", {
      memberId: member.id,
      payload
    });
  }

  $: nextDraftSnapshot = JSON.stringify(
    memberDirectory.map((member) => [member.id, member.name, member.role, member.canLogin, member.updatedAt])
  );
  $: if (nextDraftSnapshot !== draftSnapshot) {
    draftSnapshot = nextDraftSnapshot;

    const nextDrafts = {};

    for (const member of memberDirectory) {
      const previous = drafts[member.id];
      const signature = `${member.name}:${member.role}:${member.canLogin}:${member.updatedAt}`;

      nextDrafts[member.id] =
        previous?.signature === signature
          ? previous
          : {
              name: member.name,
              password: "",
              role: member.role,
              signature
            };
    }

    drafts = nextDrafts;
  }

  $: filteredMembers = [...memberDirectory]
    .sort((left, right) => {
      if (left.role !== right.role) {
        return left.role === "admin" ? -1 : 1;
      }

      return new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime();
    })
    .filter((member) => {
      const query = searchQuery.trim().toLowerCase();

      if (!query) {
        return true;
      }

      return `${member.name} ${member.email} ${member.role}`.toLowerCase().includes(query);
    });

  $: adminCount = memberDirectory.filter((member) => member.role === "admin").length;
  $: loginEnabledCount = memberDirectory.filter((member) => member.canLogin).length;
  $: statusClass =
    status?.tone === "error"
      ? "border-rose-200 bg-rose-50 text-rose-700"
      : status?.tone === "success"
        ? "border-emerald-200 bg-emerald-50 text-emerald-700"
        : status?.tone === "pending"
          ? "border-sky-200 bg-sky-50 text-sky-700"
          : "border-slate-200 bg-slate-50 text-slate-600";
</script>

<section>
  <div class="flex flex-wrap items-start justify-between gap-5">
    <div>
      <p class="text-[0.72rem] font-semibold uppercase tracking-[0.28em] text-sky-700">Member administration</p>
      <h1 class="mt-4 text-[clamp(2rem,4vw,3.4rem)] font-semibold tracking-[-0.07em] text-slate-950">
        회원 관리
      </h1>
      <p class="mt-4 max-w-3xl text-sm leading-7 text-slate-500 sm:text-base">
        관리자 계정은 여기서 전체 멤버의 역할, 로그인 허용 상태, 이름, 비밀번호 재설정, 탈퇴 처리를 한 번에
        관리할 수 있습니다.
      </p>
    </div>

    <div class="grid min-w-[240px] gap-px bg-slate-200 sm:grid-cols-3 lg:min-w-[360px]">
      <div class="bg-white px-4 py-4">
        <p class="text-[0.72rem] font-semibold uppercase tracking-[0.18em] text-slate-400">Members</p>
        <p class="mt-3 text-3xl font-semibold tracking-[-0.05em] text-slate-950">{memberDirectory.length}</p>
      </div>
      <div class="bg-white px-4 py-4">
        <p class="text-[0.72rem] font-semibold uppercase tracking-[0.18em] text-slate-400">Admins</p>
        <p class="mt-3 text-3xl font-semibold tracking-[-0.05em] text-slate-950">{adminCount}</p>
      </div>
      <div class="bg-white px-4 py-4">
        <p class="text-[0.72rem] font-semibold uppercase tracking-[0.18em] text-slate-400">Login enabled</p>
        <p class="mt-3 text-3xl font-semibold tracking-[-0.05em] text-slate-950">{loginEnabledCount}</p>
      </div>
    </div>
  </div>

  {#if status?.message}
    <p class={`mt-6 border px-4 py-3 text-sm ${statusClass}`}>{status.message}</p>
  {/if}

  {#if currentUser?.role !== "admin"}
    <div class="mt-8 border border-dashed border-slate-300 px-6 py-10 text-center">
      <p class="text-xl font-semibold text-slate-950">관리자 권한이 필요합니다</p>
      <p class="mx-auto mt-3 max-w-xl text-sm leading-7 text-slate-500">
        이 화면은 관리자 계정만 사용할 수 있습니다.
      </p>
    </div>
  {:else}
    <div class="mt-8 border-y border-slate-200/80 px-0 py-5">
      <div class="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p class="text-sm font-semibold text-slate-950">멤버 검색</p>
          <p class="mt-1 text-sm text-slate-500">이름, 이메일, 역할로 빠르게 필터링합니다.</p>
        </div>
        <div class="min-w-[260px] flex-1 sm:max-w-[360px]">
          <input
            class="w-full border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 outline-none transition placeholder:text-slate-300 focus:border-sky-500"
            bind:value={searchQuery}
            placeholder="예: admin, member, user@team.com"
          />
        </div>
      </div>
    </div>

    {#if filteredMembers.length > 0}
      <div class="mt-6 divide-y divide-slate-200 border-t border-slate-200">
        {#each filteredMembers as member}
          <article class="px-0 py-5">
            <div class="flex flex-wrap items-start justify-between gap-4">
              <div class="min-w-0">
                <div class="flex flex-wrap items-center gap-2">
                  <h2 class="truncate text-lg font-semibold text-slate-950">{member.name}</h2>
                  <span class="border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-600">
                    {roleLabel(member.role)}
                  </span>
                  <span
                    class={`border px-3 py-1 text-xs font-semibold ${
                      member.canLogin
                        ? "border border-emerald-200 bg-emerald-50 text-emerald-700"
                        : "border border-amber-200 bg-amber-50 text-amber-700"
                    }`}
                  >
                    {member.canLogin ? "로그인 허용" : "로그인 차단"}
                  </span>
                  {#if currentUser?.id === member.id}
                    <span class="border border-sky-200 bg-sky-50 px-3 py-1 text-xs font-semibold text-sky-700">
                      현재 계정
                    </span>
                  {/if}
                </div>

                <p class="mt-2 text-sm text-slate-500">{member.email}</p>
              </div>

              <div class="text-right text-xs leading-5 text-slate-400">
                <p>가입일 {formatFullDate(member.createdAt)}</p>
                <p class="mt-1">최근 변경 {formatFullDate(member.updatedAt)}</p>
              </div>
            </div>

            <div class="mt-5 grid gap-4 lg:grid-cols-[minmax(0,1fr)_200px]">
              <label class="block">
                <span class="mb-2 block text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Display name</span>
                <input
                  class="w-full border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 outline-none transition focus:border-sky-500"
                  value={drafts[member.id]?.name || member.name}
                  on:input={(event) => updateDraft(member.id, { name: event.currentTarget.value })}
                />
              </label>

              <label class="block">
                <span class="mb-2 block text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Role</span>
                <select
                  class="w-full border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 outline-none transition focus:border-sky-500"
                  value={drafts[member.id]?.role || member.role}
                  on:change={(event) => updateDraft(member.id, { role: event.currentTarget.value })}
                >
                  <option value="member">member</option>
                  <option value="admin">admin</option>
                </select>
              </label>
            </div>

            <div class="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto]">
              <label class="block">
                <span class="mb-2 block text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Password reset</span>
                <input
                  type="password"
                  class="w-full border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 outline-none transition placeholder:text-slate-300 focus:border-sky-500"
                  placeholder="비워두면 변경하지 않음"
                  value={drafts[member.id]?.password || ""}
                  on:input={(event) => updateDraft(member.id, { password: event.currentTarget.value })}
                />
                {#if (drafts[member.id]?.password || "").trim() && !passwordValid(member)}
                  <p class="mt-2 text-xs text-rose-600">비밀번호는 8자 이상이어야 합니다.</p>
                {/if}
              </label>

              <div class="flex flex-wrap items-end gap-2">
                <button
                  type="button"
                  class="border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-sky-300 hover:text-sky-700"
                  on:click={() =>
                    dispatch("updateMember", {
                      memberId: member.id,
                      payload: { canLogin: !member.canLogin }
                    })}
                >
                  {member.canLogin ? "로그인 차단" : "로그인 허용"}
                </button>

                <button
                  type="button"
                  disabled={!dirty(member) || !passwordValid(member)}
                  class="bg-sky-700 px-4 py-2 text-sm font-semibold text-white transition hover:bg-sky-800 disabled:cursor-not-allowed disabled:bg-slate-300"
                  on:click={() => saveMember(member)}
                >
                  저장
                </button>

                {#if currentUser?.id !== member.id}
                  <button
                    type="button"
                    class="border border-rose-200 px-4 py-2 text-sm font-semibold text-rose-700 transition hover:bg-rose-50"
                    on:click={() => dispatch("deleteMember", member.id)}
                  >
                    탈퇴 처리
                  </button>
                {/if}
              </div>
            </div>
          </article>
        {/each}
      </div>
    {:else}
      <div class="mt-6 border border-dashed border-slate-300 px-6 py-10 text-center">
        <p class="text-lg font-semibold text-slate-950">검색 결과가 없습니다</p>
        <p class="mt-2 text-sm leading-6 text-slate-500">다른 이름이나 이메일로 다시 검색해 보세요.</p>
      </div>
    {/if}
  {/if}
</section>
