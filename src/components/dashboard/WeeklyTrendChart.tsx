import { formatCurrency } from '../../lib/utils';

interface Day {
  date: string;
  credit_given: number;
  collection: number;
}

interface Week {
  label: string;
  credit: number;
  collection: number;
  net: number;
  /** Running total of net from the start of the period to the end of this week. */
  cumulative: number;
}

/**
 * Groups the daily series into 7-day buckets counted back from the latest
 * day, so the newest bucket is always a full week. Whatever is left over at
 * the start becomes a shorter first bucket.
 */
function toWeeks(days: Day[]): Week[] {
  const buckets: Day[][] = [];
  for (let end = days.length; end > 0; end -= 7) {
    buckets.unshift(days.slice(Math.max(0, end - 7), end));
  }
  const fmt = (d: string) => new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
  let running = 0;
  return buckets.map(b => {
    const credit = b.reduce((s, d) => s + Number(d.credit_given || 0), 0);
    const collection = b.reduce((s, d) => s + Number(d.collection || 0), 0);
    running += credit - collection;
    return {
      label: b.length > 1 ? `${fmt(b[0].date)} – ${fmt(b[b.length - 1].date)}` : fmt(b[0].date),
      credit,
      collection,
      net: credit - collection,
      cumulative: running,
    };
  });
}

/** 1,60,000 -> ₹1.6L, 45,000 -> ₹45K. Axis labels only; the table shows exact amounts. */
function compact(n: number): string {
  const sign = n < 0 ? '-' : '';
  const a = Math.abs(n);
  const trim = (v: number) => String(Math.round(v * 10) / 10);
  if (a >= 1e7) return `${sign}₹${trim(a / 1e7)}Cr`;
  if (a >= 1e5) return `${sign}₹${trim(a / 1e5)}L`;
  if (a >= 1e3) return `${sign}₹${trim(a / 1e3)}K`;
  return `${sign}₹${Math.round(a)}`;
}

/** A round upper bound and four-ish tick steps for the axis. */
function niceScale(min: number, max: number) {
  const span = Math.max(max - min, 1);
  const raw = span / 4;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const norm = raw / mag;
  const step = (norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 5 ? 5 : 10) * mag;
  return { lo: Math.floor(min / step) * step, hi: Math.ceil(max / step) * step, step };
}

const W = 640;
const H = 240;
const PAD = { top: 12, right: 12, bottom: 28, left: 52 };

/**
 * Weekly Credit Given vs Collection as paired bars, plus a line for how much
 * the dues grew (or shrank) since the start of the period. Above zero means
 * more credit has gone out than has come back.
 */
