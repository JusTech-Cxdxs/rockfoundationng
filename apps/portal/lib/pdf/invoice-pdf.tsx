import { Document, Page, Text, View, Image, StyleSheet } from '@react-pdf/renderer';
import { PLATFORM } from '../brand';
import { PDF_FONT, registerPdfFonts } from './fonts';
import type { InvoicePdfProps } from './document-types';
export type { InvoicePdfLineItem, InvoicePdfProps } from './document-types';

const bold = { fontFamily: PDF_FONT, fontWeight: 'bold' } as const;

// The estimate's letterhead and layout (estimate-pdf.tsx), so the two read as one set.
const styles = StyleSheet.create({
  page: { paddingTop: 32, paddingBottom: 32, paddingHorizontal: 36, fontSize: 10, fontFamily: PDF_FONT, color: '#0F172A' },
  headerRow: { flexDirection: 'row', alignItems: 'center' },
  logo: { width: 44, height: 53 },
  wordmarkWrap: { marginLeft: 8 },
  wordmarkTop: { fontSize: 20, ...bold },
  wordmarkBottomRow: { flexDirection: 'row', alignItems: 'center', marginTop: 2 },
  wordmarkRule: { flex: 1, borderBottomWidth: 1, borderBottomColor: '#EC3237', marginRight: 5 },
  wordmarkBottom: { fontSize: 10, ...bold, color: '#334155' },
  docTitleWrap: { marginLeft: 'auto', alignItems: 'flex-end' },
  docTitle: { fontSize: 13, ...bold, color: '#3E4095' },
  docRef: { fontSize: 11, marginTop: 2 },
  docDate: { fontSize: 9, color: '#475569', marginTop: 2 },
  ruleThick: { borderBottomWidth: 1.5, borderBottomColor: '#EC3237', marginTop: 12, paddingTop: 8 },
  eyebrow: { fontSize: 8, ...bold, color: '#94A3B8', letterSpacing: 0.5 },
  legalName: { fontSize: 11, ...bold, marginTop: 2 },
  smallMuted: { fontSize: 9, color: '#475569', marginTop: 1 },
  ruleThin: { borderBottomWidth: 0.5, borderBottomColor: '#E2E8F0', marginTop: 10, paddingTop: 8 },
  fieldGrid: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 16 },
  field: { width: '50%', marginBottom: 10 },
  fieldLabel: { fontSize: 8, ...bold, color: '#94A3B8', letterSpacing: 0.5 },
  fieldValue: { fontSize: 11, ...bold, marginTop: 1 },
  table: { marginTop: 16 },
  tHeadRow: { flexDirection: 'row', borderBottomWidth: 1.5, borderBottomColor: '#0F172A', paddingBottom: 5 },
  tRow: { flexDirection: 'row', borderBottomWidth: 0.5, borderBottomColor: '#E2E8F0', paddingVertical: 5 },
  colSn: { width: '5%' },
  colDesc: { width: '37%' },
  colQty: { width: '12%', textAlign: 'right' },
  colPrice: { width: '16%', textAlign: 'right' },
  colDisc: { width: '14%', textAlign: 'right' },
  colAmt: { width: '16%', textAlign: 'right' },
  th: { fontSize: 8, ...bold, color: '#475569' },
  totalsBox: { marginTop: 10, alignItems: 'flex-end' },
  row: { flexDirection: 'row', justifyContent: 'space-between', width: 240, marginBottom: 2 },
  rowLabel: { fontSize: 9, color: '#475569' },
  rowValue: { fontSize: 9 },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', width: 240, marginTop: 4, paddingTop: 4, borderTopWidth: 1, borderTopColor: '#0F172A' },
  totalLabel: { fontSize: 11, ...bold },
  totalValue: { fontSize: 11, ...bold },
  balanceRow: { flexDirection: 'row', justifyContent: 'space-between', width: 240, marginTop: 4, paddingTop: 4, borderTopWidth: 0.5, borderTopColor: '#E2E8F0' },
  note: { fontSize: 8, color: '#64748B', marginTop: 4, width: 240, textAlign: 'right' },
  paymentTitle: { fontSize: 10, ...bold, marginTop: 16, marginBottom: 6 },
  paymentBox: { backgroundColor: '#F8FAFC', borderWidth: 0.5, borderColor: '#E2E8F0', borderRadius: 6, padding: 12 },
  paymentLine: { fontSize: 9, marginBottom: 2 },
  paymentNote: { fontSize: 8, color: '#64748B', marginTop: 2 },
  closing: { marginTop: 18, fontSize: 10, ...bold, textAlign: 'center', color: '#3E4095' },
  closingRule: { borderTopWidth: 1.5, borderTopColor: '#EC3237', marginTop: 6, marginHorizontal: 160 },
  footer: { marginTop: 22, paddingTop: 8, borderTopWidth: 0.5, borderTopColor: '#E2E8F0', textAlign: 'center' },
  footerText: { fontSize: 8, color: '#94A3B8' },
  footerCredit: { fontSize: 7, color: '#CBD5E1', marginTop: 3 },
});

