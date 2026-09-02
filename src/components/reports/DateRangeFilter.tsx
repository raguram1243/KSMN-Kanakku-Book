import { Input } from '../ui/Input';

export interface DateRangeFilterProps {
  from: string;
  to: string;
  onFromChange: (value: string) => void;
  onToChange: (value: string) => void;
}

export function DateRangeFilter({ from, to, onFromChange, onToChange }: DateRangeFilterProps) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      <Input
        type="date"
        label="From Date"
        value={from}
        onChange={(e) => onFromChange(e.target.value)}
      />
      <Input
        type="date"
        label="To Date"
        value={to}
        onChange={(e) => onToChange(e.target.value)}
      />
    </div>
  );
}
