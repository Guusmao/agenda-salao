# Agendaí Beauty (salão)

App de agendamento online para salões de beleza: a cliente escolhe serviço, profissional, dia e horário pelo celular, e o salão acompanha tudo num painel. Cada serviço tem a sua duração (ex.: escova 45 min, progressiva 3h) e a agenda só oferece horários em que o serviço inteiro cabe.

Versão separada do app da barbearia, com banco próprio.

Feito em HTML, CSS e JavaScript puro, com banco no [Neon](https://neon.com) (Postgres + Data API + Neon Auth). Não precisa de build para rodar.

## Adaptar para um salão novo

1. Edite `js/config.js`: nome, logo, profissionais, abertura/fechamento, serviços, preços e duração.
2. Troque o logo em `img/` (e o caminho em `logoHero`).
3. Se for um banco separado, crie um projeto no Neon, rode `db/001_schema.sql` e troque `NEON_URL` em `js/db.js`.

## Acesso ao painel (`#admin`)

O login é por e-mail e senha (Neon Auth). Só entra quem estiver na tabela `admins`; o passo a passo está no final de `db/001_schema.sql`.

## Segurança

- O cliente sem login **não** consegue ler a tabela de agendamentos. Ele só vê dia e horário ocupados (view `horarios_ocupados`) e usa as funções `criar_agendamento`, `meus_agendamentos`, `cancelar_meu_agendamento`, `buscar_cliente` e `salvar_cliente`.
- O banco recusa dois agendamentos no mesmo dia e horário.
- "Meus horários" usa o telefone como identificação. Quem souber o telefone de alguém consegue ver os horários dessa pessoa. Para um nível maior de segurança, o próximo passo seria confirmar o telefone por código.

## Avisos de novo agendamento

Com o painel aberto, ele confere novos agendamentos a cada 30 segundos e mostra uma notificação no navegador. As notificações push com o painel fechado (da versão original) foram retiradas porque dependiam do servidor antigo.

## Atualizar o cliente do banco

`js/vendor/neon-js-0.10.2.min.js` é o pacote `@neon/neon-js` empacotado para o navegador:

```
echo 'import { createClient } from "@neon/neon-js"; window.NeonJS = { createClient };' > entry.js
npx esbuild entry.js --bundle --minify --format=iife --target=es2019 --outfile=neon-js.min.js
```

## Créditos

Baseado no app desenvolvido em grupo na faculdade (código original de Renan Lima), com uso autorizado.
