<script>
  import { api } from "../lib/api.js";

  export let settings = null;

  const OPENAI_CODEX_PROVIDER_ID = "openai-codex";

  let loading = false;
  let message = "";
  let messageTone = "idle";
  let snapshot = "";
  let draft = {
    profiles: {},
    providerCatalog: [],
    providers: {}
  };

  function cloneSettings(nextSettings) {
    const providers = Object.fromEntries(
      Object.entries(nextSettings?.providers || {}).map(([providerId, config]) => [
        providerId,
        {
          ...config,
          apiKey: "",
          clearApiKey: false,
          oauth: config.oauth ? { ...config.oauth } : null,
          modelCache: {
            ...(config.modelCache || {}),
            models: Array.isArray(config.modelCache?.models) ? [...config.modelCache.models] : []
          }
        }
      ])
    );

    return {
      profiles: { ...(nextSettings?.profiles || {}) },
      providerCatalog: Array.isArray(nextSettings?.providerCatalog) ? [...nextSettings.providerCatalog] : [],
      providers
    };
  }

  function setMessage(nextMessage, tone = "idle") {
    message = nextMessage;
    messageTone = tone;
  }

  function providerSupportsProfile(providerId, profileId) {
    const provider = draft.providerCatalog.find((entry) => entry.id === providerId);
    return provider?.capabilities?.includes(profileId);
  }

  function filteredModels(providerId, profileId) {
    const provider = draft.providers[providerId];
    const models = Array.isArray(provider?.modelCache?.models) ? provider.modelCache.models : [];

    if (profileId === "speechToText") {
      return models.filter((model) => model.supportsSpeechToText);
    }

    return models.filter((model) => model.supportsTextGeneration);
  }

  function providerDraftConfig(providerId) {
    if (providerId === OPENAI_CODEX_PROVIDER_ID) {
      return {};
    }

    const provider = draft.providers[providerId];

    return {
      apiKey: provider?.apiKey || undefined,
      baseUrl: provider?.baseUrl || ""
    };
  }

  function applyServerSettings(nextSettings) {
    draft = cloneSettings(nextSettings);
    snapshot = JSON.stringify(nextSettings || {});
  }

  async function saveSettings() {
    loading = true;
    setMessage("AI 설정을 저장하는 중...", "pending");

    try {
      const payload = {
        profiles: draft.profiles,
        providers: Object.fromEntries(
          Object.entries(draft.providers).map(([providerId, config]) => [
            providerId,
            providerId === OPENAI_CODEX_PROVIDER_ID
              ? {
                  enabled: config.enabled
                }
              : {
                  apiKey: config.apiKey || undefined,
                  baseUrl: config.baseUrl,
                  clearApiKey: config.clearApiKey,
                  enabled: config.enabled
                }
          ])
        )
      };
      const result = await api.adminSaveAiSettings(payload);
      applyServerSettings(result.ai);
      setMessage("AI 설정을 저장했습니다.", "success");
    } catch (error) {
      setMessage(error.message, "error");
    } finally {
      loading = false;
    }
  }

  async function runProviderCheck(providerId, kind = "test") {
    const provider = draft.providers[providerId];

    if (!provider) {
      return;
    }

    provider.loading = kind;
    draft = { ...draft };
    setMessage(kind === "test" ? "연결 테스트 중..." : "모델 목록을 불러오는 중...", "pending");

    try {
      const payload = {
        providerConfig: providerDraftConfig(providerId)
      };
      const result =
        kind === "test"
          ? await api.adminTestAiProvider(providerId, payload)
          : await api.adminListAiModels(providerId, payload);

      provider.lastTest =
        kind === "test"
          ? {
              checkedAt: new Date().toISOString(),
              message: result.message,
              ok: true
            }
          : provider.lastTest;
      provider.modelCache = {
        error: null,
        fetchedAt: result.fetchedAt || new Date().toISOString(),
        models: result.models || []
      };
      draft = { ...draft };
      setMessage(
        kind === "test"
          ? `${providerId} 연결 테스트가 완료되었습니다.`
          : `${providerId} 모델 목록을 갱신했습니다.`,
        "success"
      );
    } catch (error) {
      provider.lastTest = {
        checkedAt: new Date().toISOString(),
        message: error.message,
        ok: false
      };
      provider.modelCache = {
        ...(provider.modelCache || {}),
        error: error.message,
        models: Array.isArray(provider.modelCache?.models) ? provider.modelCache.models : []
      };
      draft = { ...draft };
      setMessage(error.message, "error");
    } finally {
      provider.loading = null;
      draft = { ...draft };
    }
  }

  async function syncAiSettings() {
    const result = await api.adminAiSettings();
    applyServerSettings(result.ai);
    return result.ai;
  }

  async function pollOauthStatus(providerId, deadlineMs) {
    while (Date.now() < deadlineMs) {
      const status = await api.adminAiProviderOauthStatus(providerId);

      if (status.connected && !status.pending) {
        await syncAiSettings();
        return status;
      }

      if (!status.pending && !status.connected && status.message) {
        throw new Error(status.message);
      }

      await new Promise((resolve) => setTimeout(resolve, 2000));
    }

    throw new Error("OAuth 연결이 시간 내에 완료되지 않았습니다.");
  }

  async function startOauthFlow(providerId) {
    const provider = draft.providers[providerId];

    if (!provider) {
      return;
    }

    provider.loading = "oauth";
    draft = { ...draft };
    setMessage("ChatGPT OAuth 연결을 시작하는 중...", "pending");

    try {
      const result = await api.adminAiProviderOauthStart(providerId);
      const authWindow = window.open(result.authorizeUrl, "_blank", "noopener,noreferrer");

      if (!authWindow) {
        window.location.assign(result.authorizeUrl);
        return;
      }

      authWindow.focus?.();

      await pollOauthStatus(providerId, result.expiresAt || Date.now() + 120000);
      setMessage("ChatGPT OAuth 연결이 완료되었습니다.", "success");
    } catch (error) {
      setMessage(error.message, "error");
    } finally {
      provider.loading = null;
      draft = { ...draft };
    }
  }

  async function disconnectOauthFlow(providerId) {
    const provider = draft.providers[providerId];

    if (!provider) {
      return;
    }

    provider.loading = "disconnect";
    draft = { ...draft };
    setMessage("ChatGPT OAuth 연결을 해제하는 중...", "pending");

    try {
      const result = await api.adminAiProviderOauthDisconnect(providerId);
      applyServerSettings(result.ai);
      setMessage("ChatGPT OAuth 연결을 해제했습니다.", "success");
    } catch (error) {
      setMessage(error.message, "error");
    } finally {
      provider.loading = null;
      draft = { ...draft };
    }
  }

  function handleProfileProviderChange(profileId, providerId) {
    draft.profiles[profileId] = {
      ...draft.profiles[profileId],
      model: filteredModels(providerId, profileId)[0]?.id || "",
      provider: providerId
    };
    draft = { ...draft };
  }

  function hintText(providerId) {
    const provider = draft.providers[providerId];

    if (providerId === OPENAI_CODEX_PROVIDER_ID) {
      if (provider?.oauth?.connected) {
      const expires = provider.oauth.expiresAt ? formatTimestamp(provider.oauth.expiresAt) : "unknown";
      const account = provider.oauth.accountIdHint || "connected";
      return `Connected as ${account}. Expires: ${expires}.`;
    }

    if (provider?.pending && provider?.message) {
      return provider.message;
    }

    if (provider?.message) {
      return provider.message;
    }

    return "ChatGPT OAuth 연결이 필요합니다.";
  }

    if (provider?.clearApiKey) {
      return "현재 저장된 API key 는 저장 시 제거됩니다.";
    }

    if (provider?.hasApiKey) {
      return provider.apiKeyHint ? `저장된 key ${provider.apiKeyHint}` : "저장된 API key 가 있습니다.";
    }

    return "저장된 API key 가 없습니다.";
  }

  function formatTimestamp(value) {
    return value ? new Date(value).toLocaleString() : "없음";
  }

  $: nextSnapshot = JSON.stringify(settings || {});
  $: if (settings && nextSnapshot !== snapshot) {
    applyServerSettings(settings);
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

<section class="space-y-8">
  <div class="border-b border-slate-200/80 pb-6">
    <div class="flex flex-wrap items-start justify-between gap-4">
      <div>
        <p class="text-[0.72rem] font-semibold uppercase tracking-[0.28em] text-sky-700">AI</p>
        <h2 class="mt-4 text-[2.3rem] font-semibold tracking-[-0.06em] text-slate-950">Provider settings</h2>
        <p class="mt-3 max-w-3xl text-sm leading-7 text-slate-500 sm:text-base">
          텍스트 생성과 음성 전사를 위한 provider, base URL, API key, 모델을 관리합니다.
        </p>
      </div>

      <button
        type="button"
        class="rounded-full bg-sky-700 px-4 py-2 text-sm font-semibold text-white transition hover:bg-sky-800 disabled:opacity-60"
        disabled={loading}
        on:click={saveSettings}
      >
        Save AI settings
      </button>
    </div>

    {#if message}
      <p class={`mt-5 border px-4 py-3 text-sm ${messageClass}`}>{message}</p>
    {/if}
  </div>

  <section class="border-t border-slate-200/80 pt-6">
    <div>
      <p class="text-sm font-semibold text-slate-950">Profiles</p>
      <p class="mt-1 text-sm text-slate-500">기능별로 다른 provider 와 모델을 지정할 수 있습니다.</p>
    </div>

    <div class="mt-5 grid gap-5 lg:grid-cols-2">
      {#each Object.entries(draft.profiles || {}) as [profileId, profile]}
        <div class="border border-slate-200 bg-white px-4 py-4">
          <p class="text-sm font-semibold text-slate-950">
            {profileId === "textGeneration" ? "Text generation" : "Speech to text"}
          </p>

          <label class="mt-4 block">
            <span class="mb-2 block text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Provider</span>
            <select
              class="w-full border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-700 outline-none transition focus:border-sky-500"
              bind:value={profile.provider}
              on:change={(event) => handleProfileProviderChange(profileId, event.currentTarget.value)}
            >
              {#each draft.providerCatalog.filter((provider) => providerSupportsProfile(provider.id, profileId)) as provider}
                <option value={provider.id}>{provider.label}</option>
              {/each}
            </select>
          </label>

          <label class="mt-4 block">
            <span class="mb-2 block text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Model</span>
            <select
              class="w-full border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-700 outline-none transition focus:border-sky-500"
              bind:value={profile.model}
            >
              <option value="">모델을 선택하세요</option>
              {#each filteredModels(profile.provider, profileId) as model}
                <option value={model.id}>{model.label}</option>
              {/each}
            </select>
          </label>
        </div>
      {/each}
    </div>
  </section>

  <section class="border-t border-slate-200/80 pt-6">
    <div>
      <p class="text-sm font-semibold text-slate-950">Providers</p>
      <p class="mt-1 text-sm text-slate-500">각 provider 별 연결 정보와 모델 캐시를 관리합니다.</p>
    </div>

    <div class="mt-5 space-y-5">
      {#each draft.providerCatalog as providerMeta}
        <article class="border border-slate-200 bg-white px-5 py-5">
          <div class="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div class="flex flex-wrap items-center gap-2">
                <p class="text-lg font-semibold text-slate-950">{providerMeta.label}</p>
                {#if providerMeta.experimental}
                  <span class="border border-amber-200 bg-amber-50 px-2 py-1 text-[0.7rem] font-semibold uppercase tracking-[0.14em] text-amber-700">
                    experimental
                  </span>
                {/if}
                {#each providerMeta.capabilities as capability}
                  <span class="border border-slate-200 px-2 py-1 text-[0.7rem] font-semibold uppercase tracking-[0.14em] text-slate-500">
                    {capability === "textGeneration" ? "text" : "speech"}
                  </span>
                {/each}
              </div>
              <p class="mt-2 text-sm text-slate-500">
                Last test: {formatTimestamp(draft.providers[providerMeta.id]?.lastTest?.checkedAt)} ·
                {draft.providers[providerMeta.id]?.lastTest?.message || "Not tested"}
              </p>
            </div>

            <label class="flex items-center gap-2 text-sm font-medium text-slate-600">
              <input type="checkbox" bind:checked={draft.providers[providerMeta.id].enabled} />
              Enabled
            </label>
          </div>

          {#if providerMeta.id === OPENAI_CODEX_PROVIDER_ID}
            <div class="mt-5 border-t border-slate-200 pt-4">
              <p class="text-sm font-medium text-slate-700">Fixed to ChatGPT OAuth and a curated model list.</p>
              <p class="mt-2 text-xs text-slate-500">{hintText(providerMeta.id)}</p>
            </div>
          {:else}
            <div class="mt-5 grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
              <label class="block">
                <span class="mb-2 block text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Base URL</span>
                <input
                  class="w-full border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-700 outline-none transition focus:border-sky-500"
                  bind:value={draft.providers[providerMeta.id].baseUrl}
                />
              </label>

              <label class="block">
                <span class="mb-2 block text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">API key</span>
                <input
                  class="w-full border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-700 outline-none transition focus:border-sky-500"
                  bind:value={draft.providers[providerMeta.id].apiKey}
                  disabled={providerMeta.id === "ollama"}
                  placeholder={providerMeta.id === "ollama" ? "로컬 provider 는 API key 가 필요 없습니다." : "새 key 를 입력하면 저장 시 교체됩니다."}
                  type="password"
                />
                <p class="mt-2 text-xs text-slate-500">{hintText(providerMeta.id)}</p>
              </label>
            </div>
          {/if}

          {#if providerMeta.id !== "ollama" && providerMeta.id !== OPENAI_CODEX_PROVIDER_ID}
            <div class="mt-3">
              <button
                type="button"
                class={`border px-3 py-2 text-sm font-semibold transition ${
                  draft.providers[providerMeta.id].clearApiKey
                    ? "border-rose-300 bg-rose-50 text-rose-700"
                    : "border-slate-200 text-slate-600 hover:border-slate-300 hover:text-slate-900"
                }`}
                on:click={() => {
                  draft.providers[providerMeta.id].clearApiKey = !draft.providers[providerMeta.id].clearApiKey;
                  if (draft.providers[providerMeta.id].clearApiKey) {
                    draft.providers[providerMeta.id].apiKey = "";
                  }
                  draft = { ...draft };
                }}
              >
                {draft.providers[providerMeta.id].clearApiKey ? "Key will be cleared" : "Clear stored key"}
              </button>
            </div>
          {/if}

          <div class="mt-5 flex flex-wrap items-center gap-2">
            <button
              type="button"
              class="border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-sky-300 hover:text-sky-700 disabled:opacity-60"
              disabled={draft.providers[providerMeta.id].loading}
              on:click={() => runProviderCheck(providerMeta.id, "test")}
            >
              {draft.providers[providerMeta.id].loading === "test"
                ? "Testing..."
                : providerMeta.id === OPENAI_CODEX_PROVIDER_ID
                  ? "Check OAuth"
                  : "Test connection"}
            </button>
            <button
              type="button"
              class="border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-sky-300 hover:text-sky-700 disabled:opacity-60"
              disabled={draft.providers[providerMeta.id].loading}
              on:click={() => runProviderCheck(providerMeta.id, "models")}
            >
              {draft.providers[providerMeta.id].loading === "models"
                ? "Loading..."
                : providerMeta.id === OPENAI_CODEX_PROVIDER_ID
                  ? "Load curated models"
                  : "Refresh models"}
            </button>
            {#if providerMeta.id === OPENAI_CODEX_PROVIDER_ID}
              <button
                type="button"
                class="border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-sky-300 hover:text-sky-700 disabled:opacity-60"
                disabled={draft.providers[providerMeta.id].loading}
                on:click={() => startOauthFlow(providerMeta.id)}
              >
                {draft.providers[providerMeta.id].loading === "oauth"
                  ? "Connecting..."
                  : draft.providers[providerMeta.id]?.oauth?.connected
                    ? "Reconnect ChatGPT"
                    : "Connect ChatGPT"}
              </button>
              <button
                type="button"
                class="border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-rose-300 hover:text-rose-700 disabled:opacity-60"
                disabled={draft.providers[providerMeta.id].loading}
                on:click={() => disconnectOauthFlow(providerMeta.id)}
              >
                {draft.providers[providerMeta.id].loading === "disconnect"
                  ? "Disconnecting..."
                  : "Disconnect"}
              </button>
            {/if}
            <span class="text-xs text-slate-400">
              Cached: {formatTimestamp(draft.providers[providerMeta.id]?.modelCache?.fetchedAt)}
            </span>
          </div>

          {#if draft.providers[providerMeta.id]?.modelCache?.models?.length > 0}
            <div class="mt-5 max-h-56 overflow-auto border-t border-slate-200 pt-4">
              <ul class="space-y-2 text-sm text-slate-600">
                {#each draft.providers[providerMeta.id].modelCache.models as model}
                  <li class="flex items-center justify-between gap-3 border-b border-slate-100 pb-2">
                    <div class="min-w-0">
                      <p class="truncate font-medium text-slate-900">{model.label}</p>
                      <p class="truncate text-xs text-slate-500">{model.id}</p>
                    </div>
                    <div class="shrink-0 text-[0.72rem] uppercase tracking-[0.14em] text-slate-400">
                      {model.supportsTextGeneration ? "text" : ""}
                      {model.supportsTextGeneration && model.supportsSpeechToText ? " · " : ""}
                      {model.supportsSpeechToText ? "speech" : ""}
                    </div>
                  </li>
                {/each}
              </ul>
            </div>
          {:else}
            <p class="mt-5 text-sm text-slate-500">아직 불러온 모델이 없습니다.</p>
          {/if}
        </article>
      {/each}
    </div>
  </section>
</section>
