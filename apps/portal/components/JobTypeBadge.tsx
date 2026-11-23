import { jobTypeLabel, isServiceType } from '@/lib/workshop/job-types';

const TONE: Record<string, string> = {
  SERVICE: 'bg-[var(--ejo-success)]/15 text-[var(--ejo-success)]',
  SERVICE_AND_REPAIR: 'bg-[var(--ejo-success)]/15 text-[var(--ejo-success)]',
  REPAIR: 'bg-[var(--ejo-primary)]/10 text-[var(--ejo-primary-text)]',
  DIAGNOSTICS: 'bg-[var(--ejo-info)]/12 text-[var(--ejo-info)]',
  SPRAYING: 'bg-[var(--brand-red)]/12 text-[var(--brand-red)]',
  CAR_WASH: 'bg-[var(--ejo-info)]/12 text-[var(--ejo-info)]',
};

/** The kind of visit a Job Card is (service, repair, spraying…); a service one drives the vehicle's next-service count once checked out. */
export function JobTypeBadge({ jobType, className = '' }: { jobType: string | null | undefined; className?: string }) {
  const type = jobType ?? 'REPAIR';
  return (
    <span
      data-testid="job-card-type-badge"
      data-job-type={type}
      title={isServiceType(type) ? 'A service visit: checking it out starts the next-service count' : undefined}
      className={`inline-block w-fit whitespace-nowrap rounded-full px-2 py-0.5 text-[10px] font-semibold ${TONE[type] ?? TONE.REPAIR} ${className}`}
    >
      {jobTypeLabel(type)}
    </span>
  );
}
