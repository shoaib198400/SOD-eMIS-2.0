// Ported from the reference app's compute_deadline(): deadline is the 5th of the month
// following the reporting month (e.g. April 2026 report -> due 5 May 2026).
export type Urgency = "overdue" | "urgent" | "warning" | "ok";

export interface DeadlineInfo {
  dateLabel: string;
  daysLeft: number;
  urgency: Urgency;
  monthLabel: string;
}

export function computeDeadline(monthYear: string): DeadlineInfo {
  const [year, month] = monthYear.split("-").map(Number); // month is 1-12

  // Date's month param is 0-indexed, so passing the 1-12 reporting month directly
  // lands on the 5th of the FOLLOWING month.
  const deadlineDate = new Date(year, month, 5);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  deadlineDate.setHours(0, 0, 0, 0);

  const daysLeft = Math.round((deadlineDate.getTime() - today.getTime()) / 86400000);
  const urgency: Urgency = daysLeft < 0 ? "overdue" : daysLeft <= 3 ? "urgent" : daysLeft <= 7 ? "warning" : "ok";

  const dateLabel = deadlineDate.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
  const monthLabel = new Date(year, month - 1, 1).toLocaleDateString("en-US", { month: "long", year: "numeric" });

  return { dateLabel, daysLeft, urgency, monthLabel };
}
