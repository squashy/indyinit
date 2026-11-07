/** Minimal DOM for UI tests. Node has no document, and the suite adds no dependencies. */

type Listener = (event: DomEvent) => void;

export class DomEvent {
  bubbles = true;
  cancelable = true;
  defaultPrevented = false;
  target: DomNode | null = null;
  currentTarget: DomNode | DomDocument | null = null;
  type: string;
  constructor(type: string, init: { bubbles?: boolean } = {}) {
    this.type = type;
    if (init.bubbles === false) this.bubbles = false;
  }
  preventDefault(): void {
    if (this.cancelable) this.defaultPrevented = true;
  }
  stopPropagation(): void {
    this.bubbles = false;
  }
}

export class DomMouseEvent extends DomEvent {
  clientX = 0;
  clientY = 0;
  button = 0;
  constructor(type: string, init: { clientX?: number; clientY?: number; button?: number } = {}) {
    super(type);
    this.clientX = init.clientX ?? Number.NaN;
    this.clientY = init.clientY ?? Number.NaN;
    this.button = init.button ?? 0;
  }
}

export class DomKeyboardEvent extends DomEvent {
  key = "";
  shiftKey = false;
  constructor(type: string, init: { key?: string; shiftKey?: boolean } = {}) {
    super(type);
    this.key = init.key ?? "";
    this.shiftKey = init.shiftKey ?? false;
  }
}

export class DomClassList {
  owner: DomElement;
  constructor(owner: DomElement) {
    this.owner = owner;
  }
  contains(name: string): boolean {
    return this.owner.className.split(/\s+/).includes(name);
  }
  add(...names: string[]): void {
    const current = new Set(this.owner.className.split(/\s+/).filter(Boolean));
    for (const name of names) current.add(name);
    this.owner.className = [...current].join(" ");
  }
  remove(...names: string[]): void {
    const drop = new Set(names);
    this.owner.className = this.owner.className.split(/\s+/).filter((name) => name && !drop.has(name)).join(" ");
  }
  toggle(name: string, force?: boolean): boolean {
    const has = this.contains(name);
    const next = force ?? !has;
    if (next) this.add(name);
    else this.remove(name);
    return next;
  }
}

export class DomNode {
  parentElement: DomElement | null = null;
  ownerDocument: DomDocument | null = null;
  childNodes: DomNode[] = [];
  #text = "";

  get textContent(): string {
    if (this instanceof DomElement && this.children.length > 0) {
      return this.children.map((child) => child.textContent).join("");
    }
    return this.#text;
  }

  set textContent(value: string) {
    this.#text = value;
    if (this instanceof DomElement) {
      for (const child of [...this.children]) child.remove();
    }
  }
}

export class DomElement extends DomNode {
  id = "";
  className = "";
  tagName: string;
  #hidden = false;
  tabIndex = -1;
  attributes = new Map<string, string>();
  listeners = new Map<string, Listener[]>();
  children: DomElement[] = [];
  classList = new DomClassList(this);
  dataset: Record<string, string>;
  style: { setProperty: () => void } = { setProperty() {} };

  get hidden(): boolean {
    return this.#hidden;
  }

  set hidden(value: boolean) {
    this.#hidden = value;
    if (value) this.attributes.set("hidden", "");
    else this.attributes.delete("hidden");
  }

  constructor(tagName: string) {
    super();
    this.tagName = tagName.toUpperCase();
    const owner = this;
    this.dataset = new Proxy({} as Record<string, string>, {
      get(_target, key) {
        if (typeof key !== "string") return undefined;
        return owner.attributes.get(dataName(key));
      },
      set(_target, key, value) {
        if (typeof key !== "string") return false;
        owner.setAttribute(dataName(key), String(value));
        return true;
      },
      deleteProperty(_target, key) {
        if (typeof key !== "string") return false;
        owner.attributes.delete(dataName(key));
        return true;
      },
    });
  }

