import { useEffect, useState } from "react";
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { api } from "./api";

type Tab = "financial" | "operational" | "safety" | "inventory" | "compliance";

function currentFyStartYear(): number {
  const now = new Date();
  return now.getMonth() + 1 >= 4 ? now.getFullYear() : now.getFullYear() - 1;
}

function monthLabel(monthYear: string): string {
  const [y, m] = monthYear.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("en-US", { month: "short", year: "2-digit" });
}

function monthlyAverage(
  rows: { monthYear: string; values: Record<string, string> }[],
  months: string[],
  fieldKey: string
): { month: string; value: number | null }[] {
  return months.map((m) => {
    const vals = rows.filter((r) => r.monthYear === m && r.values[fieldKey] !== undefined).map((r) => parseFloat(r.values[fieldKey]));
    if (vals.length === 0) return { month: monthLabel(m), value: null };
    return { month: monthLabel(m), value: Number((vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(2)) };
  });
}

const ORDINAL_COLOR: Record<string, string> = {
  NOT_STARTED: "var(--chart-ordinal-1)",
  REJECTED: "var(--chart-ordinal-1)",
  IN_PROGRESS: "var(--chart-ordinal-2)",
  PENDING_REVIEW: "var(--chart-ordinal-3)",
  SUBMITTED: "var(--chart-ordinal-4)",
};

export function AnalyticsPage() {
  const [tab, setTab] = useState<Tab>("compliance");
  const [fyStartYear, setFyStartYear] = useState(currentFyStartYear());

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
        <h2 style={{ color: "var(--navy-deep)", margin: 0 }}>Analytics</h2>
        <label>
          Financial Year:{" "}
          <select value={fyStartYear} onChange={(e) => setFyStartYear(Number(e.target.value))}>
            {[currentFyStartYear(), currentFyStartYear() - 1, currentFyStartYear() - 2].map((y) => (
              <option key={y} value={y}>
                FY {y}-{String(y + 1).slice(2)}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div style={{ display: "flex", gap: "0.5rem", marginBottom: "1rem" }}>
        {(["financial", "operational", "safety", "inventory", "compliance"] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className="btn btn-secondary"
            style={{ opacity: tab === t ? 1 : 0.55, boxShadow: "none" }}
          >
            {t[0].toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>

      {tab === "financial" && <TrendChart fyStartYear={fyStartYear} title="OPEX vs Target (Rs/MT)" seriesField="f7" seriesLabel="OPEX" targetField="f8" targetLabel="OPEX Target" />}
      {tab === "operational" && <TrendChart fyStartYear={fyStartYear} title="Throughput vs Target (MT)" seriesField="f3" seriesLabel="Total Throughput" targetField="f4" targetLabel="Throughput Target" />}
      {tab === "safety" && <SingleTrendChart fyStartYear={fyStartYear} title="HSE Index" field="f59" isArea />}
      {tab === "inventory" && <SingleTrendChart fyStartYear={fyStartYear} title="Auto-Reconciliation (% of Tanks on Auto Reco)" field="f26" />}
      {tab === "compliance" && <ComplianceTab fyStartYear={fyStartYear} />}
    </div>
  );
}

function TrendChart({
  fyStartYear,
  title,
  seriesField,
  seriesLabel,
  targetField,
  targetLabel,
}: {
  fyStartYear: number;
  title: string;
  seriesField: string;
  seriesLabel: string;
  targetField: string;
  targetLabel: string;
}) {
  const [data, setData] = useState<{ month: string; [key: string]: string | number | null }[]>([]);

  useEffect(() => {
    api.getAnalyticsFieldData(fyStartYear, [seriesField, targetField]).then((res) => {
      const actual = monthlyAverage(res.rows, res.months, seriesField);
      const target = monthlyAverage(res.rows, res.months, targetField);
      setData(actual.map((a, i) => ({ month: a.month, [seriesLabel]: a.value, [targetLabel]: target[i].value })));
    });
  }, [fyStartYear, seriesField, targetField, seriesLabel, targetLabel]);

  return (
    <div className="dash-card">
      <h3 style={{ marginTop: 0, color: "var(--navy-deep)" }}>{title}</h3>
      <ResponsiveContainer width="100%" height={280}>
        <LineChart data={data}>
          <CartesianGrid stroke="var(--chart-grid)" strokeDasharray="0" vertical={false} />
          <XAxis dataKey="month" tick={{ fill: "var(--chart-muted)", fontSize: 12 }} />
          <YAxis tick={{ fill: "var(--chart-muted)", fontSize: 12 }} />
          <Tooltip />
          <Legend />
          <Line type="monotone" dataKey={seriesLabel} stroke="var(--chart-series-1)" strokeWidth={2} dot={{ r: 4 }} connectNulls />
          <Line type="monotone" dataKey={targetLabel} stroke="var(--chart-series-2)" strokeWidth={2} dot={{ r: 4 }} connectNulls />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

function SingleTrendChart({ fyStartYear, title, field, isArea }: { fyStartYear: number; title: string; field: string; isArea?: boolean }) {
  const [data, setData] = useState<{ month: string; value: number | null }[]>([]);

  useEffect(() => {
    api.getAnalyticsFieldData(fyStartYear, [field]).then((res) => {
      setData(monthlyAverage(res.rows, res.months, field));
    });
  }, [fyStartYear, field]);

  return (
    <div className="dash-card">
      <h3 style={{ marginTop: 0, color: "var(--navy-deep)" }}>{title}</h3>
      <ResponsiveContainer width="100%" height={280}>
        {isArea ? (
          <AreaChart data={data}>
            <CartesianGrid stroke="var(--chart-grid)" strokeDasharray="0" vertical={false} />
            <XAxis dataKey="month" tick={{ fill: "var(--chart-muted)", fontSize: 12 }} />
            <YAxis tick={{ fill: "var(--chart-muted)", fontSize: 12 }} />
            <Tooltip />
            <Area type="monotone" dataKey="value" name={title} stroke="var(--chart-series-1)" strokeWidth={2} fill="var(--chart-series-1)" fillOpacity={0.1} connectNulls />
          </AreaChart>
        ) : (
          <LineChart data={data}>
            <CartesianGrid stroke="var(--chart-grid)" strokeDasharray="0" vertical={false} />
            <XAxis dataKey="month" tick={{ fill: "var(--chart-muted)", fontSize: 12 }} />
            <YAxis tick={{ fill: "var(--chart-muted)", fontSize: 12 }} />
            <Tooltip />
            <Line type="monotone" dataKey="value" name={title} stroke="var(--chart-series-1)" strokeWidth={2} dot={{ r: 4 }} connectNulls />
          </LineChart>
        )}
      </ResponsiveContainer>
    </div>
  );
}

function ComplianceTab({ fyStartYear }: { fyStartYear: number }) {
  const [data, setData] = useState<Awaited<ReturnType<typeof api.getAnalyticsCompliance>> | null>(null);

  useEffect(() => {
    api.getAnalyticsCompliance(fyStartYear).then(setData);
  }, [fyStartYear]);

  if (!data) return <p>Loading...</p>;

  const chartData = data.monthlyCompliance.map((m) => ({ month: monthLabel(m.monthYear), pct: m.pct }));
  const locations = Array.from(new Set(data.heatmap.map((h) => h.locationCode))).map((code) => ({
    code,
    name: data.heatmap.find((h) => h.locationCode === code)!.locationName,
  }));

  return (
    <div>
      <div className="dash-card">
        <h3 style={{ marginTop: 0, color: "var(--navy-deep)" }}>Monthly Compliance Rate</h3>
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={chartData}>
            <CartesianGrid stroke="var(--chart-grid)" strokeDasharray="0" vertical={false} />
            <XAxis dataKey="month" tick={{ fill: "var(--chart-muted)", fontSize: 12 }} />
            <YAxis tick={{ fill: "var(--chart-muted)", fontSize: 12 }} unit="%" />
            <Tooltip />
            <Bar dataKey="pct" name="Compliance %" fill="var(--chart-series-1)" radius={[4, 4, 0, 0]} maxBarSize={24} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="dash-card">
        <h3 style={{ marginTop: 0, color: "var(--navy-deep)" }}>Compliance Heatmap</h3>
        <div style={{ display: "flex", gap: "0.75rem", marginBottom: "0.5rem", fontSize: "0.8rem" }}>
          {Object.entries({ "Not Started": ORDINAL_COLOR.NOT_STARTED, "In Progress": ORDINAL_COLOR.IN_PROGRESS, "Pending Review": ORDINAL_COLOR.PENDING_REVIEW, Submitted: ORDINAL_COLOR.SUBMITTED }).map(
            ([label, color]) => (
              <span key={label} style={{ display: "flex", alignItems: "center", gap: "0.3rem" }}>
                <span style={{ width: 12, height: 12, background: color, display: "inline-block", borderRadius: 2 }} /> {label}
              </span>
            )
          )}
        </div>
        <div style={{ overflowX: "auto" }}>
          <table className="themed-table">
            <thead>
              <tr>
                <th>Location</th>
                {data.months.map((m) => (
                  <th key={m}>{monthLabel(m)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {locations.map((loc) => (
                <tr key={loc.code}>
                  <td>{loc.name}</td>
                  {data.months.map((m) => {
                    const cell = data.heatmap.find((h) => h.locationCode === loc.code && h.monthYear === m);
                    return (
                      <td key={m} title={cell?.status} style={{ background: ORDINAL_COLOR[cell?.status ?? "NOT_STARTED"], color: "white", textAlign: "center" }}>
                        &nbsp;
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="dash-card">
        <h3 style={{ marginTop: 0, color: "var(--navy-deep)" }}>Location Compliance Leaderboard</h3>
        <table className="themed-table">
          <thead>
            <tr>
              <th>Location</th>
              <th>Submitted</th>
              <th>Total Months</th>
              <th>Compliance %</th>
            </tr>
          </thead>
          <tbody>
            {data.leaderboard.map((l) => (
              <tr key={l.locationCode}>
                <td>{l.locationName}</td>
                <td>{l.submittedCount}</td>
                <td>{l.totalMonths}</td>
                <td>{l.pct}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
