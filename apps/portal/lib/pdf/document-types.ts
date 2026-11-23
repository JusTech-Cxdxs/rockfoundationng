/**
 * The contents of each customer PDF, as types (no JSX here, so plain modules
 * and the unit tests can use them). The documents themselves are drawn in
 * estimate-pdf.tsx, inspection-pdf.tsx, invoice-pdf.tsx and receipt-pdf.tsx.
 */

export type EstimatePdfLineItem = {
  description: string;
  quantity: number;
  unitLabel: string | null;
  amount: string;
};

export type EstimatePdfProps = {
  organisation: {
    name: string;
    legalName: string | null;
    hqAddress: string | null;
    poBox: string | null;
    rcNumber: string | null;
    hotlines: string[];
    website: string | null;
    email: string | null;
  };
  branch: {
    name: string;
    address: string | null;
    hotlines: string[];
    email: string | null;
  };
  logoUrl: string;
  jobNumber: string;
  customerName: string;
  customerAddress: string | null;
  vehicleDescription: string;
  plateNumber: string | null;
  chassisNumber: string | null;
  lineItems: EstimatePdfLineItem[];
  servicesSubtotal: string | null;
  labourSubtotal: string | null;
  sundrySubtotal: string | null;
  /** Line and whole-estimate discounts together ("−₦1,000.00"); null when none. */
  discountAmount?: string | null;
  /** "VAT (7.5%)" and its amount; null when VAT is off. */
  vatLabel?: string | null;
  vatAmount?: string | null;
  totalAmount: string;
  /** The deposit due before work starts; null when none applies (no deposit box). */
  minimumDepositAmount: string | null;
  depositPercent?: number | null;
  bankName: string;
  accountName: string;
  accountNumber: string;
  paymentRemarkSuggestion: string;
};

export type InspectionPdfItem = {
  section: string;
  name: string;
  condition: string | null;
  severity: string | null;
  action: string | null;
};

export type InspectionPdfProps = {
  organisation: {
    name: string;
    legalName: string | null;
    hqAddress: string | null;
    poBox: string | null;
    rcNumber: string | null;
    hotlines: string[];
    website: string | null;
    email: string | null;
  };
  branch: {
    name: string;
    address: string | null;
    hotlines: string[];
    email: string | null;
  };
  logoUrl: string;
  jobNumber: string;
  customerName: string;
  vehicleDescription: string;
  plateNumber: string | null;
  chassisNumber: string | null;
  inspectedByName: string;
  completedOnLabel: string;
  /** Reviewed items only: the customer copy never lists what wasn't checked
   * (same rule as the print page). */
  reviewedItems: InspectionPdfItem[];
};

export type InvoicePdfLineItem = {
  description: string;
  quantity: number;
  unitLabel: string | null;
  unitPrice: string;
  discount: string;
  amount: string;
};

export type InvoicePdfProps = {
  organisation: EstimatePdfProps['organisation'];
  branch: EstimatePdfProps['branch'];
  logoUrl: string;
  invoiceNumber: string;
  issuedOnLabel: string;
  /** "21 December 2026": printed as "Payment due by …"; null when due before collection. */
  dueOnLabel?: string | null;
  jobNumber: string;
  customerName: string;
  customerContact: string | null;
  customerAddress: string | null;
  vehicleDescription: string;
  plateNumber: string | null;
  mileage: string | null;
  lineItems: InvoicePdfLineItem[];
  subtotalAmount: string;
  discountAmount: string | null;
  discountReason: string | null;
  vatLabel: string | null;
  vatAmount: string | null;
  /** The organisation's TIN, printed beside VAT. */
  vatNumber: string | null;
  totalAmount: string;
  amountPaid: string;
  balanceDue: string;
  bankName: string;
  accountName: string;
  accountNumber: string;
  paymentRemarkSuggestion: string;
  /** "Thank you for choosing <the organisation>." */
  closing: string;
  /** The workshop's guarantee on the work, in a sentence (null: none). */
  guarantee?: string | null;
};

export type ReceiptPdfProps = {
  organisation: EstimatePdfProps['organisation'];
  branch: EstimatePdfProps['branch'];
  logoUrl: string;
  receiptNumber: string;
  /** "21 November 2026, 10:15" */
  receivedOnLabel: string;
  /** The person, or the organisation for a company customer. */
  customerName: string;
  jobNumber: string;
  vehicleDescription: string;
  plateNumber: string | null;
  amountReceived: string;
  /** "Cash" or "Bank Transfer". */
  methodLabel: string;
  reference: string | null;
  receivedByName: string;
  totalAmount: string;
  paidToDate: string;
  balanceAfter: string;
  /** "Paid in full" or "Part payment". */
  statusLabel: string;
  /** "Thank you for choosing <the organisation>." */
  closing: string;
};