  get isConnected(): boolean {
    let node: DomNode | null = this;
    while (node.parentElement) node = node.parentElement;
    return node === this.ownerDocument?.documentElement;
  }

  setAttribute(name: string, value: string): void {
    this.attributes.set(name, value);
    if (name === "id") this.id = value;
    if (name === "class") this.className = value;
  }

  getAttribute(name: string): string | null {
    if (name === "id" && this.id) return this.id;
    if (name === "class") return this.className;
    if (name === "hidden") return this.#hidden ? "" : null;
    return this.attributes.get(name) ?? null;
  }

  removeAttribute(name: string): void {
    this.attributes.delete(name);
    if (name === "id") this.id = "";
    if (name === "class") this.className = "";
    if (name === "hidden") this.#hidden = false;
  }

  appendChild<T extends DomNode>(node: T): T {
    this.adopt(node);
    this.childNodes.push(node);
    if (node instanceof DomElement) this.children.push(node);
    return node;
  }

  insertBefore<T extends DomNode>(node: T, before: DomNode | null): T {
    this.adopt(node);
    const index = before ? this.childNodes.indexOf(before) : -1;
    if (index < 0) return this.appendChild(node);
    this.childNodes.splice(index, 0, node);
    if (node instanceof DomElement) {
      const childIndex = before instanceof DomElement ? this.children.indexOf(before) : -1;
      if (childIndex < 0) this.children.push(node);
      else this.children.splice(childIndex, 0, node);
    }
    return node;
  }

  remove(): void {
    const parent = this.parentElement;
    if (!parent) return;
    parent.childNodes = parent.childNodes.filter((node) => node !== this);
    parent.children = parent.children.filter((node) => node !== this);
    this.parentElement = null;
  }

  replaceChildren(...nodes: DomNode[]): void {
    for (const child of [...this.children]) child.remove();
    this.childNodes = [];
    this.textContent = "";
    for (const node of nodes) this.appendChild(node);
  }

  addEventListener(type: string, listener: Listener): void {
    const list = this.listeners.get(type) ?? [];
    list.push(listener);
    this.listeners.set(type, list);
  }

  removeEventListener(type: string, listener: Listener): void {
    const list = this.listeners.get(type) ?? [];
    this.listeners.set(type, list.filter((item) => item !== listener));
  }

  dispatchEvent(event: DomEvent): boolean {
    event.target = this;
    let node: DomNode | null = this;
    while (node) {
      event.currentTarget = node;
      if (node instanceof DomElement) {
        for (const listener of [...(node.listeners.get(event.type) ?? [])]) listener(event);
      }
      if (!event.bubbles) break;
      node = node.parentElement;
    }
    const doc = this.ownerDocument;
    if (event.bubbles && doc) {
      event.currentTarget = doc;
      for (const listener of [...(doc.listeners.get(event.type) ?? [])]) listener(event);
    }
    return !event.defaultPrevented;
  }

  click(): void {
    if (this instanceof DomButton && this.disabled) return;
    this.dispatchEvent(new DomMouseEvent("click"));
    if (this instanceof DomButton && this.type === "submit") {
      const form = this.closest("form");
      form?.dispatchEvent(new DomEvent("submit", { bubbles: false }));
    }
  }

  focus(): void {
    this.ownerDocument?.setActive(this);
  }

  scrollIntoView(): void {}

  append(...nodes: DomNode[]): void {
    for (const node of nodes) this.appendChild(node);
  }

  closest(selector: string): DomElement | null {
    let node: DomElement | null = this;
    while (node) {
      if (node.matches(selector)) return node;
      node = node.parentElement;
    }
    return null;
  }

  contains(node: DomNode | null): boolean {
    let current = node;
    while (current) {
      if (current === this) return true;
      current = current.parentElement;
    }
    return false;
  }

  querySelector(selector: string): DomElement | null {
    return this.querySelectorAll(selector)[0] ?? null;
  }

