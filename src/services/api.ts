import { tokenStorage } from './auth';

const BASE_URL = import.meta.env.VITE_API_BASE_URL ?? '';

export async function fetchApi<T = unknown>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const url = `${BASE_URL}${endpoint}`;
  
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    ...options.headers,
  };

  const accessToken = tokenStorage.getAccessToken();
  if (accessToken) {
    (headers as Record<string, string>)['Authorization'] = `Bearer ${accessToken}`;
  }

  const response = await fetch(url, {
    ...options,
    headers,
  });

  // Se receber 401 e não for uma rota de auth direta, tentar o auto-refresh do token
  if (
    response.status === 401 &&
    endpoint !== '/auth/refresh' &&
    endpoint !== '/auth/login' &&
    endpoint !== '/auth/register'
  ) {
    const refreshToken = tokenStorage.getRefreshToken();
    if (!refreshToken) {
      tokenStorage.clearTokens();
      window.location.href = '/auth';
      throw new Error('Sessão expirada. Por favor, faça login novamente.');
    }

    try {
      const refreshResponse = await fetch(`${BASE_URL}/auth/refresh`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ refreshToken }),
      });

      if (!refreshResponse.ok) {
        throw new Error('Refresh failed');
      }

      const refreshData = await refreshResponse.json();
      
      if (refreshData.accessToken && refreshData.refreshToken) {
        tokenStorage.setTokens(refreshData.accessToken, refreshData.refreshToken);
        
        // Repetir a requisição original uma vez com os novos tokens
        const retryHeaders: HeadersInit = {
          ...headers,
          'Authorization': `Bearer ${refreshData.accessToken}`,
        };

        const retryResponse = await fetch(url, {
          ...options,
          headers: retryHeaders,
        });

        if (!retryResponse.ok) {
          let errorMsg = 'Erro na requisição';
          try {
            const errData = await retryResponse.json();
            errorMsg = errData.error || errData.message || errorMsg;
          } catch (e) {}
          throw new Error(errorMsg);
        }

        if (retryResponse.status === 204) {
          return null as unknown as T;
        }

        return retryResponse.json();
      } else {
        throw new Error('Invalid tokens received');
      }
    } catch (refreshError) {
      // Se o refresh também falhar, limpar os tokens e redirecionar
      tokenStorage.clearTokens();
      window.location.href = '/auth';
      throw new Error('Sessão expirada. Por favor, faça login novamente.');
    }
  }

  if (!response.ok) {
    let errorMsg = 'Erro na requisição';
    try {
      const data = await response.json();
      errorMsg = data.error || data.message || errorMsg;
    } catch (e) {
      // Ignore JSON parse error for non-JSON responses
    }
    throw new Error(errorMsg);
  }

  // Se a resposta for 204 No Content, não tentamos fazer o parse do JSON
  if (response.status === 204) {
    return null as unknown as T;
  }

  return response.json();
}
