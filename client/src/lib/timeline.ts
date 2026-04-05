import { isTodayOrPotentialFuture, parseDate, todayUTC } from "./dates.js";

export type TimelineRow<T> =
  | { kind: "data"; item: T }
  | { kind: "today" };

type TimelineDataRow<T> = {
  kind: "data";
  item: T;
  sortMs: number;
};

function compareRows<T>(a: TimelineDataRow<T>, b: TimelineDataRow<T>): number {
  return a.sortMs - b.sortMs;
}

export function buildTimeline<T>(
  items: T[],
  getDateStr: (item: T) => string,
  reference = todayUTC(),
): TimelineRow<T>[] {
  const past: TimelineDataRow<T>[] = [];
  const todayOrFuture: TimelineDataRow<T>[] = [];

  for (const item of items) {
    const dateStr = getDateStr(item);
    const row: TimelineDataRow<T> = {
      kind: "data",
      item,
      sortMs: parseDate(dateStr)?.getTime() ?? Number.POSITIVE_INFINITY,
    };

    if (isTodayOrPotentialFuture(dateStr, reference)) {
      todayOrFuture.push(row);
    } else {
      past.push(row);
    }
  }

  past.sort(compareRows);
  todayOrFuture.sort(compareRows);

  return [
    ...past.map(({ item }) => ({ kind: "data" as const, item })),
    { kind: "today" as const },
    ...todayOrFuture.map(({ item }) => ({ kind: "data" as const, item })),
  ];
}
