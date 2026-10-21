// DOM order follows visual order, so screen readers read the marks as they're seen.

/**
 * Moves the marks' elements in `layer` from `previous` into `next` order, when it changed. The element
 * with focus (`active`) stays put and the others move around it, because moving a focused element blurs it.
 */
export function orderElements(layer: Element, previous: readonly Element[], next: readonly Element[], active: () => Element | null): void {
  if (!next.some((element, i) => previous[i] !== element)) return;
  const focused = active();
  const pivot = next.findIndex((element) => element === focused);
  const anchor = next[pivot] ?? null;
  next.forEach((element, i) => {
    if (i < pivot) layer.insertBefore(element, anchor);
    else if (i > pivot) layer.appendChild(element);
  });
}
