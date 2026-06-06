import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Plus, Edit2, Trash2, MessageCircle, Mail, Search, ChevronLeft, ChevronRight, FileText, X, Tag, Link2 } from 'lucide-react';
import { fetchApi } from '../services/api';
import type { Patient, PaginatedResponse, ClinicalNote, BookingLinkResult } from '../types/api';
import { useToast } from '../context/ToastContext';
import ConfirmDialog from '../components/ConfirmDialog';
import { SkeletonTable } from '../components/Skeleton';
import ErrorState from '../components/ErrorState';
import './Patients.css';

const PAGE_SIZE = 20;

// ── Modalidade unificada ───────────────────────────────────────────────────────
const MODALIDADE_OPTIONS = [
  { value: 'mensal-semanal',    label: 'Mensal (Semanal)',       status: 'weekly'   as const, paymentType: 'monthly'     as const },
  { value: 'mensal-quinzenal',  label: 'Mensal (Quinzenal)',     status: 'biweekly' as const, paymentType: 'monthly'     as const },
  { value: 'sessao-semanal',    label: 'Por Sessão (Semanal)',   status: 'weekly'   as const, paymentType: 'per_session' as const },
  { value: 'sessao-quinzenal',  label: 'Por Sessão (Quinzenal)', status: 'biweekly' as const, paymentType: 'per_session' as const },
  { value: 'avulsa',            label: 'Avulsa',                 status: 'one_off'  as const, paymentType: 'per_session' as const },
] as const;

type ModalidadeValue = typeof MODALIDADE_OPTIONS[number]['value'];

function getModalidadeValue(status: string, paymentType: string | null): ModalidadeValue {
  const found = MODALIDADE_OPTIONS.find(o => o.status === status && o.paymentType === paymentType);
  return found ? found.value : 'sessao-semanal';
}

function getModalidadeLabel(status: string, paymentType: string | null): string {
  if (status === 'inactive') return 'Inativo';
  return MODALIDADE_OPTIONS.find(o => o.status === status && o.paymentType === paymentType)?.label ?? '—';
}

