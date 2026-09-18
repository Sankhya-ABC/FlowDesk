# Roteiro de Homologação — Mobile OpDespesas

Data de geração: 2026-06-08
Versão: Stage 1 (operações locais + envio em lote)

---

## 1. Setup (primeira execução)

- [ ] App abre na tela de configuração de DNS
- [ ] Validação rejeita URLs completas (só domínio aceito)
- [ ] DNS salvo persiste após fechar e reabrir o app
- [ ] Após salvar, navega para tela de Login

## 2. Login

- [ ] Login com credenciais válidas → navega para Home
- [ ] Login com credenciais inválidas → exibe mensagem de erro
- [ ] Campos obrigatórios (usuário e senha) → validação impede envio vazio
- [ ] Sessão persiste após fechar e reabrir o app (não pede login novamente)
- [ ] Opção de trocar DNS visível (se não fixado por build)
- [ ] Logout funciona e retorna para tela de Login

## 3. Home (Lista de Despesas)

- [ ] Saudação correta conforme horário (Bom dia / Boa tarde / Boa noite)
- [ ] Nome do usuário exibido
- [ ] Lista vazia quando não há despesas pendentes
- [ ] Lista exibe despesas PENDING com categoria, parceiro e valor
- [ ] Total em aberto calculado corretamente
- [ ] FAB (botão flutuante) abre formulário de nova despesa
- [ ] Tap em item da lista abre detalhe da despesa
- [ ] Menu acessível: Resumo, Enviar Relatório, Logout

## 4. Formulário de Despesa (wizard de 6 etapas)

### 4.1 Etapa — Categoria
- [ ] Exibe árvore hierárquica de categorias
- [ ] Apenas categorias analíticas (folhas) são selecionáveis
- [ ] Categorias inativas não aparecem

### 4.2 Etapa — Subcategoria
- [ ] Aparece somente quando categoria selecionada tem filhos
- [ ] Pula automaticamente se categoria já é folha

### 4.3 Etapa — Cliente/Parceiro
- [ ] Busca com debounce (350ms) funciona
- [ ] Pesquisa por razão social, nome fantasia e CPF/CNPJ
- [ ] Paginação (load-more) carrega mais resultados ao rolar

### 4.4 Etapa — Valor
- [ ] Formatação BRL (R$ 1.234,56)
- [ ] Rejeita valor zero ou negativo
- [ ] **Modo quilometragem**: ativa automaticamente para categoria código 400
- [ ] Modo quilometragem: campos distância (km) e tarifa por km visíveis
- [ ] Modo quilometragem: valor total calculado automaticamente (distância × tarifa)
- [ ] Modo quilometragem: validação de tolerância (±R$ 0,01)

### 4.5 Etapa — Anexos
- [ ] Permite adicionar via câmera
- [ ] Permite adicionar via galeria de imagens
- [ ] Permite adicionar via documentos
- [ ] Limite máximo de 3 anexos respeitado
- [ ] Limite máximo de 5 MB por arquivo respeitado
- [ ] Arquivo acima do limite exibe mensagem de erro

### 4.6 Etapa — Revisão
- [ ] Todos os dados preenchidos exibidos corretamente
- [ ] Botão salvar grava despesa no banco local com status PENDING
- [ ] Após salvar, retorna para Home e despesa aparece na lista

### Navegação do wizard
- [ ] Botão voltar retorna à etapa anterior
- [ ] Botão avançar vai para próxima etapa
- [ ] Não avança sem preencher campo obrigatório da etapa atual

## 5. Detalhe da Despesa

- [ ] Dados exibidos corretamente (categoria, parceiro, valor, data, descrição)
- [ ] Anexos listados (quando existem)
- [ ] Botão editar abre formulário preenchido com dados existentes
- [ ] Botão excluir exibe diálogo de confirmação
- [ ] Confirmação de exclusão remove despesa + anexos (cascata)
- [ ] Após exclusão, retorna para Home e item some da lista

## 6. Edição de Despesa

- [ ] Todos os campos vêm preenchidos com dados existentes
- [ ] Alteração de categoria funciona corretamente
- [ ] Alteração de parceiro funciona corretamente
- [ ] Alteração de valor funciona corretamente
- [ ] Novos anexos podem ser adicionados
- [ ] Remoção de anexos existentes não disponível (esperado — v1)
- [ ] Após salvar edição, despesa atualizada na lista

## 7. Resumo Financeiro

- [ ] Tela exibe total de despesas pendentes (não enviadas)
- [ ] Valor calculado corretamente (soma de todas PENDING)
- [ ] Atualiza ao voltar após criar/editar/excluir despesa

## 8. Envio de Relatório (batch)

### 8.1 Seleção
- [ ] Lista todas as despesas PENDING com checkboxes
- [ ] Botão selecionar todas marca todos os itens
- [ ] Botão desmarcar todas limpa seleção
- [ ] Exibe categoria e valor de cada despesa na lista

### 8.2 Formulário do relatório
- [ ] Título auto-gerado com data atual (editável)
- [ ] Campo notas (opcional)
- [ ] Campo adiantamento com formatação BRL
- [ ] Campos período início e fim (datas)

### 8.3 Envio
- [ ] Envio cria relatório no ERP e recebe número do relatório
- [ ] Despesas selecionadas enviadas em paralelo ao ERP
- [ ] Anexos codificados em Base64 e transmitidos junto
- [ ] Sucesso total → despesas marcadas como SYNCED, navegação automática
- [ ] Falha parcial → tela exibe quais falharam com mensagem de erro
- [ ] Despesas com falha marcadas como FAILED localmente

## 9. Cenários de Erro e Edge Cases

- [ ] Sem internet durante login → mensagem de erro adequada
- [ ] Sem internet durante envio de relatório → falha graceful, despesas permanecem PENDING
- [ ] Sessão expirada no ERP → comportamento aceitável (mensagem ou redirecionamento)
- [ ] Criar despesa sem categoria → bloqueado pelo wizard
- [ ] Criar despesa sem parceiro → bloqueado pelo wizard
- [ ] App em background e retorno → estado preservado
- [ ] Rotação de tela (se aplicável) → estado preservado

## 10. Limitações Conhecidas (Stage 1)

> Itens abaixo **não** são bugs — são funcionalidades planejadas para etapas futuras.

- Não há sincronização automática em background (envio é manual via Relatório)
- Não há indicador visual de status de sync (PENDING/SYNCED/FAILED) na lista
- Não há botão de retry para despesas FAILED (reselecionar e reenviar)
- Não há filtros avançados na lista (por data, categoria, status)
- Remoção de anexos existentes durante edição não implementada
- Build iOS não disponível (requer macOS)

---

## Resultado

| Seção | Passou | Falhou | Observações |
|-------|--------|--------|-------------|
| 1. Setup | | | |
| 2. Login | | | |
| 3. Home | | | |
| 4. Formulário | | | |
| 5. Detalhe | | | |
| 6. Edição | | | |
| 7. Resumo | | | |
| 8. Envio | | | |
| 9. Erros | | | |

**Testado por:** ___________________
**Data:** ___/___/______
**Dispositivo:** ___________________
**Versão Android:** ___________________
**Aprovado:** [ ] Sim  [ ] Não

Testando aqui.....