/**
 * The customer's invoice PDF, attached to the invoice email. Every figure
 * comes from the invoice as issued (lib/pdf/document-props invoicePdfProps),
 * so it always matches the printed copy.
 */
export function InvoicePdf(props: InvoicePdfProps) {
  registerPdfFonts();
  const { organisation, branch, logoUrl } = props;
  const nameWords = organisation.name.trim().split(/\s+/);
  const wordmarkTop = nameWords[0] ?? organisation.name;
  const wordmarkBottom = nameWords.slice(1).join(' ');
  const registrationLine = [organisation.poBox ? `P.O. Box ${organisation.poBox}` : null, organisation.rcNumber ? `RC Number: ${organisation.rcNumber}` : null].filter(Boolean).join('   ·   ');

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {/* eslint-disable-next-line jsx-a11y/alt-text */}
        <Image fixed src={logoUrl} style={{ position: 'absolute', top: 250, left: 70, width: 455, opacity: 0.045 }} />
        <View style={styles.headerRow}>
          {/* @react-pdf/renderer's own Image primitive (no alt prop), as in estimate-pdf.tsx. */}
          {/* eslint-disable-next-line jsx-a11y/alt-text */}
          <Image src={logoUrl} style={styles.logo} />
          <View style={styles.wordmarkWrap}>
            <Text style={styles.wordmarkTop}>{wordmarkTop}</Text>
            {wordmarkBottom ? (
              <View style={styles.wordmarkBottomRow}>
                <View style={styles.wordmarkRule} />
                <Text style={styles.wordmarkBottom}>{wordmarkBottom}</Text>
              </View>
            ) : null}
          </View>
          <View style={styles.docTitleWrap}>
            <Text style={styles.docTitle}>{props.title ?? 'Invoice'}</Text>
            <Text style={styles.docRef}>{props.invoiceNumber}</Text>
            <Text style={styles.docDate}>{props.issuedOnLabel}</Text>
            {props.dueOnLabel ? <Text style={styles.docDate}>Payment due by {props.dueOnLabel}</Text> : null}
          </View>
        </View>

        <View style={styles.ruleThick}>
          {organisation.legalName ? <Text style={styles.legalName}>{organisation.legalName}</Text> : null}
          {organisation.hqAddress ? <Text style={styles.smallMuted}>{organisation.hqAddress}</Text> : null}
          {registrationLine ? <Text style={styles.smallMuted}>{registrationLine}</Text> : null}
          {organisation.hotlines.length > 0 ? <Text style={styles.smallMuted}>General Hotlines: {organisation.hotlines.join('  |  ')}</Text> : null}
          {organisation.email ? <Text style={styles.smallMuted}>Email: {organisation.email}</Text> : null}
          {props.vatNumber ? <Text style={styles.smallMuted}>Tax ID (TIN): {props.vatNumber}</Text> : null}
        </View>

        <View style={styles.ruleThin}>
          <Text style={styles.eyebrow}>BRANCH</Text>
          <Text style={styles.legalName}>{branch.name}</Text>
          {branch.address ? <Text style={styles.smallMuted}>{branch.address}</Text> : null}
          {branch.hotlines.length > 0 ? <Text style={styles.smallMuted}>Hotlines: {branch.hotlines.join('  |  ')}</Text> : null}
          {branch.email ? <Text style={styles.smallMuted}>Email: {branch.email}</Text> : null}
        </View>

        <View style={styles.fieldGrid}>
          <View style={styles.field}>
            <Text style={styles.fieldLabel}>BILL TO</Text>
            <Text style={styles.fieldValue}>{props.customerName}</Text>
            {props.customerContact ? <Text style={styles.smallMuted}>{props.customerContact}</Text> : null}
            {props.customerAddress ? <Text style={styles.smallMuted}>{props.customerAddress}</Text> : null}
          </View>
          {props.sale ? (
            <>
              <View style={styles.field}>
                <Text style={styles.fieldLabel}>SALE</Text>
                <Text style={styles.fieldValue}>Over the counter</Text>
              </View>
              <View style={styles.field}>
                <Text style={styles.fieldLabel}>PAID BY</Text>
                <Text style={styles.fieldValue}>{props.sale.paidBy}</Text>
              </View>
              <View style={styles.field}>
                <Text style={styles.fieldLabel}>SERVED BY</Text>
                <Text style={styles.fieldValue}>{props.sale.soldBy}</Text>
              </View>
            </>
          ) : (
            <>
              <View style={styles.field}>
                <Text style={styles.fieldLabel}>JOB CARD</Text>
                <Text style={styles.fieldValue}>{props.jobNumber}</Text>
              </View>
              <View style={styles.field}>
                <Text style={styles.fieldLabel}>VEHICLE</Text>
                <Text style={styles.fieldValue}>{props.vehicleDescription}</Text>
              </View>
              <View style={styles.field}>
                <Text style={styles.fieldLabel}>PLATE NO. / MILEAGE</Text>
                <Text style={styles.fieldValue}>{[props.plateNumber ?? '—', props.mileage].filter(Boolean).join('  ·  ')}</Text>
              </View>
            </>
          )}
        </View>

        <View style={styles.table}>
          <View style={styles.tHeadRow}>
            <Text style={[styles.th, styles.colSn]}>S/N</Text>
            <Text style={[styles.th, styles.colDesc]}>Description</Text>
            <Text style={[styles.th, styles.colQty]}>Qty</Text>
            <Text style={[styles.th, styles.colPrice]}>Unit price</Text>
            <Text style={[styles.th, styles.colDisc]}>Discount</Text>
            <Text style={[styles.th, styles.colAmt]}>Amount</Text>
          </View>
          {props.lineItems.map((li, i) => (
            // eslint-disable-next-line react/no-array-index-key
            <View style={styles.tRow} key={i}>
              <Text style={styles.colSn}>{i + 1}</Text>
              <Text style={styles.colDesc}>{li.description}</Text>
              <Text style={styles.colQty}>{li.quantity}{li.unitLabel ? ` ${li.unitLabel}` : ''}</Text>
              <Text style={styles.colPrice}>{li.unitPrice}</Text>
              <Text style={styles.colDisc}>{li.discount}</Text>
              <Text style={styles.colAmt}>{li.amount}</Text>
            </View>
          ))}
        </View>

        <View style={styles.totalsBox}>
          <View style={styles.row}>
            <Text style={styles.rowLabel}>Subtotal</Text>
            <Text style={styles.rowValue}>{props.subtotalAmount}</Text>
          </View>
          {props.discountAmount ? (
            <View style={styles.row}>
              <Text style={styles.rowLabel}>Discount</Text>
              <Text style={styles.rowValue}>{props.discountAmount}</Text>
            </View>
          ) : null}
          {props.vatLabel && props.vatAmount ? (
            <View style={styles.row}>
              <Text style={styles.rowLabel}>{props.vatLabel}{props.vatNumber ? ` · TIN ${props.vatNumber}` : ''}</Text>
              <Text style={styles.rowValue}>{props.vatAmount}</Text>
            </View>
          ) : null}
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>Total</Text>
            <Text style={styles.totalValue}>{props.totalAmount}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.rowLabel}>Amount paid</Text>
            <Text style={styles.rowValue}>{props.amountPaid}</Text>
          </View>
          <View style={styles.balanceRow}>
            <Text style={styles.totalLabel}>Balance due</Text>
            <Text style={styles.totalValue}>{props.balanceDue}</Text>
          </View>
          {props.dueOnLabel ? <Text style={styles.note}>Payment due by {props.dueOnLabel}.</Text> : null}
          {props.discountReason ? <Text style={styles.note}>Discount: {props.discountReason}</Text> : null}
        </View>

        {props.sale ? null : (
          <>
            <Text style={styles.paymentTitle}>How to pay</Text>
            <View style={styles.paymentBox}>
              <Text style={styles.paymentLine}>Bank: {props.bankName}</Text>
              <Text style={styles.paymentLine}>Account Name: {props.accountName}</Text>
              <Text style={styles.paymentLine}>Account Number: {props.accountNumber}</Text>
              <Text style={styles.paymentLine}>Payment Reference: {props.paymentRemarkSuggestion}</Text>
              <Text style={styles.paymentNote}>Or pay the cashier at our {branch.name} office.</Text>
            </View>
          </>
        )}

        <Text style={styles.closing}>{props.closing}</Text>
        <View style={styles.closingRule} />

        <View style={styles.footer}>
          <Text style={styles.footerText}>{organisation.legalName ?? organisation.name}{organisation.hqAddress ? ` · ${organisation.hqAddress}` : ''}</Text>
          <Text style={styles.footerCredit}>{PLATFORM.poweredBy}</Text>
        </View>
      </Page>
    </Document>
  );
}
