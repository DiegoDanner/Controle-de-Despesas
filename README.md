# Controle de Empréstimos e Despesas – Sobrinha

Webapp em Next.js + Supabase, pronto para rodar localmente e publicar na Vercel. O layout foi inspirado no print enviado: cabeçalho roxo, quatro cards de resumo, filtros, tabela de despesas, histórico de pagamentos e painel de sincronização.

## Incluído
- Login por e-mail/senha com Supabase Auth.
- Banco PostgreSQL com Row Level Security (RLS).
- Cadastro, edição e exclusão de despesas.
- Exclusão de todos os dados financeiros da conta, com confirmação irreversível.
- Histórico independente de recebimentos com data e valor.
- Cálculo dos totais, saldos e itens quitados.
- Filtros e busca.
- Exportação CSV compatível com Excel/Google Sheets.
- Envio para Google Sheets e importação em lote de despesas.
- Layout responsivo para celular.

## 1. Pré-requisitos
- Node.js 20.9+ (recomendado LTS atual)
- Conta Supabase e projeto criado
- Conta GitHub e Vercel para publicação (opcional)

## 2. Instalar e executar
```bash
npm install
cp .env.example .env.local
```
Abra `.env.local` e preencha `NEXT_PUBLIC_SUPABASE_URL` e `NEXT_PUBLIC_SUPABASE_ANON_KEY` em Supabase → Project Settings → API (ou Connect).

No Supabase, abra **SQL Editor**, cole e execute todo o conteúdo de `supabase/schema.sql`.

Se o banco já estava configurado, execute novamente o conteúdo atualizado de `supabase/schema.sql` para criar a tabela de recebimentos agrupados e as funções necessárias. O script mantém os dados existentes.

Em **Authentication → Users**, crie o usuário autorizado com e-mail e senha. Para um webapp privado, mantenha desabilitado o cadastro público (Authentication → Providers / Signups, conforme a versão do painel).

Depois:
```bash
npm run dev
```
Abra http://localhost:3000 e entre com o usuário criado.

## 3. Sincronização com Google Sheets
O botão **Enviar para Sheets** sobrescreve os dados nas faixas `Despesas!A:H` e `Pagamentos!A:F` com o estado atual do Supabase. O botão **Importar despesas** lê as linhas da aba `Despesas` e as insere no Supabase para o usuário autenticado. A importação é bloqueada se esse usuário já tiver despesas, para evitar duplicações, e não cria registros individuais de pagamento a partir do valor pago.

No histórico de pagamentos, **Adicionar** registra apenas a data e o valor total recebido. Esse registro não altera as despesas; atualize o campo **Valor Pago** de cada item pela edição da própria linha. Excluir um recebimento remove somente o registro do histórico. Ao enviar dados para o Sheets, os recebimentos aparecem na aba `Pagamentos` sem vínculo individual com uma despesa.

Na aba `Despesas`, a linha 1 deve conter os cabeçalhos `Data`, `Descrição` e `Valor Total`; `Detalhes` e `Valor Pago` são opcionais. Datas podem estar no formato `AAAA-MM-DD` ou `DD/MM/AAAA`, e valores podem ser números ou texto em formato brasileiro. O Supabase continua sendo a fonte principal depois da importação.

1. No Google Cloud Console, crie/selecione um projeto e habilite **Google Sheets API**.
2. Crie uma Service Account e gere uma chave JSON.
3. Crie uma planilha Google Sheets com duas abas chamadas exatamente `Despesas` e `Pagamentos`.
4. Compartilhe a planilha com o e-mail da Service Account como Editor.
5. Copie o ID da planilha da URL: `https://docs.google.com/spreadsheets/d/ID_DA_PLANILHA/edit`.
6. Configure no `.env.local`:
```env
GOOGLE_SERVICE_ACCOUNT_EMAIL=nome@projeto.iam.gserviceaccount.com
GOOGLE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\\nSUA_CHAVE\\n-----END PRIVATE KEY-----\\n"
GOOGLE_SHEETS_SPREADSHEET_ID=ID_DA_PLANILHA
```
A chave privada é segredo: nunca a coloque no código, no GitHub ou em variáveis `NEXT_PUBLIC_`. Na Vercel, cadastre as mesmas variáveis em Project → Settings → Environment Variables e faça redeploy.

Crie as abas `Despesas` e `Pagamentos` antes de enviar dados ao Sheets. Compartilhe a planilha com a Service Account como Editor. A importação lê apenas a aba `Despesas` e exige as credenciais Google configuradas no ambiente.

## 4. Publicar na Vercel
1. Envie o projeto para um repositório GitHub.
2. Na Vercel, importe o repositório.
3. Adicione as variáveis de ambiente do `.env.local` nas configurações do projeto.
4. Faça o deploy.
5. Confira o login e as operações principais no endereço publicado.

## 5. Observações importantes
- Os dados de exemplo do print não são inseridos automaticamente. Cadastre-os no app ou crie linhas de exemplo no SQL, substituindo `USER_UUID` pelo ID do usuário criado.
- A coluna `is_paid` é recalculada quando a despesa é salva, de acordo com o valor pago informado.
- O histórico de recebimentos é independente dos valores pagos por item. Atualize cada valor pago editando a respectiva despesa.
- A política RLS limita cada usuário aos próprios registros. Não exponha a `service_role` do Supabase no navegador.
- O botão de exportação gera CSV com separador `;`, que abre no Excel em configurações regionais brasileiras.

## Referências oficiais
- Next.js: https://nextjs.org/docs
- Supabase Auth: https://supabase.com/docs/guides/auth
- Supabase Row Level Security: https://supabase.com/docs/guides/database/postgres/row-level-security
- Vercel deployment: https://vercel.com/docs/deployments
- Google Sheets API: https://developers.google.com/sheets/api
