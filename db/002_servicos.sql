-- ==========================================
-- Serviços editáveis no painel (preço, duração, comissão)
-- ==========================================
-- variacoes: preços por comprimento, ex.: [{"rotulo":"Curto","preco":80}, ...]
--            vazio = preço único (coluna preco)
-- comissao_pct: % do valor que vai para a auxiliar que fez o serviço

CREATE TABLE servicos (
  id SERIAL PRIMARY KEY,
  categoria TEXT NOT NULL DEFAULT 'Serviços',
  nome TEXT NOT NULL UNIQUE,
  descricao TEXT,
  icone TEXT,
  duracao_min INT NOT NULL DEFAULT 60 CHECK (duracao_min BETWEEN 5 AND 720),
  preco NUMERIC(10,2),
  a_partir_de BOOLEAN NOT NULL DEFAULT false,
  variacoes JSONB NOT NULL DEFAULT '[]',
  comissao_pct NUMERIC(5,2) NOT NULL DEFAULT 0 CHECK (comissao_pct BETWEEN 0 AND 100),
  agendavel BOOLEAN NOT NULL DEFAULT true,   -- aparece no link da cliente
  ativo BOOLEAN NOT NULL DEFAULT true,
  ordem INT NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE servicos ENABLE ROW LEVEL SECURITY;
CREATE POLICY admin_total ON servicos FOR ALL TO authenticated USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY publico_le ON servicos FOR SELECT TO anonymous USING (ativo AND agendavel);
GRANT SELECT ON servicos TO anonymous;
GRANT SELECT, INSERT, UPDATE, DELETE ON servicos TO authenticated;
GRANT USAGE ON SEQUENCE servicos_id_seq TO authenticated;

-- A duração vem da tabela de serviços, não do navegador
CREATE OR REPLACE FUNCTION duracao_servico(p_servico TEXT, p_padrao INT)
RETURNS INT LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce((SELECT duracao_min FROM servicos WHERE nome = split_part(p_servico, ' · ', 1)), p_padrao, 60);
$$;
REVOKE EXECUTE ON FUNCTION duracao_servico FROM PUBLIC;

CREATE OR REPLACE FUNCTION criar_agendamento(p_servico TEXT, p_nome TEXT, p_telefone TEXT, p_data DATE, p_horario TEXT,
                                  p_profissional TEXT DEFAULT NULL, p_duracao INT DEFAULT 60)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  novo_id UUID;
  v_prof TEXT := left(nullif(trim(p_profissional), ''), 60);
  v_dur INT := least(greatest(duracao_servico(p_servico, p_duracao), 5), 720);
BEGIN
  IF length(trim(coalesce(p_nome, ''))) < 2 OR length(regexp_replace(coalesce(p_telefone, ''), '\D', '', 'g')) < 10 THEN
    RAISE EXCEPTION 'DADOS_INVALIDOS' USING ERRCODE = '22023';
  END IF;
  IF coalesce(p_horario, '') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' THEN
    RAISE EXCEPTION 'DADOS_INVALIDOS' USING ERRCODE = '22023';
  END IF;
  IF p_data < (now() AT TIME ZONE 'America/Sao_Paulo')::date THEN
    RAISE EXCEPTION 'DATA_PASSADA' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (SELECT 1 FROM dias_bloqueados WHERE data = p_data) THEN
    RAISE EXCEPTION 'DIA_BLOQUEADO' USING ERRCODE = '22023';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtext('agenda:' || p_data::text));
  IF horario_conflita(p_data, p_horario, v_dur, v_prof) THEN
    RAISE EXCEPTION 'HORARIO_OCUPADO' USING ERRCODE = '23505';
  END IF;
  INSERT INTO agendamentos (servico, nome, telefone, data, horario, duracao_min, profissional, status)
  VALUES (left(p_servico, 120), left(trim(p_nome), 120), left(p_telefone, 20), p_data, p_horario, v_dur, v_prof, 'agendado')
  RETURNING id INTO novo_id;
  RETURN novo_id;
END;
$$;
REVOKE EXECUTE ON FUNCTION criar_agendamento FROM PUBLIC;
GRANT EXECUTE ON FUNCTION criar_agendamento TO anonymous, authenticated;

-- ---------- Tabela de valores do salão (out/2026) ----------
INSERT INTO servicos (ordem, categoria, nome, descricao, icone, duracao_min, preco, a_partir_de, variacoes, comissao_pct) VALUES
 (1, 'Corte', 'Corte', 'Consultoria de perfil, lavagem especial, corte e escova de finalização', 'tesoura', 120, 390, false, '[]', 0),
 (2, 'Cor e Luzes', 'Coloração', 'Varia com a quantidade de tinta (1 tubo: R$ 210)', 'pincel', 180, 230, true, '[]', 15),
 (3, 'Cor e Luzes', 'Iluminados', 'Mechas e iluminação', 'brilho', 180, NULL, true,
   '[{"rotulo":"Frame","preco":660},{"rotulo":"Contorno e topo","preco":940},{"rotulo":"Médio","preco":1050},{"rotulo":"Longo","preco":1300},{"rotulo":"Extra longo","preco":2040}]', 0),
 (4, 'Tratamentos', 'Banho de Pó de Pérola', 'Cabelo com muito volume: taxa a partir de R$ 50', 'gota', 300, NULL, false,
   '[{"rotulo":"Curto","preco":660},{"rotulo":"Médio","preco":770},{"rotulo":"Longo","preco":880},{"rotulo":"Extra longo","preco":990}]', 0),
 (5, 'Tratamentos', 'Tratamento Capilar', 'Valor varia com o volume do cabelo', 'gota', 120, NULL, false,
   '[{"rotulo":"Curto","preco":220},{"rotulo":"Médio","preco":280},{"rotulo":"Longo","preco":330},{"rotulo":"Extra longo","preco":390}]', 30),
 (6, 'Escovas', 'Escova', 'Adicional de chapinha ou babyliss: R$ 20', 'secador', 60, NULL, false,
   '[{"rotulo":"Curto","preco":80},{"rotulo":"Médio","preco":90},{"rotulo":"Longo","preco":100},{"rotulo":"Extra longo","preco":110}]', 40);
