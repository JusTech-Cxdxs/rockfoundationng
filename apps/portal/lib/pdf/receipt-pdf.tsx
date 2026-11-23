import { registrationLine as registrationLineOf } from '../utils/registration-line';
import { Document, Page, Text, View, Image, StyleSheet } from '@react-pdf/renderer';
import { PLATFORM } from '../brand';
import { PDF_FONT, registerPdfFonts } from './fonts';
import type { ReceiptPdfProps } from './document-types';
export type { ReceiptPdfProps } from './document-types';

const bold = { fontFamily: PDF_FONT, fontWeight: 'bold' } as const;

// The invoice's letterhead and layout (invoice-pdf.tsx), so the set reads as one.
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
  amountBox: { marginTop: 8, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderWidth: 1.5, borderColor: '#0F172A', borderRadius: 6, paddingVertical: 10, paddingHorizontal: 14 },
  amountLabel: { fontSize: 9, ...bold, color: '#475569', letterSpacing: 0.5 },
  amountValue: { fontSize: 16, ...bold },
  totalsBox: { marginTop: 12, alignItems: 'flex-end' },
  row: { flexDirection: 'row', justifyContent: 'space-between', width: 260, marginBottom: 2 },
  rowLabel: { fontSize: 9, color: '#475569' },
  rowValue: { fontSize: 9 },
  balanceRow: { flexDirection: 'row', justifyContent: 'space-between', width: 260, marginTop: 4, paddingTop: 4, borderTopWidth: 1, borderTopColor: '#0F172A' },
  totalLabel: { fontSize: 11, ...bold },
  totalValue: { fontSize: 11, ...bold },
  status: { fontSize: 9, ...bold, color: '#3E4095', marginTop: 4 },
  closing: { marginTop: 22, fontSize: 10, ...bold, textAlign: 'center', color: '#3E4095' },
  closingRule: { borderTopWidth: 1.5, borderTopColor: '#EC3237', marginTop: 6, marginHorizontal: 160 },
  footer: { marginTop: 22, paddingTop: 8, borderTopWidth: 0.5, borderTopColor: '#E2E8F0', textAlign: 'center' },
  footerText: { fontSize: 8, color: '#94A3B8' },
  footerCredit: { fontSize: 7, color: '#CBD5E1', marginTop: 3 },
});

/**
 * The customer's payment receipt as a PDF (the RCT-number), opened from the
 * secure link in a WhatsApp message. Every figure comes from
 * lib/pdf/document-props receiptPdfProps, the same reading as the printed
 * receipt (app/print/receipts).
 */
export function ReceiptPdf(props: ReceiptPdfProps) {
  registerPdfFonts();
  const { organisation, branch, logoUrl } = props;
  const nameWords = organisation.name.trim().split(/\s+/);
  const wordmarkTop = nameWords[0] ?? organisation.name;
  const wordmarkBottom = nameWords.slice(1).join(' ');
  const registrationLine = registrationLineOf(organisation);

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {/* eslint-disable-next-line jsx-a11y/alt-text */}
        <Image fixed src={logoUrl} style={{ position: 'absolute', top: 250, left: 70, width: 455, opacity: 0.045 }} />
        <View style={styles.headerRow}>
          {/* @react-pdf/renderer's own Image primitive (no alt prop), as in invoice-pdf.tsx. */}
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
            <Text style={styles.docTitle}>Payment Receipt</Text>
            <Text style={styles.docRef}>{props.receiptNumber}</Text>
            <Text style={styles.docDate}>{props.receivedOnLabel}</Text>
          </View>
        </View>

        <View style={styles.ruleThick}>
          {organisation.legalName ? <Text style={styles.legalName}>{organisation.legalName}</Text> : null}
          {organisation.hqAddress ? <Text style={styles.smallMuted}>{organisation.hqAddress}</Text> : null}
          {registrationLine ? <Text style={styles.smallMuted}>{registrationLine}</Text> : null}
          {organisation.hotlines.length > 0 ? <Text style={styles.smallMuted}>General Hotlines: {organisation.hotlines.join('  |  ')}</Text> : null}
          {organisation.email ? <Text style={styles.smallMuted}>Email: {organisation.email}</Text> : null}
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
            <Text style={styles.fieldLabel}>RECEIPT NO.</Text>
            <Text style={styles.fieldValue}>{props.receiptNumber}</Text>
          </View>
          <View style={styles.field}>
            <Text style={styles.fieldLabel}>DATE</Text>
            <Text style={styles.fieldValue}>{props.receivedOnLabel}</Text>
          </View>
          <View style={styles.field}>
            <Text style={styles.fieldLabel}>RECEIVED FROM</Text>
            <Text style={styles.fieldValue}>{props.customerName}</Text>
          </View>
          <View style={styles.field}>
            <Text style={styles.fieldLabel}>JOB CARD</Text>
            <Text style={styles.fieldValue}>{props.jobNumber}</Text>
          </View>
          <View style={styles.field}>
            <Text style={styles.fieldLabel}>VEHICLE</Text>
            <Text style={styles.fieldValue}>{[props.vehicleDescription, props.plateNumber].filter(Boolean).join('  ·  ')}</Text>
          </View>
          <View style={styles.field}>
            <Text style={styles.fieldLabel}>PAID BY</Text>
            <Text style={styles.fieldValue}>{props.methodLabel}</Text>
          </View>
          {props.reference ? (
            <View style={styles.field}>
              <Text style={styles.fieldLabel}>REFERENCE / NOTE</Text>
              <Text style={styles.fieldValue}>{props.reference}</Text>
            </View>
          ) : null}
          <View style={styles.field}>
            <Text style={styles.fieldLabel}>RECEIVED BY</Text>
            <Text style={styles.fieldValue}>{props.receivedByName}</Text>
          </View>
        </View>

        <View style={styles.amountBox}>
          <Text style={styles.amountLabel}>AMOUNT RECEIVED</Text>
          <Text style={styles.amountValue}>{props.amountReceived}</Text>
        </View>

        <View style={styles.totalsBox}>
          <View style={styles.row}>
            <Text style={styles.rowLabel}>Total for this Job Card</Text>
            <Text style={styles.rowValue}>{props.totalAmount}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.rowLabel}>Paid up to and including this receipt</Text>
            <Text style={styles.rowValue}>{props.paidToDate}</Text>
          </View>
          <View style={styles.balanceRow}>
            <Text style={styles.totalLabel}>Balance after this payment</Text>
            <Text style={styles.totalValue}>{props.balanceAfter}</Text>
          </View>
          <Text style={styles.status}>{props.statusLabel}</Text>
        </View>

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
