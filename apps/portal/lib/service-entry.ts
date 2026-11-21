/**
 * Where new service work is opened: a service is a Job Card with Service
 * ticked. Pure: safe in server and client code and in tests.
 */

/** The words on a "book a service" link. */
export const OPEN_SERVICE_JOB_CARD = 'Open a service Job Card';

/** Where "book a service" for a vehicle goes: the Open Job Card form with Service chosen. */
export function bookServiceHref(vehicleId: string): string {
  return `/workshop/job-cards?service=1&vehicle=${encodeURIComponent(vehicleId)}#open-job-card`;
}
