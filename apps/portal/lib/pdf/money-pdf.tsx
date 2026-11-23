import { Document, Page, Text, View, Image, StyleSheet } from '@react-pdf/renderer';
import { PLATFORM } from '../brand';
import { PDF_FONT, registerPdfFonts } from './fonts';
import type { EstimatePdfProps } from './document-types';

/**
 * Two money documents as PDFs, in the receipt's letterhead and layout so the
 * set reads as one: a credit note (CN-number) and a customer statement with
 * its ageing. Every figure arrives already worked out and in words
 * (lib/money/documents.ts); nothing is calculated here.
 */

export type MoneyLetterhead = { organisation: EstimatePdfProps['organisation']; branch: EstimatePdfProps['branch']; logoUrl: string };

export type CreditNotePdfProps = MoneyLetterhead & {
  number: string;
  dateLabel: string;
  customerName: string;
  invoiceNumber: string;
  jobNumber: string;
  vehicle: string;
  reason: string;
  amount: string;
  vatLine: string | null;
  invoiceTotal: string;
  creditedToDate: string;
  balanceAfter: string;
  approvedByName: string;
};

export type StatementPdfProps = MoneyLetterhead & {
  dateLabel: string;
  customerName: string;
  customerAddress: string | null;
  termsLine: string | null;
  rows: { invoiceNumber: string; jobNumber: string; issuedOn: string; dueOn: string; total: string; paid: string; credited: string; balance: string; age: string }[];
  ageing: { label: string; amount: string }[];
  owed: string;
  overdue: string;
  bank: { bankName: string; accountName: string; accountNumber: string };
};

const bold = { fontFamily: PDF_FONT, fontWeight: 'bold' } as const;
const styles = StyleSheet.create({
  page: { paddingTop: 32, paddingBottom: 32, paddingHorizontal: 36, fontSize: 10, fontFamily: PDF_FONT, color: '#0F172A' },
  headerRow: { flexDirection: 'row', alignItems: 'center' },
  logo: { width: 150, height: 36, objectFit: 'contain' },
  docTitleWrap: { marginLeft: 'auto', alignItems: 'flex-end' },
  docTitle: { fontSize: 13, ...bold, color: '#3E4095' },
  docRef: { fontSize: 11, marginTop: 2 },
  docDate: { fontSize: 9, color: '#475569', marginTop: 2 },
  ruleThick: { borderBottomWidth: 1.5, borderBottomColor: '#EC3237', marginTop: 12, paddingTop: 8 },
  legalName: { fontSize: 11, ...bold, marginTop: 2 },
  smallMuted: { fontSize: 9, color: '#475569', marginTop: 1 },
  fieldGrid: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 16 },
  field: { width: '50%', marginBottom: 10 },
  fieldLabel: { fontSize: 8, ...bold, color: '#94A3B8', letterSpacing: 0.5 },
  fieldValue: { fontSize: 11, ...bold, marginTop: 1 },
  amountBox: { marginTop: 8, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderWidth: 1.5, borderColor: '#0F172A', borderRadius: 6, paddingVertical: 10, paddingHorizontal: 14 },
  amountLabel: { fontSize: 9, ...bold, color: '#475569', letterSpacing: 0.5 },
  amountValue: { fontSize: 16, ...bold },
  totalsBox: { marginTop: 12, alignItems: 'flex-end' },
  row: { flexDirection: 'row', justifyContent: 'space-between', width: 280, marginBottom: 2 },
  rowLabel: { fontSize: 9, color: '#475569' },
  rowValue: { fontSize: 9 },
  balanceRow: { flexDirection: 'row', justifyContent: 'space-between', width: 280, marginTop: 4, paddingTop: 4, borderTopWidth: 1, borderTopColor: '#0F172A' },
  totalLabel: { fontSize: 11, ...bold },
  table: { marginTop: 14, borderTopWidth: 1, borderTopColor: '#0F172A' },
  th: { flexDirection: 'row', paddingVertical: 4, borderBottomWidth: 0.5, borderBottomColor: '#94A3B8' },
  tr: { flexDirection: 'row', paddingVertical: 4, borderBottomWidth: 0.5, borderBottomColor: '#E2E8F0' },
  thText: { fontSize: 7.5, ...bold, color: '#475569' },
  td: { fontSize: 8.5 },
  ageRow: { flexDirection: 'row', marginTop: 14, borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 6 },
  ageCell: { flex: 1, padding: 8, borderRightWidth: 0.5, borderRightColor: '#E2E8F0' },
  ageLabel: { fontSize: 7.5, ...bold, color: '#94A3B8' },
  ageValue: { fontSize: 10, ...bold, marginTop: 2 },
  note: { marginTop: 14, fontSize: 9, color: '#334155' },
  footer: { marginTop: 22, paddingTop: 8, borderTopWidth: 0.5, borderTopColor: '#E2E8F0', textAlign: 'center' },
  footerText: { fontSize: 8, color: '#94A3B8' },
  footerCredit: { fontSize: 7, color: '#CBD5E1', marginTop: 3 },
});

