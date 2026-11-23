/**
 * The fleet report's rows for one customer of the organisation (server only;
 * callers authorise first): every Job Card with what it is charged at (the
 * invoice, else the estimate sent to the customer, VAT included), paid less
 * refunds, credit notes approved and whether it was a comeback; and each
 * vehicle with its next service due. The figures are worked out by
 * @ejo/utils/fleet-report, the same as in the customer portal.
 */
import 'server-only';
import { renderToBuffer } from '@react-pdf/renderer';
import { prisma } from '@ejo/database';
import { fleetReport, type FleetJob, type FleetReport, type FleetVehicle } from '@ejo/utils/fleet-report';
import { vatSettingFor } from '@ejo/utils';
import { computeServiceCycle } from '@/lib/vehicle-service-cycle';
import { FleetReportPdf } from '@/lib/pdf/money-pdf';
import { letterhead } from '@/lib/pdf/document-props';
import { portalBaseUrl } from '@/lib/portal-url';
import { formatDateOnly as formatDate } from '@/lib/utils/format-date';

const n = (v: unknown) => (v === null || v === undefined ? 0 : Number(v));

export type FleetCustomer = { id: string; name: string; organisationName: string; customerType: string; creditLimit: number | null; paymentTermsDays: number | null };

export async function fleetFor(customerId: string, organisationId: string, from: Date, to: Date): Promise<{ customer: FleetCustomer; report: FleetReport } | null> {
  const customer = await prisma.customer.findFirst({
    where: { id: customerId, organisationId },
    select: { id: true, fullName: true, customerType: true, customerCompany: { select: { creditLimit: true, paymentTermsDays: true, creditApprovedAt: true } } },
  });
  if (!customer) return null;
  const org = await prisma.organisation.findUnique({ where: { id: organisationId }, select: { name: true, vatEnabled: true, vatRate: true } });
  const [jobs, vehicles] = await Promise.all([
    prisma.jobCard.findMany({
      where: { customerId: customer.id },
      orderBy: { createdAt: 'asc' },
      take: 2000,
      select: {
        vehicleId: true, jobNumber: true, jobType: true, status: true, createdAt: true, checkedOutAt: true, comebackOfId: true, isService: true, mileageAtCheckIn: true,
        invoice: { select: { total: true } },
        estimate: { select: { customerNotifiedAt: true, discountAmount: true, vatRate: true, lineItems: { where: { billTo: 'CUSTOMER' }, select: { amount: true, discountAmount: true } } } },
        payments: { select: { amount: true } }, refunds: { select: { amount: true } },
        creditNotes: { where: { status: 'APPROVED' }, select: { amount: true } },
        vehicle: { select: { serviceIntervalKm: true, serviceIntervalDays: true } },
        branch: { select: { businessUnit: { select: { organisation: { select: { primaryServiceIntervalKm: true, primaryServiceIntervalDays: true } } } } } },
      },
    }),
    prisma.customerVehicle.findMany({ where: { customerId: customer.id }, orderBy: { createdAt: 'asc' }, take: 500, select: { id: true, make: true, model: true, year: true, plateNumber: true } }),
  ]);
  const rows: FleetJob[] = jobs.map((j) => {
    let charged = n(j.invoice?.total);
    if (!j.invoice && j.estimate?.customerNotifiedAt) {
      // The estimate as sent: customer lines less discounts, plus VAT where it applies.
      const net = j.estimate.lineItems.reduce((s, l) => s + n(l.amount) - n(l.discountAmount), 0) - n(j.estimate.discountAmount);
      const vat = vatSettingFor(j.estimate, org);
      const rate = vat?.vatEnabled ? n(vat.vatRate) / 100 : 0;
      charged = Math.round(net * (1 + rate) * 100) / 100;
    }
    return {
      vehicleId: j.vehicleId, jobNumber: j.jobNumber, jobType: String(j.jobType), status: String(j.status), openedAt: j.createdAt, checkedOutAt: j.checkedOutAt,
      charged, paid: j.payments.reduce((s, p) => s + n(p.amount), 0) - j.refunds.reduce((s, r) => s + n(r.amount), 0),
      credited: j.creditNotes.reduce((s, c) => s + n(c.amount), 0), comeback: Boolean(j.comebackOfId),
    };
  });
  // Next service: from each vehicle's latest service visit that was checked out.
  const lastService = new Map<string, (typeof jobs)[number]>();
  for (const j of jobs) if (j.isService && j.checkedOutAt) lastService.set(j.vehicleId, j);
  const fleet: FleetVehicle[] = vehicles.map((v) => {
    const s = lastService.get(v.id);
    const cycle = s ? computeServiceCycle(s.mileageAtCheckIn, s.checkedOutAt!, s) : null;
    return { id: v.id, label: [v.year, v.make, v.model].filter(Boolean).join(' ') || 'Vehicle', plate: v.plateNumber, nextServiceDate: cycle?.nextServiceDueDate ?? null, nextServiceKm: cycle?.nextServiceDueOdometer ?? null };
  });
  return {
    customer: {
      id: customer.id, name: customer.fullName, organisationName: org?.name ?? '', customerType: String(customer.customerType),
      // Credit terms only once approved (Customers → the organisation's page).
      creditLimit: customer.customerCompany?.creditApprovedAt && customer.customerCompany.creditLimit !== null ? n(customer.customerCompany.creditLimit) : null,
      paymentTermsDays: customer.customerCompany?.creditApprovedAt ? customer.customerCompany.paymentTermsDays : null,
    },
    report: fleetReport(rows, fleet, from, to),
  };
}

