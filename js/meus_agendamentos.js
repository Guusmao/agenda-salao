(function () {
  'use strict';

  // --- DOM Elements ---
  const form = document.getElementById('searchForm');
  const telefoneInput = document.getElementById('telefoneBusca');
  const btnSearch = document.getElementById('btnSearch');
  const resultsContainer = document.getElementById('resultsContainer');
  const toastContainer = document.getElementById('toastContainer');

  // --- Init ---
  function init() {
    if (telefoneInput) telefoneInput.addEventListener('input', formatPhone);
    if (form) form.addEventListener('submit', onSubmit);
    
    // Check if already logged in and auto-search
    checkAuthAndSearch();

    // Listen for identity changes
    window.addEventListener('auth-changed', checkAuthAndSearch);
  }

  function checkAuthAndSearch() {
    if (window.Auth && window.Auth.isLoggedIn()) {
      const user = window.Auth.getUser();
      if (telefoneInput) {
        telefoneInput.value = user.telefone || '';
        // Quando logado, o telefone é fixo para a busca
        telefoneInput.readOnly = true;
        
        // Trigger search automatically
        onSubmit(new Event('submit'));
      }
    } else {
      if (telefoneInput) {
        telefoneInput.value = '';
        telefoneInput.readOnly = false;
        resultsContainer.innerHTML = '';
      }
    }
  }

  // --- Phone formatting ---
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

  // --- Form submit ---
  async function onSubmit(e) {
    e.preventDefault();

    const telefone = telefoneInput.value.trim();

    if (!telefone || telefone.replace(/\D/g, '').length < 10) {
      showToast('Informe um telefone válido para buscar.', 'warning');
      telefoneInput.focus();
      return;
    }

    setLoading(true);
    resultsContainer.innerHTML = '';

    try {
      const { data, error } = await window.db.rpc('meus_agendamentos', { p_telefone: telefone });

      if (error) {
        showToast('Erro ao buscar agendamentos. Tente novamente.', 'error');
        console.error('Fetch error:', error);
      } else {
        renderResults(data);
      }
    } catch (err) {
      showToast('Erro de conexão com o servidor.', 'error');
      console.error('System error:', err);
    }

    setLoading(false);
  }

  // --- Render Results ---
  function escapeHTML(str) {
    const div = document.createElement('div');
    div.textContent = str || '';
    return div.innerHTML;
  }

  function renderResults(agendamentos) {
    if (!agendamentos || agendamentos.length === 0) {
      resultsContainer.innerHTML = `
        <div class="empty-message">
          Nenhum agendamento encontrado para este número.
        </div>
      `;
      return;
    }

    const todayStr = getLocalDateString();
    
    let html = '<div class="agendamentos-list">';
    
    agendamentos.forEach(item => {
      // Formata data de YYYY-MM-DD para DD/MM/YYYY
      const parts = item.data.split('-');
      const dataFormatada = parts.length === 3 ? `${parts[2]}/${parts[1]}/${parts[0]}` : item.data;
      
      const rawStatus = (item.status || '').toString().toLowerCase().trim();
      const status = rawStatus === '' ? 'agendado' : rawStatus;
      
      const isCanceled = status === 'cancelado';
      const isRealized = status === 'realizado';
      
      const isPast = item.data < todayStr;
      const isPastTime = isPast || (item.data === todayStr && isTimePast(item.horario));

      const cardClass = (isPastTime || isCanceled || isRealized) ? 'agendamento-card past' : 'agendamento-card';
      
      let statusBadge = '';
      if (isCanceled) {
        statusBadge = '<span class="badge-status badge-cancelado">Cancelado</span>';
      } else if (isRealized || isPastTime) {
        statusBadge = '<span class="badge-status badge-realizado">Finalizado</span>';
      } else if (status === 'em_atendimento') {
        statusBadge = '<span class="badge-status badge-atendimento">Em Atendimento</span>';
      } else if (status === 'confirmado') {
        statusBadge = '<span class="badge-status badge-confirmado">Confirmado</span>';
      } else {
        statusBadge = '<span class="badge-status badge-agendado">Agendado</span>';
      }

      let cancelBtnHtml = '';
      if (status === 'agendado' || status === 'confirmado') {
        cancelBtnHtml = `
          <button class="btn-user-cancel btn-cancelar" data-id="${item.id}">
             Cancelar Horário
          </button>`;
      }

      const calendarIcon = `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="18" x="3" y="4" rx="2" ry="2"/><line x1="16" x2="16" y1="2" y2="6"/><line x1="8" x2="8" y1="2" y2="6"/><line x1="3" x2="21" y1="10" y2="10"/></svg>`;
      const clockIcon = `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>`;

      html += `
        <div class="${cardClass}">
          <h4>
            <span class="service-name">${escapeHTML(item.servico)}</span>
            ${statusBadge}
          </h4>
          <div class="agendamento-details">
            <div class="agendamento-detail">
              <span class="detail-icon">${calendarIcon}</span>
              <span class="detail-label">Data:</span>
              <span class="detail-value">${dataFormatada}</span>
            </div>
            <div class="agendamento-detail">
              <span class="detail-icon">${clockIcon}</span>
              <span class="detail-label">Horário:</span>
              <span class="detail-value">${escapeHTML(item.horario)}${item.duracao_min ? `–${escapeHTML(window.APP_CONFIG.horaFim(item.horario, item.duracao_min))}` : ""}</span>
            </div>
            ${item.profissional ? `
            <div class="agendamento-detail">
              <span class="detail-icon">•</span>
              <span class="detail-label">Profissional:</span>
              <span class="detail-value">${escapeHTML(item.profissional)}</span>
            </div>` : ''}
          </div>
          ${cancelBtnHtml}
        </div>
      `;
    });

    html += '</div>';
    resultsContainer.innerHTML = html;

    // Add event listeners to buttons
    const cancelButtons = resultsContainer.querySelectorAll('.btn-cancelar');
    cancelButtons.forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = btn.getAttribute('data-id');
        await cancelarAgendamento(id);
      });
    });
  }

  // --- Cancel Appointment ---
  async function cancelarAgendamento(id) {
    if (window.UI && window.UI.confirm) {
      if (!(await window.UI.confirm('Cancelar Agendamento', 'Tem certeza que deseja cancelar este agendamento?', { type: 'danger' }))) return;
    } else {
      if (!confirm('Deseja cancelar este agendamento?')) return;
    }

    setLoading(true);

    try {
      const { data: cancelado, error } = await window.db.rpc('cancelar_meu_agendamento', {
        p_id: id,
        p_telefone: telefoneInput.value.trim()
      });

      if (error) {
        console.error('Erro ao cancelar:', error);
        showToast('Erro: ' + error.message, 'error');
      } else if (!cancelado) {
        showToast('Este agendamento não pode mais ser cancelado.', 'warning');
      } else {
        showToast('Agendamento cancelado com sucesso!', 'success');
        // Re-trigger search to refresh UI
        form.dispatchEvent(new Event('submit'));
      }
    } catch (err) {
      console.error('System error:', err);
      showToast('Erro de conexão com o servidor.', 'error');
    }

    setLoading(false);
  }

  // --- Get local date string (YYYY-MM-DD) ---
  function getLocalDateString(date) {
    const d = date || new Date();
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  // Check if a time HH:MM is in the past for today
  function isTimePast(horario) {
     if (!horario) return false;
     const now = new Date();
     const [h, m] = horario.split(':').map(Number);
     if (now.getHours() > h) return true;
     if (now.getHours() === h && now.getMinutes() > m) return true;
     return false;
  }

  // --- Loading state ---
  function setLoading(loading) {
    if (loading) {
      btnSearch.classList.add('loading');
      btnSearch.disabled = true;
    } else {
      btnSearch.classList.remove('loading');
      btnSearch.disabled = false;
    }
  }

  // --- Toast Notification ---
  function showToast(message, type = 'success') {
    if (window.UI) {
      window.UI.toast(message, type);
    }
  }

  // --- Start ---
  document.addEventListener('DOMContentLoaded', init);
})();
