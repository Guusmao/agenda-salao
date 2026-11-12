// ==========================================
// Authentication UI - Interface de Identidade
// ==========================================

(function () {
  'use strict';

  // --- DOM Elements ---
  const userProfile = document.getElementById('userProfile');
  const loginModalOverlay = document.getElementById('loginModalOverlay');
  const loginForm = document.getElementById('loginForm');
  const loginTelefone = document.getElementById('loginTelefone');
  const loginNome = document.getElementById('loginNome');
  const loginNameGroup = document.getElementById('loginNameGroup');
  const btnFecharLoginModal = document.getElementById('btnFecharLoginModal');
  const btnCancelarLoginModal = document.getElementById('btnCancelarLoginModal');
  const btnConfirmarLogin = document.getElementById('btnConfirmarLogin');
  const loginMessage = document.getElementById('loginMessage');

  function init() {
    updateNavbar();

    // Listen for auth changes
    window.addEventListener('auth-changed', updateNavbar);

    // Event Listeners for Modal
    if (btnFecharLoginModal) btnFecharLoginModal.addEventListener('click', closeLoginModal);
    if (btnCancelarLoginModal) btnCancelarLoginModal.addEventListener('click', closeLoginModal);
    if (loginForm) loginForm.addEventListener('submit', onLoginSubmit);
    if (loginTelefone) loginTelefone.addEventListener('input', formatPhone);

    // Global trigger for login (can be called from other scripts)
    window.openLoginModal = openLoginModal;
  }

  function openLoginModal() {
    loginForm.reset();
    loginNameGroup.style.display = 'none';
    if (loginMessage) {
        loginMessage.style.display = 'none';
        loginMessage.textContent = '';
    }
    loginModalOverlay.style.display = 'flex';
    requestAnimationFrame(() => loginModalOverlay.classList.add('active'));
  }

  function closeLoginModal() {
    loginModalOverlay.classList.remove('active');
    setTimeout(() => { 
        loginModalOverlay.style.display = 'none'; 
        loginNameGroup.style.display = 'none';
        if (loginMessage) loginMessage.style.display = 'none';
        btnConfirmarLogin.textContent = 'Acessar';
    }, 300);
  }

  async function onLoginSubmit(e) {
    e.preventDefault();
    const telefone = loginTelefone.value.trim();
    const nome = loginNome.value.trim();

    if (!telefone || telefone.replace(/\D/g, '').length < 10) {
      showToast('Informe um telefone válido.', 'warning');
      return;
    }

    setLoading(true);

    try {
      // Step 1: Check if user exists
      const { error, user } = await window.Auth.login(telefone);

      if (!error && user) {
        showToast(`Bem-vindo de volta, ${user.nome}!`, 'success');
        closeLoginModal();
        setLoading(false);
        return;
      }

      // Step 2: If user doesn't exist, ask for name (registration)
      if (loginNameGroup.style.display === 'none') {
        if (loginMessage) {
            loginMessage.innerHTML = `<strong>Número não identificado.</strong><br>Para agendar, precisamos que você crie um perfil rápido abaixo.`;
            loginMessage.classList.remove('error');
            loginMessage.style.display = 'block';
        }
        loginNameGroup.style.display = 'block';
        btnConfirmarLogin.textContent = 'Criar Perfil & Acessar';
        setLoading(false);
        
        // Focar no campo de nome automaticamente
        setTimeout(() => loginNome.focus(), 500);
        return;
      }

      // Step 3: Perform registration
      if (!nome) {
        showToast('Informe seu nome para completar o cadastro.', 'warning');
        setLoading(false);
        return;
      }

      const { error: regError, user: newUser } = await window.Auth.register(nome, telefone);
      if (regError) {
        showToast(regError, 'error');
      } else {
        showToast(`Olá, ${newUser.nome}! Cadastro realizado com sucesso.`, 'success');
        closeLoginModal();
      }

    } catch (err) {
      showToast('Erro ao processar identificação.', 'error');
    }

    setLoading(false);
  }

  function updateNavbar() {
    const user = window.Auth.getUser();
    const isAdmin = localStorage.getItem('adminAuth') === 'true';
    
    if (!userProfile) return;

    if (isAdmin || user) {
      const name = isAdmin ? (localStorage.getItem('adminNome') || 'Administrador') : user.nome;
      const initials = name
        ? name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()
        : '?';
      
      const roleBadge = isAdmin ? `<span style="font-size: 0.65rem; background: var(--gold-primary); color: var(--on-accent); padding: 1px 5px; border-radius: 4px; margin-left: 6px; font-weight: 800; vertical-align: middle;">ADMIN</span>` : '';

      userProfile.innerHTML = `
        <div class="user-info-pill">
          <div class="user-avatar">${initials}</div>
          <span class="user-name">${name}${roleBadge}</span>
          <button class="btn-logout" id="btnLogout" title="Sair">
            ✕
          </button>
        </div>
      `;
      
      document.getElementById('btnLogout').addEventListener('click', () => {
        if (isAdmin) {
          localStorage.removeItem('adminAuth');
          localStorage.removeItem('adminNome');
          window.db.auth.signOut().catch(() => {});
        }
        window.Auth.logout();
        showToast('Sessão encerrada.', 'info');
        
        // Se estiver na página de admin, recarrega para voltar ao login
        if (window.location.hash === '#admin') {
          window.location.reload();
        }
      });
    } else {
      userProfile.innerHTML = `
        <button class="btn-login-trigger" id="btnLoginTrigger">
          <span class="icon">
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>
            </svg>
          </span> 
          <span class="text">Identificar-se</span>
        </button>
      `;
      document.getElementById('btnLoginTrigger').addEventListener('click', openLoginModal);
    }
  }

  function formatPhone(e) {
    let value = e.target.value.replace(/\D/g, '');
    if (value.length > 11) value = value.slice(0, 11);

    if (value.length > 6) {
      value = `(${value.slice(0, 2)}) ${value.slice(2, 7)}-${value.slice(7)}`;
    } else if (value.length > 2) {
      value = `(${value.slice(0, 2)}) ${value.slice(2)}`;
    } else if (value.length > 0) {
      value = `(${value}`;
    }
    e.target.value = value;
  }

  function setLoading(loading) {
    btnConfirmarLogin.disabled = loading;
    btnConfirmarLogin.classList.toggle('loading', loading);
  }

  function showToast(message, type = 'success') {
    if (window.agendamento && window.agendamento.showToast) {
       window.agendamento.showToast(message, type);
    } else if (window.UI && window.UI.toast) {
       window.UI.toast(message, type);
    } else {
        alert(message);
    }
  }

  document.addEventListener('DOMContentLoaded', init);
})();
