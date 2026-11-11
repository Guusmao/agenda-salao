// ==========================================
// Authentication - Lógica de Identidade
// ==========================================

(function (window) {
  'use strict';

  const Auth = {
    // Chave para o localStorage
    STORAGE_KEY: 'agendai_salao_user',

    /**
     * Tenta encontrar o usuário pelo telefone no Supabase
     * e salva na sessão local se encontrado.
     */
    async login(telefone) {
      if (!telefone) return { error: 'Telefone inválido' };

      try {
        // buscar_cliente procura no cadastro e, se não achar, no histórico de agendamentos
        const { data: rows, error } = await window.db.rpc('buscar_cliente', { p_telefone: telefone });
        const data = rows && rows[0];

        if (error || !data) {
          return { error: 'Usuário não encontrado' };
        }

        this.saveSession(data.nome, data.telefone);
        return { success: true, user: data };
      } catch (err) {
        console.error('Login error:', err);
        return { error: 'Erro de conexão' };
      }
    },

    /**
     * Registra ou atualiza um usuário no banco de dados
     * e salva na sessão local.
     */
    async register(nome, telefone) {
      if (!nome || !telefone) return { error: 'Nome e telefone são obrigatórios' };
      
      try {
        const { data: rows, error } = await window.db.rpc('salvar_cliente', {
          p_nome: nome,
          p_telefone: telefone
        });
        const data = rows && rows[0];

        if (error) {
          console.error('Register error:', error);
          return { error: 'Erro ao salvar dados: ' + error.message };
        }

        this.saveSession(data.nome, data.telefone);
        return { success: true, user: data };
      } catch (err) {
        console.error('Registration error:', err);
        return { error: 'Erro de conexão' };
      }
    },

    /**
     * Salva os dados do usuário no localStorage
     */
    saveSession(nome, telefone) {
      const userData = { nome, telefone };
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(userData));
      
      // Despachar evento para que outros scripts saibam da mudança
      window.dispatchEvent(new CustomEvent('auth-changed', { detail: userData }));
    },

    /**
     * Remove os dados do usuário do localStorage (Logout)
     */
    logout() {
      localStorage.removeItem(this.STORAGE_KEY);
      window.dispatchEvent(new CustomEvent('auth-changed', { detail: null }));
    },

    /**
     * Retorna os dados do usuário atual (se houver)
     */
    getUser() {
      const data = localStorage.getItem(this.STORAGE_KEY);
      return data ? JSON.parse(data) : null;
    },

    /**
     * Verifica se o usuário está logado
     */
    isLoggedIn() {
      return !!this.getUser();
    }
  };

  // Exportar para o escopo global
  window.Auth = Auth;

})(window);
