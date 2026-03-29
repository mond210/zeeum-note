<script>
  import { createEventDispatcher } from "svelte";

  export let status = null;

  const dispatch = createEventDispatcher();

  let loginEmail = "admin@zeeum.local";
  let loginPassword = "admin1234!";
  let signupEmail = "";
  let signupName = "";
  let signupPassword = "";
  let mode = "login";
</script>

<div class="min-h-screen">
  <header class="w-full border-b border-slate-200/80 bg-white">
    <div class="mx-auto flex min-h-[4.5rem] max-w-[1180px] items-center justify-between px-6 sm:px-8 lg:px-12">
      <div class="flex items-center gap-3">
        <div class="grid h-9 w-9 place-items-center rounded-xl bg-slate-900 text-xs font-semibold text-white">
          ZE
        </div>
        <div>
          <p class="text-sm font-semibold text-slate-950">zeeum-note</p>
          <p class="text-xs text-slate-400">Collaborative workspace</p>
        </div>
      </div>
    </div>
  </header>

  <div class="mx-auto grid max-w-[1180px] gap-14 px-6 py-12 sm:px-8 lg:grid-cols-[1.15fr_0.85fr] lg:px-12 lg:py-16">
    <section>
      <p class="text-[0.72rem] font-semibold uppercase tracking-[0.28em] text-sky-700">Landing</p>
      <h1 class="mt-5 text-[clamp(2.8rem,6vw,5rem)] font-semibold tracking-[-0.08em] text-slate-950">
        Project knowledge, now with accounts.
      </h1>
      <p class="mt-5 max-w-2xl text-base leading-8 text-slate-500">
        This workspace now supports sign-in, sign-up, member management, and a seeded admin account so future collaborative editing has a real identity layer to build on.
      </p>

      <div class="mt-10 grid gap-6 sm:grid-cols-3">
        <div>
          <p class="text-sm font-semibold text-slate-950">Default admin</p>
          <p class="mt-2 text-sm leading-6 text-slate-500">
            `admin@zeeum.local` / `admin1234!`
          </p>
        </div>
        <div>
          <p class="text-sm font-semibold text-slate-950">Membership</p>
          <p class="mt-2 text-sm leading-6 text-slate-500">
            Admins can manage workspace members from Project settings.
          </p>
        </div>
        <div>
          <p class="text-sm font-semibold text-slate-950">Next step</p>
          <p class="mt-2 text-sm leading-6 text-slate-500">
            This is the base needed for collaborative editing later.
          </p>
        </div>
      </div>
    </section>

    <aside class="dialog-surface rounded-[1.4rem] border border-slate-200/90 px-6 py-6 sm:px-7">
      <div class="flex items-center gap-2 rounded-full bg-slate-100 p-1">
        <button
          type="button"
          class={`flex-1 rounded-full px-4 py-2 text-sm font-semibold transition ${
            mode === "login" ? "bg-white text-slate-950 shadow-sm" : "text-slate-500"
          }`}
          on:click={() => (mode = "login")}
        >
          Sign in
        </button>
        <button
          type="button"
          class={`flex-1 rounded-full px-4 py-2 text-sm font-semibold transition ${
            mode === "signup" ? "bg-white text-slate-950 shadow-sm" : "text-slate-500"
          }`}
          on:click={() => (mode = "signup")}
        >
          Sign up
        </button>
      </div>

      {#if mode === "login"}
        <div class="mt-6 space-y-4">
          <div>
            <p class="text-[0.72rem] font-semibold uppercase tracking-[0.18em] text-slate-400">Sign in</p>
            <h2 class="mt-2 text-[1.9rem] font-semibold tracking-[-0.06em] text-slate-950">
              Access your workspace
            </h2>
          </div>

          <label class="block">
            <span class="mb-2 block text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Email</span>
            <input
              class="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700 outline-none transition focus:border-sky-500 focus:ring-4 focus:ring-sky-100"
              bind:value={loginEmail}
            />
          </label>

          <label class="block">
            <span class="mb-2 block text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Password</span>
            <input
              type="password"
              class="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700 outline-none transition focus:border-sky-500 focus:ring-4 focus:ring-sky-100"
              bind:value={loginPassword}
            />
          </label>

          <button
            type="button"
            class="w-full rounded-full bg-sky-700 px-4 py-3 text-sm font-semibold text-white transition hover:bg-sky-800"
            on:click={() => dispatch("login", { email: loginEmail, password: loginPassword })}
          >
            Sign in
          </button>
        </div>
      {:else}
        <div class="mt-6 space-y-4">
          <div>
            <p class="text-[0.72rem] font-semibold uppercase tracking-[0.18em] text-slate-400">Sign up</p>
            <h2 class="mt-2 text-[1.9rem] font-semibold tracking-[-0.06em] text-slate-950">
              Create a member account
            </h2>
          </div>

          <label class="block">
            <span class="mb-2 block text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Name</span>
            <input
              class="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700 outline-none transition focus:border-sky-500 focus:ring-4 focus:ring-sky-100"
              bind:value={signupName}
            />
          </label>

          <label class="block">
            <span class="mb-2 block text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Email</span>
            <input
              class="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700 outline-none transition focus:border-sky-500 focus:ring-4 focus:ring-sky-100"
              bind:value={signupEmail}
            />
          </label>

          <label class="block">
            <span class="mb-2 block text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Password</span>
            <input
              type="password"
              class="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700 outline-none transition focus:border-sky-500 focus:ring-4 focus:ring-sky-100"
              bind:value={signupPassword}
            />
          </label>

          <button
            type="button"
            class="w-full rounded-full bg-slate-950 px-4 py-3 text-sm font-semibold text-white transition hover:bg-slate-800"
            on:click={() =>
              dispatch("signup", {
                email: signupEmail,
                name: signupName,
                password: signupPassword
              })}
          >
            Create account
          </button>
        </div>
      {/if}

      {#if status?.message}
        <p class="mt-5 text-sm text-slate-500">{status.message}</p>
      {/if}
    </aside>
  </div>
</div>
