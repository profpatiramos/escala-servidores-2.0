export function checkinWindow(start: number, end: number, now: number) {
  return {
    allowed: now >= start - 2 * 60 * 60 * 1000 && now <= end,
    beforeStart: now <= start,
  };
}
export function isEarlyConfirmation(start: number, now: number, hours: number) {
  return now <= start - hours * 60 * 60 * 1000;
}
