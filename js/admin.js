// ==========================================
// Admin Panel - Lógica
// ==========================================

(function () {
  'use strict';

  // --- DOM Variables ---
  let agendamentosBody, emptyState, tableEl, filtroData, btnLimparFiltro, btnRefresh;
  let statAgendados, statRealizados, statCancelados, statHoje;
  let statRealizadosMes, statAgendadosMes, statCanceladosMes, statFaturamento;
  let tableView, crmView, cancelledView;
  let btnViewTable, btnViewCRM, btnViewCancelled, btnViewClientes, clientesView, btnViewServicos, servicosAdminView, btnViewFuncionamento, funcionamentoView;
  let cancelledGrid, cancelledEmptyState;
  let modalBookingId, modalTitle, cardAgendadosTotal;
  let btnBloquearHorario, adminHorariosContainer, adminTimeSlotsGrid, btnCloseAdminHorarios;

  // Dados em cache para renderização rápida
  let currentAgendamentos = [];
  let modalMode = 'new'; // 'new' ou 'edit'
  let editingId = null;
  let currentStatusFilter = null;

  // --- Preços dos Serviços ---
  const PRECOS_SERVICOS = window.APP_CONFIG.precos;

  /**
   * Captura referências do DOM para uso em todo o script
   */
  function cacheDOM() {
    agendamentosBody = document.getElementById('agendamentosBody');
    emptyState = document.getElementById('emptyState');
    tableEl = document.getElementById('agendamentosTable');
    filtroData = document.getElementById('filtroData');
    btnLimparFiltro = document.getElementById('btnLimparFiltro');
    btnRefresh = document.getElementById('btnRefresh');
    statAgendados = document.getElementById('statAgendados');
    statRealizados = document.getElementById('statRealizados');
    statCancelados = document.getElementById('statCancelados');
    statHoje = document.getElementById('statHoje');
    
    statRealizadosMes = document.getElementById('statRealizadosMes');
    statAgendadosMes = document.getElementById('statAgendadosMes');
    statCanceladosMes = document.getElementById('statCanceladosMes');
    statFaturamento = document.getElementById('statFaturamento');

    tableView = document.getElementById('tableView');
    crmView = document.getElementById('crmView');
    cancelledView = document.getElementById('cancelledView');
    btnViewTable = document.getElementById('btnViewTable');
    btnViewCRM = document.getElementById('btnViewCRM');
    btnViewCancelled = document.getElementById('btnViewCancelled');
    btnViewClientes = document.getElementById('btnViewClientes');
    clientesView = document.getElementById('clientesView');
    btnViewServicos = document.getElementById('btnViewServicos');
    servicosAdminView = document.getElementById('servicosAdminView');
    btnViewFuncionamento = document.getElementById('btnViewFuncionamento');
    funcionamentoView = document.getElementById('funcionamentoView');
    cancelledGrid = document.getElementById('cancelledGrid');
    cancelledEmptyState = document.getElementById('cancelledEmptyState');

    modalBookingId = document.getElementById('modalBookingId');
    modalTitle = document.getElementById('modalTitle');
    cardAgendadosTotal = document.getElementById('cardAgendadosTotal');

    btnBloquearHorario = document.getElementById('btnBloquearHorario');
    adminHorariosContainer = document.getElementById('adminHorariosContainer');
    adminTimeSlotsGrid = document.getElementById('adminTimeSlotsGrid');
    btnCloseAdminHorarios = document.getElementById('btnCloseAdminHorarios');
  }

  // --- Init ---
  function init() {
    cacheDOM();
    
    const adminLogin = document.getElementById('adminLogin');
    const adminDashboard = document.getElementById('adminDashboard');
    const adminLoginForm = document.getElementById('adminLoginForm');

    function mostrarLogin() {
      localStorage.removeItem('adminAuth');
      localStorage.removeItem('adminNome');
      if (adminLogin) adminLogin.style.display = 'flex';
      if (adminDashboard) adminDashboard.style.display = 'none';
    }

    // Só entra no painel quem fez login e está cadastrado na tabela "admins".
    // O banco confere isso de novo em cada consulta, então esta checagem é só visual.
    // Logo depois do login o token novo pode demorar um instante para valer
    // (e o banco pode estar "acordando"), então tenta algumas vezes antes de recusar.
    async function conferirAdmin(tentativas) {
      for (let i = 0; i < tentativas; i++) {
        try {
          if (i > 0) {
            await new Promise(r => setTimeout(r, 700 * i));
            try { await window.db.auth.getSession(); } catch (e) {}
          }
          const { data, error } = await window.db.rpc('is_admin');
          if (!error && data === true) return true;
        } catch (e) {}
      }
      return false;
    }

    async function entrarSeForAdmin(mostrarErro) {
      const isAdmin = await conferirAdmin(mostrarErro ? 5 : 3);
      const error = null;
      if (!error && isAdmin === true) {
        localStorage.setItem('adminAuth', 'true');
        try {
          const { data: sess } = await window.db.auth.getSession();
          const nome = sess && sess.user && (sess.user.name || sess.user.email);
          if (nome) localStorage.setItem('adminNome', nome);
        } catch (e) {}
        window.dispatchEvent(new CustomEvent('auth-changed'));
        showDashboard();
        return true;
      }
      if (mostrarErro) showToast('Esta conta não tem acesso ao painel.', 'error');
      await window.db.auth.signOut();
      mostrarLogin();
      return false;
    }

    mostrarLogin();
    window.db.auth.getSession().then(({ data }) => {
      if (data && data.session) entrarSeForAdmin(false);
    }).catch(() => {});

    if (adminLoginForm) {
      adminLoginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = document.getElementById('adminUser').value.trim();
        const password = document.getElementById('adminPass').value;
        const botao = adminLoginForm.querySelector('button[type="submit"]');
        const textoBotao = botao ? botao.textContent : '';
        if (botao) { if (botao.disabled) return; botao.disabled = true; botao.textContent = 'Entrando...'; }
        try {
          const { error } = await window.db.auth.signIn.email({ email, password });
          if (error) {
            showToast('E-mail ou senha incorretos.', 'error');
            return;
          }
          if (await entrarSeForAdmin(true)) showToast('Autenticado com sucesso!', 'success');
        } catch (err) {
          showToast('Não foi possível conectar. Tente de novo.', 'error');
        } finally {
          if (botao) { botao.disabled = false; botao.textContent = textoBotao; }
        }
      });
    }

    initCriarSenha(adminLoginForm, entrarSeForAdmin);
  }

  // --- Olhinho para mostrar/ocultar senha ---
  document.querySelectorAll('.btn-olho').forEach((btn) => {
    btn.addEventListener('click', () => {
      const input = document.getElementById(btn.dataset.alvo);
      const mostrar = input.type === 'password';
      input.type = mostrar ? 'text' : 'password';
      btn.classList.toggle('ativo', mostrar);
      btn.setAttribute('aria-label', mostrar ? 'Ocultar senha' : 'Mostrar senha');
    });
  });

  // --- Primeiro acesso: cria a conta na tela (sem depender de e-mail) ---
  function initCriarSenha(loginForm, entrarSeForAdmin) {
    const senhaForm = document.getElementById('adminSenhaForm');
    const btnAbrir = document.getElementById('btnCriarSenha');
    if (!senhaForm || !btnAbrir) return;

    const emailInput = document.getElementById('senhaEmail');

    function mostrar(formConta) {
      loginForm.hidden = formConta;
      senhaForm.hidden = !formConta;
    }

    btnAbrir.addEventListener('click', () => {
      emailInput.value = document.getElementById('adminUser').value.trim();
      mostrar(true);
    });
    document.getElementById('btnVoltarLogin').addEventListener('click', () => mostrar(false));

    senhaForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const name = document.getElementById('contaNome').value.trim();
      const email = emailInput.value.trim();
      const password = document.getElementById('senhaNova').value;
      if (!name || !email) { showToast('Preencha nome e e-mail.', 'warning'); return; }
      if (password.length < 8) { showToast('A senha precisa ter pelo menos 8 caracteres.', 'warning'); return; }

      const { error } = await window.db.auth.signUp.email({ email, password, name });
      if (error) {
        const jaExiste = /exist|already/i.test(error.message || '');
        showToast(jaExiste ? 'Esse e-mail já tem conta. Entre com sua senha.' : 'Não foi possível criar a conta: ' + error.message, 'error');
        return;
      }

      document.getElementById('adminUser').value = email;
      document.getElementById('adminPass').value = '';
      mostrar(false);
      if (await entrarSeForAdmin(false)) {
        showToast('Conta criada! Bem-vindo ao painel.', 'success');
      } else {
        showToast('Conta criada! Assim que o acesso for liberado, entre com seu e-mail e senha.', 'success');
      }
    });
  }

  // --- Modal DOM ---
  const modalOverlay = document.getElementById('modalOverlay');
  const btnCancelarDia = document.getElementById('btnCancelarDia');
  const btnLimparDados = document.getElementById('btnLimparDados');
  const btnBloquearDia = document.getElementById('btnBloquearDia');
  const diaBloqueadoBadge = document.getElementById('diaBloqueadoBadge');
  const diaBloqueadoTexto = document.getElementById('diaBloqueadoTexto');
  const btnNovaReserva = document.getElementById('btnNovaReserva');
  const btnFecharModal = document.getElementById('btnFecharModal');
  const btnCancelarModal = document.getElementById('btnCancelarModal');
  const formNovaReserva = document.getElementById('formNovaReserva');
  const modalData = document.getElementById('modalData');
  const modalHorario = document.getElementById('modalHorario');
  const modalTelefone = document.getElementById('modalTelefone');

  const CFG = window.APP_CONFIG;
  const HORARIOS_DISPONIVEIS = CFG.horarios;
  const faixa = ag => `${ag.horario}–${CFG.horaFim(ag.horario, ag.duracao_min)}`;
  const VARIOS_PROFISSIONAIS = window.APP_CONFIG.temVariosProfissionais;
  const modalProfissional = document.getElementById('modalProfissional');

  // Mesmo critério do banco: ocupado se o profissional já tem cliente ou se o horário foi bloqueado para todos
  function conflita(ag, profissional) {
    return !VARIOS_PROFISSIONAIS || !ag.profissional || !profissional || ag.profissional === profissional;
  }

  function showDashboard() {
    const adminLogin = document.getElementById('adminLogin');
    const adminDashboard = document.getElementById('adminDashboard');
    
    if (adminLogin) adminLogin.style.display = 'none';
    if (adminDashboard) adminDashboard.style.display = 'block';

    const today = getLocalDateString();
    filtroData.value = today;
    
    loadAgendamentos(today);
    loadStats();
    verificarBloqueio(today);

    filtroData.addEventListener('change', () => {
      loadAgendamentos(filtroData.value);
      if (filtroData.value) verificarBloqueio(filtroData.value);
      else ocultarBadgeBloqueio();
    });
    btnLimparFiltro.addEventListener('click', () => {
      filtroData.value = '';
      currentStatusFilter = null;
      loadAgendamentos();
      ocultarBadgeBloqueio();
    });
    btnRefresh.addEventListener('click', () => {
      currentStatusFilter = null;
      loadAgendamentos(filtroData.value || null);
      loadStats();
      if (filtroData.value) verificarBloqueio(filtroData.value);
      showToast('Dados atualizados!', 'success');
    });

    // --- Realtime Subscription ---
    initRealtime();

    // --- Cancel Day ---
    btnCancelarDia.addEventListener('click', cancelarDia);

    // --- Block/Unblock Day ---
    btnBloquearDia.addEventListener('click', toggleBloqueio);

    // --- Clear All Data ---
    if (btnLimparDados) btnLimparDados.addEventListener('click', limparTodosDados);

    // --- Confirm All Overdue ---
    const btnConfirmarVencidos = document.getElementById('btnConfirmarVencidos');
    if (btnConfirmarVencidos) btnConfirmarVencidos.addEventListener('click', confirmarTodosVencidos);

    // --- Manual Booking Modal ---
    btnNovaReserva.addEventListener('click', abrirModal);
    btnFecharModal.addEventListener('click', fecharModal);
    btnCancelarModal.addEventListener('click', fecharModal);
    modalOverlay.addEventListener('click', (e) => {
      if (e.target === modalOverlay) fecharModal();
    });
    formNovaReserva.addEventListener('submit', salvarReservaManual);
    modalTelefone.addEventListener('input', formatModalPhone);
    modalData.addEventListener('change', carregarHorariosModal);
    if (modalProfissional) modalProfissional.addEventListener('change', carregarHorariosModal);
    initModalServiceSelection();

    if (cardAgendadosTotal) {
      cardAgendadosTotal.addEventListener('click', () => {
        filtroData.value = '';
        currentStatusFilter = ['agendado', 'confirmado', 'em_atendimento'];
        loadAgendamentos().then(() => {
          switchView('table');
        });
      });
    }

    // --- View Toggle ---
    ligarMenuPainel();
    btnViewTable.addEventListener('click', () => switchView('table'));
    btnViewCRM.addEventListener('click', () => switchView('crm'));
    btnViewCancelled.addEventListener('click', () => switchView('cancelled'));
    if (btnViewClientes) btnViewClientes.addEventListener('click', () => switchView('clientes'));
    if (btnViewServicos) btnViewServicos.addEventListener('click', () => switchView('servicos'));
    if (btnViewFuncionamento) btnViewFuncionamento.addEventListener('click', () => switchView('funcionamento'));
    const fnSalvar = document.getElementById('fnSalvar');
    if (fnSalvar) fnSalvar.addEventListener('click', salvarFuncionamento);
    const fnAdd = document.getElementById('fnAddData');
    if (fnAdd) fnAdd.addEventListener('click', abrirDataExtra);
    const btnNovo = document.getElementById('btnNovoServico');
    if (btnNovo) btnNovo.addEventListener('click', novoServico);
    const busca = document.getElementById('clientesBusca');
    if (busca) busca.addEventListener('input', renderClientes);
    
    // --- CRM Drag & Drop Events ---
    initCRMDragEvents();

    // --- Hour Blocking ---
    btnBloquearHorario.addEventListener('click', () => {
      const isVisible = adminHorariosContainer.style.display === 'block';
      if (isVisible) {
        adminHorariosContainer.style.display = 'none';
      } else {
        const data = filtroData.value;
        if (!data) {
          showToast('Selecione uma data no filtro para gerenciar os horários.', 'warning');
          return;
        }
        adminHorariosContainer.style.display = 'block';
        renderAdminHorarios();
      }
    });

    btnCloseAdminHorarios.addEventListener('click', () => {
      adminHorariosContainer.style.display = 'none';
    });
  }

  function initCRMDragEvents() {
    const columns = document.querySelectorAll('.crm-column');
    columns.forEach(col => {
      col.addEventListener('dragover', (e) => {
        e.preventDefault();
        col.classList.add('drag-over');
      });

      col.addEventListener('dragleave', () => {
        col.classList.remove('drag-over');
      });

      col.addEventListener('drop', async (e) => {
        e.preventDefault();
        col.classList.remove('drag-over');
        const id = e.dataTransfer.getData('text/plain');
        const newStatus = col.dataset.status;
        
        if (id && newStatus) {
          const item = currentAgendamentos.find(a => a.id == id);
          if (item && item.status !== newStatus) {
            await updateStatus(id, newStatus);
          }
        }
      });
    });
  }

  // ==========================================
  // Render Admin Time Slots Grid
  // ==========================================
  function renderAdminHorarios() {
    if (!adminTimeSlotsGrid || adminHorariosContainer.style.display !== 'block') return;
    
    adminTimeSlotsGrid.innerHTML = '';
    const dataSelecionada = filtroData.value;
    if (!dataSelecionada) return;

    HORARIOS_DISPONIVEIS.forEach(horario => {
      const slotEl = document.createElement('div');
      slotEl.className = 'time-slot';
      slotEl.textContent = horario;

      // Atendimento ou bloqueio que ocupa este horário (pela duração)
      const ag = currentAgendamentos.find(a => a.status !== 'cancelado' &&
        CFG.choca(horario, CFG.intervaloMinutos || 30, [a]));
      
      if (ag) {
        if (ag.status === 'bloqueado') {
          slotEl.classList.add('blocked-by-admin'); // Classe CSS customizada
          slotEl.style.backgroundColor = '#e74c3c';
          slotEl.style.borderColor = '#c0392b';
          slotEl.style.color = '#fff';
          slotEl.title = 'Horário bloqueado manualmente. Clique para liberar.';
          slotEl.addEventListener('click', () => toggleBloqueioHorario(horario, ag.id));
        } else {
          // Ocupado por cliente
          slotEl.classList.add('occupied');
          slotEl.title = `Ocupado por: ${ag.nome} (${faixa(ag)})`;
        }
      } else {
        // Livre
        slotEl.addEventListener('click', () => toggleBloqueioHorario(horario, null));
      }

      adminTimeSlotsGrid.appendChild(slotEl);
    });
  }

  async function toggleBloqueioHorario(horario, existingId) {
    const data = filtroData.value;
    if (!data) return;

    if (existingId) {
      // Se já existe e é bloqueado, remover (desbloquear)
      const confirmed = await window.UI.confirm('Liberar Horário', `Deseja liberar o horário ${horario} do dia ${formatDateBR(data)}?`);
      if (!confirmed) return;

      try {
        const { error } = await window.db
          .from('agendamentos')
          .delete()
          .eq('id', existingId);

        if (error) {
          showToast('Erro ao liberar: ' + error.message, 'error');
          return;
        }
        showToast(`Horário ${horario} liberado com sucesso!`, 'success');
        loadAgendamentos(data);
      } catch (err) {
        showToast('Erro de conexão.', 'error');
      }
    } else {
      // Bloquear
      try {
        const { error } = await window.db
          .from('agendamentos')
          .insert([{
            servico: 'BLOQUEIO',
            nome: 'HORÁRIO BLOQUEADO',
            telefone: '-',
            data: data,
            horario: horario,
            duracao_min: CFG.intervaloMinutos || 30,
            status: 'bloqueado'
          }]);

        if (error) {
          showToast('Erro ao bloquear: ' + error.message, 'error');
          return;
        }
        showToast(`Horário ${horario} bloqueado com sucesso!`, 'success');
        loadAgendamentos(data);
      } catch (err) {
        showToast('Erro de conexão.', 'error');
      }
    }
  }

  const NOMES_SECAO = { table: 'Agenda', crm: 'Quadro CRM', cancelled: 'Cancelados', clientes: 'Clientes', servicos: 'Serviços e preços', funcionamento: 'Funcionamento' };

  // Menu lateral do painel (gaveta no celular) e menu de Ações
  function ligarMenuPainel() {
    const dash = document.getElementById('adminDashboard');
    const abrir = document.getElementById('btnAbrirSidenav');
    const fechar = document.getElementById('btnFecharSidenav');
    const fundo = document.getElementById('adminSidenavFundo');
    const setAberto = (v) => { if (dash) dash.classList.toggle('sidenav-aberta', v); };
    if (abrir) abrir.addEventListener('click', () => setAberto(true));
    if (fechar) fechar.addEventListener('click', () => setAberto(false));
    if (fundo) fundo.addEventListener('click', () => setAberto(false));
    document.querySelectorAll('.admin-sidenav .btn-toggle').forEach((b) =>
      b.addEventListener('click', () => { setAberto(false); window.scrollTo({ top: 0, behavior: 'smooth' }); }));

    const btnAcoes = document.getElementById('btnAcoes');
    const menuAcoes = document.getElementById('adminAcoesMenu');
    if (btnAcoes && menuAcoes) {
      const setMenu = (v) => { menuAcoes.classList.toggle('aberto', v); btnAcoes.setAttribute('aria-expanded', v ? 'true' : 'false'); };
      btnAcoes.addEventListener('click', (e) => { e.stopPropagation(); setMenu(!menuAcoes.classList.contains('aberto')); });
      menuAcoes.addEventListener('click', (e) => { if (e.target.closest('button')) setMenu(false); });
      document.addEventListener('click', (e) => { if (!e.target.closest('.admin-acoes')) setMenu(false); });
    }
    const mais = document.getElementById('btnStatsMais');
    const stats = document.querySelector('.admin-stats');
    if (mais && stats) mais.addEventListener('click', () => {
      const todos = stats.classList.toggle('todos');
      mais.textContent = todos ? 'Ver menos números ▴' : 'Ver mais números ▾';
    });
    if (dash) dash.dataset.view = 'table';
  }

  function switchView(view) {
    if (!tableView || !crmView || !cancelledView) return;
    const dash = document.getElementById('adminDashboard');
    if (dash) dash.dataset.view = view;
    const rotulo = document.getElementById('adminSecaoAtual');
    if (rotulo) rotulo.textContent = NOMES_SECAO[view] || 'Agenda';

    // Reset buttons
    [btnViewTable, btnViewCRM, btnViewCancelled, btnViewClientes, btnViewServicos, btnViewFuncionamento].forEach(btn => {
      if (btn) btn.classList.remove('active');
    });

    // Hide all
    tableView.style.display = 'none';
    crmView.style.display = 'none';
    cancelledView.style.display = 'none';
    if (clientesView) clientesView.style.display = 'none';
    if (servicosAdminView) servicosAdminView.style.display = 'none';
    if (funcionamentoView) funcionamentoView.style.display = 'none';

    if (view === 'table') {
      tableView.style.display = 'block';
      if (btnViewTable) btnViewTable.classList.add('active');
    } else if (view === 'crm') {
      crmView.style.display = 'block';
      if (btnViewCRM) btnViewCRM.classList.add('active');
      renderCRM(currentAgendamentos);
    } else if (view === 'cancelled') {
      cancelledView.style.display = 'block';
      if (btnViewCancelled) btnViewCancelled.classList.add('active');
      renderCancelled(currentAgendamentos);
    } else if (view === 'clientes' && clientesView) {
      clientesView.style.display = 'block';
      btnViewClientes.classList.add('active');
      carregarClientes();
    } else if (view === 'servicos' && servicosAdminView) {
      servicosAdminView.style.display = 'block';
      btnViewServicos.classList.add('active');
      carregarServicosAdmin();
    } else if (view === 'funcionamento' && funcionamentoView) {
      funcionamentoView.style.display = 'block';
      btnViewFuncionamento.classList.add('active');
      carregarFuncionamentoAdmin();
    }
  }

  // ==========================================
  // Funcionamento: dias, horários, sinal e datas extras
  // ==========================================
  const HORA_OK = /^([01][0-9]|2[0-3]):[0-5][0-9]$/;

  async function carregarFuncionamentoAdmin() {
    await CFG.carregarFuncionamento();
    const c = CFG.funcionamento || {};
    document.getElementById('fnDias').innerHTML = CFG.nomesDias.map((n, i) => `
      <label class="fn-dia"><input type="checkbox" value="${i}" ${CFG.diasSemana.includes(i) ? 'checked' : ''}> ${n.slice(0, 3)}</label>`).join('');
    document.getElementById('fnPrimeiro').value = c.primeiro_horario || CFG.primeiroHorario || '08:00';
    document.getElementById('fnUltimo').value = c.ultimo_horario || CFG.ultimoHorario || '22:00';
    document.getElementById('fnFechamento').value = c.fechamento || CFG.fechamento || '24:00';
    document.getElementById('fnIntervalo').value = String(c.intervalo_min || CFG.intervaloMinutos || 30);
    document.getElementById('fnSinal').value = c.valor_sinal != null ? Number(c.valor_sinal) : 50;
    document.getElementById('fnPix').value = c.chave_pix || '';
    document.getElementById('fnWhats').value = c.whatsapp || '';
    document.getElementById('fnRemarcar').value = c.horas_para_remarcar != null ? c.horas_para_remarcar : 24;
    await listarDatasExtras();
  }

  async function listarDatasExtras() {
    const ul = document.getElementById('fnDatas');
    try {
      const hoje = getLocalDateString();
      const { data } = await window.db.from('dias_abertos').select('id, data').gte('data', hoje).order('data', { ascending: true });
      ul.innerHTML = (data || []).length
        ? data.map(d => `<li><span>${formatDateBR(d.data)}</span> ${CFG.nomesDias[new Date(d.data + 'T12:00:00').getDay()]} <button type="button" class="sv-var-del fn-del" data-id="${d.id}" title="Fechar de novo">×</button></li>`).join('')
        : '<li>Nenhuma data extra.</li>';
      ul.querySelectorAll('.fn-del').forEach(b => b.addEventListener('click', async () => {
        await window.db.from('dias_abertos').delete().eq('id', b.dataset.id);
        listarDatasExtras();
      }));
    } catch (e) {
      ul.innerHTML = '<li>Não foi possível carregar.</li>';
    }
  }

  async function abrirDataExtra() {
    const data = document.getElementById('fnNovaData').value;
    if (!data) { showToast('Escolha a data.', 'warning'); return; }
    const { error } = await window.db.from('dias_abertos').insert([{ data }]);
    if (error) { showToast(error.message.includes('duplicate') ? 'Essa data já está aberta.' : 'Erro ao abrir a data.', 'error'); return; }
    showToast(`Dia ${formatDateBR(data)} aberto para agendamento!`, 'success');
    document.getElementById('fnNovaData').value = '';
    listarDatasExtras();
  }

  async function salvarFuncionamento() {
    const dias = [...document.querySelectorAll('#fnDias input:checked')].map(i => Number(i.value));
    const primeiro = document.getElementById('fnPrimeiro').value.trim();
    const ultimo = document.getElementById('fnUltimo').value.trim();
    const fechamento = document.getElementById('fnFechamento').value.trim();
    if (!HORA_OK.test(primeiro) || !HORA_OK.test(ultimo) || !(HORA_OK.test(fechamento) || fechamento === '24:00')) {
      showToast('Use o formato 08:00 nos horários (fechamento pode ser 24:00).', 'warning'); return;
    }
    if (ultimo < primeiro) { showToast('O último horário precisa ser depois do primeiro.', 'warning'); return; }
    const dados = {
      dias_semana: dias,
      primeiro_horario: primeiro,
      ultimo_horario: ultimo,
      fechamento,
      intervalo_min: Number(document.getElementById('fnIntervalo').value),
      valor_sinal: Number(document.getElementById('fnSinal').value || 0),
      horas_para_remarcar: Number(document.getElementById('fnRemarcar').value || 0),
      chave_pix: document.getElementById('fnPix').value.trim(),
      whatsapp: document.getElementById('fnWhats').value.trim(),
      updated_at: new Date().toISOString()
    };
    const { error } = await window.db.from('configuracoes').update(dados).eq('id', 1);
    if (error) { showToast('Erro ao salvar: ' + error.message, 'error'); return; }
    CFG.aplicarFuncionamento(dados);
    showToast('Funcionamento salvo!', 'success');
  }

  // ==========================================
  // Serviços e preços (editáveis pela dona)
  // ==========================================
  async function carregarServicosAdmin() {
    const lista = document.getElementById('servicosAdminLista');
    lista.innerHTML = '<p class="clientes-vazio">Carregando...</p>';
    await CFG.carregarServicos(true);
    const servicos = (CFG.todosServicosAdmin || []).flatMap(c => c.servicos.map(s => ({ ...s, categoria: c.nome })));
    if (!servicos.length) {
      lista.innerHTML = '<p class="clientes-vazio">Nenhum serviço cadastrado.</p>';
      return;
    }
    lista.innerHTML = servicos.map(s => {
      const vs = s.variacoes || [];
      const linhasVar = vs.map(v => `
        <div class="sv-var"><input class="form-input sv-var-rotulo" value="${escapeHTML(v.rotulo)}" placeholder="Ex.: Curto">
        <input class="form-input sv-var-preco" type="number" min="0" step="0.01" value="${escapeHTML(v.preco)}"><button type="button" class="sv-var-del" title="Tirar">×</button></div>`).join('');
      return `
      <details class="cliente-card sv-card" data-id="${s.id}">
        <summary>
          <span class="cliente-nome">${escapeHTML(s.nome)}${s.ativo ? '' : ' <span class="badge-niver">(desativado)</span>'}</span>
          <span class="cliente-meta">${escapeHTML(s.categoria)} · ${CFG.formatDuracao(s.duracao)} · comissão ${s.comissao}%</span>
        </summary>
        <div class="cliente-corpo">
          <label>Nome <input class="form-input sv-nome" value="${escapeHTML(s.nome)}"></label>
          <label>Categoria <input class="form-input sv-cat" value="${escapeHTML(s.categoria)}"></label>
          <label>Descrição <input class="form-input sv-desc" value="${escapeHTML(s.desc || '')}"></label>
          <div class="sv-linha">
            <label>Duração (minutos) <input class="form-input sv-dur" type="number" min="5" max="720" step="5" value="${s.duracao}"></label>
            <label>Comissão da auxiliar (%) <input class="form-input sv-com" type="number" min="0" max="100" step="0.5" value="${s.comissao}"></label>
          </div>
          <label>Preço único (deixe vazio se o preço é por comprimento) <input class="form-input sv-preco" type="number" min="0" step="0.01" value="${s.preco ?? ''}"></label>
          <div class="sv-vars"><span class="variacao-titulo">Preço por comprimento</span>${linhasVar}</div>
          <button type="button" class="btn btn-outline btn-sm sv-var-add">+ Comprimento</button>
          <div class="sv-checks">
            <label><input type="checkbox" class="sv-apartir" ${s.aPartirDe ? 'checked' : ''}> Mostrar "a partir de"</label>
            <label><input type="checkbox" class="sv-agendavel" ${s.agendavel ? 'checked' : ''}> Cliente pode agendar pelo link</label>
            <label><input type="checkbox" class="sv-ativo" ${s.ativo ? 'checked' : ''}> Ativo</label>
          </div>
          <div class="cliente-acoes"><button type="button" class="btn btn-primary btn-sm sv-salvar">Salvar</button></div>
        </div>
      </details>`;
    }).join('');

    lista.querySelectorAll('.sv-card').forEach(card => {
      const vars = card.querySelector('.sv-vars');
      const ligarDel = el => el.addEventListener('click', () => el.closest('.sv-var').remove());
      card.querySelectorAll('.sv-var-del').forEach(ligarDel);
      card.querySelector('.sv-var-add').addEventListener('click', () => {
        vars.insertAdjacentHTML('beforeend', `<div class="sv-var"><input class="form-input sv-var-rotulo" placeholder="Ex.: Curto"><input class="form-input sv-var-preco" type="number" min="0" step="0.01"><button type="button" class="sv-var-del" title="Tirar">×</button></div>`);
        ligarDel(vars.lastElementChild.querySelector('.sv-var-del'));
      });
      card.querySelector('.sv-salvar').addEventListener('click', () => salvarServico(card));
    });
  }

  async function salvarServico(card) {
    const v = sel => card.querySelector(sel).value.trim();
    const variacoes = [...card.querySelectorAll('.sv-var')].map(l => ({
      rotulo: l.querySelector('.sv-var-rotulo').value.trim(),
      preco: Number(l.querySelector('.sv-var-preco').value)
    })).filter(x => x.rotulo && x.preco > 0);
    const dados = {
      nome: v('.sv-nome'),
      categoria: v('.sv-cat') || 'Serviços',
      descricao: v('.sv-desc') || null,
      duracao_min: Number(v('.sv-dur')),
      comissao_pct: Number(v('.sv-com') || 0),
      preco: v('.sv-preco') === '' ? null : Number(v('.sv-preco')),
      variacoes,
      a_partir_de: card.querySelector('.sv-apartir').checked,
      agendavel: card.querySelector('.sv-agendavel').checked,
      ativo: card.querySelector('.sv-ativo').checked,
      updated_at: new Date().toISOString()
    };
    if (!dados.nome) { showToast('Informe o nome do serviço.', 'warning'); return; }
    if (!(dados.duracao_min >= 5 && dados.duracao_min <= 720)) { showToast('A duração precisa ficar entre 5 e 720 minutos.', 'warning'); return; }
    if (dados.preco == null && !variacoes.length) { showToast('Informe um preço único ou os preços por comprimento.', 'warning'); return; }
    try {
      const { error } = await window.db.from('servicos').update(dados).eq('id', Number(card.dataset.id));
      if (error) throw error;
      showToast('Serviço salvo!', 'success');
      carregarServicosAdmin();
    } catch (err) {
      showToast('Erro ao salvar: ' + (err.message || 'tente de novo'), 'error');
    }
  }

  async function novoServico() {
    try {
      const { error } = await window.db.from('servicos').insert([{
        nome: 'Novo serviço ' + Math.floor(Math.random() * 1000), categoria: 'Serviços', duracao_min: 60, preco: 0, ativo: false, ordem: 99
      }]);
      if (error) throw error;
      showToast('Serviço criado. Preencha e marque como ativo.', 'success');
      carregarServicosAdmin();
    } catch (err) {
      showToast('Erro ao criar: ' + (err.message || 'tente de novo'), 'error');
    }
  }

  // ==========================================
  // Clientes: histórico, aniversário e observações
  // ==========================================
  let listaClientes = [];
  const soDigitos = t => String(t || '').replace(/\D/g, '');

  async function carregarClientes() {
    const lista = document.getElementById('clientesLista');
    lista.innerHTML = '<p class="clientes-vazio">Carregando...</p>';
    try {
      const [{ data: cadastros, error: e1 }, { data: atendimentos, error: e2 }] = await Promise.all([
        window.db.from('clientes').select('telefone, nome, aniversario, observacoes'),
        window.db.from('agendamentos').select('telefone, nome, data, horario, servico, profissional, status')
          .neq('status', 'bloqueado').order('data', { ascending: false })
      ]);
      if (e1 || e2) throw (e1 || e2);

      // Junta pelo telefone (só os números), porque a mesma cliente pode ter digitado com ou sem máscara
      const porTel = new Map();
      (cadastros || []).forEach(c => porTel.set(soDigitos(c.telefone), { ...c, historico: [] }));
      (atendimentos || []).forEach(a => {
        const k = soDigitos(a.telefone);
        if (!k) return;
        if (!porTel.has(k)) porTel.set(k, { telefone: a.telefone, nome: a.nome, aniversario: null, observacoes: '', historico: [], semCadastro: true });
        porTel.get(k).historico.push(a);
      });
      listaClientes = [...porTel.values()].map(c => {
        const feitos = c.historico.filter(a => a.status === 'realizado');
        return { ...c, visitas: feitos.length, ultima: feitos[0] ? feitos[0].data : null };
      }).sort((a, b) => (b.ultima || '').localeCompare(a.ultima || '') || a.nome.localeCompare(b.nome));
      renderClientes();
    } catch (err) {
      lista.innerHTML = '<p class="clientes-vazio">Não foi possível carregar as clientes.</p>';
    }
  }

  function diasDesde(dataStr) {
    if (!dataStr) return null;
    return Math.floor((new Date(getLocalDateString() + 'T00:00:00') - new Date(dataStr + 'T00:00:00')) / 86400000);
  }

  function renderClientes() {
    const lista = document.getElementById('clientesLista');
    const termo = (document.getElementById('clientesBusca').value || '').trim().toLowerCase();
    const termoNum = soDigitos(termo);
    const filtradas = listaClientes.filter(c => !termo ||
      c.nome.toLowerCase().includes(termo) || (termoNum && soDigitos(c.telefone).includes(termoNum)));
    document.getElementById('clientesTotal').textContent = `${filtradas.length} cliente${filtradas.length === 1 ? '' : 's'}`;

    if (!filtradas.length) {
      lista.innerHTML = '<p class="clientes-vazio">Nenhuma cliente encontrada.</p>';
      return;
    }
    const hojeMD = getLocalDateString().slice(5);
    lista.innerHTML = filtradas.map((c, i) => {
      const dias = diasDesde(c.ultima);
      const niver = c.aniversario && c.aniversario.slice(5) === hojeMD;
      const hist = c.historico.slice(0, 10).map(a => `
        <li><span>${formatDateBR(a.data)} ${escapeHTML(a.horario)}</span> ${escapeHTML(a.servico)}${a.profissional ? ` · ${escapeHTML(a.profissional)}` : ''} <em class="st-${escapeHTML(a.status)}">${escapeHTML(a.status.replace('_', ' '))}</em></li>`).join('');
      return `
        <details class="cliente-card" data-i="${listaClientes.indexOf(c)}">
          <summary>
            <span class="cliente-nome">${escapeHTML(c.nome)}${niver ? ' <span class="badge-niver">🎂 aniversário hoje</span>' : ''}</span>
            <span class="cliente-meta">${escapeHTML(c.telefone)} · ${c.visitas} visita${c.visitas === 1 ? '' : 's'}${dias !== null ? ` · última há ${dias} dia${dias === 1 ? '' : 's'}` : ''}</span>
          </summary>
          <div class="cliente-corpo">
            <label>Aniversário <input type="date" class="form-input cli-niver" value="${escapeHTML(c.aniversario || '')}"></label>
            <label>Observações (alergias, preferências) <textarea class="form-input cli-obs" rows="2">${escapeHTML(c.observacoes || '')}</textarea></label>
            <div class="cliente-acoes">
              <button type="button" class="btn btn-primary btn-sm cli-salvar">Salvar</button>
              <a class="btn btn-outline btn-sm" target="_blank" rel="noopener" href="https://wa.me/55${soDigitos(c.telefone)}">WhatsApp</a>
            </div>
            <h4>Histórico</h4>
            <ul class="cliente-hist">${hist || '<li>Sem atendimentos ainda.</li>'}</ul>
          </div>
        </details>`;
    }).join('');

    lista.querySelectorAll('.cli-salvar').forEach(btn => btn.addEventListener('click', () => {
      const card = btn.closest('.cliente-card');
      salvarCliente(listaClientes[+card.dataset.i], card.querySelector('.cli-niver').value || null, card.querySelector('.cli-obs').value.trim());
    }));
  }

  async function salvarCliente(c, aniversario, observacoes) {
    try {
      const { error } = await window.db.from('clientes')
        .upsert({ telefone: c.telefone, nome: c.nome, aniversario, observacoes, updated_at: new Date().toISOString() }, { onConflict: 'telefone' });
      if (error) throw error;
      Object.assign(c, { aniversario, observacoes, semCadastro: false });
      showToast('Cliente salva!', 'success');
    } catch (err) {
      showToast('Erro ao salvar a cliente.', 'error');
    }
  }

  // --- Modal Service Selection Card Logic ---
  function initModalServiceSelection() {
    CFG.ligarSelecao('modalServiceSelection', document.getElementById('modalServico'), () => carregarHorariosModal());
  }

  // ==========================================
  // Cancel Entire Day
  // ==========================================
  async function cancelarDia() {
    const data = filtroData.value;
    if (!data) {
      showToast('Selecione uma data no filtro antes de cancelar o dia.', 'warning');
      return;
    }

    // Count how many agendado bookings exist for that day
    try {
      const { data: agendados, error } = await window.db
        .from('agendamentos')
        .select('id')
        .eq('data', data)
        .eq('status', 'agendado');

      if (error) {
        showToast('Erro ao verificar agendamentos: ' + error.message, 'error');
        return;
      }

      if (!agendados || agendados.length === 0) {
        showToast('Nenhum agendamento pendente para essa data.', 'warning');
        return;
      }

      const formattedDate = formatDateBR(data);
      const confirmed = await window.UI.confirm(
        'Cancelar Dia',
        `Deseja cancelar TODOS os ${agendados.length} agendamento(s) do dia ${formattedDate}?`,
        { type: 'danger', confirmText: 'Sim, Cancelar Todos' }
      );
      if (!confirmed) return;

      const ids = agendados.map(a => a.id);
      const { error: updateErr } = await window.db
        .from('agendamentos')
        .update({ status: 'cancelado' })
        .in('id', ids);

      if (updateErr) {
        showToast('Erro ao cancelar: ' + updateErr.message, 'error');
        return;
      }

      showToast(`${agendados.length} agendamento(s) cancelados com sucesso!`, 'success');
      loadAgendamentos(filtroData.value || null);
      loadStats();
    } catch (err) {
      showToast('Erro de conexão.', 'error');
    }
  }

  // ==========================================
  // Block / Unblock Day
  // ==========================================

  // Estado reativo do bloqueio para o dia filtrado
  let diaBloqueadoAtual = false;

  async function verificarBloqueio(data) {
    try {
      const { data: rows, error } = await window.db
        .from('dias_bloqueados')
        .select('id')
        .eq('data', data);

      if (error) {
        console.warn('Erro ao verificar bloqueio:', error.message);
        return;
      }

      diaBloqueadoAtual = rows && rows.length > 0;
      atualizarUIBloqueio(data, diaBloqueadoAtual);
    } catch (err) {
      console.warn('Erro de conexão ao verificar bloqueio.');
    }
  }

  function atualizarUIBloqueio(data, bloqueado) {
    const dataFormatada = formatDateBR(data);
    if (bloqueado) {
      // Badge visível
      diaBloqueadoBadge.style.display = 'flex';
      diaBloqueadoTexto.textContent = `${dataFormatada} está BLOQUEADO — nenhuma reserva será aceita`;
      // Botão vira "Desbloquear"
      btnBloquearDia.innerHTML = '🔓 Desbloquear Dia';
      btnBloquearDia.classList.remove('btn-lock');
      btnBloquearDia.classList.add('btn-unlock');
    } else {
      ocultarBadgeBloqueio();
    }
  }

  function ocultarBadgeBloqueio() {
    diaBloqueadoAtual = false;
    diaBloqueadoBadge.style.display = 'none';
    btnBloquearDia.innerHTML = '🔒 Bloquear Dia';
    btnBloquearDia.classList.remove('btn-unlock');
    btnBloquearDia.classList.add('btn-lock');
  }

  async function toggleBloqueio() {
    const data = filtroData.value;
    if (!data) {
      showToast('Selecione uma data no filtro primeiro.', 'warning');
      return;
    }

    const dataFormatada = formatDateBR(data);

    if (diaBloqueadoAtual) {
      // Desbloquear
      const confirmed = await window.UI.confirm(
        'Desbloquear Dia',
        `Deseja DESBLOQUEAR o dia ${dataFormatada}? Os clientes poderão fazer agendamentos neste dia.`
      );
      if (!confirmed) return;

      try {
        const { error } = await window.db
          .from('dias_bloqueados')
          .delete()
          .eq('data', data);

        if (error) {
          showToast('Erro ao desbloquear: ' + error.message, 'error');
          return;
        }

        showToast(`✅ Dia ${dataFormatada} desbloqueado com sucesso!`, 'success');
        ocultarBadgeBloqueio();
      } catch (err) {
        showToast('Erro de conexão.', 'error');
      }
    } else {
      // Bloquear
      const confirmed = await window.UI.confirm(
        'Bloquear Dia',
        `Deseja BLOQUEAR o dia ${dataFormatada}? Nenhum novo agendamento será aceito neste dia.`
      );
      if (!confirmed) return;

      try {
        const { error } = await window.db
          .from('dias_bloqueados')
          .insert([{ data }]);

        if (error) {
          // Se já existe (UNIQUE constraint), apenas mostra aviso
          if (error.code === '23505') {
            showToast(`O dia ${dataFormatada} já está bloqueado.`, 'warning');
            await verificarBloqueio(data);
            return;
          }
          showToast('Erro ao bloquear: ' + error.message, 'error');
          return;
        }

        showToast(`🔒 Dia ${dataFormatada} bloqueado com sucesso!`, 'success');
        atualizarUIBloqueio(data, true);
        diaBloqueadoAtual = true;
      } catch (err) {
        showToast('Erro de conexão.', 'error');
      }
    }
  }

  // ==========================================
  // Modal - Manual Booking
  // ==========================================
  function abrirModal(agData = null) {
    if (agData && agData.id) {
      modalMode = 'edit';
      editingId = agData.id;
      modalTitle.innerHTML = 'Editar <span class="gold">Reserva</span>';
      
      // Preencher campos
      document.getElementById('modalNome').value = agData.nome;
      document.getElementById('modalTelefone').value = agData.telefone;
      document.getElementById('modalData').value = agData.data;
      document.getElementById('modalBookingId').value = agData.id;
      
      // Marcar serviço
      CFG.marcarServico('modalServiceSelection', agData.servico);
      modalProfissional.value = agData.profissional || '';
      
      // Carregar horários e depois selecionar o atual
      carregarHorariosModal().then(() => {
        document.getElementById('modalHorario').value = agData.horario;
      });

    } else {
      modalMode = 'new';
      editingId = null;
      modalTitle.innerHTML = 'Nova <span class="gold">Reserva</span>';
      formNovaReserva.reset();
      CFG.marcarServico('modalServiceSelection', '');
      document.getElementById('modalBookingId').value = '';
      modalProfissional.value = '';
      
      // Set min date to today
      const today = getLocalDateString();
      modalData.setAttribute('min', today);
      modalData.value = today;
      carregarHorariosModal();
    }
    
    modalOverlay.style.display = 'flex';
    // Small delay for CSS animation
    requestAnimationFrame(() => modalOverlay.classList.add('active'));
  }

  function fecharModal() {
    modalOverlay.classList.remove('active');
    setTimeout(() => { modalOverlay.style.display = 'none'; }, 300);
  }

  function formatModalPhone(e) {
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

  async function carregarHorariosModal() {
    const dataSel = modalData.value;
    modalHorario.innerHTML = '<option value="" disabled selected>Selecione</option>';

    let ocupados = [];
    if (dataSel) {
      try {
        const { data, error } = await window.db
          .from('agendamentos')
          .select('id, horario, duracao_min, profissional')
          .eq('data', dataSel)
          .neq('status', 'cancelado');
        if (!error && data) {
          ocupados = data.filter(d => d.id !== editingId && conflita(d, modalProfissional.value));
        }
      } catch(e) { /* ignore */ }
    }

    const duracao = CFG.duracaoDe(document.getElementById('modalServico').value);
    HORARIOS_DISPONIVEIS.forEach(h => {
      const opt = document.createElement('option');
      opt.value = h;
      if (CFG.choca(h, duracao, ocupados)) {
        opt.textContent = h + ' (ocupado)';
        opt.disabled = true;
      } else if (CFG.paraMin(h) + duracao > CFG.fechamentoMin) {
        opt.textContent = h + ' (passa do fechamento)';
        opt.disabled = true;
      } else {
        opt.textContent = h;
      }
      modalHorario.appendChild(opt);
    });
  }

  async function salvarReservaManual(e) {
    e.preventDefault();
    const servico = document.getElementById('modalServico').value;
    const nome = document.getElementById('modalNome').value.trim();
    const telefone = modalTelefone.value.trim();
    const data = modalData.value;
    const horario = modalHorario.value;
    const profissional = VARIOS_PROFISSIONAIS ? modalProfissional.value : null;
    const id = document.getElementById('modalBookingId').value;

    if (!servico) { showToast('Selecione um serviço.', 'warning'); return; }
    if (!nome) { showToast('Informe o nome do cliente.', 'warning'); return; }
    if (!telefone || telefone.replace(/\D/g, '').length < 10) { showToast('Informe um telefone válido.', 'warning'); return; }
    if (!data) { showToast('Selecione a data.', 'warning'); return; }
    if (VARIOS_PROFISSIONAIS && !profissional) { showToast('Selecione o profissional.', 'warning'); return; }
    if (!horario) { showToast('Selecione um horário.', 'warning'); return; }

    try {
      // O serviço inteiro (pela duração) precisa caber sem bater em outro atendimento
      const duracao_min = CFG.duracaoDe(servico);
      const { data: conflito, error: checkErr } = await window.db.rpc('horario_conflita', {
        p_data: data,
        p_horario: horario,
        p_duracao: duracao_min,
        p_profissional: profissional,
        p_ignorar: id || null
      });
      if (checkErr) {
        showToast('Erro ao verificar horário: ' + checkErr.message, 'error');
        return;
      }
      if (conflito) {
        showToast('Esse horário bate com outro atendimento. Escolha outro.', 'error');
        carregarHorariosModal();
        return;
      }

      if (modalMode === 'edit') {
        const { error: updateErr } = await window.db
          .from('agendamentos')
          .update({ servico, nome, telefone, data, horario, duracao_min, profissional })
          .eq('id', id);

        if (updateErr) {
          showToast('Erro ao atualizar: ' + updateErr.message, 'error');
          return;
        }
        showToast('Reserva atualizada!', 'success');
      } else {
        const { error: insertErr } = await window.db
          .from('agendamentos')
          .insert([{ servico, nome, telefone, data, horario, duracao_min, profissional, status: 'agendado' }]);

        if (insertErr) {
          showToast('Erro ao criar: ' + insertErr.message, 'error');
          return;
        }
        showToast('Reserva criada!', 'success');
      }

      fecharModal();
      loadAgendamentos(filtroData.value || null);
      loadStats();
    } catch (err) {
      showToast('Erro de conexão.', 'error');
    }
  }

  // --- Get local date string ---
  function getLocalDateString(date) {
    const d = date || new Date();
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  // --- Verifica se um agendamento está vencido (data+hora já passaram) ---
  function isAgendamentoVencido(ag) {
    if (!['agendado', 'confirmado', 'em_atendimento'].includes(ag.status)) return false;
    const now = new Date();
    const [hh, mm] = ag.horario.split(':').map(Number);
    const agDateTime = new Date(ag.data + 'T00:00:00');
    agDateTime.setHours(hh, mm, 0, 0);
    return agDateTime < now;
  }

  // --- Format date for display (DD/MM/YYYY) ---
  function formatDateBR(dateStr) {
    if (!dateStr) return '-';
    const [y, m, d] = dateStr.split('-');
    return `${d}/${m}/${y}`;
  }

  // --- Format datetime for display ---
  function formatDateTimeBR(isoStr) {
    if (!isoStr) return '-';
    const d = new Date(isoStr);
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    const hours = String(d.getHours()).padStart(2, '0');
    const mins = String(d.getMinutes()).padStart(2, '0');
    return `${day}/${month}/${year} ${hours}:${mins}`;
  }

  // --- Load agendamentos ---
  async function loadAgendamentos(filterDate) {
    try {
      let query = window.db
        .from('agendamentos')
        .select('*')
        .order('data', { ascending: true })
        .order('horario', { ascending: true });

        if (filterDate) {
        query = query.eq('data', filterDate);
      }

      const { data, error } = await query;

      if (error) {
        console.error('Erro ao carregar agendamentos:', error);
        showToast('Erro ao carregar agendamentos.', 'error');
        return;
      }

      currentAgendamentos = data || [];
      renderTable(currentAgendamentos);
      renderAdminHorarios();
      
      // Se a view ativa for CRM, re-renderiza o CRM também
      if (crmView && crmView.style.display === 'block') {
        renderCRM(currentAgendamentos);
      }
      // Se a view ativa for Cancelados, re-renderiza o Cancelados
      if (cancelledView && cancelledView.style.display === 'block') {
        renderCancelled(currentAgendamentos);
      }
    } catch (err) {
      console.error('Load error:', err);
      showToast('Erro de conexão com o banco de dados.', 'error');
    }
  }

  // --- Load stats ---
  async function loadStats() {
    try {
      const today = getLocalDateString();
      const now = new Date();
      const currentMonth = now.getMonth(); // 0-11
      const currentYear = now.getFullYear();

      const { data: allData, error: allErr } = await window.db
        .from('agendamentos')
        .select('data, status, servico');

      if (!allErr && allData) {
        // Totais Gerais
        statAgendados.textContent = allData.filter(a => ['agendado','confirmado','em_atendimento'].includes(a.status)).length;
        statRealizados.textContent = allData.filter(a => a.status === 'realizado').length;
        statCancelados.textContent = allData.filter(a => a.status === 'cancelado').length;
        statHoje.textContent = allData.filter(a => a.data === today && ['agendado','confirmado','em_atendimento'].includes(a.status)).length;

        // Filtro do Mês Atual
        const agendamentosMes = allData.filter(a => {
          const d = new Date(a.data + 'T00:00:00');
          return d.getMonth() === currentMonth && d.getFullYear() === currentYear;
        });

        statRealizadosMes.textContent = agendamentosMes.filter(a => a.status === 'realizado').length;
        statAgendadosMes.textContent = agendamentosMes.filter(a => ['agendado','confirmado','em_atendimento'].includes(a.status)).length;
        statCanceladosMes.textContent = agendamentosMes.filter(a => a.status === 'cancelado').length;

        // Faturamento (apenas realizados)
        const faturamentoTotal = allData
          .filter(a => a.status === 'realizado')
          .reduce((acc, a) => {
            const preco = PRECOS_SERVICOS[a.servico] || 0;
            return acc + preco;
          }, 0);

        statFaturamento.textContent = `R$ ${faturamentoTotal.toFixed(2).replace('.', ',')}`;
      }
    } catch (err) {
      console.warn('Stats load failed:', err);
    }
  }

  // --- Render table ---
  function renderTable(agendamentos) {
    agendamentosBody.innerHTML = '';
    
    let filtered = agendamentos;
    if (currentStatusFilter) {
      filtered = agendamentos.filter(a => {
        const s = a.status || 'agendado';
        if (Array.isArray(currentStatusFilter)) {
          return currentStatusFilter.includes(s);
        }
        return s === currentStatusFilter;
      });
    }

    if (filtered.length === 0) {
      tableEl.style.display = 'none';
      emptyState.style.display = 'block';
      return;
    }

    tableEl.style.display = '';
    emptyState.style.display = 'none';

    filtered.forEach(ag => {
      const status = ag.status || 'agendado';
      const vencido = isAgendamentoVencido(ag);
      const tr = document.createElement('tr');
      if (vencido) tr.classList.add('row-vencido');
      tr.innerHTML = `
        <td data-label="Serviço"><span class="badge badge-service">${escapeHTML(ag.servico)}</span></td>
        <td data-label="Cliente">${escapeHTML(ag.nome)}${ag.profissional ? `<br><span class="badge-profissional">${escapeHTML(ag.profissional)}</span>` : ''}</td>
        <td data-label="Telefone">
          ${escapeHTML(ag.telefone)}
          <a href="https://wa.me/55${ag.telefone.replace(/\D/g, '')}" target="_blank" class="whatsapp-link" title="Conversar no WhatsApp" style="margin-left: 5px; display: inline-flex; align-items: center; vertical-align: middle;">
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#25D366" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>
          </a>
        </td>
        <td data-label="Data">${formatDateBR(ag.data)}</td>
        <td data-label="Horário"><strong>${escapeHTML(faixa(ag))}</strong>${vencido ? ' <span class="badge-vencido" title="Prazo vencido">VENCIDO</span>' : ''}</td>
        <td data-label="Status"><span class="badge-status badge-${status}">${({ agendado: 'AGUARDANDO SINAL', confirmado: 'SINAL PAGO' }[status] || status.replace('_', ' ').toUpperCase())}</span></td>
        <td data-label="Ações">
          <div style="display:flex; gap:5px; flex-wrap:wrap;">
            ${vencido ? `<button class="btn-action btn-confirmar-realizado" data-id="${ag.id}" title="Confirmar como Realizado">✅</button>` : ''}
            <button class="btn-action btn-edit" data-id="${ag.id}" title="Editar">✏️</button>
            ${podeLembrar(ag) ? `<a href="${linkLembrete(ag)}" target="_blank" rel="noopener" class="btn-action btn-lembrete" title="Enviar lembrete no WhatsApp">🔔</a>` : ''}
            <a href="${generateGoogleCalendarUrl(ag)}" target="_blank" class="btn-action btn-google" title="Adicionar ao Google Agenda">📅</a>
            <button class="btn-action btn-delete-perm" data-id="${ag.id}" title="Excluir Definitivamente">🗑️</button>
          </div>
        </td>
      `;

      tr.querySelector('.btn-edit').addEventListener('click', () => abrirModal(ag));
      tr.querySelector('.btn-delete-perm').addEventListener('click', () => excluirAgendamento(ag.id));
      tr.querySelector('.btn-confirmar-realizado')?.addEventListener('click', () => confirmarRealizado(ag.id));

      agendamentosBody.appendChild(tr);
    });
  }

  // --- Render CRM ---
  function renderCRM(agendamentos) {
    const columns = {
      'agendado': document.getElementById('crm-agendado'),
      'confirmado': document.getElementById('crm-confirmado'),
      'em_atendimento': document.getElementById('crm-em_atendimento'),
      'realizado': document.getElementById('crm-realizado')
    };

    // Limpa colunas
    Object.values(columns).forEach(col => col.innerHTML = '');

    // Filtra agendamentos ignorando cancelados no CRM (opcional, ou podemos ter coluna de cancelados)
    agendamentos.forEach(ag => {
      const status = ag.status || 'agendado';
      if (!columns[status]) return;

      const card = document.createElement('div');
      card.className = 'crm-card';
      card.setAttribute('draggable', 'true');
      
      // Drag start listener
      card.addEventListener('dragstart', (e) => {
        e.dataTransfer.setData('text/plain', ag.id);
        e.dataTransfer.effectAllowed = 'move';
        card.classList.add('dragging');
      });

      card.addEventListener('dragend', () => {
        card.classList.remove('dragging');
      });

      const nextStatusMap = {
        'agendado': 'confirmado',
        'confirmado': 'em_atendimento',
        'em_atendimento': 'realizado'
      };
      
      const nextActionLabel = {
        'agendado': 'Sinal recebido',
        'confirmado': 'Atender',
        'em_atendimento': 'Finalizar'
      };

      const nextStatus = nextStatusMap[status];

      card.innerHTML = `
        <div class="crm-card-header">
          <div class="crm-card-time">${escapeHTML(faixa(ag))}</div>
          <div class="crm-card-service-badge">${escapeHTML(ag.servico)}</div>
        </div>
        <div class="crm-card-client">${escapeHTML(ag.nome)}${ag.profissional ? ` <span class="badge-profissional">${escapeHTML(ag.profissional)}</span>` : ''}</div>
        <div class="crm-card-phone">
          <a href="https://wa.me/55${ag.telefone.replace(/\D/g, '')}" target="_blank" class="phone-link" title="Abrir WhatsApp">
            <span class="phone-icon">
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/>
              </svg>
            </span>
            ${escapeHTML(ag.telefone)}
          </a>
        </div>
        ${podeLembrar(ag) ? `<a href="${linkLembrete(ag)}" target="_blank" rel="noopener" class="btn-crm-lembrete">🔔 Enviar lembrete no WhatsApp</a>` : ''}
        <div class="crm-card-footer">
          ${nextStatus ? `
            <button class="btn-crm-action btn-crm-next" data-id="${ag.id}" data-next="${nextStatus}">
              ${nextActionLabel[status].toUpperCase()} →
            </button>
          ` : '<div style="grid-column: 1 / -1; height: 0;"></div>'}
          <button class="btn-crm-action btn-crm-edit" data-id="${ag.id}">EDITAR</button>
          ${status === 'agendado' || status === 'confirmado' ? `
            <button class="btn-crm-action btn-crm-cancel" data-id="${ag.id}">CANCELAR</button>
          ` : `
            <button class="btn-crm-action btn-crm-delete-perm" data-id="${ag.id}">EXCLUIR</button>
          `}
        </div>
      `;

      card.querySelector('.btn-crm-edit').addEventListener('click', () => abrirModal(ag));
      card.querySelector('.btn-crm-delete-perm')?.addEventListener('click', () => excluirAgendamento(ag.id));
      card.querySelector('.btn-crm-next')?.addEventListener('click', () => updateStatus(ag.id, nextStatus));
      card.querySelector('.btn-crm-cancel')?.addEventListener('click', () => updateStatus(ag.id, 'cancelado'));

      columns[status].appendChild(card);
    });

    // Mostrar empty message se coluna vazia
    Object.entries(columns).forEach(([status, el]) => {
      if (el.innerHTML === '') {
        el.innerHTML = '<div style="text-align:center; padding:20px; color:var(--text-muted); font-size:0.8rem;">Vazio</div>';
      }
    });
  }

  // --- Render Cancelled ---
  function renderCancelled(agendamentos) {
    cancelledGrid.innerHTML = '';
    const cancelados = agendamentos.filter(a => a.status === 'cancelado');

    if (cancelados.length === 0) {
      cancelledGrid.style.display = 'none';
      cancelledEmptyState.style.display = 'block';
      return;
    }

    cancelledGrid.style.display = 'grid';
    cancelledEmptyState.style.display = 'none';

    cancelados.forEach(ag => {
      const card = document.createElement('div');
      card.className = 'crm-card';

      card.innerHTML = `
        <div class="crm-card-header">
          <div class="crm-card-time">${escapeHTML(faixa(ag))}</div>
          <div class="crm-card-service-badge">${escapeHTML(ag.servico)}</div>
        </div>
        <div class="crm-card-client">${escapeHTML(ag.nome)}${ag.profissional ? ` <span class="badge-profissional">${escapeHTML(ag.profissional)}</span>` : ''}</div>
        <div class="crm-card-phone">
          <a href="https://wa.me/55${ag.telefone.replace(/\D/g, '')}" target="_blank" class="phone-link" title="Abrir WhatsApp">
            <span class="phone-icon">
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/>
              </svg>
            </span>
            ${escapeHTML(ag.telefone)}
          </a>
        </div>
        <div class="crm-card-footer">
          <button class="btn-crm-action btn-crm-next" data-id="${ag.id}" style="background:rgba(52, 152, 219, 0.1); border-color:rgba(52, 152, 219, 0.3); color:#3498db;">
            REATIVAR
          </button>
          <button class="btn-crm-action btn-crm-edit" data-id="${ag.id}">EDITAR</button>
          <button class="btn-crm-action btn-crm-delete-perm" data-id="${ag.id}">EXCLUIR</button>
        </div>
      `;

      card.querySelector('.btn-crm-edit').addEventListener('click', () => abrirModal(ag));
      card.querySelector('.btn-crm-delete-perm').addEventListener('click', () => excluirAgendamento(ag.id));
      card.querySelector('.btn-crm-next')?.addEventListener('click', () => updateStatus(ag.id, 'agendado'));

      cancelledGrid.appendChild(card);
    });
  }

  // --- Update status ---
  async function updateStatus(id, newStatus) {
    const statusLabels = {
      'agendado': 'retroceder',
      'confirmado': 'confirmar',
      'em_atendimento': 'iniciar atendimento para',
      'realizado': 'concluir',
      'cancelado': 'cancelar'
    };
    const action = statusLabels[newStatus] || 'atualizar';
    const confirmed = await window.UI.confirm(
      'Confirmar Ação',
      `Deseja ${action} este agendamento?`
    );
    if (!confirmed) return;

    try {
      const { error } = await window.db
        .from('agendamentos')
        .update({ status: newStatus })
        .eq('id', id);

      if (error) {
        console.error('Erro Supabase:', error);
        showToast('Erro: ' + error.message, 'error');
        return;
      }

      showToast(`Status atualizado para ${newStatus}!`, 'success');
      loadAgendamentos(filtroData.value || null);
      loadStats();
    } catch (err) {
      showToast('Erro de conexão.', 'error');
    }
  }

  // ==========================================
  // Confirmar Agendamento Vencido como Realizado
  // ==========================================
  async function confirmarRealizado(id) {
    const confirmed = await window.UI.confirm(
      '✅ Confirmar Serviço Realizado',
      'Deseja confirmar este agendamento como REALIZADO? Ele será contabilizado nos serviços concluídos.',
      { confirmText: 'Sim, Confirmar' }
    );
    if (!confirmed) return;

    try {
      const { error } = await window.db
        .from('agendamentos')
        .update({ status: 'realizado' })
        .eq('id', id);

      if (error) {
        showToast('Erro ao confirmar: ' + error.message, 'error');
        return;
      }

      showToast('✅ Serviço confirmado como Realizado!', 'success');
      loadAgendamentos(filtroData.value || null);
      loadStats();
    } catch (err) {
      showToast('Erro de conexão.', 'error');
    }
  }

  // --- Confirmar TODOS os vencidos como Realizado ---
  async function confirmarTodosVencidos() {
    const vencidos = currentAgendamentos.filter(isAgendamentoVencido);

    if (vencidos.length === 0) {
      showToast('Nenhum agendamento vencido encontrado.', 'warning');
      return;
    }

    const confirmed = await window.UI.confirm(
      '✅ Confirmar Vencidos como Realizados',
      `Existem ${vencidos.length} agendamento(s) com prazo vencido. Deseja confirmar TODOS como REALIZADOS? Eles serão contabilizados nos serviços concluídos.`,
      { confirmText: `Confirmar ${vencidos.length} Agendamento(s)` }
    );
    if (!confirmed) return;

    try {
      const ids = vencidos.map(a => a.id);
      const { error } = await window.db
        .from('agendamentos')
        .update({ status: 'realizado' })
        .in('id', ids);

      if (error) {
        showToast('Erro ao confirmar vencidos: ' + error.message, 'error');
        return;
      }

      showToast(`✅ ${vencidos.length} agendamento(s) confirmados como Realizados!`, 'success');
      loadAgendamentos(filtroData.value || null);
      loadStats();
    } catch (err) {
      showToast('Erro de conexão.', 'error');
    }
  }

  // --- Excluir Agendamento ---
  async function excluirAgendamento(id) {
    const confirmed = await window.UI.confirm(
      'Excluir Agendamento',
      'ATENÇÃO: Deseja EXCLUIR DEFINITIVAMENTE este agendamento? Esta ação não pode ser desfeita.',
      { type: 'danger', confirmText: 'Excluir Definitivamente' }
    );
    if (!confirmed) return;

    try {
      const { error } = await window.db
        .from('agendamentos')
        .delete()
        .eq('id', id);

      if (error) {
        console.error('Erro Supabase:', error);
        showToast('Erro ao excluir: ' + error.message, 'error');
        return;
      }

      showToast('Agendamento excluído permanentemente!', 'success');
      loadAgendamentos(filtroData.value || null);
      loadStats();
    } catch (err) {
      showToast('Erro de conexão.', 'error');
    }
  }

  // ==========================================
  // Limpar Todos os Dados
  // ==========================================
  async function limparTodosDados() {
    // Primeira confirmação
    const step1 = await window.UI.confirm(
      '⚠️ Limpar Todos os Dados',
      'Você está prestes a APAGAR TODOS os agendamentos e dias bloqueados do sistema. Esta ação é IRREVERSÍVEL.',
      { type: 'danger', confirmText: 'Sim, quero limpar' }
    );
    if (!step1) return;

    // Segunda confirmação (segurança extra)
    const step2 = await window.UI.confirm(
      '🚨 CONFIRMAÇÃO FINAL',
      'TEM CERTEZA ABSOLUTA? Todos os dados de agendamentos, histórico e dias bloqueados serão excluídos permanentemente!',
      { type: 'danger', confirmText: 'CONFIRMAR EXCLUSÃO TOTAL' }
    );
    if (!step2) return;

    try {
      // Deletar todos os agendamentos
      const { error: errAg } = await window.db
        .from('agendamentos')
        .delete()
        .not('id', 'is', null);

      if (errAg) {
        showToast('Erro ao limpar agendamentos: ' + errAg.message, 'error');
        return;
      }

      // Deletar todos os dias bloqueados
      const { error: errBloq } = await window.db
        .from('dias_bloqueados')
        .delete()
        .not('id', 'is', null);

      if (errBloq) {
        showToast('Erro ao limpar dias bloqueados: ' + errBloq.message, 'error');
        return;
      }

      showToast('✅ Todos os dados foram limpos com sucesso!', 'success');
      currentAgendamentos = [];
      renderTable([]);
      loadStats();
      ocultarBadgeBloqueio();

      // Re-renderizar views ativas
      if (crmView && crmView.style.display === 'block') renderCRM([]);
      if (cancelledView && cancelledView.style.display === 'block') renderCancelled([]);
    } catch (err) {
      showToast('Erro de conexão ao limpar dados.', 'error');
    }
  }

  // --- Escape HTML ---
  function escapeHTML(str) {
    const div = document.createElement('div');
    div.textContent = str || '';
    return div.innerHTML;
  }

  // --- Toast ---
  function showToast(message, type = 'success') {
    if (window.UI) {
      window.UI.toast(message, type);
    }
  }

  // ==========================================
  // Realtime & Notifications
  // ==========================================
  function initRealtime() {
    // Pedir permissão para notificações
    if (Notification.permission === "default") {
      Notification.requestPermission().then(perm => {
        console.log('Realtime: Permissão de notificação definida como:', perm);
        if (perm === 'granted') showToast('Notificações ativadas!', 'success');
      });
    } else if (Notification.permission === "denied") {
      showToast('Notificações bloqueadas no navegador. Ative-as para receber alertas.', 'warning');
    }

    // Botão de teste
    const btnTest = document.getElementById('btnTestNotify');
    if (btnTest) {
      // Remover listeners antigos para evitar duplicidade
      const newBtn = btnTest.cloneNode(true);
      btnTest.parentNode.replaceChild(newBtn, btnTest);
      
      newBtn.addEventListener('click', () => {
        console.log('Realtime: Executando teste de notificação local...');
        notifyNewBooking({
          nome: 'CLIENTE TESTE',
          servico: 'Corte de Teste',
          data: getLocalDateString(),
          horario: '00:00'
        });
      });
    }

    // Confere novos agendamentos a cada 30 segundos
    let ultimoVisto = new Date().toISOString();
    setInterval(async () => {
      const { data, error } = await window.db
        .from('agendamentos')
        .select('*')
        .gt('created_at', ultimoVisto)
        .neq('status', 'bloqueado')
        .order('created_at', { ascending: true });
      if (error || !data || data.length === 0) return;
      ultimoVisto = data[data.length - 1].created_at;
      data.forEach(notifyNewBooking);
      loadAgendamentos(filtroData.value || null);
      loadStats();
    }, 30000);
  }

  function notifyNewBooking(booking) {
    const title = '🆕 Novo Agendamento!';
    const text = `${booking.nome} agendou ${booking.servico} para ${formatDateBR(booking.data)} às ${booking.horario}`;
    
    console.log('Notificando:', text);

    // 1. Notificação local do navegador (fallback se o push estiver aberto)
    if ('Notification' in window) {
      if (Notification.permission === 'granted') {
        // Preferir service worker para exibir (assim funciona mesmo minimizado)
        if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
          navigator.serviceWorker.ready.then(reg => {
            reg.showNotification(title, {
              body: text,
              icon: 'img/icon-192.png',
              badge: 'img/icon-192.png',
              vibrate: [200, 100, 200],
              tag: 'novo-agendamento',
              requireInteraction: true,
              actions: [
                { action: 'abrir', title: '📋 Ver Painel' },
                { action: 'fechar', title: '✕ Fechar' }
              ]
            });
          }).catch(() => {
            new Notification(title, { body: text, icon: 'img/icon-192.png' });
          });
        } else {
          new Notification(title, { body: text, icon: 'img/icon-192.png' });
        }
      } else if (Notification.permission !== 'denied') {
        Notification.requestPermission();
      }
    }

    // 3. Toast Interno (Sempre visível na tela)
    showToast(text, 'success');

    // 4. Alerta de confirmação para o teste manual
    if (booking.nome === 'CLIENTE TESTE') {
      window.UI.alert('Teste de Notificação', 'Se a notificação apareceu, está tudo certo. Deixe o painel aberto para receber os avisos de novos agendamentos.');
    }

    // 5. Som de alerta
    try {
      const audio = new Audio('https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3');
      audio.volume = 0.6;
      const playPromise = audio.play();
      if (playPromise !== undefined) {
        playPromise.catch(e => console.warn('Som bloqueado pelo navegador. Interaja com a página primeiro.', e));
      }
    } catch (e) {
      console.warn('Erro ao tocar som:', e);
    }
  }

  // --- Lembrete no WhatsApp ---
  function podeLembrar(ag) {
    const ativo = ['agendado', 'confirmado'].includes(ag.status || 'agendado');
    return ativo && (ag.telefone || '').replace(/\D/g, '').length >= 10;
  }

  function linkLembrete(ag) {
    const valores = {
      nome: (ag.nome || '').split(' ')[0],
      servico: ag.servico,
      data: formatDateBR(ag.data),
      horario: ag.horario,
      salao: window.APP_CONFIG.nome
    };
    const texto = window.APP_CONFIG.mensagemLembrete.replace(/\{(\w+)\}/g, (m, chave) => valores[chave] ?? m);
    return `https://wa.me/55${ag.telefone.replace(/\D/g, '')}?text=${encodeURIComponent(texto)}`;
  }

  function generateGoogleCalendarUrl(ag) {
    // Formatar data: YYYYMMDDTHHMMSS
    const datePart = ag.data.replace(/-/g, '');
    const timePart = ag.horario.replace(':', '');
    const start = `${datePart}T${timePart}00`;
    
    const end = `${datePart}T${CFG.horaFim(ag.horario, ag.duracao_min).replace(':', '')}00`;
    
    const text = encodeURIComponent(`Agendamento: ${ag.servico} - ${ag.nome}`);
    const details = encodeURIComponent(`Cliente: ${ag.nome}\nTelefone: ${ag.telefone}\nServiço: ${ag.servico}`);
    const location = encodeURIComponent(window.APP_CONFIG.nome);
    
    return `https://www.google.com/calendar/render?action=TEMPLATE&text=${text}&dates=${start}/${end}&details=${details}&location=${location}`;
  }

  // --- Start ---
  document.addEventListener('DOMContentLoaded', init);
})();
