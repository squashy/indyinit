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
    node.setAttribute("data-owner", String(index % 6));
    if (node instanceof HTMLElement || node instanceof SVGElement) {
      node.style.animationDelay = `${index * SWEEP_MS}ms`;
    }
  });
  hero.replaceChildren(clone);
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