function Head({ lh, title, reference, date }: { lh: MoneyLetterhead; title: string; reference: string | null; date: string }) {
  const { organisation: o, branch } = lh;
  const reg = [o.poBox ? `P.O. Box ${o.poBox}` : null, o.rcNumber ? `RC Number: ${o.rcNumber}` : null].filter(Boolean).join('   ·   ');
  return (
    <>
      <View style={styles.headerRow}>
        {/* @react-pdf/renderer's own Image primitive (no alt prop), as in invoice-pdf.tsx. */}
        {/* eslint-disable-next-line jsx-a11y/alt-text */}
        <Image src={lh.logoUrl} style={styles.logo} />
        <View style={styles.docTitleWrap}>
          <Text style={styles.docTitle}>{title}</Text>
          {reference ? <Text style={styles.docRef}>{reference}</Text> : null}
          <Text style={styles.docDate}>{date}</Text>
        </View>
      </View>
      <View style={styles.ruleThick}>
        <Text style={styles.legalName}>{o.legalName ?? o.name}</Text>
        {o.hqAddress ? <Text style={styles.smallMuted}>{o.hqAddress}</Text> : null}
        {reg ? <Text style={styles.smallMuted}>{reg}</Text> : null}
        {o.hotlines.length > 0 ? <Text style={styles.smallMuted}>Phone: {o.hotlines.join('  |  ')}</Text> : null}
        <Text style={styles.smallMuted}>{branch.name}{branch.address ? ` · ${branch.address}` : ''}</Text>
      </View>
    </>
  );
}

function Foot({ lh }: { lh: MoneyLetterhead }) {
  return (
    <View style={styles.footer}>
      <Text style={styles.footerText}>{lh.organisation.legalName ?? lh.organisation.name}{lh.organisation.hqAddress ? ` · ${lh.organisation.hqAddress}` : ''}</Text>
      <Text style={styles.footerCredit}>{PLATFORM.poweredBy}</Text>
    </View>
  );
}

const F = ({ label, value }: { label: string; value: string }) => (
  <View style={styles.field}><Text style={styles.fieldLabel}>{label}</Text><Text style={styles.fieldValue}>{value}</Text></View>
);