const JOB_TYPE_WORDS: Record<string, string> = { SERVICE: 'Service', REPAIR: 'Repair', SERVICE_AND_REPAIR: 'Service and repair', DIAGNOSTICS: 'Diagnostics', SPRAYING: 'Spraying', CAR_WASH: 'Car wash' };
export const visitWords = (t: string) => JOB_TYPE_WORDS[t] ?? t;

/** The fleet report as a PDF (landscape A4, the statement's letterhead). */
export async function fleetReportPdfFor(customerId: string, organisationId: string, period: { from: Date; to: Date; label: string }): Promise<{ pdf: Buffer; fileName: string } | null> {
  const f = await fleetFor(customerId, organisationId, period.from, period.to);
  if (!f) return null;
  const branch = await prisma.branch.findFirst({ where: { businessUnit: { organisationId } }, orderBy: { createdAt: 'asc' }, select: BRANCH_SELECT });
  if (!branch) return null;
  const r = f.report;
  const pdf = await renderToBuffer(FleetReportPdf({
    ...letterhead(branch.businessUnit.organisation, branch, portalBaseUrl()),
    dateLabel: formatDate(new Date()),
    customerName: f.customer.name,
    periodLabel: period.label,
    termsLine: f.customer.paymentTermsDays ? `${f.customer.paymentTermsDays} days${f.customer.creditLimit !== null ? `, limit ${nairaWords(f.customer.creditLimit)}` : ''}` : null,
    tiles: [
      { label: 'Vehicles seen', value: String(r.vehiclesSeen) }, { label: 'Visits', value: String(r.visits) }, { label: 'Charged', value: nairaWords(r.charged) },
      { label: 'Comebacks', value: String(r.comebacks) }, { label: 'Still owed', value: nairaWords(r.owed) }, { label: 'Due for service', value: String(r.dueForService) },
    ],
    byType: r.byType.map((t) => ({ visit: visitWords(t.jobType), visits: String(t.visits), charged: nairaWords(t.charged) })),
    vehicles: r.vehicles.map((v) => ({
      vehicle: v.label, plate: v.plate ?? '—', visits: String(v.visits), charged: nairaWords(v.charged), owed: nairaWords(v.owed), lastVisit: v.lastVisit ? formatDate(v.lastVisit) : '—',
      nextService: [v.nextServiceDate ? formatDate(v.nextServiceDate) : null, v.nextServiceKm ? `${v.nextServiceKm.toLocaleString('en-NG')} km` : null].filter(Boolean).join(' or ') || '—',
    })),
  }));
  const safe = f.customer.name.replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'Fleet';
  return { pdf, fileName: `Fleet-report-${safe}-${period.from.toISOString().slice(0, 10)}.pdf` };
}

const ORG_SELECT = { name: true, legalName: true, hqAddress: true, poBox: true, rcNumber: true, hotlines: true, website: true, email: true } as const;
const BRANCH_SELECT = { name: true, address: true, hotlines: true, email: true, businessUnit: { select: { organisation: { select: ORG_SELECT } } } } as const;
const nairaWords = (n: number) => `₦${n.toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