export function WeeklyTrendChart({ days }: { days: Day[] }) {
  const weeks = toWeeks(days);
  if (weeks.length === 0) return null;

  const values = weeks.flatMap(w => [w.credit, w.collection, w.cumulative, 0]);
  const { lo, hi, step } = niceScale(Math.min(...values), Math.max(...values));
  const plotW = W - PAD.left - PAD.right;
  const plotH = H - PAD.top - PAD.bottom;
  const y = (v: number) => PAD.top + plotH - ((v - lo) / (hi - lo)) * plotH;
  const group = plotW / weeks.length;
  const barW = Math.min(34, group * 0.3);

  const ticks: number[] = [];
  for (let t = lo; t <= hi + step / 2; t += step) ticks.push(t);

  const cx = (i: number) => PAD.left + group * i + group / 2;
  const line = weeks.map((w, i) => `${i === 0 ? 'M' : 'L'}${cx(i)},${y(w.cumulative)}`).join(' ');

  const last = weeks[weeks.length - 1];

  return (
    <div>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full h-auto"
        role="img"
        aria-label="Weekly credit given and collection, with the running change in dues"
      >
        {ticks.map(t => (
          <g key={t}>
            <line
              x1={PAD.left}
              x2={W - PAD.right}
              y1={y(t)}
              y2={y(t)}
              className={t === 0 ? 'stroke-gray-400 dark:stroke-gray-500' : 'stroke-gray-200 dark:stroke-gray-700'}
              strokeWidth={t === 0 ? 1.5 : 1}
            />
            <text x={PAD.left - 6} y={y(t) + 4} textAnchor="end" className="fill-gray-500 dark:fill-gray-400" fontSize="11">
              {compact(t)}
            </text>
          </g>
        ))}

        {weeks.map((w, i) => (
          <g key={w.label}>
            <title>
              {`${w.label}\nCredit given: ${formatCurrency(w.credit)}\nCollection: ${formatCurrency(w.collection)}\nDues change: ${formatCurrency(w.net)}`}
            </title>
            <rect
              x={cx(i) - barW - 1}
              y={Math.min(y(w.credit), y(0))}
              width={barW}
              height={Math.abs(y(w.credit) - y(0))}
              rx={3}
              className="fill-indigo-500 dark:fill-indigo-400"
            />
            <rect
              x={cx(i) + 1}
              y={Math.min(y(w.collection), y(0))}
              width={barW}
              height={Math.abs(y(w.collection) - y(0))}
              rx={3}
              className="fill-emerald-500 dark:fill-emerald-400"
            />
            <text x={cx(i)} y={H - 8} textAnchor="middle" className="fill-gray-600 dark:fill-gray-400" fontSize="11">
              {w.label}
            </text>
          </g>
        ))}

        <path d={line} fill="none" strokeWidth={2.5} strokeLinejoin="round" className="stroke-amber-500 dark:stroke-amber-400" />
        {weeks.map((w, i) => (
          <circle key={w.label} cx={cx(i)} cy={y(w.cumulative)} r={4} className="fill-amber-500 dark:fill-amber-400 stroke-white dark:stroke-gray-900" strokeWidth={1.5} />
        ))}
      </svg>

      <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 mt-2 text-sm">
        <div className="flex items-center gap-2">
          <span className="w-3.5 h-3.5 rounded bg-indigo-500 dark:bg-indigo-400" />
          <span className="text-gray-700 dark:text-gray-300">Credit Given</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-3.5 h-3.5 rounded bg-emerald-500 dark:bg-emerald-400" />
          <span className="text-gray-700 dark:text-gray-300">Collection</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-5 h-0.5 rounded bg-amber-500 dark:bg-amber-400" />
          <span className="text-gray-700 dark:text-gray-300">Dues change so far</span>
        </div>
      </div>

      <p className="mt-3 text-sm text-gray-600 dark:text-gray-400 text-center">
        {last.cumulative > 0
          ? `Dues grew by ${formatCurrency(last.cumulative)} over this period: more credit given than collected.`
          : last.cumulative < 0
            ? `Dues shrank by ${formatCurrency(-last.cumulative)} over this period: more collected than given.`
            : 'Credit given and collection matched over this period.'}
      </p>

      <div className="mt-4 overflow-x-auto">
        <table className="w-full text-sm tnum">
          <thead>
            <tr className="text-left text-gray-500 dark:text-gray-400 border-b border-gray-200 dark:border-gray-700">
              <th className="py-1.5 pr-3 font-medium">Week</th>
              <th className="py-1.5 px-3 font-medium text-right">Credit</th>
              <th className="py-1.5 px-3 font-medium text-right">Collected</th>
              <th className="py-1.5 pl-3 font-medium text-right">Dues change</th>
            </tr>
          </thead>
          <tbody>
            {weeks.map(w => (
              <tr key={w.label} className="border-b border-gray-100 dark:border-gray-800 text-gray-900 dark:text-gray-100">
                <td className="py-1.5 pr-3 whitespace-nowrap">{w.label}</td>
                <td className="py-1.5 px-3 text-right whitespace-nowrap">{formatCurrency(w.credit)}</td>
                <td className="py-1.5 px-3 text-right whitespace-nowrap">{formatCurrency(w.collection)}</td>
                <td className={`py-1.5 pl-3 text-right whitespace-nowrap font-medium ${w.net > 0 ? 'text-red-600 dark:text-red-400' : 'text-emerald-600 dark:text-emerald-400'}`}>
                  {w.net > 0 ? '+' : w.net < 0 ? '−' : ''}{formatCurrency(Math.abs(w.net))}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
