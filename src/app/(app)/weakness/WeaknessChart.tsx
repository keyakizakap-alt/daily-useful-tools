"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Cell,
  ResponsiveContainer,
} from "recharts";

export default function WeaknessChart({ data }: { data: { domain: string; rate: number }[] }) {
  function color(rate: number) {
    if (rate >= 70) return "#22c55e";
    if (rate >= 50) return "#fbbf24";
    return "#f87171";
  }

  return (
    <div className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ left: 8, right: 16, top: 4, bottom: 4 }}>
          <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#00000010" />
          <XAxis type="number" domain={[0, 100]} tickFormatter={(v) => `${v}%`} fontSize={11} />
          <YAxis type="category" dataKey="domain" width={120} fontSize={11} tickLine={false} />
          <Tooltip formatter={(v: number) => [`${Math.round(v)}%`, "正答率"]} />
          <Bar dataKey="rate" radius={[0, 6, 6, 0]}>
            {data.map((d, i) => (
              <Cell key={i} fill={color(d.rate)} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
