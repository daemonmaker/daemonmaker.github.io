/** @returns {string} yyyy-mm-dd in local timezone */
export function toDateKey(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** @param {string} dateKey */
export function parseDateKey(dateKey) {
  const parts = dateKey.split("-").map((part) => Number(part));
  const [y, m, d] = parts;
  return new Date(y, m - 1, d);
}

/**
 * @param {Date} endDate calendar day (local)
 * @param {number} count
 * @returns {string[]}
 */
export function rollingDays(endDate, count = 365) {
  const end = new Date(
    endDate.getFullYear(),
    endDate.getMonth(),
    endDate.getDate(),
  );
  const keys = [];
  for (let i = count - 1; i >= 0; i -= 1) {
    const d = new Date(end);
    d.setDate(d.getDate() - i);
    keys.push(toDateKey(d));
  }
  return keys;
}

/** @param {number} year */
export function calendarYearDays(year) {
  const keys = [];
  const cursor = new Date(year, 0, 1);
  const last = new Date(year, 11, 31);
  while (cursor <= last) {
    keys.push(toDateKey(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return keys;
}

/**
 * @param {string[]} dayKeys ordered day keys to show
 * @param {{ weekStartsOn?: number, todayKey?: string }} options
 */
export function weekGridCells(dayKeys, options = {}) {
  const weekStartsOn = options.weekStartsOn ?? 0;
  const todayKey = options.todayKey;
  if (dayKeys.length === 0) {
    return [];
  }

  const firstDate = parseDateKey(dayKeys[0]);
  const startDow = firstDate.getDay();
  const offset = (startDow - weekStartsOn + 7) % 7;

  /** @type {{ type: 'empty' | 'day', dateKey?: string, future?: boolean }[]} */
  const cells = [];
  for (let i = 0; i < offset; i += 1) {
    cells.push({ type: "empty" });
  }

  for (const dateKey of dayKeys) {
    const future = todayKey ? dateKey > todayKey : false;
    cells.push({ type: "day", dateKey, future });
  }

  const remainder = cells.length % 7;
  if (remainder !== 0) {
    for (let i = 0; i < 7 - remainder; i += 1) {
      cells.push({ type: "empty" });
    }
  }

  return cells;
}

/**
 * @param {string[]} dayKeys
 * @param {{ todayKey?: string }} options
 */
export function wrapSequence(dayKeys, options = {}) {
  const todayKey = options.todayKey;
  return dayKeys.map((dateKey) => ({
    type: "day",
    dateKey,
    future: todayKey ? dateKey > todayKey : false,
  }));
}

/**
 * @param {"rolling" | "calendar"} range
 * @param {Date} today
 * @param {number} [rollingCount]
 */
export function dayKeysForRange(range, today, rollingCount = 365) {
  if (range === "calendar") {
    return calendarYearDays(today.getFullYear());
  }
  return rollingDays(today, rollingCount).reverse();
}
