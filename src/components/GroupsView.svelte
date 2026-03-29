<script>
  import { createEventDispatcher } from "svelte";
  import { colorClass } from "../lib/format.js";

  export let groups = [];
  export let members = [];

  const dispatch = createEventDispatcher();

  let description = "";
  let memberIds = [];
  let name = "";
  let selectedGroupId = "";
  let selectedSnapshot = "";
  let color = "cyan";

  $: if (!selectedGroupId && groups.length > 0) {
    selectedGroupId = groups[0].id;
  }

  $: selectedGroup = groups.find((group) => group.id === selectedGroupId) || null;
  $: nextSnapshot = selectedGroup
    ? `${selectedGroup.id}:${selectedGroup.name}:${selectedGroup.description}:${selectedGroup.color}:${selectedGroup.memberIds.join(",")}`
    : "";
  $: if (selectedGroup && nextSnapshot !== selectedSnapshot) {
    selectedSnapshot = nextSnapshot;
    name = selectedGroup.name;
    description = selectedGroup.description;
    color = selectedGroup.color;
    memberIds = [...selectedGroup.memberIds];
  }

  function toggleMember(memberId) {
    memberIds = memberIds.includes(memberId)
      ? memberIds.filter((entry) => entry !== memberId)
      : [...memberIds, memberId];
  }

  function handleSave() {
    if (!selectedGroup) {
      return;
    }

    dispatch("save", {
      groupId: selectedGroup.id,
      payload: {
        color,
        description,
        memberIds,
        name
      }
    });
  }

  function handleDelete() {
    if (!selectedGroup) {
      return;
    }

    if (window.confirm(`"${selectedGroup.name}" 그룹을 삭제할까요?`)) {
      dispatch("delete", selectedGroup.id);
    }
  }
</script>

<section class="grid gap-4 xl:grid-cols-[320px_minmax(0,1fr)]">
  <aside class="glass-panel rounded-[1.8rem] border border-stone-200/80 px-5 py-5">
    <div class="flex items-center justify-between">
      <div>
        <p class="text-[0.68rem] font-semibold uppercase tracking-[0.28em] text-cyan-700">Groups</p>
        <h2 class="mt-2 font-serif text-[2rem] font-semibold tracking-[-0.04em] text-slate-950">Local ownership</h2>
      </div>
      <button
        type="button"
        class="rounded-full bg-cyan-700 px-4 py-2 text-sm font-semibold text-white transition hover:-translate-y-0.5 hover:bg-cyan-800"
        on:click={() => dispatch("create")}
      >
        New group
      </button>
    </div>

    <div class="mt-5 space-y-3">
      {#each groups as group}
        <button
          type="button"
          class={`w-full rounded-[1.35rem] border px-4 py-4 text-left transition ${
            group.id === selectedGroupId ? "border-cyan-200 bg-cyan-50/80" : "border-stone-200 bg-white/80 hover:border-cyan-200"
          }`}
          on:click={() => (selectedGroupId = group.id)}
        >
          <div class="flex items-center justify-between gap-3">
            <p class="font-serif text-xl font-semibold tracking-[-0.03em] text-slate-900">{group.name}</p>
            <span class={`rounded-full px-2 py-1 text-[0.7rem] font-semibold ring-1 ${colorClass(group.color)}`}>
              {group.color}
            </span>
          </div>
          <p class="mt-2 text-sm leading-6 text-slate-500">{group.description}</p>
          <p class="mt-3 text-xs font-semibold uppercase tracking-[0.22em] text-slate-400">
            {group.memberIds.length} members
          </p>
        </button>
      {/each}
    </div>
  </aside>

  <div class="glass-panel rounded-[1.8rem] border border-stone-200/80 px-6 py-6">
    {#if selectedGroup}
      <div class="flex items-center justify-between gap-3">
        <div>
          <p class="text-[0.68rem] font-semibold uppercase tracking-[0.28em] text-cyan-700">Group detail</p>
          <h2 class="mt-2 font-serif text-[2rem] font-semibold tracking-[-0.04em] text-slate-950">
            {selectedGroup.name}
          </h2>
        </div>
        <div class="flex gap-2">
          <button type="button" class="rounded-full border border-red-200 bg-red-50 px-4 py-2 text-sm font-semibold text-red-700 transition hover:-translate-y-0.5" on:click={handleDelete}>
            Delete
          </button>
          <button type="button" class="rounded-full bg-cyan-700 px-4 py-2 text-sm font-semibold text-white transition hover:-translate-y-0.5 hover:bg-cyan-800" on:click={handleSave}>
            Save
          </button>
        </div>
      </div>

      <div class="mt-6 grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
        <div class="space-y-4">
          <label class="block">
            <span class="mb-2 block text-xs font-semibold uppercase tracking-[0.22em] text-slate-400">Name</span>
            <input class="w-full rounded-2xl border border-stone-200 bg-stone-50 px-4 py-3 text-sm text-slate-700 outline-none focus:border-cyan-500 focus:ring-4 focus:ring-cyan-100" bind:value={name} />
          </label>

          <label class="block">
            <span class="mb-2 block text-xs font-semibold uppercase tracking-[0.22em] text-slate-400">Description</span>
            <textarea class="min-h-[10rem] w-full rounded-2xl border border-stone-200 bg-stone-50 px-4 py-3 text-sm leading-6 text-slate-700 outline-none focus:border-cyan-500 focus:ring-4 focus:ring-cyan-100" bind:value={description}></textarea>
          </label>

          <label class="block">
            <span class="mb-2 block text-xs font-semibold uppercase tracking-[0.22em] text-slate-400">Color</span>
            <select class="w-full rounded-2xl border border-stone-200 bg-stone-50 px-4 py-3 text-sm text-slate-700 outline-none focus:border-cyan-500 focus:ring-4 focus:ring-cyan-100" bind:value={color}>
              <option value="cyan">cyan</option>
              <option value="emerald">emerald</option>
              <option value="amber">amber</option>
              <option value="orange">orange</option>
              <option value="violet">violet</option>
              <option value="rose">rose</option>
            </select>
          </label>
        </div>

        <div>
          <p class="mb-3 text-xs font-semibold uppercase tracking-[0.22em] text-slate-400">Members</p>
          <div class="space-y-3">
            {#each members as member}
              <label class="flex items-center gap-3 rounded-[1.25rem] border border-stone-200 bg-white/80 px-4 py-3">
                <input type="checkbox" checked={memberIds.includes(member.id)} on:change={() => toggleMember(member.id)} />
                <div>
                  <p class="font-semibold text-slate-900">{member.name}</p>
                  <p class="text-sm text-slate-500">{member.role} · {member.email}</p>
                </div>
              </label>
            {/each}
          </div>
        </div>
      </div>
    {:else}
      <div class="grid min-h-[24rem] place-items-center rounded-[1.6rem] border border-dashed border-stone-300 bg-white/70 px-8 py-12 text-center">
        <div>
          <p class="font-serif text-3xl font-semibold tracking-[-0.04em] text-slate-950">No group selected</p>
          <p class="mt-3 text-sm leading-6 text-slate-500">
            Create a group to simulate ownership and local team structures.
          </p>
        </div>
      </div>
    {/if}
  </div>
</section>
