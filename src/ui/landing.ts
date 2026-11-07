const SWEEP_MS = 28;

export function bindLanding(doc: Document): void {
  const hero = doc.getElementById("landing-hero");
  const map = doc.getElementById("map");
  if (!(hero instanceof HTMLElement) || !(map instanceof Element)) return;
  if (hero.querySelector("#landing-map")) return;
  const clone = map.cloneNode(true);
  if (!(clone instanceof Element)) return;
  clone.removeAttribute("id");
  clone.removeAttribute("tabindex");
  clone.setAttribute("aria-hidden", "true");
  for (const node of Array.from(clone.querySelectorAll("[id]"))) {
    const id = node.getAttribute("id");
    if (id && !id.startsWith("landing-")) node.setAttribute("id", `landing-${id}`);
  }
  eachElement(clone, (node) => {
    retarget(node, "href");
    retarget(node, "fill");
    retarget(node, "stroke");
    retarget(node, "filter");
    retarget(node, "clip-path");
  });
  clone.setAttribute("id", "landing-map");
  const counties = clone.querySelectorAll(".county");
  counties.forEach((node, index) => {
    node.removeAttribute("data-county-id");
    node.removeAttribute("tabindex");
    node.removeAttribute("role");
    const seat = index % 6;
    node.setAttribute("data-owner", String(seat));
    const delay = `${sweepMs(node, index)}ms`;
    if (node instanceof HTMLElement || node instanceof SVGElement) {
      node.style.animationDelay = delay;
      node.style.setProperty("--sweep", delay);
      node.style.setProperty("--settled", `var(--owner-${seat})`);
    }
    const shape = node.querySelector(".county-shape");
    if (shape instanceof HTMLElement || shape instanceof SVGElement) shape.style.animationDelay = delay;
  });
  hero.replaceChildren(clone);
}

function sweepMs(node: Element, index: number): number {
  const label = node.querySelector(".county-label");
  const y = Number(label?.getAttribute("y"));
  if (!Number.isFinite(y)) return index * SWEEP_MS;
  const south = Math.min(1, Math.max(0, (y - 60) / 820));
  return Math.round(south * 2600);
}

function eachElement(node: Element, visit: (node: Element) => void): void {
  visit(node);
  for (const child of Array.from(node.children)) eachElement(child, visit);
}

function retarget(node: Element, name: string): void {
  const value = node.getAttribute(name);
  if (!value || !value.includes("#")) return;
  node.setAttribute(name, value.replace(/#(?!landing-)([\w-]+)/g, "#landing-$1"));
}
