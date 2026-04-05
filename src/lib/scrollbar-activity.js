export function scrollbarActivity(node) {
  let scrollTimer = null;

  function setActive(active) {
    if (active) {
      node.dataset.scrollActive = "true";
      return;
    }

    delete node.dataset.scrollActive;
  }

  function handleScroll() {
    setActive(true);

    if (scrollTimer) {
      clearTimeout(scrollTimer);
    }

    scrollTimer = window.setTimeout(() => {
      scrollTimer = null;
      setActive(false);
    }, 720);
  }

  node.addEventListener("scroll", handleScroll, { passive: true });

  return {
    destroy() {
      node.removeEventListener("scroll", handleScroll);

      if (scrollTimer) {
        clearTimeout(scrollTimer);
      }
    }
  };
}
