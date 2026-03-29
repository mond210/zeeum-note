<script>
  import { onDestroy, onMount } from "svelte";
  import { createEventDispatcher } from "svelte";
  import { fade, scale } from "svelte/transition";
  import { Editor, Node, mergeAttributes } from "@tiptap/core";
  import Collaboration from "@tiptap/extension-collaboration";
  import CollaborationCaret from "@tiptap/extension-collaboration-caret";
  import Image from "@tiptap/extension-image";
  import Link from "@tiptap/extension-link";
  import Placeholder from "@tiptap/extension-placeholder";
  import TaskItem from "@tiptap/extension-task-item";
  import TaskList from "@tiptap/extension-task-list";
  import StarterKit from "@tiptap/starter-kit";
  import { WebsocketProvider } from "y-websocket";
  import * as Y from "yjs";
  import { EMPTY_DOC, ensureRichDoc, markdownToHtml } from "../lib/rich-doc.js";

  export let content = EMPTY_DOC;
  export let contentFormat = "tiptap-json";
  export let currentUser = null;
  export let documentId = null;
  export let disabled = false;
  export let placeholder = "Start writing...";
  export let projectId = null;

  const dispatch = createEventDispatcher();

  let editor;
  let element;
  let lastAppliedSignature = "";
  let lastEmittedSignature = "";
  let collaborationEnabled = false;
  let mediaDialog = null;
  let mediaMenu = null;
  let provider;
  let uploading = false;
  let ydoc;

  const ResizableImage = Image.extend({
    addAttributes() {
      return {
        ...this.parent?.(),
        width: {
          default: null,
          parseHTML: (element) => {
            const value = element.getAttribute("data-width") || element.style.width;
            const width = Number.parseInt(String(value || "").replace("px", ""), 10);
            return Number.isFinite(width) ? width : null;
          },
          renderHTML: (attributes) => {
            if (!attributes.width) {
              return {};
            }

            return {
              "data-width": attributes.width,
              style: `width:${attributes.width}px;max-width:100%;`
            };
          }
        }
      };
    }
  });

  const VideoBlock = Node.create({
    addAttributes() {
      return {
        controls: {
          default: true
        },
        src: {
          default: null
        },
        width: {
          default: null,
          parseHTML: (element) => {
            const value = element.getAttribute("data-width") || element.style.width;
            const width = Number.parseInt(String(value || "").replace("px", ""), 10);
            return Number.isFinite(width) ? width : null;
          },
          renderHTML: (attributes) => {
            if (!attributes.width) {
              return {};
            }

            return {
              "data-width": attributes.width,
              style: `width:${attributes.width}px;max-width:100%;`
            };
          }
        }
      };
    },
    draggable: true,
    group: "block",
    name: "videoBlock",
    parseHTML() {
      return [{ tag: "video[src]" }];
    },
    renderHTML({ HTMLAttributes }) {
      return [
        "video",
        mergeAttributes(HTMLAttributes, {
          class: "editor-video-block",
          controls: HTMLAttributes.controls ? "true" : null,
          playsinline: "true"
        })
      ];
    }
  });

  function signatureFor(format, value) {
    return JSON.stringify({ format, value });
  }

  function resolvedContent(format, value) {
    if (format === "markdown") {
      return markdownToHtml(typeof value === "string" ? value : "");
    }

    return ensureRichDoc(value);
  }

  function applyIncomingContent() {
    if (!editor || !documentId || provider) {
      return;
    }

    const signature = signatureFor(contentFormat, content);

    if (signature === lastAppliedSignature || signature === lastEmittedSignature) {
      return;
    }

    editor.commands.setContent(resolvedContent(contentFormat, content), false);
    lastAppliedSignature = signature;
  }

  function emitChange() {
    if (!editor || collaborationEnabled) {
      return;
    }

    const payload = {
      content: editor.getJSON(),
      contentFormat: "tiptap-json",
      html: editor.getHTML(),
      text: editor.getText()
    };

    lastEmittedSignature = signatureFor(payload.contentFormat, payload.content);
    dispatch("change", payload);
  }

  function promptLink() {
    if (!editor) {
      return;
    }

    const previousUrl = editor.getAttributes("link").href;
    const url = window.prompt("링크 URL을 입력하세요.", previousUrl || "https://");

    if (url === null) {
      return;
    }

    if (url.trim() === "") {
      editor.chain().focus().unsetLink().run();
      return;
    }

    editor.chain().focus().extendMarkRange("link").setLink({ href: url.trim() }).run();
  }

  function closeMediaDialog() {
    mediaDialog = null;
  }

  function closeMediaMenu() {
    mediaMenu = null;
  }

  function openMediaSettings() {
    if (!mediaMenu) {
      return;
    }

    mediaDialog = {
      ...mediaMenu,
      width: mediaMenu.width || 640
    };
    closeMediaMenu();
  }

  function updateMediaWidth(width) {
    if (!editor || !mediaDialog) {
      return;
    }

    const normalizedWidth = Math.max(160, Math.min(1200, Number(width) || 640));

    editor
      .chain()
      .focus()
      .setNodeSelection(mediaDialog.pos)
      .updateAttributes(mediaDialog.type, { width: normalizedWidth })
      .run();

    mediaDialog = {
      ...mediaDialog,
      width: normalizedWidth
    };
  }

  function applyMediaWidth() {
    if (!mediaDialog) {
      return;
    }

    updateMediaWidth(mediaDialog.width);
    closeMediaDialog();
  }

  function openMediaMenuAt(event, view) {
    const mediaElement = event.target?.closest?.("img.editor-image-block, video.editor-video-block");

    if (!mediaElement || !editor) {
      return false;
    }

    const pos = view.posAtDOM(mediaElement, 0);
    const node = view.state.doc.nodeAt(pos);

    if (!node) {
      return false;
    }

    const type = node.type.name === "videoBlock" ? "videoBlock" : "image";
    const measuredWidth = Math.round(mediaElement.getBoundingClientRect().width);

    mediaMenu = {
      height: mediaElement.getBoundingClientRect().height,
      pos,
      type,
      width: node.attrs.width || measuredWidth || 640,
      x: event.clientX,
      y: event.clientY
    };

    event.preventDefault();
    return true;
  }

  function currentUserLabel() {
    const name = currentUser?.name || "User";
    const parts = name.trim().split(/\s+/).filter(Boolean);
    return parts.slice(0, 2).map((part) => part[0]).join("").toUpperCase() || "U";
  }

  function currentUserColor() {
    const palette = ["#f59e0b", "#10b981", "#0ea5e9", "#ec4899", "#8b5cf6"];
    const seed = (currentUser?.name || currentUser?.email || "user")
      .split("")
      .reduce((sum, char) => sum + char.charCodeAt(0), 0);
    return palette[seed % palette.length];
  }

  function collaborationRoom() {
    if (!projectId || !documentId) {
      return "";
    }

    return `project:${projectId}:page:${documentId}`;
  }

  async function uploadAsset(file) {
    const formData = new FormData();
    formData.append("file", file);

    const response = await fetch("/api/uploads", {
      body: formData,
      method: "POST"
    });

    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      throw new Error(payload.error || "파일 업로드에 실패했습니다.");
    }

    const payload = await response.json();
    return payload.asset;
  }

  async function insertDroppedFiles(files, view, event) {
    if (!editor || files.length === 0) {
      return;
    }

    uploading = true;

    try {
      const coords = view.posAtCoords({
        left: event.clientX,
        top: event.clientY
      });

      if (coords?.pos) {
        editor.chain().focus().setTextSelection(coords.pos).run();
      } else {
        editor.chain().focus().run();
      }

      for (const file of files) {
        const asset = await uploadAsset(file);

        if (asset.type === "image") {
          editor
            .chain()
            .focus()
            .insertContent({
              attrs: {
                alt: file.name,
                src: asset.url
              },
              type: "image"
            })
            .createParagraphNear()
            .run();
          continue;
        }

        if (asset.type === "video") {
          editor
            .chain()
            .focus()
            .insertContent({
              attrs: {
                controls: true,
                src: asset.url
              },
              type: "videoBlock"
            })
            .createParagraphNear()
            .run();
        }
      }
    } finally {
      uploading = false;
    }
  }

  onMount(() => {
    if (documentId && projectId && currentUser) {
      collaborationEnabled = true;
      ydoc = new Y.Doc();
      provider = new WebsocketProvider(
        `${window.location.protocol === "https:" ? "wss" : "ws"}://${window.location.host}/api/collab`,
        collaborationRoom(),
        ydoc,
        {
          connect: true,
          params: {
            auth: window.localStorage.getItem("zeeum_auth_token") || ""
          }
        }
      );
    }

    editor = new Editor({
      content: provider ? undefined : resolvedContent(contentFormat, content),
      editorProps: {
        attributes: {
          class:
            "tiptap-surface min-h-[26rem] bg-white px-0 py-2 text-[15px] leading-7 text-slate-700 outline-none"
        },
        handleDOMEvents: {
          contextmenu(view, event) {
            return openMediaMenuAt(event, view);
          }
        },
        handleDrop(view, event) {
          const files = Array.from(event.dataTransfer?.files || []).filter((file) => {
            return file.type.startsWith("image/") || file.type.startsWith("video/");
          });

          if (files.length === 0) {
            return false;
          }

          event.preventDefault();
          void insertDroppedFiles(files, view, event);
          return true;
        }
      },
      element,
      editable: !disabled,
      extensions: [
        ResizableImage.configure({
          HTMLAttributes: {
            class: "editor-image-block"
          }
        }),
        StarterKit.configure({
          heading: {
            levels: [1, 2, 3]
          },
          undoRedo: !collaborationEnabled
        }),
        Link.configure({
          autolink: true,
          openOnClick: false
        }),
        Placeholder.configure({
          placeholder
        }),
        TaskList,
        VideoBlock,
        TaskItem.configure({
          nested: true
        }),
        ...(collaborationEnabled
          ? [
              Collaboration.configure({
                document: ydoc,
                field: "prosemirror"
              }),
              CollaborationCaret.configure({
                provider,
                render: (user) => {
                  const cursor = document.createElement("span");
                  cursor.classList.add("collaboration-carets__caret");
                  cursor.style.borderColor = user.color;

                  const label = document.createElement("div");
                  label.classList.add("collaboration-carets__label");
                  label.style.backgroundColor = user.color;
                  label.textContent = user.name;
                  cursor.append(label);
                  return cursor;
                },
                user: {
                  color: currentUserColor(),
                  name: currentUserLabel()
                }
              })
            ]
          : [])
      ],
      onUpdate() {
        emitChange();
      }
    });

    lastAppliedSignature = signatureFor(contentFormat, content);
    return () => editor?.destroy();
  });

  onDestroy(() => {
    provider?.destroy();
    ydoc?.destroy();
    editor?.destroy();
  });

  $: if (editor) {
    editor.setEditable(!disabled);
    applyIncomingContent();
  }

  $: toolbarItems = [
    {
      action: () => editor?.chain().focus().toggleBold().run(),
      active: editor?.isActive("bold"),
      icon: "format_bold",
      label: "Bold"
    },
    {
      action: () => editor?.chain().focus().toggleItalic().run(),
      active: editor?.isActive("italic"),
      icon: "format_italic",
      label: "Italic"
    },
    {
      action: () => editor?.chain().focus().toggleStrike().run(),
      active: editor?.isActive("strike"),
      icon: "strikethrough_s",
      label: "Strike"
    },
    {
      action: () => editor?.chain().focus().toggleHeading({ level: 1 }).run(),
      active: editor?.isActive("heading", { level: 1 }),
      icon: "format_h1",
      label: "Heading 1"
    },
    {
      action: () => editor?.chain().focus().toggleHeading({ level: 2 }).run(),
      active: editor?.isActive("heading", { level: 2 }),
      icon: "format_h2",
      label: "Heading 2"
    },
    {
      action: () => editor?.chain().focus().toggleBulletList().run(),
      active: editor?.isActive("bulletList"),
      icon: "format_list_bulleted",
      label: "Bulleted list"
    },
    {
      action: () => editor?.chain().focus().toggleOrderedList().run(),
      active: editor?.isActive("orderedList"),
      icon: "format_list_numbered",
      label: "Numbered list"
    },
    {
      action: () => editor?.chain().focus().toggleTaskList().run(),
      active: editor?.isActive("taskList"),
      icon: "checklist",
      label: "Checklist"
    },
    {
      action: () => editor?.chain().focus().toggleBlockquote().run(),
      active: editor?.isActive("blockquote"),
      icon: "format_quote",
      label: "Quote"
    },
    {
      action: () => editor?.chain().focus().toggleCodeBlock().run(),
      active: editor?.isActive("codeBlock"),
      icon: "code_blocks",
      label: "Code block"
    },
    {
      action: () => promptLink(),
      active: editor?.isActive("link"),
      icon: "link",
      label: "Link"
    },
    {
      action: () => editor?.chain().focus().setHorizontalRule().run(),
      active: false,
      icon: "horizontal_rule",
      label: "Divider"
    }
  ];
