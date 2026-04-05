<script>
  import { createEventDispatcher } from "svelte";

  export let status = null;

  const dispatch = createEventDispatcher();

  let signupEmail = "";
  let signupName = "";
  let signupPassword = "";
  let loginEmail = "";
  let loginPassword = "";
  let mode = "login";

  $: canLogin = loginEmail.trim() && loginPassword.trim();
  $: canSignup = signupName.trim() && signupEmail.trim() && signupPassword.trim();
  $: statusClass =
    status?.tone === "error"
      ? "text-rose-700"
      : status?.tone === "success"
        ? "text-emerald-700"
        : status?.tone === "pending"
          ? "text-sky-700"
          : "text-slate-500";

  function submitLogin() {
    if (!canLogin) {
      return;
    }

    dispatch("login", { email: loginEmail, password: loginPassword });
  }

  function submitSignup() {
    if (!canSignup) {
      return;
    }

    dispatch("signup", {
      email: signupEmail,
      name: signupName,
      password: signupPassword
    });
  }
</script>

<div class="min-h-screen bg-white">
  <main class="mx-auto grid max-w-[1280px] gap-12 px-6 py-12 sm:px-8 lg:grid-cols-[minmax(0,1fr)_420px] lg:px-12 lg:py-16">
    <section class="min-w-0">
      <div class="flex items-center gap-3">
        <div class="grid h-9 w-9 place-items-center bg-slate-950 text-xs font-semibold text-white">
          ZE
        </div>
        <div>
          <p class="text-sm font-semibold text-slate-950">zeeum-note</p>
          <p class="text-xs text-slate-400">Collaborative workspace</p>
        </div>
      </div>

      <p class="mt-8 text-[0.72rem] font-semibold uppercase tracking-[0.28em] text-sky-700">Collaborative notes</p>
      <h1 class="mt-5 max-w-4xl text-[clamp(2.8rem,6vw,5rem)] font-semibold tracking-[-0.08em] text-slate-950">
        여러 사람이 함께 쓰는 노트를 더 단정하게 이어갑니다.
      </h1>
      <p class="mt-5 max-w-3xl text-base leading-8 text-slate-500 sm:text-[1.05rem]">
        페이지를 빠르게 열고, 수정하고, 공유할 수 있는 작업 공간입니다. 문서 구조는 왼쪽에서 정리하고,
        편집은 중앙에서 바로 이어갈 수 있도록 화면을 단순하게 유지했습니다.
      </p>

      <div class="mt-10 grid gap-6 border-t border-slate-200/80 pt-6 sm:grid-cols-3">
        <div>
          <p class="text-sm font-semibold text-slate-950">실시간 편집</p>
          <p class="mt-2 text-sm leading-6 text-slate-500">
            여러 사람이 같은 페이지를 열어도 흐름이 끊기지 않게 편집 상태를 유지합니다.
          </p>
        </div>
        <div>
          <p class="text-sm font-semibold text-slate-950">파일 중심 탐색</p>
          <p class="mt-2 text-sm leading-6 text-slate-500">
            페이지와 폴더를 트리로 정리하고 필요한 문서를 바로 찾아 들어갈 수 있습니다.
          </p>
        </div>
        <div>
          <p class="text-sm font-semibold text-slate-950">히스토리 복기</p>
          <p class="mt-2 text-sm leading-6 text-slate-500">
            최근 변경 이력을 확인하면서 문서 맥락을 다시 따라갈 수 있습니다.
          </p>
        </div>
      </div>

      <div class="mt-10 border-t border-slate-200/80 pt-6">
        <p class="text-sm font-semibold text-slate-950">현재 워크플로우</p>
        <p class="mt-3 max-w-3xl text-sm leading-7 text-slate-500">
          로그인하면 바로 마지막 작업 흐름으로 들어가고, 페이지 에디터 안에서 파일 트리와 탭을 오가며 문서를 수정할 수 있습니다.
          화면 장식보다 탐색과 편집 속도를 우선하는 방향으로 맞췄습니다.
        </p>
      </div>
    </section>

    <aside class="border-t border-slate-200/80 pt-8 lg:border-t-0 lg:border-l lg:pl-10 lg:pt-0">
      <div>
        <p class="text-[0.72rem] font-semibold uppercase tracking-[0.18em] text-sky-700">Workspace access</p>
        <h2 class="mt-3 text-[2rem] font-semibold tracking-[-0.06em] text-slate-950">
          {mode === "login" ? "작업을 이어서 시작하세요" : "새 계정을 만드세요"}
        </h2>
        <p class="mt-3 text-sm leading-7 text-slate-500">
          {mode === "login"
            ? "계정으로 로그인하면 마지막 작업 페이지로 바로 이동합니다."
            : "새 계정을 만든 뒤 바로 워크스페이스에서 페이지 작업을 시작할 수 있습니다."}
        </p>
      </div>

      <div class="mt-6 flex items-center gap-2 border-b border-slate-200 pb-3">
        <button
          type="button"
          class={`px-0 py-2 text-sm font-semibold transition ${
            mode === "login" ? "text-slate-950" : "text-slate-400"
          }`}
          on:click={() => (mode = "login")}
        >
          로그인
        </button>
        <span class="text-slate-300">/</span>
        <button
          type="button"
          class={`px-0 py-2 text-sm font-semibold transition ${
            mode === "signup" ? "text-slate-950" : "text-slate-400"
          }`}
          on:click={() => (mode = "signup")}
        >
          회원가입
        </button>
      </div>

      {#if mode === "login"}
        <form class="mt-6 space-y-4" on:submit|preventDefault={submitLogin}>
          <label class="block">
            <span class="mb-2 block text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Email</span>
            <input
              type="email"
              autocomplete="username"
              placeholder="name@team.com"
              class="w-full border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 outline-none transition placeholder:text-slate-300 focus:border-sky-500"
              bind:value={loginEmail}
            />
          </label>

          <label class="block">
            <span class="mb-2 block text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Password</span>
            <input
              type="password"
              autocomplete="current-password"
              placeholder="비밀번호를 입력하세요"
              class="w-full border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 outline-none transition placeholder:text-slate-300 focus:border-sky-500"
              bind:value={loginPassword}
            />
          </label>

          <button
            type="submit"
            disabled={!canLogin}
            class="w-full bg-slate-950 px-4 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300"
          >
            로그인
          </button>

          {#if status?.message}
            <p class={`text-sm leading-6 ${statusClass}`}>{status.message}</p>
          {/if}
        </form>
      {:else}
        <form class="mt-6 space-y-4" on:submit|preventDefault={submitSignup}>
          <label class="block">
            <span class="mb-2 block text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Name</span>
            <input
              autocomplete="name"
              placeholder="이름"
              class="w-full border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 outline-none transition placeholder:text-slate-300 focus:border-sky-500"
              bind:value={signupName}
            />
          </label>

          <label class="block">
            <span class="mb-2 block text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Email</span>
            <input
              type="email"
              autocomplete="email"
              placeholder="name@team.com"
              class="w-full border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 outline-none transition placeholder:text-slate-300 focus:border-sky-500"
              bind:value={signupEmail}
            />
          </label>

          <label class="block">
            <span class="mb-2 block text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Password</span>
            <input
              type="password"
              autocomplete="new-password"
              placeholder="새 비밀번호를 입력하세요"
              class="w-full border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 outline-none transition placeholder:text-slate-300 focus:border-sky-500"
              bind:value={signupPassword}
            />
          </label>

          <button
            type="submit"
            disabled={!canSignup}
            class="w-full bg-slate-950 px-4 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300"
          >
            계정 만들기
          </button>

          {#if status?.message}
            <p class={`text-sm leading-6 ${statusClass}`}>{status.message}</p>
          {/if}
        </form>
      {/if}
    </aside>
  </main>
</div>
