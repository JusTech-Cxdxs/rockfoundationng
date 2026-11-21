/** Marks a Job Card opened as a routine service (it drives the vehicle's next-service count once checked out). */
export function ServiceJobCardBadge({ className = '' }: { className?: string }) {
  return (
    <span
      data-testid="job-card-service-badge"
      title="Opened as a routine service: checking it out starts the next-service count"
      className={`inline-block w-fit rounded-full bg-[var(--ejo-success)]/15 px-2 py-0.5 text-[10px] font-semibold text-[var(--ejo-success)] ${className}`}
    >
      Service
    </span>
  );
}