</script>

<div class="relative pb-24">
  <div bind:this={element}></div>

  {#if uploading}
    <div class="pointer-events-none absolute right-0 top-0 rounded-full bg-slate-950 px-3 py-1.5 text-xs font-semibold text-white">
      Uploading…
    </div>
  {/if}

  {#if editor}
    <div class="pointer-events-none fixed bottom-6 left-1/2 z-30 -translate-x-1/2">
      <div class="pointer-events-auto flex items-center gap-1 rounded-full border border-slate-200/80 bg-white/92 px-2 py-2 shadow-[0_16px_40px_rgba(15,23,42,0.14)] backdrop-blur-md">
        {#each toolbarItems as item, index}
          {#if index === 3 || index === 5 || index === 9}
            <div class="mx-1 h-7 w-px bg-slate-200"></div>
          {/if}
          <button
            type="button"
            class={`grid h-10 w-10 place-items-center rounded-full transition ${
              item.active
                ? "bg-sky-700 text-white shadow-[0_8px_20px_rgba(3,105,161,0.28)]"
                : "text-slate-500 hover:bg-slate-100 hover:text-slate-950"
            }`}
            aria-label={item.label}
            title={item.label}
            on:click={item.action}
          >
            <span class={`material-symbols-rounded ${item.active ? "is-filled" : ""}`}>{item.icon}</span>
          </button>
        {/each}
      </div>
    </div>
  {/if}

  {#if mediaMenu}
    <button
      type="button"
      class="fixed inset-0 z-40"
      aria-label="Close media menu"
      on:click={closeMediaMenu}
    ></button>
    <div
      class="fixed z-50 min-w-[180px] rounded-2xl border border-slate-200 bg-white p-2 shadow-[0_18px_40px_rgba(15,23,42,0.16)]"
      style={`left:${mediaMenu.x}px; top:${mediaMenu.y}px;`}
      transition:fade={{ duration: 120 }}
    >
      <button
        type="button"
        class="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-sm font-medium text-slate-700 transition hover:bg-slate-100"
        on:click={openMediaSettings}
      >
        <span class="material-symbols-rounded">tune</span>
        <span>{mediaMenu.type === "image" ? "Image settings" : "Video settings"}</span>
      </button>
    </div>
  {/if}

  {#if mediaDialog}
    <button
      type="button"
      class="fixed inset-0 z-50 bg-black/22 backdrop-blur-[2px]"
      aria-label="Close media settings"
      on:click={closeMediaDialog}
      transition:fade={{ duration: 140 }}
    ></button>
    <div class="fixed inset-0 z-[60] grid place-items-center px-4">
      <div
        class="dialog-surface w-full max-w-[420px] rounded-[1.3rem] border border-slate-200/90 px-6 py-6"
        transition:scale={{ duration: 170, start: 0.96 }}
      >
        <div class="flex items-start justify-between gap-4">
          <div>
            <p class="text-xs font-semibold uppercase tracking-[0.18em] text-sky-700">
              {mediaDialog.type === "image" ? "Image" : "Video"}
            </p>
            <h3 class="mt-2 text-[1.6rem] font-semibold tracking-[-0.05em] text-slate-950">
              Display size
            </h3>
            <p class="mt-2 text-sm leading-6 text-slate-500">
              Resize how this media renders inside the document without changing the original file.
            </p>
          </div>

          <button
            type="button"
            class="rounded-full border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-500 transition hover:border-slate-300 hover:text-slate-800"
            on:click={closeMediaDialog}
          >
            Close
          </button>
        </div>

        <div class="mt-6 space-y-4">
          <label class="block">
            <span class="mb-2 block text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Width</span>
            <input
              type="range"
              min="160"
              max="1200"
              step="10"
              value={mediaDialog.width}
              class="w-full accent-sky-600"
              on:input={(event) =>
                (mediaDialog = { ...mediaDialog, width: Number(event.currentTarget.value) })}
            />
          </label>

          <label class="block">
            <span class="mb-2 block text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Pixels</span>
            <input
              type="number"
              min="160"
              max="1200"
              step="10"
              class="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700 outline-none transition focus:border-sky-500 focus:ring-4 focus:ring-sky-100"
              value={mediaDialog.width}
              on:input={(event) =>
                (mediaDialog = { ...mediaDialog, width: Number(event.currentTarget.value) })}
            />
          </label>

          <div class="flex justify-end gap-2 pt-2">
            <button
              type="button"
              class="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-300"
              on:click={closeMediaDialog}
            >
              Cancel
            </button>
            <button
              type="button"
              class="rounded-full bg-sky-700 px-4 py-2 text-sm font-semibold text-white transition hover:bg-sky-800"
              on:click={applyMediaWidth}
            >
              Apply
            </button>
          </div>
        </div>
      </div>
    </div>
  {/if}
</div>