  querySelectorAll(selector: string): DomElement[] {
    const found: DomElement[] = [];
    for (const child of this.descendants()) {
      if (matchesSelector(child, selector)) found.push(child);
    }
    return found;
  }

  matches(selector: string): boolean {
    return matchesSelector(this, selector);
  }

  *descendants(): Generator<DomElement> {
    for (const child of this.children) {
      yield child;
      yield* child.descendants();
    }
  }

  private adopt(node: DomNode): void {
    if (node.parentElement) node.parentElement.removeChild(node);
    node.parentElement = this;
    node.ownerDocument = this.ownerDocument;
    if (node instanceof DomElement) {
      for (const descendant of node.descendants()) descendant.ownerDocument = this.ownerDocument;
    }
  }

  private removeChild(node: DomNode): void {
    this.childNodes = this.childNodes.filter((item) => item !== node);
    if (node instanceof DomElement) this.children = this.children.filter((item) => item !== node);
    node.parentElement = null;
  }
}

export class DomHTMLElement extends DomElement {}
export class DomButton extends DomHTMLElement {
  type = "button";
  disabled = false;
}
export class DomInput extends DomHTMLElement {
  type = "text";
  name = "";
  min = "";
  max = "";
  disabled = false;
  #value = "";

  get value(): string {
    return this.#value;
  }

  set value(next: string) {
    this.#value = next;
    this.dispatchEvent(new DomEvent("input"));
  }
}
export class DomTextArea extends DomHTMLElement {}
export class DomSelect extends DomHTMLElement {}
export class DomOList extends DomHTMLElement {}
export class DomForm extends DomHTMLElement {}
export class DomSVGElement extends DomElement {}
export class DomSVGSVGElement extends DomSVGElement {}

export class DomDocument {
  documentElement: DomElement;
  activeElement: DomElement | null = null;
  listeners = new Map<string, Listener[]>();
  elementFromPoint: (x: number, y: number) => DomElement | null = () => null;
  reducedMotion = false;
  defaultView: { matchMedia: (query: string) => { matches: boolean; media: string }; localStorage?: Storage };

  constructor() {
    this.documentElement = new DomHTMLElement("html");
    this.documentElement.ownerDocument = this;
    const doc = this;
    this.defaultView = {
      matchMedia(query: string) {
        const reduce = query.includes("prefers-reduced-motion");
        return { matches: reduce ? doc.reducedMotion : false, media: query };
      },
    };
  }

  setActive(element: DomElement | null): void {
    this.activeElement = element;
  }

  createElement(tag: string): DomHTMLElement {
    const made = createTag(tag);
    made.ownerDocument = this;
    return made;
  }

  getElementById(id: string): DomElement | null {
    if (this.documentElement.id === id) return this.documentElement;
    for (const node of this.documentElement.descendants()) {
      if (node.id === id) return node;
    }
    return null;
  }

  querySelector(selector: string): DomElement | null {
    return this.querySelectorAll(selector)[0] ?? null;
  }

  querySelectorAll(selector: string): DomElement[] {
    return this.documentElement.querySelectorAll(selector);
  }

  addEventListener(type: string, listener: Listener): void {
    const list = this.listeners.get(type) ?? [];
    list.push(listener);
    this.listeners.set(type, list);
  }
}

let installed = false;

export function installDom(): void {
  if (installed) return;
  installed = true;
  const target = globalThis as unknown as Record<string, unknown>;
  target.HTMLElement = DomHTMLElement;
  target.HTMLButtonElement = DomButton;
  target.HTMLInputElement = DomInput;
  target.HTMLTextAreaElement = DomTextArea;
  target.HTMLSelectElement = DomSelect;
  target.HTMLOListElement = DomOList;
  target.HTMLFormElement = DomForm;
  target.SVGElement = DomSVGElement;
  target.SVGSVGElement = DomSVGSVGElement;
  target.Element = DomElement;
  target.Node = DomNode;
  target.MouseEvent = DomMouseEvent;
  target.KeyboardEvent = DomKeyboardEvent;
  target.Event = DomEvent;
  target.window = {
    setTimeout: globalThis.setTimeout.bind(globalThis),
    clearTimeout: globalThis.clearTimeout.bind(globalThis),
    matchMedia(query: string) {
      const reduce = query.includes("prefers-reduced-motion");
      return { matches: reduce ? currentDocument?.reducedMotion === true : false, media: query };
    },
  };
}

