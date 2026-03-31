'use client';

import { Input } from '@/components/ui/input';

type Props = {
  value: string;
  onChange: (v: string) => void;
};

export function CustomersSearchBar({ value, onChange }: Props) {
  return (
    <Input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder="Search by customer name..."
      className="h-10 rounded-xl text-sm md:h-11 md:text-base"
    />
  );
}
