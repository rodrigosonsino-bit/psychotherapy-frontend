import React, { useEffect, useState, useCallback } from 'react';
import { fetchApi } from '../services/api';
import type { Patient, Session, PaginatedResponse } from '../types/api';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Trash2, Download } from 'lucide-react';
import { useToast } from '../context/ToastContext';
import ConfirmDialog from '../components/ConfirmDialog';
import { SkeletonTable } from '../components/Skeleton';
import ErrorState from '../components/ErrorState';
import './Sessions.css';

type SessionStatus = 'attended' | 'justified_absence' | 'unjustified_absence' | 'canceled';

export default function Sessions() {
  const [patients, setPatients] = useState<Patient[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const getLocalDatetimeString = () => {
    const now = new Date();
    return new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().substring(0, 16);
  };

  // Form state
  const [patientId, setPatientId] = useState('');
  const [date, setDate] = useState(getLocalDatetimeString()); // YYYY-MM-DDThh:mm local time
  const [status, setStatus] = useState<SessionStatus>('attended');
  const [notes, setNotes] = useState('');

  // Confirmation dialog state
  const [confirmDelete, setConfirmDelete] = useState<{ open: boolean; id: string | null }>({
    open: false,
    id: null,
  });

  const toast = useToast();

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      setError(false);
      const [patientsData, sessionsData] = await Promise.all([
        fetchApi<PaginatedResponse<Patient>>('/api/psychotherapy/patients?limit=200'),
        fetchApi<PaginatedResponse<Session>>('/api/psychotherapy/sessions')
      ]);
      setPatients((patientsData.data || []).filter(p => p.status !== 'inactive'));
      setSessions(sessionsData.data || []);
    } catch (err) {
      console.error(err);
      setError(true);
      toast.error('Erro ao carregar os dados de sessões.');
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setSubmitting(true);
      await fetchApi('/api/psychotherapy/sessions', {
        method: 'POST',
        body: JSON.stringify({
          patientId,
          date: new Date(date).toISOString(),
          status,
          notes: notes || null
        })
      });
      toast.success('Sessão registrada com sucesso.');
      setNotes('');
      await loadData();
    } catch (err) {
      console.error(err);
      toast.error((err instanceof Error ? err.message : String(err)) || 'Falha ao registrar sessão.');
    } finally {
      setSubmitting(false);
    }
  };

  const askDeleteSession = (id: string) => {
    setConfirmDelete({ open: true, id });
  };

  const handleDelete = async () => {
    const id = confirmDelete.id;
    if (!id) return;

    try {
      await fetchApi(`/api/psychotherapy/sessions/${id}`, { method: 'DELETE' });
      toast.success('Sessão excluída com sucesso.');
      await loadData();
    } catch (err) {
      console.error(err);
      toast.error((err instanceof Error ? err.message : String(err)) || 'Falha ao excluir registro de sessão.');
    } finally {
      setConfirmDelete({ open: false, id: null });
    }
  };

  const getStatusBadge = (status: SessionStatus) => {
    switch (status) {
      case 'attended': return <span className="badge attended">Presente</span>;
      case 'justified_absence': return <span className="badge justified_absence">Falta Justificada</span>;
      case 'unjustified_absence': return <span className="badge unjustified_absence">Falta Injustificada</span>;
      case 'canceled': return <span className="badge canceled">Cancelado</span>;
      default: return null;
    }
  };

  const getPatientName = (id: string) => {
    const p = patients.find(p => p.id === id);
    return p ? p.name : 'Paciente Desconhecido';
  };

  const handleExport = async () => {
    try {
      const blob = await fetchApi<Blob>('/api/psychotherapy/export/sessions', {
        headers: { Accept: 'text/csv' },
        responseType: 'blob'
      });
      const url = URL.createObjectURL(new Blob([blob as any], { type: 'text/csv' }));
      Object.assign(document.createElement('a'), { href: url, download: 'sessoes.csv' }).click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error(err);
      toast.error('Erro ao exportar sessões.');
    }
  };

  return (
    <div className="sessions-container animate-fade-in">
      <div className="sessions-header flex justify-between items-center">
        <h1 className="text-h1">Diário de Sessões</h1>
        <button
          onClick={handleExport}
          className="btn btn-secondary"
          style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', textDecoration: 'none' }}
        >
          <Download size={16} /> CSV
        </button>
      </div>

      <form className="new-session-form" onSubmit={handleSubmit}>
        <div className="form-group">
          <label className="form-label">Paciente</label>
          <select 
            required 
            value={patientId} 
            onChange={e => setPatientId(e.target.value)} 
            className="form-control"
            disabled={submitting}
          >
            <option value="">Selecione o paciente...</option>
            {patients.map(p => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </div>
        
        <div className="form-group">
          <label className="form-label">Data e Hora</label>
          <input 
            type="datetime-local" 
            required 
            value={date} 
            onChange={e => setDate(e.target.value)} 
            className="form-control"
            disabled={submitting}
          />
        </div>

        <div className="form-group">
          <label className="form-label">Status</label>
          <select 
            required 
            value={status} 
            onChange={e => setStatus(e.target.value as SessionStatus)} 
            className="form-control"
            disabled={submitting}
          >
            <option value="attended">Presente</option>
            <option value="justified_absence">Falta Justificada (Não cobra)</option>
            <option value="unjustified_absence">Falta Injustificada (Cobra)</option>
            <option value="canceled">Cancelado pelo Terapeuta</option>
          </select>
        </div>

        <div className="form-group">
          <label className="form-label">Anotações (opcional)</label>
          <input 
            type="text" 
            value={notes} 
            onChange={e => setNotes(e.target.value)} 
            className="form-control" 
            placeholder="Ex: Trânsito, atestado..." 
            disabled={submitting}
          />
        </div>

        <button type="submit" className="btn btn-primary" disabled={!patientId || submitting}>
          {submitting ? 'Registrando...' : 'Registrar Sessão'}
        </button>
      </form>

      {loading ? (
        <SkeletonTable rows={5} cols={4} />
      ) : error ? (
        <ErrorState
          title="Erro ao obter sessões"
          message="Não foi possível recuperar os dados de sessões agendadas."
          onRetry={loadData}
        />
      ) : (
        <div className="sessions-list">
          {sessions.length === 0 ? (
            <div className="empty-state">Nenhuma sessão registrada.</div>
          ) : (
            sessions.map(session => (
              <div key={session.id} className="session-item animate-fade-in">
                <div className="session-info">
                  <span className="session-patient">{getPatientName(session.patientId)}</span>
                  <span className="session-date">
                    {format(new Date(session.date), "dd 'de' MMMM 'às' HH:mm", { locale: ptBR })}
                    {session.notes && ` - Nota: ${session.notes}`}
                  </span>
                </div>
                <div className="session-status">
                  {getStatusBadge(session.status)}
                  <button className="btn btn-icon btn-danger" onClick={() => askDeleteSession(session.id)}>
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      <ConfirmDialog
        isOpen={confirmDelete.open}
        title="Excluir Registro de Sessão"
        message="Esta ação irá remover permanentemente o registro desta sessão. Tem certeza que deseja prosseguir?"
        confirmLabel="Excluir"
        cancelLabel="Cancelar"
        variant="danger"
        onConfirm={handleDelete}
        onCancel={() => setConfirmDelete({ open: false, id: null })}
      />
    </div>
  );
}
