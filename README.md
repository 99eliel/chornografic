# Story Ads Lab

Painel web para cadastro, análise e compartilhamento de campanhas de Stories.

## Arquitetura

- **Firebase Hosting**: publicação da aplicação.
- **Cloud Firestore**: persistência das campanhas e dos links compartilhados.
- **Firebase Storage**: armazenamento das imagens dos Stories.
- **Firebase Authentication (anônima)**: identifica silenciosamente o navegador que criou cada campanha, sem tela de login.
- **PWA**: permite instalação no dispositivo e atualização do front-end.

## Projeção automática de desempenho

As métricas de volume usam uma projeção temporal claramente identificada na interface.

- Taxa: **5%**
- Intervalo: **a cada 4 horas**
- Valores projetados: visualizações, alcance, curtidas, respostas, compartilhamentos, cliques, visitas ao perfil e seguidores.
- Investimento permanece fixo.
- O Firestore armazena os **valores-base** e o instante inicial da projeção.
- O navegador calcula a projeção no momento em que a campanha é aberta, portanto não é necessário executar tarefas agendadas nem gravar novos valores no banco a cada quatro horas.

Fórmula:

```
valorProjetado = valorBase × (1,05 ^ blocosDe4Horas)
```

Exemplo: 100 visualizações tornam-se aproximadamente 134 após 24 horas (6 blocos de 4 horas).

## Estrutura de dados

### campaigns/{campaignId}

Coleção privada de trabalho. Cada documento possui `ownerUid` e só pode ser lido, alterado ou excluído pelo usuário anônimo que o criou.

### sharedCampaigns/{shareId}

Snapshot de leitura da campanha usado no link público.

- `get`: público para quem possui o identificador do compartilhamento.
- `list`: bloqueado.
- edição e exclusão: apenas pelo proprietário.

Exemplo de link:

```
https://instagramanuncios.web.app/?campanha=ID_DO_COMPARTILHAMENTO
```

Quem recebe esse endereço vê somente o relatório daquela campanha e não recebe controles de edição.

## Estrutura do projeto

```
public/
  index.html
  app.js
  firebase-config.js
  manifest.json
  sw.js

firebase.json
.firebaserc
firestore.rules
firestore.indexes.json
storage.rules
```

## Preparação do Firebase

No projeto `instagramanuncios`:

1. Criar o banco **Cloud Firestore**.
2. Ativar **Authentication > Sign-in method > Anonymous**.
3. Criar/ativar **Cloud Storage**.
4. Em **Authentication > Settings > Authorized domains**, adicionar `99eliel.github.io` caso queira importar automaticamente os dados salvos na versão antiga do GitHub Pages.

## Publicação

Com o Firebase CLI instalado:

```bash
firebase login
firebase use instagramanuncios
firebase deploy
```

O comando publica Hosting, regras do Firestore, índices e regras do Storage conforme o `firebase.json`.

## Migração da versão antiga

A aplicação antiga armazenava campanhas em `localStorage`. A nova versão detecta esse conteúdo e tenta enviá-lo para o Firestore na primeira conexão autenticada.

Como o `localStorage` pertence ao domínio onde foi criado, para migrar dados que estavam em `https://99eliel.github.io/chornografic/`, abra esse endereço uma vez depois de ativar o Firebase e autorizar `99eliel.github.io` no Authentication. Depois da migração, as campanhas ficam disponíveis no banco online.