export default function Patients() {
  const [patients, setPatients] = useState<Patient[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [currentPatient, setCurrentPatient] = useState<Partial<Patient> | null>(null);
  const [notesPatient, setNotesPatient] = useState<Patient | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<{ open: boolean; id: string | null }>({ open: false, id: null });
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const toast = useToast();

  const loadPatients = useCallback(async (pg = page, q = search) => {
    try {
      setLoading(true);
      setError(false);
      const params = new URLSearchParams({ page: String(pg), limit: String(PAGE_SIZE) });
      if (q) params.set('search', q);
      const res = await fetchApi<PaginatedResponse<Patient>>(`/api/psychotherapy/patients?${params}`);
      setPatients(res.data);
      setTotal(res.meta.total);
    } catch (err) {
      console.error(err);
      setError(true);
      toast.error('Erro ao carregar lista de pacientes.');
    } finally {
      setLoading(false);
    }
  }, [page, search, toast]);

  useEffect(() => { loadPatients(page, search); }, [page, search]);

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setSearchInput(val);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setSearch(val);
      setPage(1);
    }, 350);
  };

  const totalPages = Math.ceil(total / PAGE_SIZE);

  const askDeletePatient = (id: string) => setConfirmDelete({ open: true, id });

  const handleDelete = async () => {
    const id = confirmDelete.id;
    if (!id) return;
    try {
      await fetchApi(`/api/psychotherapy/patients/${id}`, { method: 'DELETE' });
      toast.success('Paciente excluído com sucesso.');
      loadPatients(page, search);
    } catch (err) {
      toast.error((err instanceof Error ? err.message : String(err)) || 'Falha ao excluir paciente.');
    } finally {
      setConfirmDelete({ open: false, id: null });
    }
  };

  const openModal = (patient: Partial<Patient> | null = null) => {
    setCurrentPatient(patient || { status: 'weekly', paymentType: 'monthly' });
    setShowModal(true);
  };

  const generateBookingLink = async (patient: Patient) => {
    try {
      const res = await fetchApi<{ data: BookingLinkResult }>(`/api/psychotherapy/patients/${patient.id}/booking-link`, {
        method: 'POST', body: JSON.stringify({})
      });
      await navigator.clipboard.writeText(res.data.url);
      toast.success(`Link de agendamento copiado para ${patient.name}!`);
    } catch (err) {
      toast.error((err instanceof Error ? err.message : String(err)) || 'Falha ao gerar link.');
    }
  };

  const formatCurrency = (cents: number | null) => {
    if (cents === null || cents === undefined) return '-';
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(cents / 100);
  };

  return (
    <div className="patients-page animate-fade-in">
      <div className="flex justify-between items-center mb-4">
        <h1 className="text-h1">Pacientes</h1>
        <button className="btn btn-primary" onClick={() => openModal()}>
          <Plus size={18} /> Novo Paciente
        </button>
      </div>

      {/* Busca */}
      <div className="patients-search-bar mb-4">
        <Search size={16} className="search-icon" />
        <input
          type="text"
          className="form-control"
          placeholder="Buscar por nome..."
          value={searchInput}
          onChange={handleSearchChange}
          style={{ paddingLeft: '2.25rem' }}
        />
      </div>

      {loading ? (
        <SkeletonTable rows={6} cols={5} />
      ) : error ? (
        <ErrorState
          title="Erro ao obter pacientes"
          message="Não foi possível carregar a lista de pacientes."
          onRetry={() => loadPatients(page, search)}
        />
      ) : (
        <>
          <div className="table-container">
            <table className="table">
              <thead>
                <tr>
                  <th>Nome</th>
                  <th>Modalidade</th>
                  <th>Valor / Sessão</th>
                  <th>Ações</th>
                </tr>
              </thead>
              <tbody>
                {patients.map(p => (
                  <tr key={p.id}>
                    <td>
                      <strong>{p.name}</strong>
                      {p.document && <div className="text-small">CPF: {p.document}</div>}
                      <div className="flex flex-col gap-1 mt-1">
                        {p.phone && (
                          <a
                            href={`https://api.whatsapp.com/send?phone=${p.phone.replace(/\D/g, '')}`}
                            target="_blank" rel="noopener noreferrer"
                            className="flex items-center gap-1"
                            style={{ color: '#10b981', fontSize: '0.8125rem', fontWeight: 500 }}
                          >
                            <MessageCircle size={14} /> {p.phone}
                          </a>
                        )}
                        {p.email && (
                          <div className="text-small flex items-center gap-1" style={{ fontSize: '0.8125rem' }}>
                            <Mail size={14} /> {p.email}
                          </div>
                        )}
                      </div>
                    </td>
                    <td>
                      <span className={`badge badge-${p.status === 'inactive' ? 'danger' : 'success'}`}>
                        {getModalidadeLabel(p.status, p.paymentType ?? null)}
                      </span>
                    </td>
                    <td>{formatCurrency(p.defaultSessionPriceCents)}</td>
                    <td>
                      <div className="flex gap-2">
                        <button className="btn-icon" title="Prontuário" onClick={() => setNotesPatient(p)}>
                          <FileText size={16} />
                        </button>
                        <button className="btn-icon" title="Gerar link de agendamento" onClick={() => generateBookingLink(p)}
                          style={{ color: 'var(--brand-secondary)' }}>
                          <Link2 size={16} />
                        </button>
                        <button className="btn-icon" title="Editar" onClick={() => openModal(p)}>
                          <Edit2 size={16} />
                        </button>
                        <button className="btn-icon text-danger" title="Excluir" onClick={() => askDeletePatient(p.id)}>
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {patients.length === 0 && (
                  <tr>
                    <td colSpan={5} style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>
                      {search ? `Nenhum paciente encontrado para "${search}".` : 'Nenhum paciente cadastrado.'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Paginação */}
          {totalPages > 1 && (
            <div className="pagination">
              <span className="pagination-info">{total} paciente{total !== 1 ? 's' : ''}</span>
              <div className="pagination-controls">
                <button
                  className="btn-icon" disabled={page === 1}
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                >
                  <ChevronLeft size={16} />
                </button>
                <span className="pagination-pages">
                  {page} / {totalPages}
                </span>
                <button
                  className="btn-icon" disabled={page === totalPages}
                  onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                >
                  <ChevronRight size={16} />
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {showModal && (
        <PatientModal
          patient={currentPatient}
          onClose={() => setShowModal(false)}
          onSave={() => loadPatients(page, search)}
        />
      )}

      {notesPatient && (
        <ClinicalNotesModal
          patient={notesPatient}
          onClose={() => setNotesPatient(null)}
        />
      )}

      <ConfirmDialog
        isOpen={confirmDelete.open}
        title="Excluir paciente"
        message="Esta ação não pode ser desfeita. Tem certeza de que deseja remover permanentemente este paciente e todos os seus dados vinculados?"
        confirmLabel="Excluir" cancelLabel="Cancelar" variant="danger"
        onConfirm={handleDelete}
        onCancel={() => setConfirmDelete({ open: false, id: null })}
      />
    </div>
  );
}

// ── PatientModal ──────────────────────────────────────────────────────────────

function PatientModal({ patient, onClose, onSave }: { patient: Partial<Patient> | null; onClose: () => void; onSave: () => void }) {
  const isInactiveInit = patient?.status === 'inactive';
  const [formData, setFormData] = useState({
    id: patient?.id,
    name: patient?.name || '',
    modalidade: isInactiveInit
      ? 'sessao-semanal' as ModalidadeValue
      : getModalidadeValue(patient?.status || 'weekly', patient?.paymentType || 'monthly'),
    isInactive: isInactiveInit,
    defaultSessionPriceCents: patient?.defaultSessionPriceCents ? String(patient.defaultSessionPriceCents / 100) : '',
    document: patient?.document || '',
    phone: patient?.phone || '',
    email: patient?.email || ''
  });
  const [submitting, setSubmitting] = useState(false);
  const toast = useToast();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setSubmitting(true);
      const option = MODALIDADE_OPTIONS.find(o => o.value === formData.modalidade)!;
      await fetchApi('/api/psychotherapy/patients', {
        method: 'POST',
        body: JSON.stringify({
          id: formData.id,
          name: formData.name,
          status: formData.isInactive ? 'inactive' : option.status,
          paymentType: option.paymentType,
          defaultSessionPriceCents: formData.defaultSessionPriceCents ? Math.round(Number(formData.defaultSessionPriceCents) * 100) : null,
          document: formData.document || null,
          phone: formData.phone || null,
          email: formData.email || null,
        })
      });
      toast.success(patient?.id ? 'Paciente atualizado com sucesso.' : 'Paciente criado com sucesso.');
      onSave();
      onClose();
    } catch (error) {
      toast.error((error instanceof Error ? error.message : String(error)) || 'Falha ao salvar paciente.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="modal-overlay">
      <div className="modal-content animate-fade-in" style={{ maxWidth: '600px' }}>
        <h2 className="text-h2 mb-4">{patient?.id ? 'Editar Paciente' : 'Novo Paciente'}</h2>
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label">Nome *</label>
            <input required type="text" className="form-control" value={formData.name}
              onChange={e => setFormData({ ...formData, name: e.target.value })} disabled={submitting} />
          </div>
          <div className="flex gap-4 items-end">
            <div className="form-group w-full">
              <label className="form-label">Modalidade *</label>
              <select className="form-control" value={formData.modalidade}
                onChange={e => setFormData({ ...formData, modalidade: e.target.value as ModalidadeValue })}
                disabled={submitting || formData.isInactive}>
                {MODALIDADE_OPTIONS.map(o => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
            <div className="form-group" style={{ whiteSpace: 'nowrap', paddingBottom: '0.25rem' }}>
              <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={formData.isInactive}
                  onChange={e => setFormData({ ...formData, isInactive: e.target.checked })}
                  disabled={submitting}
                  style={{ width: '1rem', height: '1rem' }}
                />
                Inativo
              </label>
            </div>
          </div>
          <div className="flex gap-4">
            <div className="form-group w-full">
              <label className="form-label">Valor Padrão por Sessão (R$)</label>
              <input type="number" step="0.01" className="form-control" value={formData.defaultSessionPriceCents}
                onChange={e => setFormData({ ...formData, defaultSessionPriceCents: e.target.value })} disabled={submitting} />
            </div>
            <div className="form-group w-full">
              <label className="form-label">CPF / Documento</label>
              <input type="text" className="form-control" value={formData.document}
                onChange={e => setFormData({ ...formData, document: e.target.value })} disabled={submitting} />
            </div>
          </div>
          <div className="flex gap-4">
            <div className="form-group w-full">
              <label className="form-label">WhatsApp (com DDD)</label>
              <input type="text" className="form-control" placeholder="11999998888" value={formData.phone}
                onChange={e => setFormData({ ...formData, phone: e.target.value })} disabled={submitting} />
            </div>
            <div className="form-group w-full">
              <label className="form-label">E-mail</label>
              <input type="email" className="form-control" value={formData.email}
                onChange={e => setFormData({ ...formData, email: e.target.value })} disabled={submitting} />
            </div>
          </div>
          <div className="flex justify-end gap-2 mt-6">
            <button type="button" className="btn btn-secondary" onClick={onClose} disabled={submitting}>Cancelar</button>
            <button type="submit" className="btn btn-primary" disabled={submitting}>
              {submitting ? 'Salvando...' : 'Salvar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── ClinicalNotesModal ────────────────────────────────────────────────────────

function ClinicalNotesModal({ patient, onClose }: { patient: Patient; onClose: () => void }) {
  const [notes, setNotes] = useState<ClinicalNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editNote, setEditNote] = useState<ClinicalNote | null>(null);
  const [formData, setFormData] = useState({ noteDate: new Date().toISOString().slice(0, 10), content: '', tags: '' });
  const [submitting, setSubmitting] = useState(false);
  const toast = useToast();

  const loadNotes = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetchApi<PaginatedResponse<ClinicalNote>>(`/api/psychotherapy/patients/${patient.id}/notes`);
      setNotes(res.data);
    } catch {
      toast.error('Erro ao carregar prontuário.');
    } finally {
      setLoading(false);
    }
  }, [patient.id, toast]);

  useEffect(() => { loadNotes(); }, [loadNotes]);

  const openForm = (note: ClinicalNote | null = null) => {
    setEditNote(note);
    setFormData({
      noteDate: note ? note.noteDate.slice(0, 10) : new Date().toISOString().slice(0, 10),
      content: note?.content || '',
      tags: note?.tags.join(', ') || ''
    });
    setShowForm(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setSubmitting(true);
      const tags = formData.tags.split(',').map(t => t.trim()).filter(Boolean);
      const body = { id: editNote?.id, noteDate: formData.noteDate, content: formData.content, tags };
      await fetchApi(`/api/psychotherapy/patients/${patient.id}/notes`, { method: 'POST', body: JSON.stringify(body) });
      toast.success(editNote ? 'Nota atualizada.' : 'Nota criada.');
      setShowForm(false);
      loadNotes();
    } catch (err) {
      toast.error((err instanceof Error ? err.message : String(err)) || 'Falha ao salvar nota.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Excluir esta nota?')) return;
    try {
      await fetchApi(`/api/psychotherapy/notes/${id}`, { method: 'DELETE' });
      toast.success('Nota excluída.');
      loadNotes();
    } catch {
      toast.error('Falha ao excluir nota.');
    }
  };

  return (
    <div className="modal-overlay">
      <div className="modal-content animate-fade-in" style={{ maxWidth: '720px', maxHeight: '90vh', overflowY: 'auto' }}>
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-h2">Prontuário — {patient.name}</h2>
          <button className="btn-icon" onClick={onClose}><X size={20} /></button>
        </div>

        {showForm ? (
          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label className="form-label">Data da Nota</label>
              <input type="date" className="form-control" value={formData.noteDate}
                onChange={e => setFormData({ ...formData, noteDate: e.target.value })} disabled={submitting} />
            </div>
            <div className="form-group">
              <label className="form-label">Conteúdo *</label>
              <textarea required className="form-control" rows={8}
                placeholder="Evolução clínica, observações, hipóteses diagnósticas..."
                value={formData.content}
                onChange={e => setFormData({ ...formData, content: e.target.value })}
                disabled={submitting}
                style={{ resize: 'vertical', fontFamily: 'inherit' }}
              />
            </div>
            <div className="form-group">
              <label className="form-label">Tags (separadas por vírgula)</label>
              <input type="text" className="form-control" placeholder="Ex: TCC, ansiedade, trauma"
                value={formData.tags} onChange={e => setFormData({ ...formData, tags: e.target.value })} disabled={submitting} />
            </div>
            <div className="flex justify-end gap-2 mt-4">
              <button type="button" className="btn btn-secondary" onClick={() => setShowForm(false)} disabled={submitting}>Cancelar</button>
              <button type="submit" className="btn btn-primary" disabled={submitting}>
                {submitting ? 'Salvando...' : 'Salvar Nota'}
              </button>
            </div>
          </form>
        ) : (
          <>
            <div className="flex justify-end mb-3">
              <button className="btn btn-primary" onClick={() => openForm()}>
                <Plus size={16} /> Nova Nota
              </button>
            </div>

            {loading ? (
              <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>Carregando...</div>
            ) : notes.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>
                Nenhuma nota clínica registrada.
              </div>
            ) : (
              <div className="notes-list">
                {notes.map(note => (
                  <div key={note.id} className="note-card card mb-3">
                    <div className="flex justify-between items-start mb-2">
                      <span className="text-small" style={{ color: 'var(--text-secondary)' }}>
                        {new Date(note.noteDate).toLocaleDateString('pt-BR', { timeZone: 'UTC' })}
                      </span>
                      <div className="flex gap-2">
                        <button className="btn-icon" onClick={() => openForm(note)}><Edit2 size={14} /></button>
                        <button className="btn-icon text-danger" onClick={() => handleDelete(note.id)}><Trash2 size={14} /></button>
                      </div>
                    </div>
                    <p style={{ whiteSpace: 'pre-wrap', lineHeight: 1.6, marginBottom: note.tags.length ? '0.75rem' : 0 }}>
                      {note.content}
                    </p>
                    {note.tags.length > 0 && (
                      <div className="flex gap-1 flex-wrap">
                        {note.tags.map(tag => (
                          <span key={tag} className="note-tag">
                            <Tag size={10} /> {tag}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
