-- ==========================================
-- 005 - Fechamento do atendimento e comissões
-- ==========================================
-- Ao terminar o atendimento, o salão registra:
--   * os serviços feitos (pode ter mais de um) e quem fez cada um;
--   * quanto já foi pago de sinal e como o restante foi pago.
-- A comissão de cada serviço é guardada no momento do fechamento
-- (se o percentual mudar depois, os meses anteriores não mudam).

CREATE TABLE auxiliares (
  id SERIAL PRIMARY KEY,
  nome TEXT NOT NULL,
  ativo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE fechamentos (
  agendamento_id UUID PRIMARY KEY REFERENCES agendamentos(id) ON DELETE CASCADE,
  valor_total NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK (valor_total >= 0),
  sinal NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK (sinal >= 0),
  forma_pagamento TEXT NOT NULL DEFAULT 'pix' CHECK (forma_pagamento IN ('pix', 'dinheiro', 'debito', 'credito', 'parcelado')),
  parcelas INT NOT NULL DEFAULT 1 CHECK (parcelas BETWEEN 1 AND 12),
  observacao TEXT,
  fechado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE fechamento_itens (
  id SERIAL PRIMARY KEY,
  agendamento_id UUID NOT NULL REFERENCES fechamentos(agendamento_id) ON DELETE CASCADE,
  servico TEXT NOT NULL,
  valor NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK (valor >= 0),
  auxiliar_id INT REFERENCES auxiliares(id) ON DELETE SET NULL,
  auxiliar_nome TEXT,            -- guardado para o relatório continuar certo se a auxiliar for renomeada/removida
  comissao_pct NUMERIC(5,2) NOT NULL DEFAULT 0 CHECK (comissao_pct BETWEEN 0 AND 100),
  comissao_valor NUMERIC(10,2) NOT NULL DEFAULT 0
);
CREATE INDEX fechamento_itens_ag ON fechamento_itens(agendamento_id);

ALTER TABLE auxiliares ENABLE ROW LEVEL SECURITY;
ALTER TABLE fechamentos ENABLE ROW LEVEL SECURITY;
ALTER TABLE fechamento_itens ENABLE ROW LEVEL SECURITY;
CREATE POLICY admin_total ON auxiliares FOR ALL TO authenticated USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY admin_total ON fechamentos FOR ALL TO authenticated USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY admin_total ON fechamento_itens FOR ALL TO authenticated USING (is_admin()) WITH CHECK (is_admin());
GRANT SELECT, INSERT, UPDATE, DELETE ON auxiliares, fechamentos, fechamento_itens TO authenticated;
GRANT USAGE ON SEQUENCE auxiliares_id_seq, fechamento_itens_id_seq TO authenticated;

-- Salva (ou refaz) o fechamento de um atendimento de uma vez só.
-- p_itens: [{"servico": "Escova · Médio", "valor": 90, "auxiliar_id": 1, "comissao_pct": 40}, ...]
CREATE OR REPLACE FUNCTION fechar_atendimento(p_agendamento UUID, p_sinal NUMERIC, p_forma TEXT,
                                              p_parcelas INT, p_itens JSONB, p_observacao TEXT DEFAULT NULL)
RETURNS NUMERIC LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  total NUMERIC(10,2);
BEGIN
  IF NOT is_admin() THEN RAISE EXCEPTION 'SEM_PERMISSAO'; END IF;
  IF NOT EXISTS (SELECT 1 FROM agendamentos WHERE id = p_agendamento AND status NOT IN ('cancelado', 'bloqueado')) THEN
    RAISE EXCEPTION 'AGENDAMENTO_INVALIDO';
  END IF;
  IF p_itens IS NULL OR jsonb_typeof(p_itens) <> 'array' OR jsonb_array_length(p_itens) = 0 THEN
    RAISE EXCEPTION 'SEM_SERVICOS';
  END IF;

  SELECT COALESCE(SUM(GREATEST((i->>'valor')::NUMERIC, 0)), 0) INTO total FROM jsonb_array_elements(p_itens) i;

  INSERT INTO fechamentos (agendamento_id, valor_total, sinal, forma_pagamento, parcelas, observacao, fechado_em)
  VALUES (p_agendamento, total, GREATEST(COALESCE(p_sinal, 0), 0), COALESCE(p_forma, 'pix'),
          CASE WHEN p_forma = 'parcelado' THEN GREATEST(COALESCE(p_parcelas, 2), 2) ELSE 1 END, p_observacao, now())
  ON CONFLICT (agendamento_id) DO UPDATE SET
    valor_total = EXCLUDED.valor_total, sinal = EXCLUDED.sinal, forma_pagamento = EXCLUDED.forma_pagamento,
    parcelas = EXCLUDED.parcelas, observacao = EXCLUDED.observacao;

  DELETE FROM fechamento_itens WHERE agendamento_id = p_agendamento;
  INSERT INTO fechamento_itens (agendamento_id, servico, valor, auxiliar_id, auxiliar_nome, comissao_pct, comissao_valor)
  SELECT p_agendamento,
         COALESCE(NULLIF(trim(i->>'servico'), ''), 'Serviço'),
         GREATEST((i->>'valor')::NUMERIC, 0),
         a.id, a.nome,
         CASE WHEN a.id IS NULL THEN 0 ELSE LEAST(GREATEST(COALESCE((i->>'comissao_pct')::NUMERIC, 0), 0), 100) END,
         CASE WHEN a.id IS NULL THEN 0
              ELSE round(GREATEST((i->>'valor')::NUMERIC, 0) * LEAST(GREATEST(COALESCE((i->>'comissao_pct')::NUMERIC, 0), 0), 100) / 100, 2) END
  FROM jsonb_array_elements(p_itens) i
  LEFT JOIN auxiliares a ON a.id = NULLIF(i->>'auxiliar_id', '')::INT;

  UPDATE agendamentos SET status = 'realizado' WHERE id = p_agendamento;
  RETURN total;
END $$;
REVOKE ALL ON FUNCTION fechar_atendimento FROM PUBLIC;
GRANT EXECUTE ON FUNCTION fechar_atendimento TO authenticated;
