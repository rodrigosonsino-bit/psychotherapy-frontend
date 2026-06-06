import { useState, useEffect, useCallback } from 'react';
import { format } from 'date-fns';
import { TrendingUp, TrendingDown, DollarSign, AlertCircle } from 'lucide-react';
import { fetchApi } from '../services/api';
import type { DashboardAnalytics } from '../types/api';
import Skeleton, { SkeletonCard } from '../components/Skeleton';
import ErrorState from '../components/ErrorState';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer
} from 'recharts';
import './Dashboard.css';

export default function Dashboard() {
  const [analytics, setAnalytics] = useState<DashboardAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const currentMonth = format(new Date(), 'yyyy-MM');

  const loadAnalytics = useCallback(async () => {
    try {
      setLoading(true);
      setError(false);
      const data = await fetchApi<DashboardAnalytics>(`/api/psychotherapy/analytics/dashboard?month=${currentMonth}`);
      setAnalytics(data);
    } catch (err) {
      console.error('Erro ao carregar analytics', err);
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [currentMonth]);

  useEffect(() => {
    loadAnalytics();
  }, [loadAnalytics]);

  const formatCurrency = (cents: number) => {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(cents / 100);
  };

  const formatChartData = () => {
    if (!analytics?.sixMonthsTrend) return [];
    const sorted = [...analytics.sixMonthsTrend].sort((a, b) => a.month.localeCompare(b.month));
    
    return sorted.map(item => ({
      name: item.month,
      Receitas: item.revenueCents / 100,
      Despesas: item.expensesCents / 100
    }));
  };

  if (loading) {
    return (
      <div className="dashboard animate-fade-in">
        <div className="dashboard-header">
          <Skeleton width="180px" height="2.25rem" />
          <Skeleton width="220px" height="1.25rem" className="mt-2" />
        </div>

        <div className="dashboard-grid">
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
        </div>

        <div className="chart-section mt-4">
          <Skeleton width="350px" height="1.75rem" className="mb-4" />
          <Skeleton width="100%" height="400px" />
        </div>
      </div>
    );
  }

  if (error || !analytics) {
    return (
      <div className="dashboard animate-fade-in">
        <div className="dashboard-header">
          <h1 className="text-h1">Visão Geral</h1>
          <p className="text-body">Mês de referência: {currentMonth}</p>
        </div>
        <ErrorState
          title="Erro ao carregar Painel Financeiro"
          message="Não foi possível estabelecer contato com o servidor para obter dados consolidados."
          onRetry={loadAnalytics}
        />
      </div>
    );
  }

  const { currentMonth: cm } = analytics;

  return (
    <div className="dashboard animate-fade-in">
      <div className="dashboard-header">
        <h1 className="text-h1">Visão Geral</h1>
        <p className="text-body">Mês de referência: {currentMonth}</p>
      </div>

      <div className="dashboard-grid">
        <div className="stat-card">
          <div className="stat-icon" style={{ backgroundColor: 'rgba(16, 185, 129, 0.1)', color: 'var(--status-success)' }}>
            <TrendingUp size={28} />
          </div>
          <div className="stat-details">
            <h3>Receitas (Pagas)</h3>
            <p className="stat-value text-success">{formatCurrency(cm.revenueCents)}</p>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon" style={{ backgroundColor: 'rgba(239, 68, 68, 0.1)', color: 'var(--status-danger)' }}>
            <TrendingDown size={28} />
          </div>
          <div className="stat-details">
            <h3>Despesas</h3>
            <p className="stat-value text-danger">{formatCurrency(cm.expensesCents)}</p>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon" style={{ backgroundColor: 'rgba(59, 130, 246, 0.1)', color: 'var(--status-info)' }}>
            <DollarSign size={28} />
          </div>
          <div className="stat-details">
            <h3>Lucro Líquido</h3>
            <p className="stat-value text-info">{formatCurrency(cm.netIncomeCents)}</p>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon" style={{ backgroundColor: 'rgba(245, 158, 11, 0.1)', color: 'var(--status-warning)' }}>
            <AlertCircle size={28} />
          </div>
          <div className="stat-details">
            <h3>Inadimplência</h3>
            <p className="stat-value text-warning">{formatCurrency(cm.pendingCents)}</p>
          </div>
        </div>
      </div>

      <div className="chart-section">
        <h2>Evolução Financeira (Últimos 6 meses)</h2>
        <div style={{ width: '100%', height: 400 }}>
          <ResponsiveContainer>
            <BarChart
              data={formatChartData()}
              margin={{ top: 20, right: 30, left: 20, bottom: 5 }}
            >
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border-color)" />
              <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#64748b' }} dy={10} />
              <YAxis 
                axisLine={false} 
                tickLine={false} 
                tick={{ fill: '#64748b' }}
                tickFormatter={(value) => `R$ ${value}`} 
              />
              <Tooltip 
                formatter={(value: unknown) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(value) || 0)}
                cursor={{ fill: 'rgba(255,255,255,0.03)' }}
                contentStyle={{ 
                  backgroundColor: 'var(--bg-surface)', 
                  border: '1px solid var(--border-color)', 
                  borderRadius: 'var(--radius-md)',
                  color: 'var(--text-primary)'
                }}
              />
              <Legend wrapperStyle={{ paddingTop: '20px' }} />
              <Bar dataKey="Receitas" fill="#10b981" radius={[4, 4, 0, 0]} maxBarSize={50} />
              <Bar dataKey="Despesas" fill="#ef4444" radius={[4, 4, 0, 0]} maxBarSize={50} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
