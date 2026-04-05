<script>
  import { createEventDispatcher } from "svelte";
  import { fade, scale } from "svelte/transition";
  import { api } from "../lib/api.js";

  export let pageId = null;
  export let pageTitle = "";
  export let projectId = null;

  const dispatch = createEventDispatcher();

  let activeMode = "summary";
  let editInstruction = "";
  let editLoading = false;
  let editPreview = null;
  let message = "";
  let messageTone = "idle";
  let sttFile = null;
  let sttLoading = false;
  let sttMode = "append";
  let sttTranscript = "";
  let summaryFocus = "";
  let summaryLoading = false;
  let summaryText = "";

  function setMessage(nextMessage, tone = "idle") {
    message = nextMessage;
    messageTone = tone;
  }

  async function runSummary() {
    summaryLoading = true;
    setMessage("요약을 생성하는 중...", "pending");

    try {
      const result = await api.aiEditorSummary({
        focus: summaryFocus,
        pageId,
        projectId
      });
      summaryText = result.summary || "";
      setMessage("요약이 준비되었습니다.", "success");
    } catch (error) {
      setMessage(error.message, "error");
    } finally {
      summaryLoading = false;
    }
  }

  async function createEditPreview() {
    if (!editInstruction.trim()) {
      setMessage("편집 지시를 입력하세요.", "error");
      return;
    }

    editLoading = true;
    setMessage("문서 수정안을 생성하는 중...", "pending");

    try {
      editPreview = await api.aiEditorPreview({
        instruction: editInstruction,
        pageId,
        projectId
      });
      setMessage("미리보기가 준비되었습니다.", "success");
    } catch (error) {
      setMessage(error.message, "error");
    } finally {
      editLoading = false;
    }
  }

  async function applyEditPreview() {
    if (!editPreview?.previewId) {
      return;
    }

    editLoading = true;
    setMessage("문서 수정안을 적용하는 중...", "pending");

    try {
      await api.aiEditorApply(editPreview.previewId);
      dispatch("applied");
      dispatch("close");
    } catch (error) {
      setMessage(error.message, "error");
    } finally {
      editLoading = false;
    }
  }

  async function transcribeAudio() {
    if (!sttFile) {
      setMessage("오디오 파일을 선택하세요.", "error");
      return;
    }

    sttLoading = true;
    setMessage("음성을 전사하는 중...", "pending");

    try {
      const result = await api.aiTranscribeAudio(sttFile);
      sttTranscript = result.transcript?.text || "";
      setMessage("전사가 완료되었습니다.", "success");
    } catch (error) {
      setMessage(error.message, "error");
    } finally {
      sttLoading = false;
    }
  }

  async function insertTranscript() {
    if (!sttTranscript.trim()) {
      setMessage("삽입할 전사 텍스트가 없습니다.", "error");
      return;
    }

    sttLoading = true;
    setMessage("전사 텍스트를 문서에 반영하는 중...", "pending");

    try {
      await api.aiInsertTranscript({
        mode: sttMode,
        pageId,
        projectId,
        text: sttTranscript
      });
      dispatch("applied");
      dispatch("close");
    } catch (error) {
      setMessage(error.message, "error");
    } finally {
      sttLoading = false;
    }
  }

  $: messageClass =
    messageTone === "error"
      ? "border-rose-200 bg-rose-50 text-rose-700"
      : messageTone === "success"
        ? "border-emerald-200 bg-emerald-50 text-emerald-700"
        : messageTone === "pending"
          ? "border-sky-200 bg-sky-50 text-sky-700"
          : "border-slate-200 bg-slate-50 text-slate-600";
</script>

<button
  type="button"
  class="fixed inset-0 z-40 bg-black/22"
  aria-label="Close AI dialog"
  on:click={() => dispatch("close")}
  transition:fade={{ duration: 140 }}
></button>

