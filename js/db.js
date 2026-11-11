// ==========================================
// Conexão com o banco (Neon)
// ==========================================
// O endereço abaixo não é segredo: quem protege os dados são as regras
// de acesso do banco (veja db/001_schema.sql).
// Para outro salão, troque pelo endereço do projeto Neon dela
// (Neon > projeto > Data API, sem o "apirest." e sem o "/rest/v1").

const NEON_URL = 'https://ep-still-night-b6fm5duh.c-2.sa-east-1.aws.neon.tech/neondb';

// allowAnonymous: clientes sem login conseguem agendar (com permissões limitadas)
window.db = window.NeonJS.createClient(NEON_URL, {
  auth: { allowAnonymous: true }
});
