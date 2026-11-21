/**
 * Aftercare: vehicles due a service (the Service tracker's own reader,
 * fenced to the person's workshop branch).
 */
import { allows } from '@/lib/authz/server';
import { listVehiclesDueForService } from '@/lib/actions/service-tracking';
import { getWorkshopBranchId } from '@/lib/workshop-core';
import { day, ok, refused } from '../tool-helpers';
import type { StaffTool } from '../types';

export const aftercareTools: StaffTool[] = [
  {
    name: 'service_due',
    kind: 'read',
    status: 'Checking which vehicles are due a service…',
    description:
      'Vehicles at this person\'s workshop that are overdue or due soon for their next service (from the Service tracker): owner, plate, due date or odometer, days or km left, whether it is already back in the workshop, and whether a reminder can be sent now.',
    parameters: { type: 'object', properties: {}, additionalProperties: false },
    run: async () => {
      if (!(await allows('workshop.job_card.view'))) return refused('the Service tracker is for the workshop and management.');
      const due = await listVehiclesDueForService(await getWorkshopBranchId());
      const crm = await allows('crm.view');
      const rows = due.slice(0, 20).map((v) => ({
        vehicle: v.vehicleDescription, plate: v.plateNumber, customer: v.customerName, ...(crm && v.customerId ? { customerHref: `/crm/customers/${v.customerId}` } : {}),
        status: v.status === 'OVERDUE' ? 'Overdue' : 'Due soon', dueDate: day(v.nextServiceDueDate), dueOdometer: v.nextServiceDueOdometer, daysLeft: v.daysRemaining, kmLeft: v.kmRemaining,
        inWorkshopNow: v.inWorkshop ? v.inWorkshop.number : null, remindersSentThisCycle: v.remindersSentThisCycle, reminderCanBeSentNow: Boolean(v.reminderDue),
        href: `/workshop/vehicles/${v.vehicleId}/edit`,
      }));
      return ok({
        overdue: due.filter((v) => v.status === 'OVERDUE').length,
        dueSoon: due.filter((v) => v.status === 'DUE_SOON').length,
        vehicles: rows,
      }, [{ label: 'Service tracker', href: '/workshop/service-tracker' }]);
    },
  },
];
