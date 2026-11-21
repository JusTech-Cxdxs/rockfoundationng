import { featureOn } from './modules';

/**
 * Where new service work is opened in this edition. With the separate
 * Vehicle Service switched off (D'Phoenix Autocare), a service is a Job
 * Card with Service ticked; old Vehicle Services stay readable by link and
 * search. Pure: safe in server and client code and in tests.
 */
export function separateVehicleServiceOn(): boolean {
  return featureOn('separateVehicleService');
}

/** The words on a "book a service" link when services are opened as a Job Card. */
export const OPEN_SERVICE_JOB_CARD = 'Open a service Job Card';

/** Where "book a service" for a vehicle goes: the Vehicle Service booking, or the Open Job Card form with Service chosen. */
export function bookServiceHref(vehicleId: string): string {
  const id = encodeURIComponent(vehicleId);
  return separateVehicleServiceOn() ? `/workshop/vehicle-service/book?vehicleId=${id}` : `/workshop/job-cards?service=1&vehicle=${id}#open-job-card`;
}

/** The message when someone tries to open a Vehicle Service while it is switched off. */
export const VEHICLE_SERVICE_OFF_MESSAGE = 'New services are opened as a Job Card — choose "Service" on the Open Job Card form. Past Vehicle Services stay available to view.';
