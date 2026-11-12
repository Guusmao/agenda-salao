// ==========================================
// Fechamento do atendimento, auxiliares e comissões (painel)
// ==========================================
// Ao terminar o atendimento, o salão registra os serviços feitos,
// quem fez cada um (Aline ou uma auxiliar), o sinal já pago e como
// o restante foi pago. A comissão é calculada pelo percentual do serviço.
(function () {
  'use strict';

  const CFG = window.APP_CONFIG;
  const SEP = ' · ';
  const FORMAS = [
    { v: 'pix', t: 'Pix' },
    { v: 'dinheiro', t: 'Dinheiro' },
    { v: 'debito', t: 'Débito' },
    { v: 'credito', t: 'Crédito à vista' },
    { v: 'parcelado', t: 'Crédito parcelado' }
  ];
  const NOME_FORMA = Object.fromEntries(FORMAS.map(f => [f.v, f.t]));
  const DONA = 'Aline';

  let auxiliares = [];
  let estado = null; // { ag, itens: [{servico, valor, auxiliar_id, comissao_pct}], aoSalvar }

  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const reais = n => 'R$ ' + (Number(n) || 0).toFixed(2).replace('.', ',');
  const num = v => { const n = parseFloat(String(v).replace(',', '.')); return isNaN(n) ? 0 : n; };
  const toast = (m, t) => (window.UI ? window.UI.toast(m, t) : alert(m));

  // --- Serviços disponíveis (com variações por comprimento) ---
  function opcoesServicos() {
    const cats = CFG.todosServicosAdmin || CFG.categorias || [];
    const out = [];
    cats.forEach(c => (c.servicos || []).forEach(s => {
      if (s.ativo === false) return;
      const pct = Number(s.comissao || 0);
      if (s.variacoes && s.variacoes.length) {
        s.variacoes.forEach(v => out.push({ valor: s.valor + SEP + v.rotulo, preco: Number(v.preco) || 0, pct }));
      } else {
        out.push({ valor: s.valor, preco: s.preco == null ? 0 : Number(s.preco), pct });
      }
    }));
    return out;
  }
  // Procura na lista completa do painel (inclui serviços que não são agendáveis pelo link, como a escova)
  function opcaoDe(servico) {
    const ops = opcoesServicos();
    return ops.find(o => o.valor === servico) || ops.find(o => o.valor === String(servico || '').split(SEP)[0]) || null;
  }
  function pctDe(servico) {
    const o = opcaoDe(servico);
    return o ? o.pct : 0;
  }
  function precoDe(servico) {
    const o = ops0(servico);
    return o != null ? o : (CFG.precos && CFG.precos[servico] != null ? Number(CFG.precos[servico]) : 0);
  }
  function ops0(servico) {
    const o = opcoesServicos().find(x => x.valor === servico);
    return o ? o.preco : null;
  }

  async function carregarAuxiliares() {
    const { data, error } = await window.db.from('auxiliares').select('*').order('nome', { ascending: true });
    auxiliares = !error && data ? data : [];
    return auxiliares;
  }

  // ==========================================
  // Modal de fechamento
  // ==========================================
  function garantirModal() {
    let el = document.getElementById('fechamentoOverlay');
    if (el) return el;
    el = document.createElement('div');
    el.className = 'modal-overlay';
    el.id = 'fechamentoOverlay';
    el.style.display = 'none';
    el.innerHTML = `
      <div class="modal-card fech-card">
        <div class="modal-header">
          <h3>Fechar <span class="gold">atendimento</span></h3>
          <button class="modal-close" type="button" data-fechar>&times;</button>
        </div>
        <div class="fech-cliente" id="fechCliente"></div>
        <div class="fech-secao">Serviços feitos</div>
        <div id="fechItens"></div>
        <button type="button" class="fech-add" id="fechAdd">+ Adicionar serviço</button>

        <div class="fech-secao">Pagamento</div>
        <div class="fech-linha"><span>Total</span><strong id="fechTotal">R$ 0,00</strong></div>
        <div class="fech-linha"><label for="fechSinal">Sinal já pago</label>
          <div class="fech-moeda"><span>R$</span><input type="text" inputmode="decimal" id="fechSinal" class="form-input"></div></div>
        <div class="fech-linha fech-falta"><span>Falta receber</span><strong id="fechFalta">R$ 0,00</strong></div>

        <div class="fech-formas" id="fechFormas">
          ${FORMAS.map(f => `<button type="button" class="fech-forma" data-forma="${f.v}">${f.t}</button>`).join('')}
        </div>
        <div class="fech-parcelas" id="fechParcelasBox" hidden>
          <label for="fechParcelas">Parcelas</label>
          <select id="fechParcelas" class="form-input"></select>
          <small id="fechParcelasRegra"></small>
        </div>
        <label class="fech-obs-label" for="fechObs">Observação (opcional)</label>
        <textarea id="fechObs" class="form-input" rows="2" placeholder="Ex.: cliente pagou o restante em dinheiro"></textarea>

        <div class="modal-actions">
          <button type="button" class="btn btn-outline btn-sm" data-fechar>Cancelar</button>
          <button type="button" class="btn btn-primary btn-sm" id="fechSalvar">Fechar atendimento</button>
        </div>
      </div>`;
    document.body.appendChild(el);
    el.querySelectorAll('[data-fechar]').forEach(b => b.addEventListener('click', fecharModal));
    el.addEventListener('click', e => { if (e.target === el) fecharModal(); });
    el.querySelector('#fechAdd').addEventListener('click', () => {
      estado.itens.push({ servico: '', valor: 0, auxiliar_id: '', comissao_pct: 0 });
      renderItens();
    });
    el.querySelector('#fechSinal').addEventListener('input', atualizarTotais);
    el.querySelectorAll('.fech-forma').forEach(b => b.addEventListener('click', () => { estado.forma = b.dataset.forma; atualizarTotais(); }));
    el.querySelector('#fechParcelas').addEventListener('change', e => { estado.parcelas = Number(e.target.value); atualizarTotais(); });
    el.querySelector('#fechSalvar').addEventListener('click', salvar);
    return el;
  }

  function fecharModal() {
    const el = document.getElementById('fechamentoOverlay');
    if (!el) return;
    el.classList.remove('active');
    setTimeout(() => { el.style.display = 'none'; }, 250);
  }

  function renderItens() {
    const box = document.getElementById('fechItens');
    const ops = opcoesServicos();
    box.innerHTML = '';
    estado.itens.forEach((it, i) => {
      const temOpcao = ops.some(o => o.valor === it.servico);
      const row = document.createElement('div');
      row.className = 'fech-item';
      row.innerHTML = `
        <div class="fech-item-topo">
          <select class="form-input fech-serv">
            <option value="">Escolha o serviço</option>
            ${!temOpcao && it.servico ? `<option value="${esc(it.servico)}" selected>${esc(it.servico)}</option>` : ''}
            ${ops.map(o => `<option value="${esc(o.valor)}" ${o.valor === it.servico ? 'selected' : ''}>${esc(o.valor)}</option>`).join('')}
          </select>
          ${estado.itens.length > 1 ? '<button type="button" class="fech-remover" title="Remover">&times;</button>' : ''}
        </div>
        <div class="fech-item-dados">
          <div class="fech-moeda"><span>R$</span><input type="text" inputmode="decimal" class="form-input fech-valor" value="${(Number(it.valor) || 0).toFixed(2).replace('.', ',')}"></div>
          <select class="form-input fech-quem">
            <option value="">Feito por: ${DONA}</option>
            ${auxiliares.filter(a => a.ativo || String(a.id) === String(it.auxiliar_id)).map(a => `<option value="${a.id}" ${String(a.id) === String(it.auxiliar_id) ? 'selected' : ''}>Feito por: ${esc(a.nome)}</option>`).join('')}
          </select>
        </div>
        <div class="fech-comissao"></div>`;
      const sel = row.querySelector('.fech-serv');
      const val = row.querySelector('.fech-valor');
      const quem = row.querySelector('.fech-quem');
      sel.addEventListener('change', () => {
        it.servico = sel.value;
        it.valor = precoDe(sel.value);
        it.comissao_pct = pctDe(sel.value);
        val.value = it.valor.toFixed(2).replace('.', ',');
        atualizarTotais();
      });
      val.addEventListener('input', () => { it.valor = num(val.value); atualizarTotais(); });
      quem.addEventListener('change', () => {
        it.auxiliar_id = quem.value;
        if (quem.value && !it.comissao_pct) it.comissao_pct = pctDe(it.servico);
        atualizarTotais();
      });
      row.querySelector('.fech-remover')?.addEventListener('click', () => { estado.itens.splice(i, 1); renderItens(); });
      box.appendChild(row);
    });
    atualizarTotais();
  }

  function atualizarTotais() {
    const el = document.getElementById('fechamentoOverlay');
    const total = estado.itens.reduce((s, it) => s + (Number(it.valor) || 0), 0);
    const sinal = num(el.querySelector('#fechSinal').value);
    const falta = Math.max(total - sinal, 0);
    el.querySelector('#fechTotal').textContent = reais(total);
    el.querySelector('#fechFalta').textContent = reais(falta);

    // Comissão de cada linha
    el.querySelectorAll('.fech-item').forEach((row, i) => {
      const it = estado.itens[i];
      const box = row.querySelector('.fech-comissao');
      if (!it) return;
      if (it.auxiliar_id) {
        const pct = Number(it.comissao_pct) || 0;
        const aux = auxiliares.find(a => String(a.id) === String(it.auxiliar_id));
        box.textContent = `Comissão ${aux ? aux.nome : ''}: ${reais((Number(it.valor) || 0) * pct / 100)} (${pct}%)`;
        box.hidden = false;
      } else {
        box.hidden = true;
      }
    });

    // Forma de pagamento e parcelas (até 2x até R$300; 3x acima de R$300)
    el.querySelectorAll('.fech-forma').forEach(b => b.classList.toggle('ativa', b.dataset.forma === estado.forma));
    const maxParc = total > 300 ? 3 : 2;
    if (estado.parcelas > maxParc) estado.parcelas = maxParc;
    if (!estado.parcelas || estado.parcelas < 2) estado.parcelas = 2;
    const pbox = el.querySelector('#fechParcelasBox');
    pbox.hidden = estado.forma !== 'parcelado';
    const psel = el.querySelector('#fechParcelas');
    psel.innerHTML = Array.from({ length: maxParc - 1 }, (_, k) => k + 2)
      .map(n => `<option value="${n}" ${n === estado.parcelas ? 'selected' : ''}>${n}x de ${reais(falta / n)}</option>`).join('');
    el.querySelector('#fechParcelasRegra').textContent = total > 300 ? 'Acima de R$ 300: até 3x.' : 'Até R$ 300: até 2x.';
  }

  async function abrir(ag, aoSalvar) {
    if (!ag || !ag.id) return;
    const el = garantirModal();
    await Promise.all([
      carregarAuxiliares(),
      CFG.carregarServicos ? CFG.carregarServicos(true) : null
    ]);
    const [{ data: fech }, { data: itens }] = await Promise.all([
      window.db.from('fechamentos').select('*').eq('agendamento_id', ag.id),
      window.db.from('fechamento_itens').select('*').eq('agendamento_id', ag.id).order('id', { ascending: true })
    ]);
    const f = fech && fech[0];

    estado = {
      ag, aoSalvar,
      forma: f ? f.forma_pagamento : 'pix',
      parcelas: f ? f.parcelas : 2,
      itens: itens && itens.length
        ? itens.map(i => ({ servico: i.servico, valor: Number(i.valor), auxiliar_id: i.auxiliar_id || '', comissao_pct: Number(i.comissao_pct) }))
        : [{ servico: ag.servico, valor: precoDe(ag.servico), auxiliar_id: '', comissao_pct: pctDe(ag.servico) }]
    };
    const sinalPadrao = f ? Number(f.sinal) : (['confirmado', 'em_atendimento', 'realizado'].includes(ag.status) ? Number(CFG.valorSinal || 50) : 0);
    el.querySelector('#fechSinal').value = sinalPadrao.toFixed(2).replace('.', ',');
    el.querySelector('#fechObs').value = f && f.observacao ? f.observacao : '';
    const data = ag.data ? ag.data.split('-').reverse().join('/') : '';
    el.querySelector('#fechCliente').innerHTML = `<strong>${esc(ag.nome)}</strong><span>${esc(data)} · ${esc(ag.horario || '')}</span>`;
    el.querySelector('#fechSalvar').textContent = f ? 'Salvar alterações' : 'Fechar atendimento';

    renderItens();
    el.style.display = 'flex';
    requestAnimationFrame(() => el.classList.add('active'));
  }

  async function salvar() {
    const el = document.getElementById('fechamentoOverlay');
    const itens = estado.itens.filter(it => it.servico);
    if (!itens.length) { toast('Escolha pelo menos um serviço.', 'error'); return; }
    const botao = el.querySelector('#fechSalvar');
    botao.disabled = true;
    const { error } = await window.db.rpc('fechar_atendimento', {
      p_agendamento: estado.ag.id,
      p_sinal: num(el.querySelector('#fechSinal').value),
      p_forma: estado.forma,
      p_parcelas: estado.forma === 'parcelado' ? estado.parcelas : 1,
      p_itens: itens.map(it => ({
        servico: it.servico,
        valor: Number(it.valor) || 0,
        auxiliar_id: it.auxiliar_id ? Number(it.auxiliar_id) : null,
        comissao_pct: it.auxiliar_id ? Number(it.comissao_pct) || 0 : 0
      })),
      p_observacao: el.querySelector('#fechObs').value.trim() || null
    });
    botao.disabled = false;
    if (error) {
      console.error(error);
      toast('Não foi possível fechar o atendimento. Tente de novo.', 'error');
      return;
    }
    toast('Atendimento fechado!', 'success');
    fecharModal();
    if (typeof estado.aoSalvar === 'function') estado.aoSalvar();
  }

  // ==========================================
  // Tela "Caixa e comissões"
  // ==========================================
  function mesAtual() {
    const d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
  }

  async function carregarCaixa() {
    const mesInput = document.getElementById('caixaMes');
    if (!mesInput) return;
    if (!mesInput.value) mesInput.value = mesAtual();
    if (!mesInput.dataset.ligado) {
      mesInput.dataset.ligado = '1';
      mesInput.addEventListener('change', carregarCaixa);
      document.getElementById('btnNovaAuxiliar').addEventListener('click', novaAuxiliar);
    }
    const [ano, mes] = mesInput.value.split('-').map(Number);
    const ini = `${ano}-${String(mes).padStart(2, '0')}-01`;
    const fimD = new Date(ano, mes, 1);
    const fim = `${fimD.getFullYear()}-${String(fimD.getMonth() + 1).padStart(2, '0')}-01`;

    await carregarAuxiliares();
    renderAuxiliares();

    const { data: ags } = await window.db.from('agendamentos').select('id, nome, data, horario')
      .gte('data', ini).lt('data', fim);
    const ids = (ags || []).map(a => a.id);
    let fechs = [], itens = [];
    if (ids.length) {
      const [r1, r2] = await Promise.all([
        window.db.from('fechamentos').select('*').in('agendamento_id', ids),
        window.db.from('fechamento_itens').select('*').in('agendamento_id', ids)
      ]);
      fechs = r1.data || []; itens = r2.data || [];
    }
    const porAg = Object.fromEntries((ags || []).map(a => [a.id, a]));

    // Resumo do caixa
    const total = fechs.reduce((s, f) => s + Number(f.valor_total), 0);
    const sinais = fechs.reduce((s, f) => s + Math.min(Number(f.sinal), Number(f.valor_total)), 0);
    const comissoes = itens.reduce((s, i) => s + Number(i.comissao_valor), 0);
    const porForma = {};
    fechs.forEach(f => {
      const resto = Math.max(Number(f.valor_total) - Number(f.sinal), 0);
      const chave = f.forma_pagamento === 'parcelado' ? `Crédito ${f.parcelas}x` : NOME_FORMA[f.forma_pagamento] || f.forma_pagamento;
      porForma[chave] = (porForma[chave] || 0) + resto;
    });
    document.getElementById('caixaResumo').innerHTML = `
      <div class="caixa-card destaque"><span>Faturamento do mês</span><strong>${reais(total)}</strong><small>${fechs.length} atendimento(s) fechado(s)</small></div>
      <div class="caixa-card"><span>Comissões a pagar</span><strong>${reais(comissoes)}</strong></div>
      <div class="caixa-card"><span>Fica para o salão</span><strong>${reais(total - comissoes)}</strong></div>
      <div class="caixa-card"><span>Recebido de sinal (Pix)</span><strong>${reais(sinais)}</strong></div>
      ${Object.entries(porForma).map(([k, v]) => `<div class="caixa-card"><span>Restante em ${esc(k)}</span><strong>${reais(v)}</strong></div>`).join('')}`;

    // Comissões por auxiliar
    const grupos = {};
    itens.filter(i => i.auxiliar_nome || i.auxiliar_id).forEach(i => {
      const nome = i.auxiliar_nome || 'Auxiliar';
      (grupos[nome] = grupos[nome] || []).push(i);
    });
    const box = document.getElementById('caixaComissoes');
    const nomes = Object.keys(grupos).sort();
    if (!nomes.length) {
      box.innerHTML = '<p class="caixa-vazio">Nenhuma comissão neste mês. Ao fechar um atendimento, escolha quem fez cada serviço.</p>';
      return;
    }
    box.innerHTML = nomes.map(nome => {
      const lista = grupos[nome].slice().sort((a, b) => String(porAg[a.agendamento_id]?.data).localeCompare(String(porAg[b.agendamento_id]?.data)));
      const soma = lista.reduce((s, i) => s + Number(i.comissao_valor), 0);
      return `
        <details class="comissao-grupo">
          <summary><span class="comissao-nome">${esc(nome)}</span><span class="comissao-qtd">${lista.length} serviço(s)</span><strong>${reais(soma)}</strong></summary>
          <div class="comissao-lista">
            ${lista.map(i => {
              const a = porAg[i.agendamento_id] || {};
              const d = a.data ? a.data.split('-').reverse().slice(0, 2).join('/') : '';
              return `<div class="comissao-item"><span>${esc(d)} · ${esc(i.servico)}<small>${esc(a.nome || '')} · ${reais(i.valor)} × ${Number(i.comissao_pct)}%</small></span><strong>${reais(i.comissao_valor)}</strong></div>`;
            }).join('')}
          </div>
        </details>`;
    }).join('');
  }

  function renderAuxiliares() {
    const box = document.getElementById('auxiliaresLista');
    if (!box) return;
    if (!auxiliares.length) {
      box.innerHTML = '<p class="caixa-vazio">Nenhuma auxiliar cadastrada ainda.</p>';
      return;
    }
    box.innerHTML = '';
    auxiliares.forEach(a => {
      const row = document.createElement('div');
      row.className = 'aux-row' + (a.ativo ? '' : ' inativa');
      row.innerHTML = `
        <input type="text" class="form-input" value="${esc(a.nome)}" maxlength="60">
        <label class="aux-ativa"><input type="checkbox" ${a.ativo ? 'checked' : ''}> Ativa</label>
        <button type="button" class="btn btn-outline btn-sm">Salvar</button>`;
      row.querySelector('button').addEventListener('click', async () => {
        const nome = row.querySelector('input[type=text]').value.trim();
        if (!nome) { toast('Digite o nome.', 'error'); return; }
        const { error } = await window.db.from('auxiliares').update({ nome, ativo: row.querySelector('input[type=checkbox]').checked }).eq('id', a.id);
        if (error) { toast('Erro ao salvar.', 'error'); return; }
        toast('Auxiliar salva.', 'success');
        carregarCaixa();
      });
      box.appendChild(row);
    });
  }

  async function novaAuxiliar() {
    const input = document.getElementById('novaAuxiliarNome');
    const nome = input.value.trim();
    if (!nome) { toast('Digite o nome da auxiliar.', 'error'); input.focus(); return; }
    const { error } = await window.db.from('auxiliares').insert({ nome });
    if (error) { toast('Erro ao cadastrar.', 'error'); return; }
    input.value = '';
    toast('Auxiliar cadastrada.', 'success');
    carregarCaixa();
  }

  // Faturamento real (dos fechamentos) para os números do painel
  async function totaisFechados() {
    const { data, error } = await window.db.from('fechamentos').select('agendamento_id, valor_total');
    if (error || !data) return null;
    return Object.fromEntries(data.map(f => [f.agendamento_id, Number(f.valor_total)]));
  }

  window.Fechamento = { abrir, carregarCaixa, totaisFechados };
})();
