// ==========================================
// Aplica o APP_CONFIG na página
// ==========================================
// Precisa rodar antes de agendamento.js e admin.js, porque eles
// procuram os .service-item já desenhados na tela.

(function () {
  'use strict';

  const cfg = window.APP_CONFIG;
  if (!cfg) return;

  const todosServicos = cfg.categorias.flatMap(c => c.servicos);

  // Tabela valor -> preço, usada no faturamento do painel
  cfg.precos = Object.fromEntries(todosServicos.map(s => [s.valor, s.preco]));

  // --- Agenda com duração por serviço ---
  const DURACAO_PADRAO = 60;
  cfg.duracoes = Object.fromEntries(todosServicos.map(s => [s.valor, s.duracao || DURACAO_PADRAO]));
  cfg.duracaoDe = valor => cfg.duracoes[valor] || DURACAO_PADRAO;

  const paraMin = h => { const [hh, mm] = String(h).split(':').map(Number); return hh * 60 + mm; };
  const paraHora = m => String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0');
  cfg.paraMin = paraMin;
  cfg.paraHora = paraHora;

  // Horários de início, de abertura até fechamento
  if (!cfg.horarios) {
    const passo = cfg.intervaloMinutos || 30;
    cfg.horarios = [];
    for (let m = paraMin(cfg.abertura || '09:00'); m < paraMin(cfg.fechamento || '18:00'); m += passo) {
      cfg.horarios.push(paraHora(m));
    }
  }
  cfg.fechamentoMin = cfg.fechamento ? paraMin(cfg.fechamento) : paraMin(cfg.horarios[cfg.horarios.length - 1]) + DURACAO_PADRAO;

  // Hora de término de um agendamento
  cfg.horaFim = (horario, duracao) => paraHora(paraMin(horario) + (duracao || DURACAO_PADRAO));

  // [inicio, inicio + duracao) encosta em algum dos ocupados? ocupados = [{ horario, duracao_min }]
  cfg.choca = (horario, duracao, ocupados) => {
    const ini = paraMin(horario);
    const fim = ini + (duracao || DURACAO_PADRAO);
    return ocupados.some(o => {
      const oi = paraMin(o.horario);
      return oi < fim && oi + (o.duracao_min || DURACAO_PADRAO) > ini;
    });
  };

  cfg.formatDuracao = min => {
    const h = Math.floor(min / 60), m = min % 60;
    if (!h) return m + ' min';
    return h + 'h' + (m ? String(m).padStart(2, '0') : '');
  };

  function esc(str) {
    return String(str).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  function formatPreco(s) {
    const valor = 'R$ ' + s.preco.toFixed(2).replace('.', ',');
    return s.aPartirDe ? 'a partir de ' + valor : valor;
  }

  // --- Cor de destaque ---
  // A partir de uma cor, gera a versão clara, a escura e a cor do texto por cima
  function aplicarCor(hex) {
    const m = /^#?([0-9a-f]{6})$/i.exec(hex || '');
    if (!m) return;
    const n = parseInt(m[1], 16);
    const rgb = [n >> 16, (n >> 8) & 255, n & 255];
    const mistura = (alvo, peso) => '#' + rgb
      .map(c => Math.round(c + (alvo - c) * peso).toString(16).padStart(2, '0'))
      .join('');
    const luminancia = (0.299 * rgb[0] + 0.587 * rgb[1] + 0.114 * rgb[2]) / 255;
    const raiz = document.documentElement.style;
    raiz.setProperty('--accent', '#' + m[1]);
    raiz.setProperty('--accent-rgb', rgb.join(', '));
    raiz.setProperty('--accent-light', mistura(255, 0.25));
    raiz.setProperty('--accent-dark', mistura(0, 0.2));
    raiz.setProperty('--on-accent', luminancia > 0.6 ? '#0e1116' : '#ffffff');
  }
  aplicarCor(cfg.corDestaque);

  // --- Textos ---
  document.title = cfg.tituloPagina;
  const meta = document.querySelector('meta[name="description"]');
  if (meta) meta.setAttribute('content', cfg.descricaoPagina);

  document.querySelectorAll('[data-config]').forEach(el => {
    const chave = el.dataset.config;
    if (cfg[chave] !== undefined) el.textContent = cfg[chave];
  });

  const logo = document.getElementById('heroLogo');
  if (logo) {
    logo.src = cfg.logoHero;
    logo.alt = 'Logo ' + cfg.nome;
  }

  // --- Ícones de traço (estilo Lucide). Em config.js use o nome, ou junte com "+" para combos.
  //     Texto que não for um nome conhecido (ex.: um emoji) aparece como está.
  const ICONES = {
    tesoura: '<circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M20 4 8.12 15.88"/><path d="M14.47 14.48 20 20"/><path d="M8.12 8.12 12 12"/>',
    barba: '<path d="M7 13c1.5-2 3-2 5-.5 2-1.5 3.5-1.5 5 .5-1.5.5-3 .5-5-.5-2 1-3.5 1-5 .5z"/><path d="M4 8c0 7 3.5 13 8 13s8-6 8-13"/><path d="M4 8c1 3 2 4 3.5 5"/><path d="M20 8c-1 3-2 4-3.5 5"/>',
    olho: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
    regua: '<path d="M21.3 15.3a2.4 2.4 0 0 1 0 3.4l-2.6 2.6a2.4 2.4 0 0 1-3.4 0L2.7 8.7a2.41 2.41 0 0 1 0-3.4l2.6-2.6a2.41 2.41 0 0 1 3.4 0Z"/><path d="m14.5 12.5 2-2"/><path d="m11.5 9.5 2-2"/><path d="m8.5 6.5 2-2"/><path d="m17.5 15.5 2-2"/>',
    chama: '<path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.07-2.14-.22-4.05 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.15.43-2.29 1-3a2.5 2.5 0 0 0 2.5 2.5z"/>',
    secador: '<path d="M14 4a6 6 0 1 0 0 12h1l5 2V2l-5 2z"/><circle cx="14" cy="10" r="2"/><path d="M10 15.5 8 22h4l1.5-6"/>',
    esmalte: '<path d="M9 3h6v5H9z"/><path d="M8 8h8l1 3v8a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2v-8z"/><path d="M10 14h4"/>',
    gota: '<path d="M12 2.7s6 6.3 6 11.3a6 6 0 0 1-12 0c0-5 6-11.3 6-11.3z"/><path d="M9 15a3 3 0 0 0 3 3"/>',
    pincel: '<path d="M18.4 2.6a2 2 0 0 1 3 3L12 15l-3-3z"/><path d="M9 12c-2.5 0-4 1.5-4 4 0 1.5-1 3-3 3 1.5 2 4 3 6 3 3.5 0 5-2.5 5-5z"/>',
    brilho: '<path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z"/><path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z"/>',
    presente: '<rect x="3" y="8" width="18" height="4" rx="1"/><path d="M12 8v13"/><path d="M19 12v7a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-7"/><path d="M7.5 8a2.5 2.5 0 0 1 0-5C10 3 12 8 12 8s2-5 4.5-5a2.5 2.5 0 0 1 0 5"/>'
  };
  function icone(nome) {
    const partes = String(nome || '').split('+').map(p => p.trim()).filter(Boolean);
    if (!partes.length || !partes.every(p => ICONES[p])) return esc(nome);
    return '<span class="icones icones-' + partes.length + '">' + partes.map(p =>
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + ICONES[p] + '</svg>'
    ).join('') + '</span>';
  }

  // --- Grades de seleção de serviço (agendamento e modal do admin) ---
  const itemSelecao = s => `
    <div class="service-item" data-value="${esc(s.valor)}">
      <span class="service-item-icon">${icone(s.icone)}</span>
      <span class="service-item-name">${esc(s.nome)}</span>
      <span class="service-item-price">${esc(formatPreco(s))}</span>
      <span class="service-item-duracao">${esc(cfg.formatDuracao(s.duracao || DURACAO_PADRAO))}</span>
    </div>`;

  ['serviceSelection', 'modalServiceSelection'].forEach(id => {
    const grid = document.getElementById(id);
    if (grid) grid.innerHTML = todosServicos.map(itemSelecao).join('');
  });

  // --- Profissionais ---
  cfg.profissionais = cfg.profissionais || [];
  cfg.temVariosProfissionais = cfg.profissionais.length >= 2;
  if (cfg.temVariosProfissionais) {
    const grid = document.getElementById('proSelection');
    if (grid) {
      grid.innerHTML = cfg.profissionais.map(b => `
        <div class="service-item" data-value="${esc(b.nome)}">
          <span class="service-item-icon pro-avatar">${esc(b.nome.trim().charAt(0).toUpperCase())}</span>
          <span class="service-item-name">${esc(b.nome)}</span>
          ${b.desc ? `<span class="service-item-price pro-desc">${esc(b.desc)}</span>` : ''}
        </div>`).join('');
      document.getElementById('profissionalGroup').hidden = false;
    }
    const sel = document.getElementById('modalProfissional');
    if (sel) {
      sel.innerHTML = '<option value="" disabled selected>Selecione</option>' +
        cfg.profissionais.map(b => `<option value="${esc(b.nome)}">${esc(b.nome)}</option>`).join('');
      document.getElementById('modalProfissionalGroup').hidden = false;
    }
  }

  // --- Catálogo da página "Nossos Serviços" ---
  const catalogo = document.getElementById('catalogoServicos');
  if (catalogo) {
    catalogo.innerHTML = cfg.categorias.map(cat => `
      <div class="servicos-categoria animate-fade-up">
        <div class="categoria-header">
          <span class="categoria-icon">${icone(cat.icone)}</span>
          <h3>${esc(cat.nome)}</h3>
        </div>
        <div class="servicos-lista-grid">
          ${cat.servicos.map(s => `
            <div class="servico-card-catalogo ${esc(cat.classe)}${s.destaque ? ' destaque' : ''}">
              <span class="servico-card-icon">${icone(s.icone)}</span>
              <div class="servico-card-info">
                <h4>${esc(s.titulo || s.nome)}</h4>
                <p class="servico-card-desc">${esc(s.desc || '')}${s.desc ? ' · ' : ''}${esc(cfg.formatDuracao(s.duracao || DURACAO_PADRAO))}</p>
              </div>
              <span class="servico-card-preco">${esc(formatPreco(s))}</span>
            </div>`).join('')}
        </div>
      </div>`).join('');
  }
})();
