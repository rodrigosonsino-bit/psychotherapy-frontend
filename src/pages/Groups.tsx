import React, { useState, useEffect, useCallback } from 'react';
import type { Patient } from '../types/api';
import {
  Users, ChevronLeft, ChevronRight, ClipboardCheck,
  Clock, Calendar, CheckCircle2, XCircle, AlertCircle, RefreshCw,
  UserPlus, UserMinus, Search
} from 'lucide-react';
import { fetchApi } from '../services/api';
import { useToast } from '../context/ToastContext';
import { SkeletonTable } from '../components/Skeleton';
import './Groups.css';

// ── Types ─────────────────────────────────────────────────────────────────────

type PaymentStatus = 'paid' | 'partial' | 'pending';
type AttendanceStatus = 'present' | 'absent' | 'excused';

interface TherapyGroup {
  id: string;
  name: string;
  description: string | null;
  session_price_cents: number;
  day_of_week: number | null;
  start_time: string | null;
  duration_minutes: number;
  is_active: boolean;
  member_count: number;
}

interface GroupMember {
  patient_id: string;
  name: string;
  phone: string | null;
  payment_type: string | null;
  patient_status: string;
  payment_status: PaymentStatus;
  paid_sessions: number;
  expected_sessions: number;
  absences: number;
}

interface SessionRecord {
  id: string;
  session_date: string;
  patient_id: string;
  patient_name: string;
  attendance_status: AttendanceStatus;
  payment_status: PaymentStatus | null;
  notes: string | null;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const DAY_NAMES = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];

const PAYMENT_LABEL: Record<PaymentStatus, string> = {
  paid: '✅ Pago',
  partial: '🟡 Parcial',
  pending: '🔴 Pendente',
};


function formatCurrency(cents: number) {
  return (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function monthStr(d: Date) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
  }).formatToParts(d);
  return `${parts.find(p => p.type === 'year')!.value}-${parts.find(p => p.type === 'month')!.value}`;
}

