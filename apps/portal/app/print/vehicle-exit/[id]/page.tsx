import { portalConfig } from '@/lib/site-config';
import { notFound } from 'next/navigation';
import { getVehicleGateExit } from '@/lib/actions/security';
import { getOrganisation } from '@/lib/actions/organisation';
import { PrintOnLoad } from '@/components/print/PrintOnLoad';
import { PassSheet, PassLine } from '@/components/print/PassSheet';
import { formatDateTime } from '@/lib/utils/format-date';
import { qrSvgPath } from '@/lib/barcode/qr';
import { portalBaseUrl } from '@/lib/portal-url';

/** The gate pass for a vehicle released by the Workshop: the workshop keeps
 * one copy, the customer signs the acknowledgement. Its QR code opens the
 * gate pass in the portal, so the gate can check it is genuine. */
export default async function VehicleExitSlip({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ variant?: string }> }) {
  const { id } = await params;
  const { variant } = await searchParams;
  const isOrg = variant !== 'client';
  const [x, org] = await Promise.all([getVehicleGateExit(id), getOrganisation()]);
  if (!x) notFound();
  const rec = x.jobCard ? { number: x.jobCard.jobNumber, released: x.jobCard.checkedOutAt, collector: x.jobCard.collectedByName, customer: x.jobCard.customer.fullName } : null;
  const qr = qrSvgPath(`${portalBaseUrl()}/security/vehicles/exits/${x.id}`);
  return (
    <>
      <PrintOnLoad />
      <PassSheet copyLabel={isOrg ? 'Workshop copy' : 'Customer copy'} orgName={org?.name ?? portalConfig.organisationName} subName={x.branch.name} title="VEHICLE GATE PASS" note="This vehicle was released by the Workshop and checked out through the gate by Security.">
        <div style={{ textAlign: 'center', fontWeight: 700, fontSize: '1.2em', marginBottom: '4px' }}>{x.exitNumber}</div>
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '6px' }}>
          <svg role="img" aria-label={`QR code for gate pass ${x.exitNumber}`} width="96" height="96" viewBox={`0 0 ${qr.modules} ${qr.modules}`} shapeRendering="crispEdges"><rect width={qr.modules} height={qr.modules} fill="#fff" /><path d={qr.path} fill="#000" /></svg>
        </div>
        <PassLine label="Vehicle" value={[x.vehicle.make, x.vehicle.model].filter(Boolean).join(' ') || 'Vehicle'} />
        <PassLine label="Plate" value={x.vehicle.plateNumber} />
        <PassLine label="VIN" value={x.vehicle.chassisNumber} />
        <PassLine label="Job Card" value={rec?.number ?? null} />
        <PassLine label="Customer" value={rec?.customer ?? null} />
        <PassLine label="Released" value={rec?.released ? formatDateTime(rec.released) : null} />
        <PassLine label="Collected by" value={x.driverName ?? rec?.collector ?? null} />
        <PassLine label="Left the gate" value={formatDateTime(x.exitedAt)} />
        {isOrg ? <PassLine label="Confirmed by" value={x.exitedBy.fullName} /> : null}
        {isOrg && x.notes ? <PassLine label="Notes" value={x.notes} /> : null}
        <div style={{ marginTop: '12px', textAlign: 'center' }}>
          <div style={{ borderBottom: '1px dotted #64748B', minHeight: '1.6em' }} />
          <div style={{ fontSize: '0.85em' }}>{isOrg ? 'Collected by: signature' : 'Vehicle received in good condition: signature'}</div>
        </div>
      </PassSheet>
    </>
  );
}