/** A credit note against an invoice (approved by the Owner). */
export function CreditNotePdf(p: CreditNotePdfProps) {
  registerPdfFonts();
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <Head lh={p} title="Credit Note" reference={p.number} date={p.dateLabel} />
        <View style={styles.fieldGrid}>
          <F label="CREDIT NOTE NO." value={p.number} />
          <F label="DATE" value={p.dateLabel} />
          <F label="CUSTOMER" value={p.customerName} />
          <F label="AGAINST INVOICE" value={p.invoiceNumber} />
          <F label="JOB CARD" value={p.jobNumber} />
          <F label="VEHICLE" value={p.vehicle} />
          <F label="APPROVED BY" value={p.approvedByName} />
        </View>
        <Text style={styles.fieldLabel}>REASON</Text>
        <Text style={{ fontSize: 10, marginTop: 2 }}>{p.reason}</Text>
        <View style={styles.amountBox}>
          <Text style={styles.amountLabel}>AMOUNT CREDITED</Text>
          <Text style={styles.amountValue}>{p.amount}</Text>
        </View>
        <View style={styles.totalsBox}>
          {p.vatLine ? <View style={styles.row}><Text style={styles.rowLabel}>Of which VAT</Text><Text style={styles.rowValue}>{p.vatLine}</Text></View> : null}
          <View style={styles.row}><Text style={styles.rowLabel}>Invoice total</Text><Text style={styles.rowValue}>{p.invoiceTotal}</Text></View>
          <View style={styles.row}><Text style={styles.rowLabel}>Credited on this invoice so far</Text><Text style={styles.rowValue}>{p.creditedToDate}</Text></View>
          <View style={styles.balanceRow}><Text style={styles.totalLabel}>Balance on the invoice now</Text><Text style={styles.totalLabel}>{p.balanceAfter}</Text></View>
        </View>
        <Text style={styles.note}>This amount is taken off what you owe on the invoice above. Where you have already paid it, we refund it or keep it towards your next visit, as agreed with you.</Text>
        <Foot lh={p} />
      </Page>
    </Document>
  );
}

const COLS: [string, keyof StatementPdfProps['rows'][number], number][] = [
  ['INVOICE', 'invoiceNumber', 1.3], ['JOB CARD', 'jobNumber', 1.3], ['DATE', 'issuedOn', 0.9], ['DUE', 'dueOn', 0.9],
  ['TOTAL', 'total', 1.1], ['PAID', 'paid', 1.1], ['CREDITED', 'credited', 1], ['BALANCE', 'balance', 1.1], ['AGE', 'age', 0.7],
];

/** What a customer owes, invoice by invoice, with the ageing (0–30 · 31–60 · 61–90 · over 90 days). */
export function StatementPdf(p: StatementPdfProps) {
  registerPdfFonts();
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <Head lh={p} title="Statement of Account" reference={null} date={p.dateLabel} />
        <View style={styles.fieldGrid}>
          <F label="CUSTOMER" value={p.customerName} />
          <F label="STATEMENT DATE" value={p.dateLabel} />
          {p.customerAddress ? <F label="ADDRESS" value={p.customerAddress} /> : null}
          {p.termsLine ? <F label="TERMS" value={p.termsLine} /> : null}
        </View>
        <View style={styles.table}>
          <View style={styles.th}>{COLS.map(([h, , w]) => <Text key={h} style={[styles.thText, { flex: w }]}>{h}</Text>)}</View>
          {p.rows.length === 0 ? <Text style={[styles.td, { paddingVertical: 8 }]}>Nothing is owed. Thank you.</Text> : p.rows.map((r) => (
            <View key={r.invoiceNumber} style={styles.tr} wrap={false}>
              {COLS.map(([h, k, w]) => <Text key={h} style={[styles.td, { flex: w }]}>{r[k]}</Text>)}
            </View>
          ))}
        </View>
        <View style={styles.ageRow}>
          {p.ageing.map((a) => <View key={a.label} style={styles.ageCell}><Text style={styles.ageLabel}>{a.label.toUpperCase()}</Text><Text style={styles.ageValue}>{a.amount}</Text></View>)}
        </View>
        <View style={styles.totalsBox}>
          <View style={styles.row}><Text style={styles.rowLabel}>Of which past its due date</Text><Text style={styles.rowValue}>{p.overdue}</Text></View>
          <View style={styles.balanceRow}><Text style={styles.totalLabel}>Total owed</Text><Text style={styles.totalLabel}>{p.owed}</Text></View>
        </View>
        <Text style={styles.note}>Please pay into {p.bank.accountName}, {p.bank.bankName}, account number {p.bank.accountNumber}, quoting the invoice numbers. If your records differ from this statement, please call us.</Text>
        <Foot lh={p} />
      </Page>
    </Document>
  );
}
