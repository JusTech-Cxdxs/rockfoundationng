import { notFound } from 'next/navigation';
import { jobCardVisible, guardAnyPage } from '@/lib/authz/server';
import { getVehicleInspection } from '@/lib/actions/vehicle-inspection';
import { getJobCard } from '@/lib/actions/workshop';
import { InspectionWorkspace } from '@/components/InspectionWorkspace';
import { FormFeedbackBanner } from '@/components/FormFeedbackBanner';
import { getApplicableTemplate } from '@/lib/vehicle-inspection-template';
import { BackLink } from '@/components/ui';

/** The Job Card's check-in inspection. Loads the data; the interactive checklist is InspectionWorkspace. */
export default async function VehicleInspectionPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; status?: string }>;
}) {
  await guardAnyPage(['workshop.view'], '/workshop');
  const { id: jobCardId } = await params;
  // An id the viewer can't see is a 404.
  if (!(await jobCardVisible(jobCardId, 'page'))) notFound();
  const { error, status } = await searchParams;
  const [jobCard, inspection] = await Promise.all([
    getJobCard(jobCardId),
    getVehicleInspection(jobCardId),
  ]);
  if (!jobCard) notFound();

  const vehicleType = jobCard.vehicle.vehicleType;
  const template = vehicleType ? getApplicableTemplate(vehicleType) : [];

  return (
    <div className="p-4 sm:p-8">
      <BackLink href={`/workshop/job-cards/${jobCardId}`} label={<>Back to {jobCard.jobNumber}</>} className="mb-4" />

      {error ? (
        <div className="mb-6 max-w-xl">
          <FormFeedbackBanner kind="error" message={error} />
        </div>
      ) : null}
      {status === 'saved' ? (
        <div className="mb-6 max-w-xl">
          <FormFeedbackBanner kind="success" message="Changes saved." />
        </div>
      ) : null}
      {status === 'completed' ? (
        <div className="mb-6 max-w-xl">
          <FormFeedbackBanner kind="success" message="Inspection completed." />
        </div>
      ) : null}
      {status === 'skipped' ? (
        <div className="mb-6 max-w-xl">
          <FormFeedbackBanner kind="success" message="Inspection skipped and recorded." />
        </div>
      ) : null}
      {status === 'inspection_cancelled' ? (
        <div className="mb-6 max-w-xl">
          <FormFeedbackBanner kind="success" message="Inspection cancelled — choose to start or skip again below." />
        </div>
      ) : null}

      {!vehicleType ? (
        <div className="max-w-md rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-warning)]/30 bg-[var(--ejo-warning)]/5 p-6 text-sm text-[var(--ejo-text)]">
          This vehicle has no Passenger/Commercial type on file yet — set it on the Vehicles page before
          starting an inspection.
        </div>
      ) : (
        <InspectionWorkspace
          jobCardId={jobCardId}
          vehicleId={jobCard.vehicle.id}
          jobNumber={jobCard.jobNumber}
          vehicleDescription={[jobCard.vehicle.year, jobCard.vehicle.make, jobCard.vehicle.model].filter(Boolean).join(' ') || 'Vehicle'}
          vehicleType={vehicleType}
          template={template}
          inspection={inspection}
        />
      )}
    </div>
  );
}
