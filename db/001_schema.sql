-- ==========================================
-- Banco do app de agendamento (Neon + Data API)
-- ==========================================
-- Quem acessa o quê:
--   anonymous     -> cliente do site, sem login. NÃO lê a tabela de agendamentos;
--                    usa só a view de horários ocupados e as funções (RPC) abaixo.
--   authenticated -> qualquer pessoa logada. Só tem acesso total se estiver
--                    cadastrada na tabela "admins" (a dona do salão).

-- ---------- Tabelas ----------
-- profissional NULL = vale para o salão todo (ex.: horário bloqueado pela dona)
CREATE TABLE agendamentos (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  servico TEXT NOT NULL,
  nome TEXT NOT NULL,
  telefone TEXT NOT NULL,
  data DATE NOT NULL,
  horario TEXT NOT NULL,               -- início, 'HH:MM'
  duracao_min INT NOT NULL DEFAULT 60, -- quanto tempo o serviço ocupa a agenda
  profissional TEXT,
  status TEXT NOT NULL DEFAULT 'agendado', -- agendado, confirmado, em_atendimento, realizado, cancelado, bloqueado
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (duracao_min BETWEEN 5 AND 720)
);
CREATE INDEX agendamentos_telefone_idx ON agendamentos (telefone);
CREATE INDEX agendamentos_data_idx ON agendamentos (data);

CREATE TABLE dias_bloqueados (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  data DATE UNIQUE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE clientes (
  telefone TEXT PRIMARY KEY,
  nome TEXT NOT NULL,
  aniversario DATE,       -- para a mensagem de parabéns
  observacoes TEXT,       -- alergias, preferências etc. (só a dona vê)
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE admins (
  user_id TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Dois horários se chocam se o mesmo profissional (ou o salão todo) já está
-- ocupado em algum minuto do intervalo [início, início + duração)
CREATE FUNCTION horario_conflita(p_data DATE, p_horario TEXT, p_duracao INT, p_profissional TEXT, p_ignorar UUID DEFAULT NULL)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM agendamentos a
    WHERE a.data = p_data AND a.status <> 'cancelado'
      AND (p_ignorar IS NULL OR a.id <> p_ignorar)
      AND (a.profissional IS NULL OR p_profissional IS NULL OR a.profissional = p_profissional)
      AND (a.data + a.horario::time) < (p_data + p_horario::time) + make_interval(mins => p_duracao)
      AND (a.data + a.horario::time) + make_interval(mins => a.duracao_min) > (p_data + p_horario::time)
  );
$$;

-- ---------- Admin ----------
CREATE FUNCTION is_admin() RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM admins WHERE user_id = auth.user_id());
$$;

ALTER TABLE agendamentos ENABLE ROW LEVEL SECURITY;
ALTER TABLE dias_bloqueados ENABLE ROW LEVEL SECURITY;
ALTER TABLE clientes ENABLE ROW LEVEL SECURITY;
ALTER TABLE admins ENABLE ROW LEVEL SECURITY;

CREATE POLICY admin_total ON agendamentos FOR ALL TO authenticated USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY admin_total ON dias_bloqueados FOR ALL TO authenticated USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY admin_total ON clientes FOR ALL TO authenticated USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY admin_le_admins ON admins FOR SELECT TO authenticated USING (is_admin());
-- Dias bloqueados não são dado pessoal: o site precisa ler para avisar o cliente
CREATE POLICY publico_le ON dias_bloqueados FOR SELECT TO anonymous USING (true);

GRANT USAGE ON SCHEMA public TO anonymous, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON agendamentos, dias_bloqueados, clientes TO authenticated;
GRANT SELECT ON admins TO authenticated;
GRANT SELECT ON dias_bloqueados TO anonymous;

-- ---------- Cliente (sem login) ----------
-- Só data e horário, sem nome nem telefone
CREATE VIEW horarios_ocupados AS
  SELECT data, horario, duracao_min, profissional FROM agendamentos WHERE status <> 'cancelado';
GRANT SELECT ON horarios_ocupados TO anonymous, authenticated;

CREATE FUNCTION criar_agendamento(p_servico TEXT, p_nome TEXT, p_telefone TEXT, p_data DATE, p_horario TEXT,
                                  p_profissional TEXT DEFAULT NULL, p_duracao INT DEFAULT 60)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  novo_id UUID;
  v_prof TEXT := left(nullif(trim(p_profissional), ''), 60);
  v_dur INT := least(greatest(coalesce(p_duracao, 60), 5), 720);
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
  -- Uma reserva por vez em cada dia, para duas clientes não pegarem o mesmo intervalo
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

CREATE FUNCTION meus_agendamentos(p_telefone TEXT)
RETURNS TABLE (id UUID, servico TEXT, nome TEXT, telefone TEXT, data DATE, horario TEXT, status TEXT, created_at TIMESTAMPTZ, profissional TEXT, duracao_min INT)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT a.id, a.servico, a.nome, a.telefone, a.data, a.horario, a.status, a.created_at, a.profissional, a.duracao_min
  FROM agendamentos a
  WHERE a.telefone = p_telefone AND a.status <> 'bloqueado'
  ORDER BY a.data DESC, a.horario DESC;
$$;

CREATE FUNCTION cancelar_meu_agendamento(p_id UUID, p_telefone TEXT)
RETURNS BOOLEAN LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  WITH c AS (
    UPDATE agendamentos SET status = 'cancelado'
    WHERE id = p_id AND telefone = p_telefone AND status IN ('agendado', 'confirmado')
    RETURNING 1
  ) SELECT EXISTS (SELECT 1 FROM c);
$$;

CREATE FUNCTION buscar_cliente(p_telefone TEXT)
RETURNS TABLE (nome TEXT, telefone TEXT)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT c.nome, c.telefone FROM clientes c WHERE c.telefone = p_telefone
  UNION ALL
  SELECT a.nome, a.telefone FROM agendamentos a
  WHERE a.telefone = p_telefone AND a.status <> 'bloqueado'
    AND NOT EXISTS (SELECT 1 FROM clientes c2 WHERE c2.telefone = p_telefone)
  LIMIT 1;
$$;

CREATE FUNCTION salvar_cliente(p_nome TEXT, p_telefone TEXT)
RETURNS TABLE (nome TEXT, telefone TEXT)
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  INSERT INTO clientes AS c (telefone, nome) VALUES (left(p_telefone, 20), left(trim(p_nome), 120))
  ON CONFLICT (telefone) DO UPDATE SET nome = EXCLUDED.nome, updated_at = NOW()
  RETURNING c.nome, c.telefone;
$$;

REVOKE EXECUTE ON FUNCTION criar_agendamento, meus_agendamentos, cancelar_meu_agendamento, buscar_cliente, salvar_cliente, is_admin, horario_conflita FROM PUBLIC;
GRANT EXECUTE ON FUNCTION criar_agendamento, meus_agendamentos, cancelar_meu_agendamento, buscar_cliente, salvar_cliente TO anonymous, authenticated;
GRANT EXECUTE ON FUNCTION is_admin, horario_conflita TO authenticated;

-- ---------- Cadastrar a dona como admin ----------
-- 1. Crie o usuário dela no Neon Auth (Neon > Auth > Users).
-- 2. Rode, trocando o e-mail:
--   INSERT INTO admins (user_id, email)
--   SELECT id::text, email FROM neon_auth.users_sync WHERE email = 'dona@exemplo.com';
