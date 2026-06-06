import React, { useState, useEffect, useCallback } from 'react';
import { Save, User, CreditCard, Shield, MapPin, ShieldCheck, ShieldOff, Copy, CalendarDays, CheckCircle, XCircle } from 'lucide-react';
import { fetchApi } from '../services/api';
import type { TenantProfile, TotpSetupResult, GoogleCalendarStatus } from '../types/api';
import { useToast } from '../context/ToastContext';
import Skeleton from '../components/Skeleton';
import ErrorState from '../components/ErrorState';
import './ProfileSettings.css';

export default function ProfileSettings() {
  const [formData, setFormData] = useState({
    fullName: '',
    document: '',
    professionalId: '',
    address: '',
    twoFactorEnabled: false
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(false);

  const toast = useToast();

  const loadProfile = useCallback(async () => {
    try {
      setLoading(true);
      setError(false);
      const data = await fetchApi<TenantProfile>('/api/profile');
      setFormData({
        fullName: data.fullName || '',
        document: data.document || '',
        professionalId: data.professionalId || '',
        address: data.address || '',
        twoFactorEnabled: data.twoFactorEnabled || false
      });
    } catch (err) {
      console.error(err);
      setError(true);
      toast.error('Erro ao carregar os dados de perfil.');
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    loadProfile();
  }, [loadProfile]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await fetchApi<TenantProfile>('/api/profile', {
        method: 'PUT',
        body: JSON.stringify(formData)
      });
      toast.success('Perfil atualizado com sucesso!');
    } catch (err) {
      console.error(err);
      toast.error((err instanceof Error ? err.message : String(err)) || 'Erro ao salvar alterações no perfil.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="profile-container animate-fade-in">
        <h1 className="text-h1">Configurações do Perfil</h1>
        <p className="text-body"><Skeleton width="150px" height="1rem" className="mt-2" /></p>
        <div className="card profile-card mt-4" style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          <Skeleton width="100%" height="2.5rem" />
          <div style={{ display: 'flex', gap: '1rem' }}>
            <Skeleton width="50%" height="2.5rem" />
            <Skeleton width="50%" height="2.5rem" />
          </div>
          <Skeleton width="100%" height="5rem" />
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <Skeleton width="120px" height="2.5rem" />
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="profile-container animate-fade-in">
        <h1 className="text-h1">Configurações do Perfil</h1>
        <ErrorState
          title="Erro ao obter perfil"
          message="Não foi possível obter os dados cadastrais do seu perfil profissional."
          onRetry={loadProfile}
        />
      </div>
    );
  }

  return (
    <div className="profile-container animate-fade-in">
      <div className="profile-header">
        <div>
          <h1 className="text-h1">Configurações do Perfil</h1>
          <p className="text-body">Gerencie seus dados profissionais para emissão de recibos válidos</p>
        </div>
      </div>

      <GoogleCalendarSection />
      <TwoFactorSection 
        enabled={formData.twoFactorEnabled} 
        onStatusChange={(status) => setFormData(prev => ({ ...prev, twoFactorEnabled: status }))} 
      />

      <div className="card profile-card mt-4">
        <form onSubmit={handleSubmit} className="profile-form">
          <div className="form-row">
            <div className="form-group">
              <label className="form-label flex items-center gap-2">
                <User size={16} className="text-muted" /> Nome Completo *
              </label>
              <input
                required
                type="text"
                className="form-control"
                placeholder="Ex: Dra. Ana Silva"
                value={formData.fullName}
                onChange={e => setFormData({ ...formData, fullName: e.target.value })}
                disabled={saving}
              />
            </div>
          </div>

          <div className="form-grid">
            <div className="form-group">
              <label className="form-label flex items-center gap-2">
                <CreditCard size={16} className="text-muted" /> CPF ou CNPJ *
              </label>
              <input
                required
                type="text"
                className="form-control"
                placeholder="Ex: 000.000.000-00"
                value={formData.document}
                onChange={e => setFormData({ ...formData, document: e.target.value })}
                disabled={saving}
              />
            </div>

            <div className="form-group">
              <label className="form-label flex items-center gap-2">
                <Shield size={16} className="text-muted" /> CRP (Registro Profissional)
              </label>
              <input
                type="text"
                className="form-control"
                placeholder="Ex: CRP 06/12345 (Opcional)"
                value={formData.professionalId}
                onChange={e => setFormData({ ...formData, professionalId: e.target.value })}
                disabled={saving}
              />
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label className="form-label flex items-center gap-2">
                <MapPin size={16} className="text-muted" /> Endereço do Consultório *
              </label>
              <textarea
                required
                className="form-control"
                rows={3}
                placeholder="Ex: Av. Paulista, 1000 - Sala 42, Bela Vista, São Paulo - SP"
                value={formData.address}
                onChange={e => setFormData({ ...formData, address: e.target.value })}
                style={{ resize: 'vertical', minHeight: '80px' }}
                disabled={saving}
              />
            </div>
          </div>

          <div className="flex justify-end gap-2 mt-6">
            <button
              type="submit"
              className="btn btn-primary"
              disabled={saving}
            >
              <Save size={18} /> {saving ? 'Salvando...' : 'Salvar Alterações'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Google Calendar Section ───────────────────────────────────────────────────

function GoogleCalendarSection() {
  const [status, setStatus] = useState<GoogleCalendarStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [configError, setConfigError] = useState<string | null>(null);
  const toast = useToast();

  const loadStatus = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetchApi<GoogleCalendarStatus>('/auth/google/status');
      setStatus(res);
    } catch {
      setStatus({ connected: false, calendarName: null, calendarId: null });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // Detecta retorno do OAuth Google pela query string
    const params = new URLSearchParams(window.location.search);
    const googleParam = params.get('google');
    if (googleParam === 'connected') {
      toast.success('Google Calendar conectado com sucesso!');
      window.history.replaceState({}, '', '/profile');
    } else if (googleParam === 'denied') {
      toast.error('Conexão com Google cancelada.');
      window.history.replaceState({}, '', '/profile');
    } else if (googleParam === 'error') {
      toast.error('Erro ao conectar com Google Calendar. Tente novamente.');
      window.history.replaceState({}, '', '/profile');
    }
    loadStatus();
  }, [loadStatus, toast]);

  const handleConnect = async () => {
    try {
      setConnecting(true);
      setConfigError(null);
      const res = await fetchApi<{ url: string }>('/auth/google/auth-url');
      // Navega para o consent screen do Google com o token já validado pelo fetch
      window.location.href = res.url;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('GOOGLE_CLIENT_ID') || msg.includes('não está configurado') || msg.includes('503')) {
        setConfigError('As credenciais do Google Calendar não estão configuradas no servidor. Consulte o guia de configuração.');
      } else {
        toast.error(msg || 'Erro ao iniciar conexão com Google Calendar.');
      }
    } finally {
      setConnecting(false);
    }
  };

  const handleDisconnect = async () => {
    try {
      setDisconnecting(true);
      await fetchApi('/auth/google/disconnect', { method: 'DELETE' });
      toast.success('Google Calendar desconectado.');
      setStatus({ connected: false, calendarName: null, calendarId: null });
    } catch {
      toast.error('Erro ao desconectar Google Calendar.');
    } finally {
      setDisconnecting(false);
    }
  };

  return (
    <div className="card profile-card mt-4" style={{ maxWidth: 700 }}>
      <div className="flex items-center gap-2 mb-4">
        <CalendarDays size={20} style={{ color: '#4285f4' }} />
        <h3 className="text-h3" style={{ margin: 0 }}>Google Calendar</h3>
      </div>

      {loading ? (
        <div style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>Verificando conexão...</div>
      ) : status?.connected ? (
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-2">
            <CheckCircle size={18} style={{ color: 'var(--status-success)' }} />
            <div>
              <p style={{ color: 'var(--text-primary)', fontWeight: 500, margin: 0 }}>
                Conectado — calendário <strong>{status.calendarName}</strong>
              </p>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', margin: '0.2rem 0 0' }}>
                Novos agendamentos serão criados automaticamente neste calendário.
              </p>
            </div>
          </div>
          <button className="btn btn-secondary" onClick={handleDisconnect} disabled={disconnecting}>
            <XCircle size={16} /> {disconnecting ? 'Desconectando...' : 'Desconectar'}
          </button>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <p style={{ color: 'var(--text-secondary)', margin: 0 }}>
                Sincronize seus agendamentos com o Google Calendar automaticamente.
              </p>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', margin: '0.3rem 0 0' }}>
                Será criado/usado o calendário <strong>Sessões_Terapia</strong> na sua conta Google.
              </p>
            </div>
            <button
              className="btn btn-primary"
              onClick={handleConnect}
              disabled={connecting}
              style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', whiteSpace: 'nowrap' }}
            >
              <CalendarDays size={16} />
              {connecting ? 'Redirecionando...' : 'Conectar Google Calendar'}
            </button>
          </div>

          {configError && (
            <div style={{
              background: 'rgba(245, 158, 11, 0.1)',
              border: '1px solid var(--status-warning)',
              borderRadius: 'var(--radius-md)',
              padding: '0.875rem 1rem',
              fontSize: '0.875rem',
              color: 'var(--status-warning)',
              lineHeight: 1.5
            }}>
              <strong>Configuração necessária:</strong> {configError}
              <br />
              <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                Adicione <code>GOOGLE_CLIENT_ID</code> e <code>GOOGLE_CLIENT_SECRET</code> no arquivo <code>.env</code> do backend e reinicie o servidor.
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── 2FA Section ───────────────────────────────────────────────────────────────

function TwoFactorSection({ enabled, onStatusChange }: { enabled: boolean, onStatusChange: (status: boolean) => void }) {
  const [setup, setSetup] = useState<TotpSetupResult | null>(null);
  const [step, setStep] = useState<'idle' | 'setup' | 'disable'>('idle');
  const [token, setToken] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const toast = useToast();

  const handleSetup = async () => {
    try {
      setSubmitting(true);
      const res = await fetchApi<{ data: TotpSetupResult }>('/auth/2fa/setup', { method: 'POST' });
      setSetup(res.data);
      setStep('setup');
    } catch (err) {
      toast.error((err instanceof Error ? err.message : String(err)) || 'Erro ao iniciar configuração do 2FA.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setSubmitting(true);
      await fetchApi('/auth/2fa/verify', { method: 'POST', body: JSON.stringify({ token }) });
      toast.success('2FA ativado com sucesso! Guarde seus códigos de backup.');
      setStep('idle');
      setToken('');
      onStatusChange(true);
    } catch (err) {
      toast.error((err instanceof Error ? err.message : String(err)) || 'Código inválido.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDisable = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setSubmitting(true);
      await fetchApi('/auth/2fa/disable', { method: 'POST', body: JSON.stringify({ token }) });
      toast.success('2FA desativado.');
      setStep('idle');
      setToken('');
      setSetup(null);
      onStatusChange(false);
    } catch (err) {
      toast.error((err instanceof Error ? err.message : String(err)) || 'Código inválido.');
    } finally {
      setSubmitting(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success('Copiado!');
  };

  return (
    <div className="card profile-card mt-4">
      <div className="flex items-center gap-2 mb-4">
        <Shield size={20} style={{ color: 'var(--brand-primary)' }} />
        <h3 className="text-h3" style={{ margin: 0 }}>Autenticação em 2 Fatores (2FA)</h3>
      </div>

      {step === 'idle' && (
        <div className="flex items-center justify-between">
          <p style={{ color: 'var(--text-secondary)', maxWidth: '420px' }}>
            Adicione uma camada extra de segurança usando um aplicativo como Google Authenticator ou Authy.
          </p>
          <div className="flex gap-2">
            {!enabled ? (
              <button className="btn btn-primary" onClick={handleSetup} disabled={submitting}>
                <ShieldCheck size={16} /> Ativar 2FA
              </button>
            ) : (
              <button className="btn btn-secondary" onClick={() => setStep('disable')}>
                <ShieldOff size={16} /> Desativar
              </button>
            )}
          </div>
        </div>
      )}

      {step === 'setup' && setup && (
        <div>
          <p style={{ color: 'var(--text-secondary)', marginBottom: '1rem' }}>
            Escaneie o QR Code abaixo com seu app autenticador e insira o código gerado para confirmar.
          </p>
          <div style={{ display: 'flex', gap: '2rem', alignItems: 'flex-start', flexWrap: 'wrap' }}>
            <img src={setup.qrCodeDataUrl} alt="QR Code 2FA" style={{ width: 180, height: 180, borderRadius: 8, border: '1px solid var(--border-color)' }} />
            <div style={{ flex: 1, minWidth: '240px' }}>
              <div className="form-group mb-3">
                <label className="form-label">Chave Manual</label>
                <div className="flex gap-2">
                  <input readOnly className="form-control" value={setup.secret} style={{ fontFamily: 'monospace', fontSize: '0.85rem' }} />
                  <button type="button" className="btn btn-secondary" onClick={() => copyToClipboard(setup.secret)}>
                    <Copy size={14} />
                  </button>
                </div>
              </div>
              <div className="form-group mb-3">
                <label className="form-label">Códigos de Backup (guarde em local seguro)</label>
                <div className="backup-codes-grid">
                  {setup.backupCodes.map(code => (
                    <code key={code} className="backup-code">{code}</code>
                  ))}
                </div>
              </div>
              <form onSubmit={handleVerify}>
                <div className="form-group">
                  <label className="form-label">Código do App *</label>
                  <input required type="text" className="form-control" placeholder="000000"
                    value={token} onChange={e => setToken(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    maxLength={6} disabled={submitting} style={{ letterSpacing: '0.4rem', textAlign: 'center', fontSize: '1.25rem' }} />
                </div>
                <div className="flex gap-2 mt-3">
                  <button type="button" className="btn btn-secondary" onClick={() => setStep('idle')} disabled={submitting}>Cancelar</button>
                  <button type="submit" className="btn btn-primary" disabled={submitting || token.length < 6}>
                    {submitting ? 'Verificando...' : 'Confirmar e Ativar'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {step === 'disable' && (
        <form onSubmit={handleDisable}>
          <p style={{ color: 'var(--text-secondary)', marginBottom: '1rem' }}>
            Insira o código atual do seu app autenticador para desativar o 2FA.
          </p>
          <div className="form-group" style={{ maxWidth: '280px' }}>
            <label className="form-label">Código 2FA *</label>
            <input required type="text" className="form-control" placeholder="000000"
              value={token} onChange={e => setToken(e.target.value.replace(/\D/g, '').slice(0, 6))}
              maxLength={6} disabled={submitting} style={{ letterSpacing: '0.4rem', textAlign: 'center' }} autoFocus />
          </div>
          <div className="flex gap-2 mt-3">
            <button type="button" className="btn btn-secondary" onClick={() => { setStep('idle'); setToken(''); }} disabled={submitting}>Cancelar</button>
            <button type="submit" className="btn btn-danger" disabled={submitting || token.length < 6}>
              {submitting ? 'Desativando...' : 'Desativar 2FA'}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
