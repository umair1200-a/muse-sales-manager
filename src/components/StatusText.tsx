import type { WarrantyStatus } from '../types/models.ts';

export function WarrantyStatusText({ status }: { status: WarrantyStatus }) {
  if (status === 'ACTIVE') {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-400 whitespace-nowrap">
        <span className="w-1.5 h-1.5 rounded-xs bg-emerald-400" aria-hidden="true" />
        Active
      </span>
    );
  }
  if (status === 'EXPIRING_SOON') {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-amber-400 whitespace-nowrap">
        <span className="w-1.5 h-1.5 rounded-xs bg-amber-400" aria-hidden="true" />
        Expiring Soon
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-red-400 whitespace-nowrap">
      <span className="w-1.5 h-1.5 rounded-xs bg-red-400" aria-hidden="true" />
      Expired
    </span>
  );
}
