-- ==========================================
-- Sinal pelo Pix (sem integração): a cliente paga na chave do salão
-- e manda o comprovante no WhatsApp; a dona marca "sinal recebido" no painel.
-- Status: agendado = aguardando sinal, confirmado = sinal pago.
-- ==========================================
ALTER TABLE configuracoes ADD COLUMN chave_pix TEXT NOT NULL DEFAULT '';
ALTER TABLE configuracoes ADD COLUMN whatsapp TEXT NOT NULL DEFAULT '';
