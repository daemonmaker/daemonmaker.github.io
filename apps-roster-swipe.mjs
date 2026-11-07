export const ROSTER_SWIPE_WIDTH_PX = 52;
export const ROSTER_SWIPE_OPEN_THRESHOLD_PX = 28;

/**
 * @param {number} startOffset
 * @param {number} dx
 * @param {number} width
 */
export function clampSwipeOffset(startOffset, dx, width) {
  return Math.min(0, Math.max(-width, startOffset + dx));
}

/**
 * @param {{
 *   next: number,
 *   startOffset: number,
 *   threshold: number,
 * }} args
 */
export function shouldOpenSwipe({ next, startOffset, threshold }) {
  return (
    next <= -threshold || (startOffset < 0 && next < startOffset)
  );
}

export function trashIconSvg() {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("class", "roster__delete-icon");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("aria-hidden", "true");
  const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
  path.setAttribute("fill", "currentColor");
  path.setAttribute(
    "d",
    "M9 3h6l1 2h5v2H3V5h5l1-2zm1 6h2v10h-2V9zm4 0h2v10h-2V9zM7 9h2v10H7V9zm-1 13h12a1 1 0 0 0 1-1V7H5v14a1 1 0 0 0 1 1z",
  );
  svg.appendChild(path);
  return svg;
}

function setSwipeOffset(row, offsetPx, { animate = true } = {}) {
  const front = row.querySelector(".roster__front");
  if (!front) {
    return;
  }
  row.classList.toggle("is-swiping", !animate);
  front.style.transform =
    offsetPx === 0 ? "" : `translateX(${offsetPx}px)`;
}

/**
 * @param {HTMLElement} row
 * @param {string} emailKey
 * @param {string | null} openKey
 */
export function syncRosterSwipePresentation(row, emailKey, openKey) {
  const front = row.querySelector(".roster__front");
  if (!front) {
    return;
  }
  const open = openKey === emailKey;
  row.classList.toggle("is-revealed", open);
  row.classList.remove("is-swiping");
  front.style.transform = open
    ? `translateX(${-ROSTER_SWIPE_WIDTH_PX}px)`
    : "";
}

/**
 * @param {{
 *   rosterEl: HTMLElement,
 *   getOpenKey: () => string | null,
 *   setOpenKey: (key: string | null) => void,
 * }} ctx
 */
export function closeOpenRosterSwipe(ctx, { animate = true } = {}) {
  const openKey = ctx.getOpenKey();
  if (!openKey) {
    return;
  }
  const row = ctx.rosterEl.querySelector(
    `.roster__row[data-email-key="${openKey}"]`,
  );
  ctx.setOpenKey(null);
  if (row) {
    row.classList.remove("is-revealed");
    setSwipeOffset(row, 0, { animate });
    if (!animate) {
      row.classList.remove("is-swiping");
    }
  }
}

/**
 * @param {HTMLElement} front
 * @param {string} emailKey
 * @param {{
 *   rosterEl: HTMLElement,
 *   getOpenKey: () => string | null,
 *   setOpenKey: (key: string | null) => void,
 * }} ctx
 */
export function bindRosterRowSwipe(front, emailKey, ctx) {
  if (front.dataset.swipeBound === "true") {
    return;
  }
  front.dataset.swipeBound = "true";

  let pointerId = null;
  let startX = 0;
  let startY = 0;
  let startOffset = 0;
  let axis = null;
  let dragging = false;
  let moved = false;

  function openSwipe() {
    const current = ctx.getOpenKey();
    if (current && current !== emailKey) {
      closeOpenRosterSwipe(ctx);
    }
    const row = front.closest(".roster__row");
    if (!row) {
      return;
    }
    ctx.setOpenKey(emailKey);
    row.classList.add("is-revealed");
    row.classList.remove("is-swiping");
    setSwipeOffset(row, -ROSTER_SWIPE_WIDTH_PX);
  }

  front.addEventListener("pointerdown", (event) => {
    if (event.button !== 0) {
      return;
    }
    if (event.target.closest('input[type="checkbox"]')) {
      return;
    }
    const row = front.closest(".roster__row");
    if (!row) {
      return;
    }
    pointerId = event.pointerId;
    startX = event.clientX;
    startY = event.clientY;
    startOffset =
      ctx.getOpenKey() === emailKey ? -ROSTER_SWIPE_WIDTH_PX : 0;
    axis = null;
    dragging = true;
    moved = false;
  });

  front.addEventListener("pointermove", (event) => {
    if (!dragging || event.pointerId !== pointerId) {
      return;
    }
    const dx = event.clientX - startX;
    const dy = event.clientY - startY;
    if (!axis) {
      if (Math.abs(dx) < 6 && Math.abs(dy) < 6) {
        return;
      }
      axis = Math.abs(dx) >= Math.abs(dy) ? "x" : "y";
      if (axis === "y") {
        dragging = false;
        pointerId = null;
        return;
      }
      if (ctx.getOpenKey() && ctx.getOpenKey() !== emailKey) {
        closeOpenRosterSwipe(ctx, { animate: false });
      }
      try {
        front.setPointerCapture(pointerId);
      } catch {
        /* already released */
      }
    }
    if (axis !== "x") {
      return;
    }
    event.preventDefault();
    moved = true;
    const next = clampSwipeOffset(
      startOffset,
      dx,
      ROSTER_SWIPE_WIDTH_PX,
    );
    const row = front.closest(".roster__row");
    if (row) {
      row.classList.remove("is-revealed");
      setSwipeOffset(row, next, { animate: false });
    }
  });

  function endSwipe(event) {
    if (!dragging || event.pointerId !== pointerId) {
      return;
    }
    const activePointerId = pointerId;
    dragging = false;
    const li = front.closest(".roster__row");
    const wasHorizontal = axis === "x";
    pointerId = null;
    axis = null;
    if (front.hasPointerCapture?.(activePointerId)) {
      try {
        front.releasePointerCapture(activePointerId);
      } catch {
        /* already released */
      }
    }
    if (!li || !wasHorizontal) {
      return;
    }
    const dx = event.clientX - startX;
    const next = clampSwipeOffset(
      startOffset,
      dx,
      ROSTER_SWIPE_WIDTH_PX,
    );
    const shouldOpen = shouldOpenSwipe({
      next,
      startOffset,
      threshold: ROSTER_SWIPE_OPEN_THRESHOLD_PX,
    });
    if (shouldOpen) {
      openSwipe();
    } else {
      if (ctx.getOpenKey() === emailKey) {
        ctx.setOpenKey(null);
      }
      li.classList.remove("is-revealed");
      setSwipeOffset(li, 0);
    }
  }

  front.addEventListener("pointerup", endSwipe);
  front.addEventListener("pointercancel", endSwipe);

  front.addEventListener(
    "click",
    (event) => {
      if (!moved) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      moved = false;
    },
    true,
  );
}
