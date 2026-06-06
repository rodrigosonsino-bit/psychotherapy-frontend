import React, { useEffect, useState, useCallback } from 'react';
import { fetchApi } from '../services/api';
import type { Expense, PaginatedResponse } from '../types/api';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Trash2, Download } from 'lucide-react';
import { useToast } from '../context/ToastContext';
import ConfirmDialog from '../components/ConfirmDialog';
import { SkeletonTable } from '../components/Skeleton';
import ErrorState from '../components/ErrorState';
import './Expenses.css';

type ExpenseCategory = 'rent' | 'taxes' | 'software' | 'marketing' | 'other';

export default function Expenses() {
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  
  // Form state
  const [date, setDate] = useState(new Date().toISOString().substring(0, 16));
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState<ExpenseCategory>('other');

  // Confirmation state
  const [confirmDelete, setConfirmDelete] = useState<{ open: boolean; id: string | null }>({
    open: false,
    id: null,
  });

  const toast = useToast();

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      setError(false);
      const data = await fetchApi<PaginatedResponse<Expense>>('/api/psychotherapy/expenses');
      setExpenses(data.data || []);
    } catch (err) {
      console.error(err);
      setError(true);
      toast.error('Erro ao carregar despesas.');
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!amount || parseFloat(amount) <= 0) {
      toast.error('O valor inserido é inválido.');
      return;
    }
    try {
      setSubmitting(true);
      await fetchApi('/api/psychotherapy/expenses', {
        method: 'POST',
        body: JSON.stringify({
          date: new Date(date).toISOString(),
          amountCents: Math.round(parseFloat(amount) * 100),
          description,
          category
        })
      });
      toast.success('Despesa registrada com sucesso.');
      setDescription('');
      setAmount('');
      await loadData();
    } catch (err) {
      console.error(err);
      toast.error((err instanceof Error ? err.message : String(err)) || 'Falha ao salvar despesa.');
    } finally {
      setSubmitting(false);
    }
  };

  const askDeleteExpense = (id: string) => {
    setConfirmDelete({ open: true, id });
  };

  const handleDelete = async () => {
    const id = confirmDelete.id;
    if (!id) return;

    try {
      await fetchApi(`/api/psychotherapy/expenses/${id}`, { method: 'DELETE' });
      toast.success('Despesa excluída com sucesso.');
      await loadData();
    } catch (err) {
      console.error(err);
      toast.error((err instanceof Error ? err.message : String(err)) || 'Falha ao excluir despesa.');
    } finally {
      setConfirmDelete({ open: false, id: null });
    }
  };

  const formatCurrency = (cents: number) => {
    return (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  };

  const translateCategory = (cat: ExpenseCategory) => {
    const map: Record<ExpenseCategory, string> = {
      'rent': 'Aluguel / Imóvel',
      'taxes': 'Impostos / Taxas',
      'software': 'Software / Apps',
      'marketing': 'Marketing',
      'other': 'Outros'
    };
    return map[cat] || cat;
  };

  const handleExport = async () => {
    try {
      const blob = await fetchApi<Blob>('/api/psychotherapy/export/expenses', {
        headers: { Accept: 'text/csv' },
        responseType: 'blob'
      });
      const url = URL.createObjectURL(new Blob([blob as any], { type: 'text/csv' }));
      Object.assign(document.createElement('a'), { href: url, download: 'despesas.csv' }).click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error(err);
      toast.error('Erro ao exportar despesas.');
    }
  };

  return (
    <div className="expenses-container animate-fade-in">
      <div className="expenses-header flex justify-between items-center">
        <h1 className="text-h1">Despesas do Consultório</h1>
        <button
          onClick={handleExport}
          className="btn btn-secondary"
          style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', textDecoration: 'none' }}
        >
          <Download size={16} /> CSV
        </button>
      </div>

      <form className="new-expense-form" onSubmit={handleSubmit}>
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
          <label className="form-label">Valor (R$)</label>
          <input 
            type="number" 
            step="0.01" 
            min="0.01" 
            required 
            value={amount} 
            onChange={e => setAmount(e.target.value)} 
            className="form-control" 
            placeholder="Ex: 150.00" 
            disabled={submitting}
          />
        </div>

        <div className="form-group">
          <label className="form-label">Categoria</label>
          <select 
            required 
            value={category} 
            onChange={e => setCategory(e.target.value as ExpenseCategory)} 
            className="form-control"
            disabled={submitting}
          >
            <option value="rent">Aluguel / Imóvel</option>
            <option value="taxes">Impostos / Taxas</option>
            <option value="software">Software / Apps</option>
            <option value="marketing">Marketing</option>
            <option value="other">Outros</option>
          </select>
        </div>

        <div className="form-group">
          <label className="form-label">Descrição</label>
          <input 
            type="text" 
            required 
            value={description} 
            onChange={e => setDescription(e.target.value)} 
            className="form-control" 
            placeholder="Ex: Aluguel da sala" 
            disabled={submitting}
          />
        </div>

        <button type="submit" className="btn btn-primary" disabled={submitting}>
          {submitting ? 'Salvando...' : 'Registrar Despesa'}
        </button>
      </form>

      {loading ? (
        <SkeletonTable rows={5} cols={4} />
      ) : error ? (
        <ErrorState
          title="Erro ao carregar despesas"
          message="Não foi possível recuperar a lista de despesas registradas."
          onRetry={loadData}
        />
      ) : (
        <div className="expenses-list">
          {expenses.length === 0 ? (
            <div className="empty-state">Nenhuma despesa registrada.</div>
          ) : (
            expenses.map(exp => (
              <div key={exp.id} className="expense-item animate-fade-in">
                <div className="expense-info">
                  <span className="expense-desc">{exp.description}</span>
                  <span className="expense-date">
                    {format(new Date(exp.date), "dd 'de' MMMM 'às' HH:mm", { locale: ptBR })}
                  </span>
                </div>
                <div className="expense-amount-cat">
                  <span className="badge badge-info">{translateCategory(exp.category)}</span>
                  <span className="expense-amount">- {formatCurrency(exp.amountCents)}</span>
                  <button className="btn btn-icon btn-danger" onClick={() => askDeleteExpense(exp.id)}>
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
        title="Excluir Despesa"
        message="Esta ação irá remover permanentemente esta despesa do banco de dados. Tem certeza de que deseja prosseguir?"
        confirmLabel="Excluir"
        cancelLabel="Cancelar"
        variant="danger"
        onConfirm={handleDelete}
        onCancel={() => setConfirmDelete({ open: false, id: null })}
      />
    </div>
  );
}
