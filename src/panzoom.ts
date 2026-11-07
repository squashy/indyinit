export interface PanZoom {
  reset(): void;
  zoomBy(factor: number): void;
}

export function attachPanZoom(svg: SVGSVGElement): PanZoom {
  const base = readViewBox(svg);
  if (!base) {
    return { reset() {}, zoomBy() {} };
  }
  let view = base;
  let suppressClick = false;
  const pointers = new Map<number, { x: number; y: number }>();
  let drag: { id: number; x: number; y: number; moved: boolean } | null = null;
  let pinch: { distance: number; x: number; y: number } | null = null;

  const column = svg.closest(".map-column");
  const frame: HTMLElement | SVGSVGElement = column instanceof HTMLElement ? column : svg;
  const apply = (next: ViewBox) => {
    view = clamp(next, base);
    svg.setAttribute("viewBox", `${view.x} ${view.y} ${view.width} ${view.height}`);
  };

  const zoomAt = (factor: number, clientX: number, clientY: number) => {
    const point = userPoint(svg, view, clientX, clientY);
    if (!point) return;
    const width = view.width * factor;
    const height = view.height * factor;
    const rx = (point.x - view.x) / view.width;
    const ry = (point.y - view.y) / view.height;
    apply({ x: point.x - rx * width, y: point.y - ry * height, width, height });
  };

  frame.addEventListener("wheel", (event) => {
    if (!(event instanceof WheelEvent)) return;
    event.preventDefault();
    const factor = event.deltaY > 0 ? 1.12 : 0.88;
    zoomAt(factor, event.clientX, event.clientY);
  }, { passive: false });

  svg.addEventListener("keydown", (event) => {
    if (event.key === "+" || event.key === "=") {
      event.preventDefault();
      zoomAt(0.88, center(svg).x, center(svg).y);
    } else if (event.key === "-" || event.key === "_") {
      event.preventDefault();
      zoomAt(1.12, center(svg).x, center(svg).y);
    } else if (event.key === "0") {
      event.preventDefault();
      apply(base);
    }
  });

  frame.addEventListener("pointerdown", (event) => {
    if (!(event instanceof PointerEvent)) return;
    if (event.button !== 0 && event.pointerType === "mouse") return;
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    frame.setPointerCapture(event.pointerId);
    if (pointers.size === 2) {
      pinch = pinchStart(pointers);
      drag = null;
      return;
    }
    drag = { id: event.pointerId, x: event.clientX, y: event.clientY, moved: false };
  });

  frame.addEventListener("pointermove", (event) => {
    if (!(event instanceof PointerEvent)) return;
    const previous = pointers.get(event.pointerId);
    if (!previous) return;
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointers.size >= 2 && pinch) {
      const next = pinchStart(pointers);
      if (!next || pinch.distance === 0) return;
      zoomAt(pinch.distance / next.distance, next.x, next.y);
      pinch = next;
      suppressClick = true;
      return;
    }
    if (!drag || drag.id !== event.pointerId) return;
    const dx = event.clientX - drag.x;
    const dy = event.clientY - drag.y;
    if (!drag.moved && Math.hypot(dx, dy) < 6) return;
    drag.moved = true;
    suppressClick = true;
    const rect = svg.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;
    apply({
      x: view.x - (dx / rect.width) * view.width,
      y: view.y - (dy / rect.height) * view.height,
      width: view.width,
      height: view.height,
    });
    drag.x = event.clientX;
    drag.y = event.clientY;
  });

  const endPointer = (event: Event) => {
    if (!(event instanceof PointerEvent)) return;
    pointers.delete(event.pointerId);
    if (drag?.id === event.pointerId) drag = null;
    pinch = pointers.size >= 2 ? pinchStart(pointers) : null;
  };
  frame.addEventListener("pointerup", endPointer);
  frame.addEventListener("pointercancel", endPointer);

  frame.addEventListener("click", (event) => {
    if (!suppressClick) return;
    suppressClick = false;
    event.preventDefault();
    event.stopPropagation();
  }, true);

  return {
    reset() {
      apply(base);
    },
    zoomBy(factor: number) {
      const point = center(svg);
      zoomAt(factor, point.x, point.y);
    },
  };
}

interface ViewBox {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

function readViewBox(svg: SVGSVGElement): ViewBox | null {
  const parts = (svg.getAttribute("viewBox") ?? "").trim().split(/[\s,]+/).map(Number);
  const [x, y, width, height] = parts;
  if (x === undefined || y === undefined || width === undefined || height === undefined) return null;
  if (![x, y, width, height].every(Number.isFinite) || width <= 0 || height <= 0) return null;
  return { x, y, width, height };
}

function clamp(next: ViewBox, base: ViewBox): ViewBox {
  const width = Math.min(base.width, Math.max(base.width / 12, next.width));
  const height = width * (base.height / base.width);
  const minX = base.x - width * 0.35;
  const maxX = base.x + base.width - width * 0.65;
  const minY = base.y - height * 0.35;
  const maxY = base.y + base.height - height * 0.65;
  return {
    x: Math.min(maxX, Math.max(minX, next.x)),
    y: Math.min(maxY, Math.max(minY, next.y)),
    width,
    height,
  };
}

function userPoint(svg: SVGSVGElement, view: ViewBox, clientX: number, clientY: number): { x: number; y: number } | null {
  const rect = svg.getBoundingClientRect();
  if (rect.width === 0 || rect.height === 0) return null;
  return {
    x: view.x + ((clientX - rect.left) / rect.width) * view.width,
    y: view.y + ((clientY - rect.top) / rect.height) * view.height,
  };
}

function center(svg: SVGSVGElement): { x: number; y: number } {
  const rect = svg.getBoundingClientRect();
  return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
}

function pinchStart(pointers: Map<number, { x: number; y: number }>): { distance: number; x: number; y: number } | null {
  const points = [...pointers.values()];
  const first = points[0];
  const second = points[1];
  if (!first || !second) return null;
  return {
    distance: Math.hypot(second.x - first.x, second.y - first.y),
    x: (first.x + second.x) / 2,
    y: (first.y + second.y) / 2,
  };
}
