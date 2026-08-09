export type DateGroup<T> = {
  dateKey: string;
  dateLabel: string;
  isPast: boolean;
  items: T[];
};

// Groups items by calendar day (from getDate), newest-created first within
// each day. Day groups are ordered upcoming-soonest-first, then
// past-most-recent-first - same "what's coming up, then history" shape
// used across My rides / My matches.
export function groupByDate<T>(
  items: T[],
  getDate: (item: T) => string,
  getCreatedAt: (item: T) => string,
): DateGroup<T>[] {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const key = new Date(getDate(item)).toDateString();
    const list = groups.get(key);
    if (list) {
      list.push(item);
    } else {
      groups.set(key, [item]);
    }
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const result: DateGroup<T>[] = Array.from(groups.entries()).map(([dateKey, groupItems]) => {
    const groupDate = new Date(dateKey);
    return {
      dateKey,
      dateLabel: groupDate.toLocaleDateString(undefined, {
        weekday: 'long',
        month: 'long',
        day: 'numeric',
        year: 'numeric',
      }),
      isPast: groupDate < today,
      items: [...groupItems].sort(
        (a, b) => new Date(getCreatedAt(b)).getTime() - new Date(getCreatedAt(a)).getTime(),
      ),
    };
  });

  result.sort((a, b) => {
    if (a.isPast !== b.isPast) return a.isPast ? 1 : -1;
    const aTime = new Date(a.dateKey).getTime();
    const bTime = new Date(b.dateKey).getTime();
    return a.isPast ? bTime - aTime : aTime - bTime;
  });

  return result;
}
