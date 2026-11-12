// ==========================================
// Aplica o APP_CONFIG na página
// ==========================================
// Precisa rodar antes de agendamento.js e admin.js, porque eles
// procuram os .service-item já desenhados na tela.

(function () {
  'use strict';

  const cfg = window.APP_CONFIG;
  if (!cfg) return;

  const DURACAO_PADRAO = 60;
  const SEP = ' · '; // "Escova · Médio": serviço + comprimento
  let todosServicos = [];

  // Tabelas valor -> preço (faturamento do painel) e serviço -> duração.
  // São os mesmos objetos a vida toda, só o conteúdo muda quando os serviços chegam do banco.
  cfg.precos = {};
  cfg.duracoes = {};
  cfg.base = valor => String(valor || '').split(SEP)[0];
  cfg.duracaoDe = valor => cfg.duracoes[cfg.base(valor)] || DURACAO_PADRAO;
  cfg.servicoDe = valor => todosServicos.find(s => s.valor === cfg.base(valor));

  function indexar() {
    todosServicos = cfg.categorias.flatMap(c => c.servicos);
    Object.keys(cfg.precos).forEach(k => delete cfg.precos[k]);
    Object.keys(cfg.duracoes).forEach(k => delete cfg.duracoes[k]);
    todosServicos.forEach(s => {
      cfg.duracoes[s.valor] = s.duracao || DURACAO_PADRAO;
      if (s.preco != null) cfg.precos[s.valor] = Number(s.preco);
      (s.variacoes || []).forEach(v => { cfg.precos[s.valor + SEP + v.rotulo] = Number(v.preco); });
    });
  }
  indexar();

  // Serviços cadastrados no painel (tabela "servicos"). Sem banco ou sem linhas, fica o config.js.
  function deLinhas(linhas) {
    const cats = [];
    linhas.forEach(l => {
      let cat = cats.find(c => c.nome === l.categoria);
      if (!cat) { cat = { nome: l.categoria, icone: l.icone, classe: '', servicos: [] }; cats.push(cat); }
      cat.servicos.push({
        id: l.id, valor: l.nome, nome: l.nome, desc: l.descricao || '', icone: l.icone,
        duracao: l.duracao_min, preco: l.preco == null ? null : Number(l.preco), aPartirDe: l.a_partir_de,
        variacoes: l.variacoes || [], comissao: Number(l.comissao_pct || 0), agendavel: l.agendavel, ativo: l.ativo
      });
    });
    return cats;
  }

  cfg.carregarServicos = async function (todos) {
    if (!window.db) return cfg.categorias;
    try {
      let q = window.db.from('servicos').select('*').order('ordem', { ascending: true });
      if (!todos) q = q.eq('ativo', true).eq('agendavel', true);
      const { data, error } = await q;
      if (!error && data && data.length) {
        if (todos) {
          // Painel: lista completa para edição; a página da cliente continua só com os agendáveis
          cfg.todosServicosAdmin = deLinhas(data);
        } else {
          cfg.categorias = deLinhas(data);
          indexar();
          renderServicos();
        }
      }
    } catch (e) { /* fica com o config.js */ }
    return cfg.categorias;
  };
  document.addEventListener('DOMContentLoaded', () => {
    cfg.servicosProntos = cfg.carregarServicos(false);
  });

  const paraMin = h => { const [hh, mm] = String(h).split(':').map(Number); return hh * 60 + mm; };
  const paraHora = m => String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0');
  cfg.paraMin = paraMin;
  cfg.paraHora = paraHora;

  // --- Funcionamento (vem da tabela "configuracoes"; config.js é só o padrão) ---
  // primeiroHorario/ultimoHorario: quando a cliente pode COMEÇAR; fechamento: até quando o serviço pode terminar
  cfg.horarios = [];
  cfg.diasSemana = cfg.diasSemana || [4, 5, 6];
  cfg.diasAbertos = new Set();
  function montarHorarios() {
    const passo = cfg.intervaloMinutos || 30;
    const ini = paraMin(cfg.primeiroHorario || cfg.abertura || '09:00');
    const fim = cfg.ultimoHorario ? paraMin(cfg.ultimoHorario) : paraMin(cfg.fechamento || '18:00') - passo;
    cfg.horarios.length = 0; // mesmo array: quem guardou a referência vê a mudança
    for (let m = ini; m <= fim; m += passo) cfg.horarios.push(paraHora(m));
    cfg.fechamentoMin = cfg.fechamento ? paraMin(cfg.fechamento) : fim + DURACAO_PADRAO;
  }
  montarHorarios();

  const NOMES_DIAS = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];
  cfg.nomesDias = NOMES_DIAS;
  cfg.textoDias = () => {
    const d = [...cfg.diasSemana].sort((a, b) => a - b);
    if (!d.length) return 'só em datas especiais';
    const seguidos = d.every((x, i) => i === 0 || x === d[i - 1] + 1);
    if (seguidos && d.length > 2) return `de ${NOMES_DIAS[d[0]]} a ${NOMES_DIAS[d[d.length - 1]]}`;
    return d.map(x => NOMES_DIAS[x]).join(', ').replace(/, ([^,]*)$/, ' e $1');
  };
  // Dia normal de funcionamento ou data aberta avulsa (dias bloqueados são checados à parte)
  cfg.abreNoDia = dataStr => cfg.diasAbertos.has(dataStr) ||
    cfg.diasSemana.includes(new Date(dataStr + 'T12:00:00').getDay());

  cfg.aplicarFuncionamento = c => {
    cfg.diasSemana = (c.dias_semana || cfg.diasSemana).map(Number);
    cfg.primeiroHorario = c.primeiro_horario;
    cfg.ultimoHorario = c.ultimo_horario;
    cfg.fechamento = c.fechamento;
    cfg.intervaloMinutos = c.intervalo_min;
    cfg.valorSinal = Number(c.valor_sinal);
    cfg.horasParaRemarcar = c.horas_para_remarcar;
    cfg.chavePix = c.chave_pix || '';
    cfg.whatsappSalao = c.whatsapp || '';
    cfg.funcionamento = c;
    montarHorarios();
  };
  cfg.carregarFuncionamento = async function () {
    if (!window.db) return;
    try {
      const [{ data: conf }, { data: abertos }] = await Promise.all([
        window.db.from('configuracoes').select('*').eq('id', 1),
        window.db.from('dias_abertos').select('data')
      ]);
      if (conf && conf[0]) cfg.aplicarFuncionamento(conf[0]);
      cfg.diasAbertos = new Set((abertos || []).map(d => d.data));
    } catch (e) { /* fica o padrão */ }
  };
  document.addEventListener('DOMContentLoaded', () => {
    cfg.funcionamentoPronto = cfg.carregarFuncionamento();
  });

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

  const reais = v => 'R$ ' + Number(v).toFixed(2).replace('.', ',');
  cfg.reais = reais;
  function formatPreco(s) {
    const vs = s.variacoes || [];
    if (vs.length) return 'a partir de ' + reais(Math.min(...vs.map(v => Number(v.preco))));
    if (s.preco == null) return 'sob consulta';
    return (s.aPartirDe ? 'a partir de ' : '') + reais(s.preco);
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

  // Logo no menu superior no lugar do texto
  if (cfg.logoMenu) {
    document.querySelectorAll('.navbar-brand').forEach(a => {
      a.classList.add('navbar-brand-logo');
      a.innerHTML = `<img src="${esc(cfg.logoMenu)}" alt="${esc(cfg.nome)}">`;
    });
  }

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

  // Liga uma grade de serviços a um input escondido. Serviço com preço por comprimento
  // mostra as opções embaixo e só preenche o valor depois que a cliente escolhe uma.
  const ligacoes = {};
  cfg.ligarSelecao = function (gridId, hidden, aoMudar) {
    ligacoes[gridId] = { hidden, aoMudar };
    desenharGrade(gridId);
  };
  cfg.marcarServico = function (gridId, valor) {
    const l = ligacoes[gridId];
    const grid = document.getElementById(gridId);
    if (!l || !grid) return;
    const base = cfg.base(valor);
    grid.querySelectorAll('.service-item').forEach(i => i.classList.toggle('selected', !!valor && i.dataset.value === base));
    mostrarVariacoes(gridId, valor ? base : null, valor);
    l.hidden.value = valor || '';
  };

  function desenharGrade(gridId) {
    const grid = document.getElementById(gridId);
    const l = ligacoes[gridId];
    if (!grid || !l) return;
    grid.innerHTML = todosServicos.map(itemSelecao).join('');
    grid.querySelectorAll('.service-item').forEach(item => item.addEventListener('click', () => {
      grid.querySelectorAll('.service-item').forEach(i => i.classList.remove('selected'));
      item.classList.add('selected');
      const s = cfg.servicoDe(item.dataset.value);
      l.hidden.value = (s.variacoes || []).length ? '' : s.valor;
      mostrarVariacoes(gridId, s.valor, null);
      if (l.aoMudar) l.aoMudar(l.hidden.value);
    }));
    mostrarVariacoes(gridId, null, null);
  }

  function mostrarVariacoes(gridId, base, valorAtual) {
    const grid = document.getElementById(gridId);
    const l = ligacoes[gridId];
    let box = document.getElementById(gridId + 'Var');
    if (!box) {
      box = document.createElement('div');
      box.id = gridId + 'Var';
      box.className = 'variacao-box';
      grid.insertAdjacentElement('afterend', box);
    }
    const s = base && cfg.servicoDe(base);
    if (!s || !(s.variacoes || []).length) { box.innerHTML = ''; box.hidden = true; return; }
    box.hidden = false;
    box.innerHTML = `<span class="variacao-titulo">Comprimento do cabelo</span><div class="variacao-chips">` +
      s.variacoes.map(v => {
        const valor = s.valor + SEP + v.rotulo;
        return `<button type="button" class="variacao-chip${valor === valorAtual ? ' selected' : ''}" data-value="${esc(valor)}">${esc(v.rotulo)}<small>${esc(reais(v.preco))}</small></button>`;
      }).join('') + '</div>';
    box.querySelectorAll('.variacao-chip').forEach(chip => chip.addEventListener('click', () => {
      box.querySelectorAll('.variacao-chip').forEach(c => c.classList.remove('selected'));
      chip.classList.add('selected');
      l.hidden.value = chip.dataset.value;
      if (l.aoMudar) l.aoMudar(l.hidden.value);
    }));
  }

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
  function renderCatalogo() {
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
  }

  function renderServicos() {
    Object.keys(ligacoes).forEach(desenharGrade);
    renderCatalogo();
  }
  renderServicos();
})();
