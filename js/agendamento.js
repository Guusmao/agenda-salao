// ==========================================
// Agendamento - Lógica do Formulário
// ==========================================

(function () {
  'use strict';

  // --- Config ---
  const CFG = window.APP_CONFIG;
  const HORARIOS = CFG.horarios;
  const ANTECEDENCIA_MINIMA_HORAS = window.APP_CONFIG.antecedenciaMinimaHoras;

  // --- DOM Elements ---
  const form = document.getElementById('bookingForm');
  const servicoSelect = document.getElementById('servico');
  const nomeInput = document.getElementById('nome');
  const telefoneInput = document.getElementById('telefone');
  const dataInput = document.getElementById('data');
  const timeSlotsGrid = document.getElementById('timeSlotsGrid');
  const horarioHidden = document.getElementById('horarioSelecionado');
  const btnSubmit = document.getElementById('btnSubmit');
  const toastContainer = document.getElementById('toastContainer');

  const VARIOS_PROFISSIONAIS = window.APP_CONFIG.temVariosProfissionais;
  const profissionalHidden = document.getElementById('profissional');

  let selectedSlot = null;
  let horariosOcupados = []; // [{ horario, duracao_min, profissional }]
  let diaBloqueado = false;

  // --- Init ---
  function init() {
    setMinDate();
    renderTimeSlots();
    initServiceSelection();
    initProSelection();
    checkAuth(); // Check if already logged in

    dataInput.addEventListener('change', onDateChange);
    form.addEventListener('submit', onSubmit);
    telefoneInput.addEventListener('input', formatPhone);

    // Listen for identity changes
    window.addEventListener('auth-changed', checkAuth);
  }

  // --- Identity Integration ---
  function checkAuth() {
    if (window.Auth && window.Auth.isLoggedIn()) {
      const user = window.Auth.getUser();
      nomeInput.value = user.nome || '';
      telefoneInput.value = user.telefone || '';
      
      // Quando logado, o nome e telefone são fixos
      nomeInput.readOnly = true;
      telefoneInput.readOnly = true;
    } else {
      // Se deslogar, limpa os campos e permite edição
      nomeInput.value = '';
      telefoneInput.value = '';
      nomeInput.readOnly = false;
      telefoneInput.readOnly = false;
    }
  }

  // --- Service Selection Card Logic ---
  function initServiceSelection() {
    const serviceItems = document.querySelectorAll('#serviceSelection .service-item');
    serviceItems.forEach(item => {
      item.addEventListener('click', () => {
        serviceItems.forEach(i => i.classList.remove('selected'));
        item.classList.add('selected');
        servicoSelect.value = item.dataset.value;
        // A duração muda quais horários cabem
        selectedSlot = null;
        horarioHidden.value = '';
        renderTimeSlots();
      });
    });
  }

  // --- Escolha da profissional (só aparece com 2 ou mais profissionais) ---
  function initProSelection() {
    const items = document.querySelectorAll('#proSelection .service-item');
    items.forEach(item => {
      item.addEventListener('click', () => {
        items.forEach(i => i.classList.remove('selected'));
        item.classList.add('selected');
        profissionalHidden.value = item.dataset.value;
        selectedSlot = null;
        horarioHidden.value = '';
        renderTimeSlots();
      });
    });
  }

  // Um horário está ocupado para a profissional escolhida se algum minuto do serviço
  // bate com outro atendimento dela, ou com um bloqueio do salão todo (profissional vazio)
  function horarioOcupado(horario) {
    const daAgenda = horariosOcupados.filter(o =>
      !VARIOS_PROFISSIONAIS || !o.profissional || o.profissional === profissionalHidden.value
    );
    return CFG.choca(horario, CFG.duracaoDe(servicoSelect.value), daAgenda);
  }

  // O serviço precisa terminar até o fechamento
  function cabeNoDia(horario) {
    return CFG.paraMin(horario) + CFG.duracaoDe(servicoSelect.value) <= CFG.fechamentoMin;
  }

  // --- Set min date to today ---
  function setMinDate() {
    const today = getLocalDateString();
    dataInput.setAttribute('min', today);
    dataInput.value = today;
    servicoSelect.value = '';
    const serviceItems = document.querySelectorAll('#serviceSelection .service-item');
    serviceItems.forEach(i => i.classList.remove('selected'));
    onDateChange();
  }

  // --- Get local date string (YYYY-MM-DD) ---
  function getLocalDateString(date) {
    const d = date || new Date();
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
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

  // --- On date change: load occupied slots and check if blocked ---
  async function onDateChange() {
    const dataSelecionada = dataInput.value;
    if (!dataSelecionada) return;

    horariosOcupados = [];
    diaBloqueado = false;
    selectedSlot = null;
    horarioHidden.value = '';

    try {
      // Verificar se o dia está bloqueado
      const { data: bloqueios, error: bloqueioErr } = await window.db
        .from('dias_bloqueados')
        .select('id')
        .eq('data', dataSelecionada);

      if (!bloqueioErr && bloqueios && bloqueios.length > 0) {
        diaBloqueado = true;
        renderTimeSlots();
        return; // Não busca horários se bloqueado
      }
    } catch (err) {
      console.warn('Erro ao verificar bloqueio de data.');
    }

    try {
      const { data, error } = await window.db
        .from('horarios_ocupados')
        .select('horario, duracao_min, profissional')
        .eq('data', dataSelecionada);

      if (error) {
        console.warn('Erro ao buscar horários:', error.message);
      } else if (data) {
        horariosOcupados = data;
      }
    } catch (err) {
      console.warn('Supabase não configurado ou sem conexão. Continuando sem verificação de ocupação.');
    }

    renderTimeSlots();
  }

  // --- Render time slots ---
  function renderTimeSlots() {
    timeSlotsGrid.innerHTML = '';

    // Se o dia está bloqueado, mostrar banner
    if (diaBloqueado) {
      timeSlotsGrid.innerHTML = `
        <div class="dia-bloqueado-aviso">
          <span class="dia-bloqueado-aviso-icon">🔒</span>
          <strong>Data indisponível</strong>
          <p>Este dia está bloqueado e não aceita agendamentos.<br>Escolha outra data.</p>
        </div>
      `;
      return;
    }

    if (!servicoSelect.value) {
      timeSlotsGrid.innerHTML = '<p class="time-slots-hint">Escolha o serviço para ver os horários livres.</p>';
      return;
    }

    if (VARIOS_PROFISSIONAIS && !profissionalHidden.value) {
      timeSlotsGrid.innerHTML = '<p class="time-slots-hint">Escolha o profissional para ver os horários livres.</p>';
      return;
    }

    const dataSelecionada = dataInput.value;
    const now = new Date();
    const todayStr = getLocalDateString(now);
    const isToday = dataSelecionada === todayStr;

    HORARIOS.filter(cabeNoDia).forEach(horario => {
      const slotEl = document.createElement('div');
      slotEl.className = 'time-slot';
      slotEl.textContent = horario;

      const isOccupied = horarioOcupado(horario);
      let isDisabled = false;

      if (isToday) {
        // Parse horário
        const [hh, mm] = horario.split(':').map(Number);
        const slotTime = new Date(now);
        slotTime.setHours(hh, mm, 0, 0);

        // Precisa ter pelo menos 1 hora de antecedência
        const minTime = new Date(now.getTime() + ANTECEDENCIA_MINIMA_HORAS * 60 * 60 * 1000);
        if (slotTime <= minTime) {
          isDisabled = true;
        }
      }

      if (isOccupied) {
        slotEl.classList.add('occupied');
      } else if (isDisabled) {
        slotEl.classList.add('disabled');
      } else {
        slotEl.addEventListener('click', () => selectSlot(slotEl, horario));
      }

      timeSlotsGrid.appendChild(slotEl);
    });
  }

  // --- Select a time slot ---
  function selectSlot(el, horario) {
    // Deselect previous
    const prev = timeSlotsGrid.querySelector('.selected');
    if (prev) prev.classList.remove('selected');

    el.classList.add('selected');
    selectedSlot = horario;
    horarioHidden.value = horario;
  }

  // --- Form submit ---
  async function onSubmit(e) {
    e.preventDefault();

    // Validations
    const servico = servicoSelect.value;
    const nome = nomeInput.value.trim();
    const telefone = telefoneInput.value.trim();
    const data = dataInput.value;
    const horario = horarioHidden.value;

    if (!servico) {
      showToast('Selecione um serviço.', 'warning');
      servicoSelect.focus();
      return;
    }

    // Se não estiver logado, forçar identificação antes de agendar
    if (window.Auth && !window.Auth.isLoggedIn()) {
       if (window.openLoginModal) {
         showToast('Identifique-se para confirmar o agendamento.', 'info');
         window.openLoginModal();
         return;
       }
    }

    if (!nome) {
      showToast('Informe seu nome completo.', 'warning');
      nomeInput.focus();
      return;
    }
    if (!telefone || telefone.replace(/\D/g, '').length < 10) {
      showToast('Informe um telefone válido.', 'warning');
      telefoneInput.focus();
      return;
    }
    if (!data) {
      showToast('Selecione a data do agendamento.', 'warning');
      dataInput.focus();
      return;
    }
    if (!servicoSelect.value) {
      timeSlotsGrid.innerHTML = '<p class="time-slots-hint">Escolha o serviço para ver os horários livres.</p>';
      return;
    }

    if (VARIOS_PROFISSIONAIS && !profissionalHidden.value) {
      showToast('Escolha o profissional.', 'warning');
      return;
    }
    if (!horario) {
      showToast('Selecione um horário disponível.', 'warning');
      return;
    }

    // Validate: check 1h advance for today
    const now = new Date();
    const todayStr = getLocalDateString(now);
    if (data === todayStr) {
      const [hh, mm] = horario.split(':').map(Number);
      const slotTime = new Date(now);
      slotTime.setHours(hh, mm, 0, 0);
      const minTime = new Date(now.getTime() + ANTECEDENCIA_MINIMA_HORAS * 60 * 60 * 1000);
      if (slotTime <= minTime) {
        showToast('Este horário não tem antecedência mínima de 1 hora.', 'error');
        return;
      }
    }

    // Check past date
    const selectedDate = new Date(data + 'T00:00:00');
    const todayDate = new Date(todayStr + 'T00:00:00');
    if (selectedDate < todayDate) {
      showToast('Não é possível agendar em datas passadas.', 'error');
      return;
    }

    // Submit to Supabase
    setLoading(true);

    try {
      // A função criar_agendamento valida os dados e recusa horário já ocupado
      const { error: insertError } = await window.db.rpc('criar_agendamento', {
        p_servico: servico,
        p_nome: nome,
        p_telefone: telefone,
        p_data: data,
        p_horario: horario,
        p_profissional: VARIOS_PROFISSIONAIS ? profissionalHidden.value : null,
        p_duracao: CFG.duracaoDe(servico)
      });

      if (insertError) {
        console.error('Insert error:', insertError);
        const msg = insertError.message || '';
        if (msg.includes('HORARIO_OCUPADO')) {
          showToast('Este horário acabou de ser reservado. Escolha outro.', 'error');
          horariosOcupados.push({ horario, duracao_min: CFG.duracaoDe(servico), profissional: profissionalHidden.value || null });
          renderTimeSlots();
          selectedSlot = null;
          horarioHidden.value = '';
        } else if (msg.includes('DIA_BLOQUEADO')) {
          showToast('O salão não atende neste dia. Escolha outra data.', 'error');
        } else {
          showToast('Erro ao agendar. Verifique os dados e tente novamente.', 'error');
        }
        setLoading(false);
        return;
      }

      // Success
      const gCalUrl = generateGoogleCalendarUrl({ servico, nome, telefone, data, horario });
      showToast(`✅ Agendamento confirmado! <a href="${gCalUrl}" target="_blank" style="color: var(--accent-light); font-weight: bold; text-decoration: underline; margin-left: 5px;">Adicionar ao Google Agenda</a>`, 'success', 8000);

      // Reset form
      form.reset();
      const serviceItems = document.querySelectorAll('#serviceSelection .service-item');
      serviceItems.forEach(i => i.classList.remove('selected'));
      document.querySelectorAll('#proSelection .service-item').forEach(i => i.classList.remove('selected'));
      profissionalHidden.value = '';
      selectedSlot = null;
      horarioHidden.value = '';
      setMinDate();

    } catch (err) {
      console.error('Submission error:', err);
      showToast('Erro de conexão. Verifique sua internet e tente novamente.', 'error');
    }

    setLoading(false);
  }

  // --- Loading state ---
  function setLoading(loading) {
    if (loading) {
      btnSubmit.classList.add('loading');
      btnSubmit.disabled = true;
    } else {
      btnSubmit.classList.remove('loading');
      btnSubmit.disabled = false;
    }
  }

  // --- Toast Notification ---
  function showToast(message, type = 'success') {
    if (window.UI) {
      window.UI.toast(message, type);
    }
  }

  function generateGoogleCalendarUrl(ag) {
    // Formatar data: YYYYMMDDTHHMMSS
    const datePart = ag.data.replace(/-/g, '');
    const timePart = ag.horario.replace(':', '');
    const start = `${datePart}T${timePart}00`;
    
    const end = `${datePart}T${CFG.horaFim(ag.horario, CFG.duracaoDe(ag.servico)).replace(':', '')}00`;
    
    const text = encodeURIComponent(`Agendamento: ${ag.servico}`);
    const details = encodeURIComponent(`Olá! Seu agendamento de ${ag.servico} está confirmado.\nData: ${ag.data}\nHorário: ${ag.horario}\nLocal: ${window.APP_CONFIG.nome}`);
    const location = encodeURIComponent(window.APP_CONFIG.nome);
    
    return `https://www.google.com/calendar/render?action=TEMPLATE&text=${text}&dates=${start}/${end}&details=${details}&location=${location}`;
  }

  // --- Start ---
  document.addEventListener('DOMContentLoaded', init);
})();
