import { useState } from 'react';
import type { TimeBucketPoint } from '../types/models.ts';

export function TimelineBarChart({
  data,
  height = 220,
  emptyLabel = 'No sales recorded in this period',
}: {
  data: TimeBucketPoint[];
  height?: number;
  emptyLabel?: string;
}) {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);

  const hasData = data.some((d) => d.salesCount > 0 || d.replacementsCount > 0);
  const maxVal = Math.max(1, ...data.map((d) => Math.max(d.salesCount, d.replacementsCount)));

  if (!hasData) {
    return (
      <div
        style={{ height }}
        className="flex flex-col items-center justify-center text-center border border-dashed border-zinc-800/80 rounded-lg p-6"
      >
        <p className="text-sm text-zinc-400">{emptyLabel}</p>
        <p className="text-xs text-zinc-600 mt-1">
          Chart bars populate automatically as sales and replacements are saved.
        </p>
      </div>
    );
  }

  const width = 640;
  const padLeft = 34;
  const padRight = 14;
  const padTop = 16;
  const padBottom = 34;
  const plotW = width - padLeft - padRight;
  const plotH = height - padTop - padBottom;
  const groupW = plotW / Math.max(1, data.length);
  const barW = Math.max(6, Math.min(22, groupW * 0.44));

  const ticks = [0, Math.ceil(maxVal / 2), maxVal];

  return (
    <div className="relative w-full">
      {hoveredIdx !== null && data[hoveredIdx] && (
        <div className="absolute top-2 right-2 z-10 bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-xs pointer-events-none">
          <p className="font-semibold text-white">{data[hoveredIdx].label}</p>
          <p className="text-zinc-300 font-mono tabular-nums mt-0.5">
            Sales: {data[hoveredIdx].salesCount} · Volume: {data[hoveredIdx].volumeBillions}B
          </p>
          <p className="text-amber-400 font-mono tabular-nums">
            Replacements: {data[hoveredIdx].replacementsCount}
          </p>
        </div>
      )}
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full h-auto overflow-visible"
        role="img"
        aria-label="Sales and replacements timeline chart"
      >
        {ticks.map((tick, idx) => {
          const y = padTop + plotH - (tick / maxVal) * plotH;
          return (
            <g key={`${tick}-${idx}`}>
              <line
                x1={padLeft}
                y1={y}
                x2={width - padRight}
                y2={y}
                stroke="rgba(255,255,255,0.06)"
                strokeDasharray="3 3"
              />
              <text
                x={padLeft - 8}
                y={y + 4}
                textAnchor="end"
                className="fill-zinc-500 text-[10px] font-mono tabular-nums"
              >
                {tick}
              </text>
            </g>
          );
        })}

        {data.map((point, idx) => {
          const cx = padLeft + idx * groupW + groupW / 2;
          const salesH = (point.salesCount / maxVal) * plotH;
          const repH = (point.replacementsCount / maxVal) * plotH;
          const isHovered = hoveredIdx === idx;
          const showLabel =
            data.length <= 10 || idx === 0 || idx === data.length - 1 || idx % 2 === 0;

          return (
            <g
              key={point.key}
              onMouseEnter={() => setHoveredIdx(idx)}
              onMouseLeave={() => setHoveredIdx(null)}
              className="cursor-pointer"
            >
              <rect
                x={cx - groupW / 2}
                y={padTop}
                width={groupW}
                height={plotH}
                fill={isHovered ? 'rgba(255,255,255,0.03)' : 'transparent'}
              />
              <rect
                x={cx - barW / 2 - (point.replacementsCount > 0 ? 3 : 0)}
                y={padTop + plotH - salesH}
                width={barW}
                height={Math.max(point.salesCount > 0 ? 3 : 0, salesH)}
                rx={3}
                fill={isHovered ? '#EF4444' : '#DC2626'}
              />
              {point.replacementsCount > 0 && (
                <rect
                  x={cx + barW / 2 - 1}
                  y={padTop + plotH - repH}
                  width={Math.max(4, barW * 0.55)}
                  height={Math.max(3, repH)}
                  rx={2}
                  fill="#F59E0B"
                />
              )}
              {showLabel && (
                <text
                  x={cx}
                  y={height - 10}
                  textAnchor="middle"
                  className="fill-zinc-500 text-[10px] font-mono"
                >
                  {point.label}
                </text>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

export function WarrantyStatusDonut({
  active,
  expiringSoon,
  expired,
}: {
  active: number;
  expiringSoon: number;
  expired: number;
}) {
  const total = active + expiringSoon + expired;
  const radius = 56;
  const circumference = 2 * Math.PI * radius;

  const segments = [
    { label: 'Active', count: active, color: '#10B981', textClass: 'text-emerald-400' },
    { label: 'Expiring Soon', count: expiringSoon, color: '#F59E0B', textClass: 'text-amber-400' },
    { label: 'Expired', count: expired, color: '#EF4444', textClass: 'text-red-400' },
  ];

  let offset = 0;

  return (
    <div className="flex flex-col sm:flex-row items-center gap-6">
      <div className="relative w-36 h-36 shrink-0 flex items-center justify-center">
        <svg viewBox="0 0 144 144" className="w-36 h-36 -rotate-90" role="img" aria-label="Warranty status breakdown">
          <circle
            cx="72"
            cy="72"
            r={radius}
            fill="none"
            stroke="#27272A"
            strokeWidth="14"
          />
          {total > 0 &&
            segments.map((seg) => {
              if (seg.count === 0) return null;
              const dash = (seg.count / total) * circumference;
              const currentOffset = offset;
              offset += dash;
              return (
                <circle
                  key={seg.label}
                  cx="72"
                  cy="72"
                  r={radius}
                  fill="none"
                  stroke={seg.color}
                  strokeWidth="14"
                  strokeDasharray={`${dash} ${circumference - dash}`}
                  strokeDashoffset={-currentOffset}
                  strokeLinecap="butt"
                />
              );
            })}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
          <span className="text-2xl font-semibold text-white font-mono tabular-nums">
            {total}
          </span>
          <span className="text-[11px] text-zinc-500">Total</span>
        </div>
      </div>

      <div className="flex-1 w-full space-y-3">
        {segments.map((seg) => {
          const pct = total === 0 ? 0 : Math.round((seg.count / total) * 100);
          return (
            <div key={seg.label} className="space-y-1">
              <div className="flex items-center justify-between text-sm">
                <span className={`font-medium ${seg.textClass}`}>{seg.label}</span>
                <span className="font-mono tabular-nums text-zinc-200">
                  {seg.count}{' '}
                  <span className="text-zinc-500 text-xs">({pct}%)</span>
                </span>
              </div>
              <div className="h-1.5 bg-zinc-900 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-300"
                  style={{ width: `${pct}%`, backgroundColor: seg.color }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function HorizontalDistributionList({
  items,
  emptyLabel = 'No records yet',
}: {
  items: Array<{ label: string; count: number; secondary?: string }>;
  emptyLabel?: string;
}) {
  const nonZero = items.filter((i) => i.count > 0);
  if (nonZero.length === 0) {
    return <p className="text-sm text-zinc-500 py-4">{emptyLabel}</p>;
  }
  const max = Math.max(1, ...nonZero.map((i) => i.count));

  return (
    <div className="space-y-2.5">
      {nonZero.map((item) => {
        const widthPct = Math.max(4, Math.round((item.count / max) * 100));
        return (
          <div key={item.label} className="space-y-1">
            <div className="flex items-center justify-between text-xs">
              <span className="text-zinc-200 font-medium">{item.label}</span>
              <span className="font-mono tabular-nums text-zinc-400">
                {item.count} sold{item.secondary ? ` · ${item.secondary}` : ''}
              </span>
            </div>
            <div className="h-1.5 bg-zinc-900 rounded-full overflow-hidden">
              <div
                className="h-full bg-red-600 rounded-full transition-all duration-300"
                style={{ width: `${widthPct}%` }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}
