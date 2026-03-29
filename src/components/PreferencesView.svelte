<script>
  import { createEventDispatcher } from "svelte";

  export let preferences = null;

  const dispatch = createEventDispatcher();

  let density = "comfortable";
  let landingView = "workspace";
  let showInspector = true;
  let theme = "light";
  let snapshotKey = "";

  $: nextKey = preferences
    ? `${preferences.theme}:${preferences.density}:${preferences.landingView}:${preferences.showInspector}`
    : "";
  $: if (preferences && nextKey !== snapshotKey) {
    snapshotKey = nextKey;
    density = preferences.density;
    landingView = preferences.landingView;
    showInspector = preferences.showInspector;
    theme = preferences.theme;
  }

  function handleSave() {
    dispatch("save", {
      density,
      landingView,
      showInspector,
      theme
    });
  }
</script>

<section class="glass-panel rounded-[1.8rem] border border-stone-200/80 px-6 py-6">
  <div class="flex items-center justify-between gap-3">
    <div>
      <p class="text-[0.68rem] font-semibold uppercase tracking-[0.28em] text-cyan-700">Preferences</p>
      <h2 class="mt-2 font-serif text-[2.4rem] font-semibold tracking-[-0.05em] text-slate-950">
        Workspace behavior
      </h2>
      <p class="mt-2 max-w-2xl text-sm leading-7 text-slate-500">
        Workspace landing, density, theme, and the right-side inspector behavior를 이곳에서 조정합니다.
      </p>
    </div>
    <button
      type="button"
      class="rounded-full bg-cyan-700 px-4 py-2 text-sm font-semibold text-white transition hover:-translate-y-0.5 hover:bg-cyan-800"
      on:click={handleSave}
    >
      Save preferences
    </button>
  </div>

  <div class="mt-6 grid gap-4 lg:grid-cols-2">
    <label class="block rounded-[1.45rem] border border-stone-200 bg-white/80 px-5 py-5">
      <span class="mb-2 block text-xs font-semibold uppercase tracking-[0.22em] text-slate-400">Theme</span>
      <select class="w-full rounded-2xl border border-stone-200 bg-stone-50 px-4 py-3 text-sm text-slate-700 outline-none focus:border-cyan-500 focus:ring-4 focus:ring-cyan-100" bind:value={theme}>
        <option value="light">light</option>
        <option value="sepia">sepia</option>
        <option value="slate">slate</option>
      </select>
    </label>

    <label class="block rounded-[1.45rem] border border-stone-200 bg-white/80 px-5 py-5">
      <span class="mb-2 block text-xs font-semibold uppercase tracking-[0.22em] text-slate-400">Density</span>
      <select class="w-full rounded-2xl border border-stone-200 bg-stone-50 px-4 py-3 text-sm text-slate-700 outline-none focus:border-cyan-500 focus:ring-4 focus:ring-cyan-100" bind:value={density}>
        <option value="comfortable">comfortable</option>
        <option value="compact">compact</option>
      </select>
    </label>

    <label class="block rounded-[1.45rem] border border-stone-200 bg-white/80 px-5 py-5">
      <span class="mb-2 block text-xs font-semibold uppercase tracking-[0.22em] text-slate-400">Landing view</span>
      <select class="w-full rounded-2xl border border-stone-200 bg-stone-50 px-4 py-3 text-sm text-slate-700 outline-none focus:border-cyan-500 focus:ring-4 focus:ring-cyan-100" bind:value={landingView}>
        <option value="workspace">workspace</option>
        <option value="pages">pages</option>
      </select>
    </label>

    <label class="flex items-center justify-between rounded-[1.45rem] border border-stone-200 bg-white/80 px-5 py-5">
      <div>
        <p class="text-xs font-semibold uppercase tracking-[0.22em] text-slate-400">Inspector panel</p>
        <p class="mt-2 text-sm leading-6 text-slate-500">
          Show the right-side page inspector inside the Pages route.
        </p>
      </div>
      <input type="checkbox" bind:checked={showInspector} />
    </label>
  </div>
</section>