let currentDocument: DomDocument | null = null;

export function createDocument(): DomDocument {
  installDom();
  const doc = new DomDocument();
  currentDocument = doc;
  const body = doc.createElement("div");
  body.setAttribute("id", "app");
  doc.documentElement.appendChild(body);
  return doc;
}

export function useDocument(doc: DomDocument): void {
  currentDocument = doc;
}

function createTag(tag: string): DomHTMLElement {
  const name = tag.toLowerCase();
  if (name === "button") return new DomButton("button");
  if (name === "input") return new DomInput("input");
  if (name === "textarea") return new DomTextArea("textarea");
  if (name === "select") return new DomSelect("select");
  if (name === "ol") return new DomOList("ol");
  if (name === "form") return new DomForm("form");
  if (name === "svg") return new DomSVGSVGElement("svg") as unknown as DomHTMLElement;
  return new DomHTMLElement(name);
}

function dataName(key: string): string {
  return `data-${key.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)}`;
}

function matchesSelector(element: DomElement, selector: string): boolean {
  const groups = selector.split(",").map((part) => part.trim()).filter(Boolean);
  return groups.some((group) => matchesGroup(element, group));
}

function matchesGroup(element: DomElement, selector: string): boolean {
  const parts = splitDescendant(selector);
  if (parts.length === 0) return false;
  const last = parts[parts.length - 1];
  if (!last || !matchesCompound(element, last)) return false;
  let ancestor: DomElement | null = element.parentElement;
  for (let index = parts.length - 2; index >= 0; index -= 1) {
    const part = parts[index];
    if (!part) return false;
    while (ancestor && !matchesCompound(ancestor, part)) ancestor = ancestor.parentElement;
    if (!ancestor) return false;
    ancestor = ancestor.parentElement;
  }
  return true;
}

function splitDescendant(selector: string): string[] {
  const parts: string[] = [];
  let current = "";
  let depth = 0;
  for (const char of selector.trim()) {
    if (char === "[") depth += 1;
    if (char === "]") depth -= 1;
    if (char === " " && depth === 0) {
      if (current) parts.push(current);
      current = "";
    } else current += char;
  }
  if (current) parts.push(current);
  return parts;
}

function matchesCompound(element: DomElement, compound: string): boolean {
  let rest = compound;
  const nots: string[] = [];
  rest = rest.replace(/:not\(([^)]+)\)/g, (_match, inner: string) => {
    nots.push(inner);
    return "";
  });
  if (nots.some((inner) => matchesCompound(element, inner))) return false;
  const id = rest.match(/#([\w-]+)/);
  if (id && element.id !== id[1]) return false;
  rest = rest.replace(/#[\w-]+/g, "");
  const classes = [...rest.matchAll(/\.([\w-]+)/g)].map((match) => match[1] ?? "");
  if (classes.some((name) => !element.classList.contains(name))) return false;
  rest = rest.replace(/\.[\w-]+/g, "");
  for (const attr of rest.matchAll(/\[([\w-]+)(?:=(?:"([^"]*)"|'([^']*)'))?\]/g)) {
    const name = attr[1] ?? "";
    const expected = attr[2] ?? attr[3];
    const actual = element.getAttribute(name);
    if (actual === null) return false;
    if (expected !== undefined && actual !== expected) return false;
  }
  rest = rest.replace(/\[[^\]]+\]/g, "").trim().toLowerCase();
  if (rest && element.tagName.toLowerCase() !== rest) return false;
  return true;
}
