// ==========================================
// Configuração do salão
// ==========================================
// Este é o ÚNICO arquivo que você precisa editar para adaptar o app
// a um salão novo: nome, logo, profissionais, horários e serviços.
//
// Atenção: o campo "valor" de cada serviço é o que fica salvo no banco.
// Se já existem agendamentos com aquele serviço, não troque o "valor";
// mude só "nome", "titulo", "desc", "preco" ou "duracao".

window.APP_CONFIG = {
  // --- Identidade ---
  nome: 'Aline Ramos',                    // Nome completo (Google Agenda, painel)
  nomeCurto: 'Aline Ramos',               // Nome curto (rodapé e menu do admin)
  marca: 'Aline Ramos',                 // Texto do logo no menu superior
  logoHero: 'img/logo-aline-ramos.png?v=1',     // Coloque o logo do salão em img/ e troque aqui
  corDestaque: '#d4ab57',               // Cor dos botões, preços e detalhes (formato #rrggbb)
  tituloPagina: 'Aline Ramos | Agende seu horário',
  descricaoPagina: 'Aline Ramos, especialista em corte feminino. Agende seu horário online.',
  textoCatalogo: 'Corte, cor, luzes e tratamentos. Confira tudo o que oferecemos.',

  // --- Profissionais ---
  // Com 2 ou mais, a cliente escolhe com quem quer ser atendida e cada uma tem a própria agenda.
  // Com 1 ou nenhuma, a escolha some e a agenda é única.
  // A agenda é única: uma cliente por vez, com a Aline.
  profissionais: [],

  // --- Agenda (padrão; a dona muda no painel, aba "Funcionamento") ---
  // A cliente pode começar entre primeiroHorario e ultimoHorario, de intervalo em intervalo minutos.
  // Um serviço só aparece num horário se terminar até o "fechamento".
  diasSemana: [4, 5, 6],      // 0 = domingo ... 6 = sábado
  primeiroHorario: '08:00',
  ultimoHorario: '22:00',
  fechamento: '24:00',
  intervaloMinutos: 30,
  antecedenciaMinimaHoras: 1,

  // --- Lembrete no WhatsApp (botão 🔔 no painel) ---
  // {nome}, {servico}, {data}, {horario} e {salao} são trocados pelos dados do agendamento
  mensagemLembrete: 'Olá, {nome}! Passando para lembrar do seu horário no {salao}: {servico} em {data} às {horario}. Se não puder vir, é só responder esta mensagem para remarcar. Até lá!',

  // --- Serviços ---
  // A lista de verdade fica no banco (tabela "servicos") e a dona edita pelo painel.
  // Esta aqui só aparece se o banco não responder.
  categorias: [
    { nome: 'Corte', icone: 'tesoura', classe: '', servicos: [
      { valor: 'Corte', nome: 'Corte', icone: 'tesoura', preco: 390, duracao: 120, desc: 'Consultoria de perfil, lavagem especial, corte e escova de finalização' } ] },
    { nome: 'Cor e Luzes', icone: 'pincel', classe: '', servicos: [
      { valor: 'Coloração', nome: 'Coloração', icone: 'pincel', preco: 230, aPartirDe: true, duracao: 180, desc: 'Varia com a quantidade de tinta (1 tubo: R$ 210)' },
      { valor: 'Iluminados', nome: 'Iluminados', icone: 'brilho', duracao: 180, desc: 'Mechas e iluminação',
        variacoes: [{ rotulo: 'Frame', preco: 660 }, { rotulo: 'Contorno e topo', preco: 940 }, { rotulo: 'Médio', preco: 1050 }, { rotulo: 'Longo', preco: 1300 }, { rotulo: 'Extra longo', preco: 2040 }] } ] },
    { nome: 'Tratamentos', icone: 'gota', classe: '', servicos: [
      { valor: 'Banho de Pó de Pérola', nome: 'Banho de Pó de Pérola', icone: 'gota', duracao: 300, desc: 'Cabelo com muito volume: taxa a partir de R$ 50',
        variacoes: [{ rotulo: 'Curto', preco: 660 }, { rotulo: 'Médio', preco: 770 }, { rotulo: 'Longo', preco: 880 }, { rotulo: 'Extra longo', preco: 990 }] },
      { valor: 'Tratamento Capilar', nome: 'Tratamento Capilar', icone: 'gota', duracao: 120, desc: 'Valor varia com o volume do cabelo',
        variacoes: [{ rotulo: 'Curto', preco: 220 }, { rotulo: 'Médio', preco: 280 }, { rotulo: 'Longo', preco: 330 }, { rotulo: 'Extra longo', preco: 390 }] } ] },
    { nome: 'Escovas', icone: 'secador', classe: '', servicos: [
      { valor: 'Escova', nome: 'Escova', icone: 'secador', duracao: 60, desc: 'Adicional de chapinha ou babyliss: R$ 20',
        variacoes: [{ rotulo: 'Curto', preco: 80 }, { rotulo: 'Médio', preco: 90 }, { rotulo: 'Longo', preco: 100 }, { rotulo: 'Extra longo', preco: 110 }] } ] }
  ]
};
