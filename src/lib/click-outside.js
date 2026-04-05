export function clickOutside(node, enabled = true) {
  let active = !!enabled;

  function handlePointerDown(event) {
    if (!active) {
      return;
    }

    if (node.contains(event.target)) {
      return;
    }

    node.dispatchEvent(
      new CustomEvent("clickoutside", {
        detail: { target: event.target }
      })
    );
  }

  document.addEventListener("pointerdown", handlePointerDown, true);

  return {
    update(nextEnabled) {
      active = !!nextEnabled;
    },
    destroy() {
      document.removeEventListener("pointerdown", handlePointerDown, true);
    }
  };
}
