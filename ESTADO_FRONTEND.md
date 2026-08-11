# Estado do frontend — verificação visual

Screenshots verificados em 10/08/2026 no dev server.

## Rotas implementadas e registradas em App.tsx

| Rota | Página | Estado |
|---|---|---|
| `/acesso` | Login.tsx | OK — abas E-mail e ID+PIN, link de ativação |
| `/ativar` | ActivateAccess.tsx | OK — ID, código, PIN + confirmação, orientação de PIN fraco |
| `/` | Dashboard.tsx | OK — 4 cards de atenção, próximas celebrações |
| `/celebracoes` | Celebrations.tsx | OK — filtro por período, empty state |
| `/celebracoes/:id` | CelebrationDetail.tsx | OK |
| `/servidores` | Servers.tsx | OK — busca, inativos, nome linkado ao detalhe |
| `/servidores/:id` | ServerDetail.tsx | OK — vínculos, credencial, habilitações, formações |
| `/responsaveis` | Responsibles.tsx | OK — empty state |
| `/disponibilidade` | Availability.tsx | OK — aviso de restrição obrigatória |
| `/assistente` | AiAssistant.tsx | OK — aviso "A IA não publica escalas" no topo |
| `/eventos` | Events.tsx | OK |
| `/eventos/:id` | EventDetail.tsx | OK |
| `/reconhecimento` | Gamification.tsx | OK — abas Meus pontos / Ranking |
| `/relatorios` | Reports.tsx | OK — 5 abas incl. Auditoria |
| `/configuracoes` | Settings.tsx | OK — prazos, gamificação com aviso, equipe |
| `/minha-escala` | MySchedule.tsx | Implementada |
| `/notificacoes` | Notifications.tsx | Implementada |
| `/credenciais` | Credentials.tsx | Implementada |

## Observações

- A navegação lateral filtra itens por papel do ator (AppLayout.tsx).
- Toggles sensíveis de gamificação (penalidade, ranking de menores) têm bloco
  de aviso âmbar explicando o impacto sobre crianças. Ranking de menores fica
  desabilitado na UI enquanto o ranking geral estiver desligado.
- Rota `/assistente-ia` não existe; o caminho correto é `/assistente`.
