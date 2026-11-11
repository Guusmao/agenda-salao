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
  descricaoPagina: 'Agende seu horário online: cabelo, unhas, sobrancelha e muito mais.',
  textoCatalogo: 'Cabelo, unhas e beleza. Confira tudo o que oferecemos.',

  // --- Profissionais ---
  // Com 2 ou mais, a cliente escolhe com quem quer ser atendida e cada uma tem a própria agenda.
  // Com 1 ou nenhuma, a escolha some e a agenda é única.
  // A agenda é única: uma cliente por vez, com a Aline.
  profissionais: [],

  // --- Agenda ---
  // Os horários de início são gerados de "abertura" até "fechamento", de "intervalo" em "intervalo" minutos.
  // Um serviço só aparece num horário se couber inteiro até o fechamento.
  abertura: '08:00',
  fechamento: '20:00',
  intervaloMinutos: 30,
  antecedenciaMinimaHoras: 1,

  // --- Lembrete no WhatsApp (botão 🔔 no painel) ---
  // {nome}, {servico}, {data}, {horario} e {salao} são trocados pelos dados do agendamento
  mensagemLembrete: 'Olá, {nome}! Passando para lembrar do seu horário no {salao}: {servico} em {data} às {horario}. Se não puder vir, é só responder esta mensagem para remarcar. Até lá!',

  // --- Serviços ---
  // nome:     como aparece na hora de agendar
  // titulo:   como aparece na página "Nossos Serviços" (opcional, usa "nome" se faltar)
  // duracao:  minutos que o serviço ocupa na agenda
  // aPartirDe: true mostra "a partir de R$ X"
  categorias: [
    {
      nome: 'Cabelo', icone: 'secador', classe: '',
      servicos: [
        { valor: 'Corte Feminino', nome: 'Corte Feminino', icone: 'tesoura', preco: 60, duracao: 60, desc: 'Corte com lavagem e finalização' },
        { valor: 'Escova', nome: 'Escova', icone: 'secador', preco: 45, duracao: 45, aPartirDe: true, desc: 'Escova modelada ou lisa' },
        { valor: 'Hidratação', nome: 'Hidratação', icone: 'gota', preco: 70, duracao: 60, desc: 'Tratamento com máscara e escova' },
        { valor: 'Coloração', nome: 'Coloração', icone: 'pincel', preco: 120, duracao: 120, aPartirDe: true, desc: 'Cor raiz ou global' },
        { valor: 'Progressiva', nome: 'Progressiva', icone: 'chama', preco: 180, duracao: 180, aPartirDe: true, desc: 'Alisamento e redução de volume' }
      ]
    },
    {
      nome: 'Unhas', icone: 'esmalte', classe: '',
      servicos: [
        { valor: 'Manicure', nome: 'Manicure', icone: 'esmalte', preco: 30, duracao: 40, desc: 'Cutilagem e esmaltação' },
        { valor: 'Pedicure', nome: 'Pedicure', icone: 'esmalte', preco: 35, duracao: 45, desc: 'Cutilagem e esmaltação dos pés' },
        { valor: 'Pé e Mão', nome: 'Pé e Mão', icone: 'esmalte', preco: 60, duracao: 80, desc: 'Manicure e pedicure juntas' },
        { valor: 'Alongamento em Gel', nome: 'Alongamento em Gel', icone: 'brilho', preco: 150, duracao: 150, desc: 'Alongamento com acabamento natural' }
      ]
    },
    {
      nome: 'Rosto', icone: 'olho', classe: '',
      servicos: [
        { valor: 'Design de Sobrancelha', nome: 'Design de Sobrancelha', icone: 'olho', preco: 35, duracao: 30, desc: 'Design com pinça e linha' },
        { valor: 'Sobrancelha com Henna', nome: 'Sobrancelha com Henna', icone: 'olho', preco: 50, duracao: 45, desc: 'Design e preenchimento com henna' }
      ]
    }
  ]
};
