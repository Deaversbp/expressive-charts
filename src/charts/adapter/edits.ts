// Every change the adapter makes to the host's elements, with what was there before, so it can all
// be undone: attributes (tabindex, ARIA), inline style properties and classes. Touching el.style or
// el.classList rewrites the whole attribute, so once the last of our changes is undone, an attribute
// that reads the same as before gets its exact text back (or goes away, if it wasn't there).
//
// A host that reuses its elements may rewrite an attribute we also write (its own aria-label, as the
// data changes). Its latest value is the one to put back, so an attribute that no longer reads as we
// left it takes the host's value as its new original, and undoing our change leaves the host's alone.

/** An attribute we changed. null: absent. */
interface SavedAttribute {
  /** What to put back: the host's value from before our first change, or the one it wrote since. */
  original: string | null;
  /** What we last left it as. */
  written: string | null;
}

interface Saved {
  readonly attributes: Map<string, SavedAttribute>;
  /** Inline style properties we changed: their value and priority before. */
  readonly styles: Map<string, { readonly value: string; readonly priority: string }>;
  /** Classes we added (ones the element already had are left alone). */
  readonly classes: Set<string>;
  /** The style and class attributes' text from before our first change to each. */
  readonly before: { style?: { readonly text: string | null; readonly css: string }; class?: string | null };
}

export interface HostEdits {
  /** Sets an attribute; null puts back the host's value, unless the host has written its own since. */
  attribute(element: Element, name: string, value: string | null): void;
  /** Removes an attribute; `attribute(element, name, null)` puts it back. */
  remove(element: Element, name: string): void;
  /** Sets an inline style property; undefined puts back what was there before. */
  style(element: Element, property: string, value: string | undefined): void;
  /** Whether we're overriding the property now. */
  styled(element: Element, property: string): boolean;
  /** Adds (true) or removes (false) a class we add; classes the element had stay. */
  toggleClass(element: Element, name: string, on: boolean): void;
  /** Undoes every change to the element. */
  restore(element: Element): void;
  /** Undoes every change to every element. */
  restoreAll(): void;
  /** Elements with changes. */
  elements(): Element[];
}

export function hostEdits(): HostEdits {
  const saved = new Map<Element, Saved>();

  const entry = (element: Element): Saved => {
    let found = saved.get(element);
    if (!found) {
      found = { attributes: new Map(), styles: new Map(), classes: new Set(), before: {} };
      saved.set(element, found);
    }
    return found;
  };

  const styleOf = (element: Element): CSSStyleDeclaration | undefined => (element as SVGElement).style;

  const put = (element: Element, name: string, text: string | null): void => {
    if (text === null) element.removeAttribute(name);
    else if (element.getAttribute(name) !== text) element.setAttribute(name, text);
  };

  /** After the last of our style changes is undone: the exact text, if nothing else changed meanwhile. */
  const settleStyle = (element: Element, found: Saved): void => {
    const before = found.before.style;
    if (found.styles.size > 0 || !before) return;
    found.before.style = undefined;
    if (styleOf(element)?.cssText === before.css) put(element, "style", before.text);
  };

  const settleClass = (element: Element, found: Saved): void => {
    const before = found.before.class;
    if (found.classes.size > 0 || before === undefined) return;
    found.before.class = undefined;
    const tokens = (text: string | null | undefined): string => [...new Set((text ?? "").split(/\s+/).filter(Boolean))].sort().join(" ");
    if (tokens(element.getAttribute("class")) === tokens(before)) put(element, "class", before);
  };

  /** Sets (text) or removes (null) an attribute, keeping the host's value to put back. */
  function write(element: Element, name: string, text: string | null): void {
    const now = element.getAttribute(name);
    const kept = entry(element).attributes;
    const found = kept.get(name);
    if (!found) kept.set(name, { original: now, written: text });
    else {
      // The host changed it since we last wrote it: that's its value now.
      if (now !== found.written) found.original = now;
      found.written = text;
    }
    put(element, name, text);
  }

  function attribute(element: Element, name: string, value: string | null): void {
    if (value !== null) {
      write(element, name, value);
      return;
    }
    const kept = saved.get(element)?.attributes;
    const found = kept?.get(name);
    if (!kept || !found) return;
    // Unless the host has written its own since, which stays.
    if (element.getAttribute(name) === found.written) put(element, name, found.original);
    kept.delete(name);
  }

  function style(element: Element, property: string, value: string | undefined): void {
    const declaration = styleOf(element);
    if (!declaration) return;
    const found = entry(element);
    const original = found.styles.get(property);
    if (value === undefined) {
      if (!original) return;
      if (original.value === "") declaration.removeProperty(property);
      else declaration.setProperty(property, original.value, original.priority);
      found.styles.delete(property);
      settleStyle(element, found);
      return;
    }
    if (!original) {
      if (found.styles.size === 0) found.before.style = { text: element.getAttribute("style"), css: declaration.cssText };
      found.styles.set(property, { value: declaration.getPropertyValue(property), priority: declaration.getPropertyPriority(property) });
    }
    if (declaration.getPropertyValue(property) !== value) declaration.setProperty(property, value);
  }

  function toggleClass(element: Element, name: string, on: boolean): void {
    const list = element.classList;
    if (on) {
      if (list.contains(name)) return;
      const found = entry(element);
      if (found.classes.size === 0) found.before.class = element.getAttribute("class");
      found.classes.add(name);
      list.add(name);
      return;
    }
    const found = saved.get(element);
    if (!found?.classes.delete(name)) return;
    list.remove(name);
    settleClass(element, found);
  }

  function restore(element: Element): void {
    const found = saved.get(element);
    if (!found) return;
    for (const property of [...found.styles.keys()]) style(element, property, undefined);
    for (const name of [...found.classes]) toggleClass(element, name, false);
    for (const name of [...found.attributes.keys()]) attribute(element, name, null);
    saved.delete(element);
  }

  return {
    attribute,
    remove: (element, name) => write(element, name, null),
    style,
    styled: (element, property) => saved.get(element)?.styles.has(property) ?? false,
    toggleClass,
    restore,
    restoreAll() {
      for (const element of [...saved.keys()]) restore(element);
    },
    elements: () => [...saved.keys()]
  };
}
