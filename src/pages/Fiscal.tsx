import { useState, useEffect, useCallback } from 'react';
import { FileText, Download, AlertTriangle, TrendingUp, TrendingDown, DollarSign } from 'lucide-react';
import { fetchApi } from '../services/api';
import type { IrReport, IrPatientSummary } from '../types/api';
import { formatCurrency } from '../utils/formatters';
import { useToast } from '../context/ToastContext';
import { SkeletonTable } from '../components/Skeleton';

// ── Helpers ───────────────────────────────────────────────────────────────────

const MONTH_NAMES: Record<string, string> = {
  '01': 'Janeiro', '02': 'Fevereiro', '03': 'Março',    '04': 'Abril',
  '05': 'Maio',    '06': 'Junho',     '07': 'Julho',    '08': 'Agosto',
  '09': 'Setembro','10': 'Outubro',   '11': 'Novembro', '12': 'Dezembro',
};

function monthLabel(yyyyMM: string): string {
  const [year, mm] = yyyyMM.split('-');
  return `${MONTH_NAMES[mm] ?? mm}/${year}`;
}

function escapeCsv(v: unknown): string {
  if (v === null || v === undefined) return '';
  const s = String(v);
  return s.includes(',') || s.includes('"') || s.includes('\n')
    ? `"${s.replace(/"/g, '""')}"`
    : s;
}

// ── PDF individual do paciente ────────────────────────────────────────────────

async function generatePatientPdf(
  patient: IrPatientSummary,
  year: number,
  tenant: IrReport['tenant'],
): Promise<void> {
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });

  const margin = 20;
  const pageW = 210;
  let y = margin;

  const line = (text: string, size = 10, bold = false) => {
    doc.setFontSize(size);
    doc.setFont('helvetica', bold ? 'bold' : 'normal');
    doc.text(text, margin, y);
    y += size * 0.5 + 2;
  };

  const hline = () => {
    doc.setDrawColor(180);
    doc.line(margin, y, pageW - margin, y);
    y += 5;
  };

  // Cabeçalho
  doc.setFillColor(245, 245, 250);
  doc.rect(0, 0, pageW, 28, 'F');
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(40, 40, 80);
  doc.text('INFORME DE PAGAMENTOS', margin, 12);
  doc.setFontSize(11);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(80, 80, 80);
  doc.text(`Ano-Base ${year}  •  Imposto de Renda`, margin, 20);
  doc.setTextColor(0);
  y = 36;

  // Prestador
  line('PRESTADOR DE SERVIÇOS', 9, true);
  hline();
  line(`Nome: ${tenant.fullName ?? tenant.name}`);
  if (tenant.professionalId) line(`CRP: ${tenant.professionalId}`);
  if (tenant.document)       line(`CPF/CNPJ: ${tenant.document}`);
  if (tenant.address)        line(`Endereço: ${tenant.address}`);
  line(`E-mail: ${tenant.email}`);
  y += 4;

  // Paciente
  line('TOMADOR (PACIENTE)', 9, true);
  hline();
  line(`Nome: ${patient.patientName}`);
  line(`CPF: ${patient.document ?? '(não informado)'}`);
  y += 4;

  // Pagamentos mensais
  line('PAGAMENTOS REALIZADOS NO ANO', 9, true);
  hline();

  // Valores mensais não vêm discriminados na patientSummary — mostramos
  // os meses em que houve pagamento e o total geral no rodapé.
  patient.months.forEach(m => {
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text(monthLabel(m), margin, y);
    doc.text('(sessão realizada)', margin + 60, y);
    y += 6;
  });

  y += 4;
  hline();

  // Total
  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.text('TOTAL PAGO NO ANO-BASE:', margin, y);
  doc.text(
    formatCurrency(patient.totalPaidCents),
    pageW - margin - doc.getTextWidth(formatCurrency(patient.totalPaidCents)),
    y,
  );
  y += 7;
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text(`Número de sessões computadas: ${patient.sessionCount}`, margin, y);
  y += 14;

  // Rodapé legal
  hline();
  doc.setFontSize(8);
  doc.setTextColor(100);
  const notice = [
    'Este documento comprova pagamentos realizados a título de honorários profissionais de psicólogo',
    'e pode ser utilizado na Declaração de Imposto de Renda de Pessoa Física (DIRPF), na ficha',
    '"Pagamentos Efetuados", código 21 — Médico, dentista, psicólogo, fisioterapeuta, terapeuta',
    'ocupacional e fonoaudiólogo.',
  ];
  notice.forEach(l => { doc.text(l, margin, y); y += 4; });

  // Data e assinatura
  y += 6;
  doc.setTextColor(0);
  doc.setFontSize(10);
  const today = new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' });
  doc.text(`Emitido em ${today}`, margin, y);
  y += 10;
  doc.line(margin, y, margin + 70, y);
  y += 5;
  doc.text(tenant.fullName ?? tenant.name, margin, y);
  if (tenant.professionalId) { y += 5; doc.text(`CRP ${tenant.professionalId}`, margin, y); }

  const filename = `informe-ir-${year}-${patient.patientName.toLowerCase().replace(/\s+/g, '-')}.pdf`;
  doc.save(filename);
}