<div class="fixed inset-0 z-50 overflow-y-auto px-4 py-8">
  <div class="mx-auto w-full max-w-[960px] border border-slate-200 bg-white" transition:scale={{ duration: 170, start: 0.98 }}>
    <div class="border-b border-slate-200 px-6 py-5">
      <div class="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p class="text-[0.72rem] font-semibold uppercase tracking-[0.28em] text-sky-700">AI editor</p>
          <h3 class="mt-2 text-[1.9rem] font-semibold tracking-[-0.05em] text-slate-950">{pageTitle || "Untitled"}</h3>
          <p class="mt-2 text-sm text-slate-500">요약, 편집 미리보기, 음성 전사를 한곳에서 실행합니다.</p>
        </div>

        <button
          type="button"
          class="border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-600 transition hover:border-slate-300 hover:text-slate-900"
          on:click={() => dispatch("close")}
        >
          Close
        </button>
      </div>

      <div class="mt-5 flex flex-wrap gap-2">
        <button
          type="button"
          class={`border px-3 py-2 text-sm font-semibold transition ${
            activeMode === "summary"
              ? "border-slate-950 bg-slate-950 text-white"
              : "border-slate-200 text-slate-600 hover:border-slate-300 hover:text-slate-900"
          }`}
          on:click={() => (activeMode = "summary")}
        >
          Summary
        </button>
        <button
          type="button"
          class={`border px-3 py-2 text-sm font-semibold transition ${
            activeMode === "edit"
              ? "border-slate-950 bg-slate-950 text-white"
              : "border-slate-200 text-slate-600 hover:border-slate-300 hover:text-slate-900"
          }`}
          on:click={() => (activeMode = "edit")}
        >
          Edit with AI
        </button>
        <button
          type="button"
          class={`border px-3 py-2 text-sm font-semibold transition ${
            activeMode === "speech"
              ? "border-slate-950 bg-slate-950 text-white"
              : "border-slate-200 text-slate-600 hover:border-slate-300 hover:text-slate-900"
          }`}
          on:click={() => (activeMode = "speech")}
        >
          Speech to text
        </button>
      </div>

      {#if message}
        <p class={`mt-5 border px-4 py-3 text-sm ${messageClass}`}>{message}</p>
      {/if}
    </div>

    <div class="px-6 py-6">
      {#if activeMode === "summary"}
        <div class="space-y-5">
          <label class="block">
            <span class="mb-2 block text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Focus</span>
            <input
              class="w-full border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-700 outline-none transition focus:border-sky-500"
              bind:value={summaryFocus}
              placeholder="예: 결정 사항만, 해야 할 일만"
            />
          </label>

          <button
            type="button"
            class="border border-slate-950 bg-slate-950 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:opacity-60"
            disabled={summaryLoading}
            on:click={runSummary}
          >
            {summaryLoading ? "Generating..." : "Generate summary"}
          </button>

          <div class="border border-slate-200 bg-slate-50 px-4 py-4">
            {#if summaryText}
              <p class="whitespace-pre-wrap text-sm leading-7 text-slate-700">{summaryText}</p>
            {:else}
              <p class="text-sm text-slate-500">아직 생성된 요약이 없습니다.</p>
            {/if}
          </div>
        </div>
      {:else if activeMode === "edit"}
        <div class="grid gap-6 lg:grid-cols-[360px_minmax(0,1fr)]">
          <div class="space-y-4">
            <label class="block">
              <span class="mb-2 block text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Instruction</span>
              <textarea
                class="min-h-[220px] w-full border border-slate-200 bg-slate-50 px-3 py-3 text-sm leading-6 text-slate-700 outline-none transition focus:border-sky-500"
                bind:value={editInstruction}
                placeholder="예: 이 문서를 5줄로 요약해서 맨 위에 추가하고, 누락된 할 일을 체크리스트로 정리해줘"
              ></textarea>
            </label>

            <button
              type="button"
              class="border border-slate-950 bg-slate-950 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:opacity-60"
              disabled={editLoading}
              on:click={createEditPreview}
            >
              {editLoading ? "Generating..." : "Create preview"}
            </button>

            <p class="text-xs leading-5 text-slate-400">문서 내용 변경은 미리보기를 확인한 뒤에만 적용됩니다.</p>
          </div>

          <div class="min-w-0">
            {#if editPreview}
              <div class="space-y-4">
                <div class="border border-slate-200 bg-slate-50 px-4 py-4">
                  <p class="text-sm font-semibold text-slate-950">Preview summary</p>
                  <p class="mt-2 text-sm leading-6 text-slate-600">{editPreview.summary}</p>
                  <p class="mt-3 text-xs text-slate-400">
                    +{editPreview.diff?.addedChars || 0} chars · -{editPreview.diff?.removedChars || 0} chars
                  </p>
                </div>

                <label class="block">
                  <span class="mb-2 block text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Revised markdown</span>
                  <textarea
                    class="min-h-[320px] w-full border border-slate-200 bg-white px-3 py-3 text-sm leading-6 text-slate-700 outline-none"
                    readonly
                    value={editPreview.afterMarkdown}
                  ></textarea>
                </label>

                <button
                  type="button"
                  class="border border-sky-700 bg-sky-700 px-4 py-2 text-sm font-semibold text-white transition hover:bg-sky-800 disabled:opacity-60"
                  disabled={editLoading}
                  on:click={applyEditPreview}
                >
                  Apply preview
                </button>
              </div>
            {:else}
              <div class="grid min-h-[360px] place-items-center border border-dashed border-slate-300 bg-slate-50 px-6 py-8 text-center">
                <div>
                  <p class="text-lg font-semibold text-slate-950">No preview yet</p>
                  <p class="mt-2 text-sm leading-6 text-slate-500">지시를 입력한 뒤 미리보기를 생성하세요.</p>
                </div>
              </div>
            {/if}
          </div>
        </div>
      {:else}
        <div class="space-y-5">
          <label class="block">
            <span class="mb-2 block text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Audio file</span>
            <input
              accept="audio/*"
              class="block w-full text-sm text-slate-600"
              on:change={(event) => {
                sttFile = event.currentTarget.files?.[0] || null;
              }}
              type="file"
            />
          </label>

          <div class="flex flex-wrap items-center gap-2">
            <button
              type="button"
              class="border border-slate-950 bg-slate-950 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:opacity-60"
              disabled={sttLoading}
              on:click={transcribeAudio}
            >
              {sttLoading ? "Transcribing..." : "Transcribe audio"}
            </button>

            <select
              class="border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700 outline-none"
              bind:value={sttMode}
            >
              <option value="append">Append to page</option>
              <option value="replace">Replace page</option>
            </select>
          </div>

          <label class="block">
            <span class="mb-2 block text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Transcript</span>
            <textarea
              class="min-h-[260px] w-full border border-slate-200 bg-slate-50 px-3 py-3 text-sm leading-6 text-slate-700 outline-none transition focus:border-sky-500"
              bind:value={sttTranscript}
              placeholder="전사 결과가 여기에 표시됩니다."
            ></textarea>
          </label>

          <button
            type="button"
            class="border border-sky-700 bg-sky-700 px-4 py-2 text-sm font-semibold text-white transition hover:bg-sky-800 disabled:opacity-60"
            disabled={sttLoading}
            on:click={insertTranscript}
          >
            Insert transcript
          </button>
        </div>
      {/if}
    </div>
  </div>
</div>
