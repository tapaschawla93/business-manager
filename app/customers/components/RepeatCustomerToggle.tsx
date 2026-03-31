'use client';

type Props = {
  checked: boolean;
  onChange: (v: boolean) => void;
};

export function RepeatCustomerToggle({ checked, onChange }: Props) {
  return (
    <label className="inline-flex items-center gap-2 text-sm text-foreground">
      <input
        type="checkbox"
        className="h-4 w-4 rounded border-border"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      Repeat Customer
    </label>
  );
}
