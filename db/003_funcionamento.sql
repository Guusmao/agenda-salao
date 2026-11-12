-- ==========================================
-- Funcionamento editável no painel
-- ==========================================
-- dias_semana: 0 = domingo ... 6 = sábado (padrão: quinta a sábado)
-- primeiro_horario / ultimo_horario: horários em que a cliente pode COMEÇAR
-- fechamento: até quando um serviço pode terminar ('24:00' = meia-noite)
-- dias_abertos: datas avulsas abertas fora dos dias normais (ex.: terças de dezembro)
-- dias_bloqueados (já existe): datas fechadas mesmo sendo dia normal

CREATE TABLE configuracoes (
  id INT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  dias_semana INT[] NOT NULL DEFAULT '{4,5,6}',
  primeiro_horario TEXT NOT NULL DEFAULT '08:00',
  ultimo_horario TEXT NOT NULL DEFAULT '22:00',
  fechamento TEXT NOT NULL DEFAULT '24:00',
  intervalo_min INT NOT NULL DEFAULT 30 CHECK (intervalo_min IN (15, 30, 60)),
  valor_sinal NUMERIC(10,2) NOT NULL DEFAULT 50,
  horas_para_remarcar INT NOT NULL DEFAULT 24,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
INSERT INTO configuracoes (id) VALUES (1);

CREATE TABLE dias_abertos (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  data DATE UNIQUE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE configuracoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE dias_abertos ENABLE ROW LEVEL SECURITY;
CREATE POLICY admin_total ON configuracoes FOR ALL TO authenticated USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY admin_total ON dias_abertos FOR ALL TO authenticated USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY publico_le ON configuracoes FOR SELECT TO anonymous USING (true);
CREATE POLICY publico_le ON dias_abertos FOR SELECT TO anonymous USING (true);
GRANT SELECT ON configuracoes, dias_abertos TO anonymous;
GRANT SELECT, INSERT, UPDATE, DELETE ON configuracoes, dias_abertos TO authenticated;

-- Se o salão abre nessa data
CREATE OR REPLACE FUNCTION dia_aberto(p_data DATE)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT NOT EXISTS (SELECT 1 FROM dias_bloqueados WHERE data = p_data)
     AND (EXISTS (SELECT 1 FROM configuracoes WHERE id = 1 AND EXTRACT(DOW FROM p_data)::int = ANY (dias_semana))
          OR EXISTS (SELECT 1 FROM dias_abertos WHERE data = p_data));
$$;
REVOKE EXECUTE ON FUNCTION dia_aberto FROM PUBLIC;
GRANT EXECUTE ON FUNCTION dia_aberto TO anonymous, authenticated;

CREATE OR REPLACE FUNCTION criar_agendamento(p_servico TEXT, p_nome TEXT, p_telefone TEXT, p_data DATE, p_horario TEXT,
                                  p_profissional TEXT DEFAULT NULL, p_duracao INT DEFAULT 60)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  novo_id UUID;
  v_prof TEXT := left(nullif(trim(p_profissional), ''), 60);
  v_dur INT := least(greatest(duracao_servico(p_servico, p_duracao), 5), 720);
  c configuracoes;
  v_ini INT;
  v_fech INT;
BEGIN
  SELECT * INTO c FROM configuracoes WHERE id = 1;
  IF length(trim(coalesce(p_nome, ''))) < 2 OR length(regexp_replace(coalesce(p_telefone, ''), '\D', '', 'g')) < 10 THEN
    RAISE EXCEPTION 'DADOS_INVALIDOS' USING ERRCODE = '22023';
  END IF;
  IF coalesce(p_horario, '') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' THEN
    RAISE EXCEPTION 'DADOS_INVALIDOS' USING ERRCODE = '22023';
  END IF;
  IF p_data < (now() AT TIME ZONE 'America/Sao_Paulo')::date THEN
    RAISE EXCEPTION 'DATA_PASSADA' USING ERRCODE = '22023';
  END IF;
  IF NOT dia_aberto(p_data) THEN
    RAISE EXCEPTION 'DIA_BLOQUEADO' USING ERRCODE = '22023';
  END IF;
  -- Dentro do horário de agendamento e terminando até o fechamento
  v_ini := split_part(p_horario, ':', 1)::int * 60 + split_part(p_horario, ':', 2)::int;
  v_fech := split_part(c.fechamento, ':', 1)::int * 60 + split_part(c.fechamento, ':', 2)::int;
  IF p_horario < c.primeiro_horario OR p_horario > c.ultimo_horario OR v_ini + v_dur > v_fech THEN
    RAISE EXCEPTION 'FORA_DO_HORARIO' USING ERRCODE = '22023';
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

-- Escova: feita pelas auxiliares, lançada pela dona no painel (não aparece no link)
UPDATE servicos SET agendavel = false WHERE nome = 'Escova';