// ── Componente principal ──────────────────────────────────────────────────────

export default function Fiscal() {
  const toast = useToast();
  const currentYear = new Date().getFullYear();

  // Ano padrão = ano anterior (época do IR)
  const [year, setYear] = useState(currentYear - 1);
  const [report, setReport] = useState<IrReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [generatingPdf, setGeneratingPdf] = useState<string | null>(null); // patientId em geração

  const loadReport = useCallback(async (y: number) => {
    setLoading(true);
    setReport(null);
    try {
      const data = await fetchApi<IrReport>(`/api/psychotherapy/export/ir-report?year=${y}`);
      setReport(data);
    } catch {
      toast.error('Erro ao carregar relatório fiscal.');
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => { loadReport(year); }, [year, loadReport]);

  // ── CSV client-side ──────────────────────────────────────────────────────────
  const handleExportCsv = () => {
    if (!report) return;
    const rows = [
      ['Nome do Paciente', 'CPF', 'Total Pago (R$)', 'Sessões', 'Meses'].map(escapeCsv).join(','),
      ...report.patientSummaries.map(p => [
        p.patientName,
        p.document ?? '',
        (p.totalPaidCents / 100).toFixed(2).replace('.', ','),
        p.sessionCount,
        p.months.map(monthLabel).join('; '),
      ].map(escapeCsv).join(',')),
    ];
    const csv = '﻿' + rows.join('\r\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    Object.assign(document.createElement('a'), {
      href: url,
      download: `informe-ir-${year}-pacientes.csv`,
    }).click();
    URL.revokeObjectURL(url);
  };

  // ── PDF individual ────────────────────────────────────────────────────────────
  const handleDownloadPdf = async (patient: IrPatientSummary) => {
    if (!report) return;
    setGeneratingPdf(patient.patientId);
    try {
      await generatePatientPdf(patient, year, report.tenant);
    } catch {
      toast.error('Erro ao gerar PDF.');
    } finally {
      setGeneratingPdf(null);
    }
  };

  // ── Helpers de formatação ─────────────────────────────────────────────────────
  const yearOptions = Array.from({ length: 6 }, (_, i) => currentYear - i);
  const noCpf = report?.patientSummaries.filter(p => !p.document).length ?? 0;

  return (
    <div className="page-container">
      {/* Cabeçalho */}
      <div className="page-header">
        <div>
          <h1 className="page-title">Relatórios Fiscais</h1>
          <p className="page-subtitle">Declaração de IR e informes de pagamento por paciente</p>
        </div>
        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
          <select
            className="form-control"
            value={year}
            onChange={e => setYear(parseInt(e.target.value, 10))}
            style={{ width: 'auto' }}
            aria-label="Selecionar ano"
          >
            {yearOptions.map(y => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
          <button
            className="btn btn-secondary"
            onClick={handleExportCsv}
            disabled={!report || loading}
          >
            <Download size={16} /> Exportar CSV
          </button>
        </div>
      </div>

      {/* Aviso de CPF ausente */}
      {!loading && noCpf > 0 && (
        <div className="alert alert-warning" style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-start', marginBottom: '1.25rem' }}>
          <AlertTriangle size={18} style={{ flexShrink: 0, marginTop: '0.1rem' }} />
          <span>
            <strong>{noCpf} paciente{noCpf > 1 ? 's' : ''}</strong> sem CPF cadastrado.
            O informe individual desses pacientes será gerado sem CPF — cadastre-o na tela de Pacientes antes de enviar.
          </span>
        </div>
      )}

      {/* Cards de resumo */}
      {loading ? (
        <SkeletonTable rows={3} cols={3} />
      ) : report ? (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem', marginBottom: '1.5rem' }}>
            <SummaryCard
              icon={<TrendingUp size={22} color="var(--status-success)" />}
              label="Receita Bruta"
              value={formatCurrency(report.summary.totalRevenueCents)}
              color="var(--status-success)"
            />
            <SummaryCard
              icon={<TrendingDown size={22} color="var(--status-danger)" />}
              label="Despesas Dedutíveis"
              value={formatCurrency(report.summary.totalExpensesCents)}
              color="var(--status-danger)"
            />
            <SummaryCard
              icon={<DollarSign size={22} color="var(--status-info)" />}
              label="Resultado Líquido"
              value={formatCurrency(report.summary.netIncomeCents)}
              color={report.summary.netIncomeCents >= 0 ? 'var(--status-info)' : 'var(--status-danger)'}
            />
          </div>

          {/* Breakdown mensal */}
          {report.summary.monthlyBreakdown.length > 0 && (
            <div className="card" style={{ marginBottom: '1.5rem', overflowX: 'auto' }}>
              <div className="card-header">
                <h3 className="card-title">Breakdown Mensal — {year}</h3>
              </div>
              <table className="table">
                <thead>
                  <tr>
                    <th>Mês</th>
                    <th style={{ textAlign: 'right' }}>Receita</th>
                    <th style={{ textAlign: 'right' }}>Despesas</th>
                    <th style={{ textAlign: 'right' }}>Resultado</th>
                  </tr>
                </thead>
                <tbody>
                  {report.summary.monthlyBreakdown.map(m => {
                    const net = m.revenueCents - m.expensesCents;
                    return (
                      <tr key={m.month}>
                        <td>{monthLabel(m.month)}</td>
                        <td style={{ textAlign: 'right', color: 'var(--status-success)' }}>
                          {formatCurrency(m.revenueCents)}
                        </td>
                        <td style={{ textAlign: 'right', color: 'var(--status-danger)' }}>
                          {formatCurrency(m.expensesCents)}
                        </td>
                        <td style={{ textAlign: 'right', fontWeight: 500, color: net >= 0 ? 'var(--status-success)' : 'var(--status-danger)' }}>
                          {formatCurrency(net)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* Tabela de pacientes */}
          <div className="card" style={{ overflowX: 'auto' }}>
            <div className="card-header">
              <h3 className="card-title">
                Pacientes — {report.patientSummaries.length} com pagamentos em {year}
              </h3>
            </div>
            {report.patientSummaries.length === 0 ? (
              <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                <FileText size={36} style={{ opacity: 0.3, marginBottom: '0.75rem' }} />
                <p>Nenhum pagamento registrado em {year}.</p>
              </div>
            ) : (
              <table className="table">
                <thead>
                  <tr>
                    <th>Paciente</th>
                    <th>CPF</th>
                    <th style={{ textAlign: 'right' }}>Total Pago</th>
                    <th style={{ textAlign: 'center' }}>Sessões</th>
                    <th style={{ textAlign: 'center' }}>Informe</th>
                  </tr>
                </thead>
                <tbody>
                  {report.patientSummaries.map(p => (
                    <tr key={p.patientId}>
                      <td style={{ fontWeight: 500 }}>{p.patientName}</td>
                      <td>
                        {p.document ? (
                          <span style={{ fontFamily: 'monospace', fontSize: '0.875rem' }}>{p.document}</span>
                        ) : (
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem', color: 'var(--status-warning)', fontSize: '0.8rem' }}>
                            <AlertTriangle size={13} /> sem CPF
                          </span>
                        )}
                      </td>
                      <td style={{ textAlign: 'right', fontWeight: 600 }}>
                        {formatCurrency(p.totalPaidCents)}
                      </td>
                      <td style={{ textAlign: 'center', color: 'var(--text-secondary)' }}>
                        {p.sessionCount}
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        <button
                          className="btn btn-secondary"
                          style={{ padding: '0.25rem 0.6rem', fontSize: '0.8rem' }}
                          onClick={() => handleDownloadPdf(p)}
                          disabled={generatingPdf === p.patientId}
                          title={`Gerar informe de ${p.patientName}`}
                        >
                          {generatingPdf === p.patientId ? (
                            '...'
                          ) : (
                            <><FileText size={13} /> PDF</>
                          )}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </>
      ) : null}
    </div>
  );
}

// ── Card de resumo ────────────────────────────────────────────────────────────
function SummaryCard({
  icon, label, value, color,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  color: string;
}) {
  return (
    <div className="card" style={{ display: 'flex', alignItems: 'center', gap: '1rem', padding: '1.25rem' }}>
      <div style={{
        width: 44, height: 44, borderRadius: '50%',
        background: `color-mix(in srgb, ${color} 12%, transparent)`,
        display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
      }}>
        {icon}
      </div>
      <div>
        <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.15rem' }}>{label}</div>
        <div style={{ fontSize: '1.25rem', fontWeight: 700, color }}>{value}</div>
      </div>
    </div>
  );
}
