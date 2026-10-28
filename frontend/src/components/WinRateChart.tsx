/**
 * Weekly win rate per member (won / (won + lost)), one line per member.
 * Colours follow the validated categorical order and stay with the member (never re-ranked).
 * The team table next to this chart doubles as its table view.
 */
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import type { TeamStats } from "../lib/types";

// Validated categorical palette (light surface), fixed order. Max 6 lines; never cycled.
const SERIES = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4", "#008300"];

function weekLabel(iso: string) {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString(undefined, { month: "short", day: "numeric", timeZone: "UTC" });
}

export function WinRateChart({ stats }: { stats: TeamStats }) {
  const members = stats.members.slice(0, SERIES.length);
  const data = stats.win_rate_series.map((row) => {
    const point: Record<string, string | number | null> = { week: weekLabel(row.week) };
    members.forEach((m) => {
      const v = row[m.member_id];
      point[m.member_id] = typeof v === "number" ? Math.round(v * 100) : null;
    });
    return point;
  });

  return (
    <div className="h-72 w-full">
      <ResponsiveContainer>
        <LineChart data={data} margin={{ top: 8, right: 16, bottom: 0, left: -8 }}>
          <CartesianGrid stroke="#e2e8f0" strokeDasharray="0" vertical={false} />
          <XAxis dataKey="week" tick={{ fill: "#64748b", fontSize: 12 }} axisLine={{ stroke: "#cbd5e1" }} tickLine={false} />
          <YAxis domain={[0, 100]} ticks={[0, 25, 50, 75, 100]} tickFormatter={(v) => `${v}%`} tick={{ fill: "#64748b", fontSize: 12 }} axisLine={false} tickLine={false} />
          <Tooltip
            formatter={(value, key) => [value == null ? "no outcomes" : `${value}%`, members.find((m) => m.member_id === key)?.name ?? String(key)]}
            contentStyle={{ borderRadius: 8, borderColor: "#e2e8f0", fontSize: 12, color: "#0f172a" }}
            labelStyle={{ color: "#475569", fontWeight: 500 }}
            cursor={{ stroke: "#94a3b8", strokeWidth: 1 }}
          />
          <Legend formatter={(key: string) => <span className="text-xs text-slate-600">{members.find((m) => m.member_id === key)?.name ?? key}</span>} iconType="plainline" />
          {members.map((m, i) => (
            <Line
              key={m.member_id}
              dataKey={m.member_id}
              name={m.member_id}
              type="monotone"
              stroke={SERIES[i]}
              strokeWidth={2}
              dot={{ r: 4, strokeWidth: 2, stroke: "#fff", fill: SERIES[i] }}
              activeDot={{ r: 5, strokeWidth: 2, stroke: "#fff" }}
              connectNulls
              isAnimationActive={false}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
      {stats.members.length > SERIES.length && (
        <p className="mt-1 text-xs text-slate-500">Showing the first {SERIES.length} members. See the team table for everyone.</p>
      )}
    </div>
  );
}