function monthLabel(str: string) {
  const [y, m] = str.split('-');
  return new Date(Number(y), Number(m) - 1, 1).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function Groups() {
  const toast = useToast();
  const [tab, setTab] = useState<'groups' | 'sessions'>('groups');
  const [groups, setGroups] = useState<TherapyGroup[]>([]);
  const [selectedGroup, setSelectedGroup] = useState<TherapyGroup | null>(null);
  const [members, setMembers] = useState<GroupMember[]>([]);
  const [sessionHistory, setSessionHistory] = useState<SessionRecord[]>([]);
  const [loadingGroups, setLoadingGroups] = useState(true);
  const [loadingMembers, setLoadingMembers] = useState(false);
  const [currentMonth, setCurrentMonth] = useState(() => monthStr(new Date()));
  const [showRegisterModal, setShowRegisterModal] = useState(false);
  const [showAddMemberModal, setShowAddMemberModal] = useState(false);

  // Load groups
  const loadGroups = useCallback(async () => {
    try {
      setLoadingGroups(true);
      const res = await fetchApi<{ data: TherapyGroup[] }>('/api/psychotherapy/groups');
      setGroups(res.data);
      if (res.data.length > 0 && !selectedGroup) {
        setSelectedGroup(res.data[0]);
      }
    } catch {
      toast.error('Erro ao carregar grupos.');
    } finally {
      setLoadingGroups(false);
    }
  }, [toast, selectedGroup]);

  // Load members of selected group
  const loadMembers = useCallback(async (groupId: string, month: string) => {
    try {
      setLoadingMembers(true);
      const res = await fetchApi<{ data: GroupMember[] }>(
        `/api/psychotherapy/groups/${groupId}/members?month=${month}`
      );
      setMembers(res.data);
    } catch {
      toast.error('Erro ao carregar membros.');
    } finally {
      setLoadingMembers(false);
    }
  }, [toast]);

  // Load session history
  const loadHistory = useCallback(async (groupId: string, month: string) => {
    try {
      const res = await fetchApi<{ data: SessionRecord[] }>(
        `/api/psychotherapy/groups/${groupId}/sessions?month=${month}`
      );
      setSessionHistory(res.data);
    } catch {
      setSessionHistory([]);
    }
  }, []);

  useEffect(() => { loadGroups(); }, [loadGroups]);

  useEffect(() => {
    if (selectedGroup) {
      loadMembers(selectedGroup.id, currentMonth);
      loadHistory(selectedGroup.id, currentMonth);
    }
  }, [selectedGroup, currentMonth, loadMembers, loadHistory]);

  const prevMonth = () => {
    const [y, m] = currentMonth.split('-').map(Number);
    const d = new Date(y, m - 2, 1);
    setCurrentMonth(monthStr(d));
  };

  const nextMonth = () => {
    const [y, m] = currentMonth.split('-').map(Number);
    const d = new Date(y, m, 1);
    setCurrentMonth(monthStr(d));
  };

  const removeMember = async (patientId: string, name: string) => {
    if (!selectedGroup) return;
    if (!window.confirm(`Tem certeza que deseja remover ${name} do grupo ${selectedGroup.name}?\n\nO histórico financeiro anterior será mantido.`)) {
      return;
    }
    try {
      await fetchApi(`/api/psychotherapy/groups/${selectedGroup.id}/members/${patientId}`, {
        method: 'DELETE'
      });
      toast.success('Membro removido com sucesso!');
      loadMembers(selectedGroup.id, currentMonth);
    } catch (err) {
      toast.error((err instanceof Error ? err.message : String(err)) || 'Erro ao remover membro.');
    }
  };

  // Group sessions by date for history view
  const groupedHistory = sessionHistory.reduce<Record<string, SessionRecord[]>>((acc, r) => {
    const date = r.session_date.slice(0, 10);
    (acc[date] = acc[date] || []).push(r);
    return acc;
  }, {});
  const historyDates = Object.keys(groupedHistory).sort().reverse();

  return (
    <div className="groups-page">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-h1">Grupos Terapêuticos</h1>
          <p className="text-body" style={{ marginTop: '0.25rem' }}>
            Gerencie sessões, presenças e faturamento dos grupos
          </p>
        </div>
        {selectedGroup && (
          <button
            id="btn-register-group-session"
            className="btn btn-primary"
            onClick={() => setShowRegisterModal(true)}
          >
            <ClipboardCheck size={16} />
            Registrar Sessão
          </button>
        )}
      </div>

      {/* Tabs */}
      <div className="groups-tabs">
        <button
          id="tab-groups-list"
          className={`groups-tab ${tab === 'groups' ? 'active' : ''}`}
          onClick={() => setTab('groups')}
        >
          Grupos
        </button>
        <button
          id="tab-sessions-history"
          className={`groups-tab ${tab === 'sessions' ? 'active' : ''}`}
          onClick={() => setTab('sessions')}
        >
          Histórico de Sessões
        </button>
      </div>

      {/* Month Navigator */}
      <div className="flex items-center gap-4 flex-wrap">
        <div className="month-nav">
          <button id="btn-prev-month-groups" onClick={prevMonth}><ChevronLeft size={16} /></button>
          <span className="month-label">{monthLabel(currentMonth)}</span>
          <button id="btn-next-month-groups" onClick={nextMonth}><ChevronRight size={16} /></button>
        </div>
        <span className="text-small">
          {groups.length} grupo{groups.length !== 1 ? 's' : ''}
        </span>
      </div>

      {tab === 'groups' ? (
        // ── Groups + Members view ──────────────────────────────────────────
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.5fr', gap: '1.25rem', alignItems: 'start' }}>
          {/* Left: group cards */}
          <div>
            {loadingGroups ? (
              <SkeletonTable rows={3} cols={1} />
            ) : groups.length === 0 ? (
              <div className="groups-empty">
                <Users size={36} />
                <p>Nenhum grupo encontrado.</p>
                <p className="text-small">Crie grupos no painel de configurações.</p>
              </div>
            ) : (
              <div className="groups-grid" style={{ gridTemplateColumns: '1fr' }}>
                {groups.map(g => (
                  <div
                    key={g.id}
                    id={`group-card-${g.id}`}
                    className={`group-card ${selectedGroup?.id === g.id ? 'selected' : ''}`}
                    onClick={() => setSelectedGroup(g)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={e => e.key === 'Enter' && setSelectedGroup(g)}
                  >
                    <div className="group-card-header">
                      <span className="group-card-name">{g.name}</span>
                      <span className={`badge ${g.is_active ? 'badge-success' : 'badge-danger'}`}>
                        {g.is_active ? 'Ativo' : 'Inativo'}
                      </span>
                    </div>
                    <div className="group-card-meta">
                      {g.day_of_week !== null && (
                        <span className="group-meta-row">
                          <Calendar size={12} />
                          {DAY_NAMES[g.day_of_week]}
                          {g.start_time ? ` • ${g.start_time.slice(0, 5)}` : ''}
                        </span>
                      )}
                      <span className="group-meta-row">
                        <Clock size={12} />
                        {g.duration_minutes} min • {formatCurrency(g.session_price_cents)}/sessão
                      </span>
                    </div>
                    <div className="group-card-footer">
                      <span className="group-member-count">
                        <Users size={12} />
                        {g.member_count} membro{g.member_count !== 1 ? 's' : ''}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Right: members of selected group */}
          <div>
            {selectedGroup ? (
              <div className="group-detail-panel">
                <div className="group-panel-header">
                  <span className="group-panel-title">
                    <Users size={18} />
                    {selectedGroup.name}
                  </span>
                  <div className="flex gap-2">
                    <button
                      id="btn-add-member"
                      className="btn btn-secondary"
                      style={{ padding: '0.375rem 0.75rem', fontSize: '0.8rem' }}
                      onClick={() => setShowAddMemberModal(true)}
                    >
                      <UserPlus size={13} />
                      Adicionar Membro
                    </button>
                    <button
                      id="btn-refresh-members"
                      className="btn btn-secondary"
                      style={{ padding: '0.375rem 0.75rem', fontSize: '0.8rem' }}
                      onClick={() => loadMembers(selectedGroup.id, currentMonth)}
                    >
                      <RefreshCw size={13} />
                      Atualizar
                    </button>
                  </div>
                </div>

                {loadingMembers ? (
                  <SkeletonTable rows={4} cols={4} />
                ) : members.length === 0 ? (
                  <div className="groups-empty">
                    <Users size={28} />
                    <p>Nenhum membro ativo neste grupo.</p>
                  </div>
                ) : (
                  <div className="table-container">
                    <table className="table">
                      <thead>
                        <tr>
                          <th>Paciente</th>
                          <th>Sessões</th>
                          <th style={{ textAlign: 'center' }}>Status {currentMonth.slice(0, 7)}</th>
                          <th>Tipo</th>
                          <th style={{ width: '40px' }}></th>
                        </tr>
                      </thead>
                      <tbody>
                        {members.map(m => (
                          <tr key={m.patient_id}>
                            <td>
                              <strong style={{ color: 'var(--text-primary)' }}>{m.name}</strong>
                              {m.phone && <div className="text-small">{m.phone}</div>}
                            </td>
                            <td>
                              <span style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
                                {m.paid_sessions}/{m.expected_sessions}
                                {m.absences > 0 && (
                                  <span style={{ color: 'var(--status-warning)', marginLeft: '0.35rem' }}>
                                    ({m.absences} falta{m.absences !== 1 ? 's' : ''})
                                  </span>
                                )}
                              </span>
                            </td>
                            <td style={{ textAlign: 'center' }}>
                              <span className={`payment-pill ${m.payment_status}`}>
                                <span className={`payment-dot ${m.payment_status}`} />
                                {PAYMENT_LABEL[m.payment_status]}
                              </span>
                            </td>
                            <td>
                              <span className="text-small" style={{ textTransform: 'capitalize' }}>
                                {m.payment_type === 'monthly' ? 'Mensal' : 'Por sessão'}
                              </span>
                            </td>
                            <td>
                              <button
                                className="icon-btn danger"
                                title="Remover Membro"
                                onClick={() => removeMember(m.patient_id, m.name)}
                              >
                                <UserMinus size={15} />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            ) : (
              <div className="groups-empty" style={{ height: '100%', minHeight: '200px' }}>
                <Users size={28} />
                <p>Selecione um grupo para ver os membros</p>
              </div>
            )}
          </div>
        </div>
      ) : (
        // ── Session History view ───────────────────────────────────────────
        <div>
          {!selectedGroup ? (
            <div className="groups-empty">
              <Users size={28} />
              <p>Selecione um grupo na aba "Grupos" primeiro.</p>
            </div>
          ) : historyDates.length === 0 ? (
            <div className="groups-empty">
              <ClipboardCheck size={28} />
              <p>Nenhuma sessão registrada em {monthLabel(currentMonth)}.</p>
            </div>
          ) : (
            <div>
              {historyDates.map(date => (
                <div key={date} className="session-date-group">
                  <div className="session-date-label">
                    {new Date(date + 'T12:00:00').toLocaleDateString('pt-BR', {
                      weekday: 'long', day: '2-digit', month: 'long'
                    })}
                  </div>
                  <div className="table-container">
                    <table className="table">
                      <thead>
                        <tr>
                          <th>Paciente</th>
                          <th>Presença</th>
                          <th>Faturamento</th>
                          <th>Obs.</th>
                        </tr>
                      </thead>
                      <tbody>
                        {groupedHistory[date].map(r => (
                          <tr key={r.id}>
                            <td>
                              <strong style={{ color: 'var(--text-primary)' }}>{r.patient_name}</strong>
                            </td>
                            <td>
                              {r.attendance_status === 'present' && (
                                <span className="flex items-center gap-2" style={{ color: 'var(--status-success)' }}>
                                  <CheckCircle2 size={14} /> Presente
                                </span>
                              )}
                              {r.attendance_status === 'absent' && (
                                <span className="flex items-center gap-2" style={{ color: 'var(--status-danger)' }}>
                                  <XCircle size={14} /> Faltou
                                </span>
                              )}
                              {r.attendance_status === 'excused' && (
                                <span className="flex items-center gap-2" style={{ color: 'var(--status-warning)' }}>
                                  <AlertCircle size={14} /> Justificado
                                </span>
                              )}
                            </td>
                            <td>
                              {r.payment_status ? (
                                <span className={`payment-pill ${r.payment_status}`}>
                                  <span className={`payment-dot ${r.payment_status}`} />
                                  {PAYMENT_LABEL[r.payment_status]}
                                </span>
                              ) : (
                                <span className="text-small">—</span>
                              )}
                            </td>
                            <td className="text-small">{r.notes ?? '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Register Session Modal */}
      {showRegisterModal && selectedGroup && (
        <RegisterSessionModal
          group={selectedGroup}
          members={members}
          onClose={() => setShowRegisterModal(false)}
          onSuccess={() => {
            setShowRegisterModal(false);
            toast.success('Sessão registrada com sucesso!');
            loadMembers(selectedGroup.id, currentMonth);
            loadHistory(selectedGroup.id, currentMonth);
          }}
        />
      )}

      {/* Add Member Modal */}
      {showAddMemberModal && selectedGroup && (
        <AddMemberModal
          group={selectedGroup}
          currentMembers={members}
          onClose={() => setShowAddMemberModal(false)}
          onSuccess={() => {
            setShowAddMemberModal(false);
            toast.success('Membro adicionado com sucesso!');
            loadMembers(selectedGroup.id, currentMonth);
          }}
        />
      )}
    </div>
  );
}

// ── Register Session Modal ────────────────────────────────────────────────────

function RegisterSessionModal({
  group, members, onClose, onSuccess
}: {
  group: TherapyGroup;
  members: GroupMember[];
  onClose: () => void;
  onSuccess: () => void;
}) {
  const toast = useToast();

  // Default date = today
  const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' });
  const [sessionDate, setSessionDate] = useState(today);
  const [sessionNotes, setSessionNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [confirmed, setConfirmed] = useState(false);

  // Attendance state per member: default = 'present'
  const [attendances, setAttendances] = useState<Record<string, AttendanceStatus>>(
    () => Object.fromEntries(members.map(m => [m.patient_id, 'present' as AttendanceStatus]))
  );

  const setStatus = (patientId: string, status: AttendanceStatus) => {
    setAttendances(prev => ({ ...prev, [patientId]: status }));
    setConfirmed(false); // reset confirmation when attendance changes
  };

  const counts = {
    present: Object.values(attendances).filter(s => s === 'present').length,
    absent: Object.values(attendances).filter(s => s === 'absent').length,
    excused: Object.values(attendances).filter(s => s === 'excused').length,
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!confirmed) {
      setConfirmed(true);
      return; // first click = show confirmation summary
    }

    try {
      setSubmitting(true);
      await fetchApi(`/api/psychotherapy/groups/${group.id}/sessions`, {
        method: 'POST',
        body: JSON.stringify({
          sessionDate,
          sessionNotes: sessionNotes || null,
          attendances: members.map(m => ({
            patientId: m.patient_id,
            status: attendances[m.patient_id] ?? 'present',
          })),
        }),
      });
      onSuccess();
    } catch (err) {
      toast.error((err instanceof Error ? err.message : String(err)) || 'Erro ao registrar sessão.');
      setConfirmed(false);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="modal-overlay">
      <div className="modal-content animate-fade-in" style={{ maxWidth: '580px' }}>
        <h2 className="text-h2 mb-4">Registrar Sessão — {group.name}</h2>

        <form onSubmit={handleSubmit}>
          {/* Date & Notes */}
          <div className="flex gap-4 mb-4">
            <div className="form-group w-full">
              <label className="form-label">Data da Sessão *</label>
              <input
                id="input-session-date"
                type="date"
                required
                className="form-control"
                value={sessionDate}
                onChange={e => { setSessionDate(e.target.value); setConfirmed(false); }}
                disabled={submitting}
              />
            </div>
            <div className="form-group w-full">
              <label className="form-label">Notas da Sessão</label>
              <input
                id="input-session-notes"
                type="text"
                className="form-control"
                placeholder="Opcional"
                value={sessionNotes}
                onChange={e => setSessionNotes(e.target.value)}
                disabled={submitting}
              />
            </div>
          </div>

          {/* Attendance list */}
          <div className="form-group">
            <label className="form-label">Presença dos Membros ({members.length})</label>
            <div className="attendance-list">
              {members.map(m => (
                <div key={m.patient_id} className="attendance-row">
                  <span className="attendance-name">{m.name}</span>
                  <div className="attendance-toggle">
                    <button
                      type="button"
                      id={`att-present-${m.patient_id}`}
                      className={`attendance-btn ${attendances[m.patient_id] === 'present' ? 'active-present' : ''}`}
                      onClick={() => setStatus(m.patient_id, 'present')}
                      title="Presente"
                    >
                      ✓ Pres.
                    </button>
                    <button
                      type="button"
                      id={`att-absent-${m.patient_id}`}
                      className={`attendance-btn ${attendances[m.patient_id] === 'absent' ? 'active-absent' : ''}`}
                      onClick={() => setStatus(m.patient_id, 'absent')}
                      title="Faltou"
                    >
                      ✗ Falta
                    </button>
                    <button
                      type="button"
                      id={`att-excused-${m.patient_id}`}
                      className={`attendance-btn ${attendances[m.patient_id] === 'excused' ? 'active-excused' : ''}`}
                      onClick={() => setStatus(m.patient_id, 'excused')}
                      title="Falta Justificada"
                    >
                      ⚠ Just.
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Confirmation summary (shown after first click) */}
          {confirmed && (
            <div className="register-summary">
              <div>
                <strong>{sessionDate}</strong> — {group.name}<br />
                <span style={{ fontSize: '0.8rem' }}>
                  ✅ {counts.present} presentes &nbsp;|&nbsp;
                  ❌ {counts.absent} faltas &nbsp;|&nbsp;
                  ⚠️ {counts.excused} justificados
                </span>
              </div>
            </div>
          )}

          {confirmed && (
            <p className="submit-guard-hint">
              Confirma o registro acima? Clique em <strong>Confirmar Sessão</strong> para salvar.
            </p>
          )}

          <div className="flex justify-end gap-2" style={{ marginTop: '1.25rem' }}>
            <button
              id="btn-cancel-register-session"
              type="button"
              className="btn btn-secondary"
              onClick={onClose}
              disabled={submitting}
            >
              Cancelar
            </button>
            <button
              id="btn-submit-register-session"
              type="submit"
              className="btn btn-primary"
              disabled={submitting}
            >
              {submitting
                ? 'Salvando...'
                : confirmed
                  ? '✓ Confirmar Sessão'
                  : 'Revisar & Registrar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Add Member Modal ──────────────────────────────────────────────────────────

function AddMemberModal({
  group, currentMembers, onClose, onSuccess
}: {
  group: TherapyGroup;
  currentMembers: GroupMember[];
  onClose: () => void;
  onSuccess: () => void;
}) {
  const toast = useToast();
  const [patients, setPatients] = useState<Patient[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetchApi<{ data: Patient[] }>('/api/psychotherapy/patients?includeInactive=false');
        setPatients(res.data);
      } catch {
        toast.error('Erro ao carregar pacientes.');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [toast]);

  const currentIds = new Set(currentMembers.map(m => m.patient_id));
  
  const availablePatients = patients.filter(p => !currentIds.has(p.id));
  const filteredPatients = availablePatients.filter(p => 
    p.name.toLowerCase().includes(search.toLowerCase())
  );

  const handleAdd = async (patientId: string) => {
    try {
      setSubmitting(true);
      await fetchApi(`/api/psychotherapy/groups/${group.id}/members`, {
        method: 'POST',
        body: JSON.stringify({ patientId })
      });
      onSuccess();
    } catch (err) {
      toast.error((err instanceof Error ? err.message : String(err)) || 'Erro ao adicionar membro.');
      setSubmitting(false);
    }
  };

  return (
    <div className="modal-overlay">
      <div className="modal-content animate-fade-in" style={{ maxWidth: '480px' }}>
        <h2 className="text-h2 mb-4">Adicionar Membro — {group.name}</h2>

        <div className="search-bar" style={{ marginBottom: '1rem', position: 'relative' }}>
          <Search size={16} style={{ position: 'absolute', left: '10px', top: '10px', color: '#999' }} />
          <input
            type="text"
            className="form-control"
            placeholder="Buscar paciente..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{ paddingLeft: '36px' }}
            autoFocus
          />
        </div>

        <div style={{ maxHeight: '300px', overflowY: 'auto', border: '1px solid var(--border-light)', borderRadius: '6px' }}>
          {loading ? (
            <div style={{ padding: '1rem', textAlign: 'center', color: 'var(--text-secondary)' }}>Carregando...</div>
          ) : availablePatients.length === 0 ? (
            <div style={{ padding: '1rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
              Todos os pacientes já estão neste grupo.
            </div>
          ) : filteredPatients.length === 0 ? (
            <div style={{ padding: '1rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
              Nenhum paciente encontrado na busca.
            </div>
          ) : (
            <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
              {filteredPatients.map(p => (
                <li 
                  key={p.id} 
                  style={{ 
                    padding: '0.75rem 1rem', 
                    borderBottom: '1px solid var(--border-light)',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center'
                  }}
                >
                  <div>
                    <strong>{p.name}</strong>
                    <div className="text-small" style={{ color: 'var(--text-secondary)' }}>
                      {p.status === 'inactive' ? 'Inativo' : 'Ativo'}
                    </div>
                  </div>
                  <button 
                    className="btn btn-primary"
                    style={{ padding: '0.25rem 0.75rem', fontSize: '0.8rem' }}
                    onClick={() => handleAdd(p.id)}
                    disabled={submitting}
                  >
                    Adicionar
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="flex justify-end mt-4">
          <button
            className="btn btn-secondary"
            onClick={onClose}
            disabled={submitting}
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
}
