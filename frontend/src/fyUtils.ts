// FY runs April -> March, matching the reference app's fiscal year convention.
export function fyStartYearOf(monthYear: string): number {
  const [year, month] = monthYear.split("-").map(Number);
  return month >= 4 ? year : year - 1;
}

export function fyLabel(fyStartYear: number): string {
  return `FY ${fyStartYear}-${String(fyStartYear + 1).slice(2)}`;
}

export function fyMonthOptions(fyStartYear: number): { value: string; label: string }[] {
  const opts: { value: string; label: string }[] = [];
  for (let i = 0; i < 12; i++) {
    const monthNum = ((i + 3) % 12) + 1; // April(4) .. March(3)
    const year = i < 9 ? fyStartYear : fyStartYear + 1;
    const value = `${year}-${String(monthNum).padStart(2, "0")}`;
    const label = new Date(year, monthNum - 1, 1).toLocaleDateString("en-US", { month: "long", year: "numeric" });
    opts.push({ value, label });
  }
  return opts;
}

export function fyStartYearOptions(current: number): number[] {
  return [current - 1, current, current + 1];
}
