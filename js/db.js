// ==========================================
// Conexão com o banco (Neon)
// ==========================================
// O endereço abaixo não é segredo: quem protege os dados são as regras
// de acesso do banco (veja db/001_schema.sql).
// Para outro salão, troque pelo endereço do projeto Neon dela
// (Neon > projeto > Data API, sem o "apirest." e sem o "/rest/v1").

// TODO: trocar pelo projeto Neon do salão (NÃO usar o da barbearia)
const NEON_URL = 'https://SEU-PROJETO.neon.tech/neondb';

// allowAnonymous: clientes sem login conseguem agendar (com permissões limitadas)
window.db = window.NeonJS.createClient(NEON_URL, {
  auth: { allowAnonymous: true }
});
