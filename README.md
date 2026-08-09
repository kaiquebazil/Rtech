# Conecta Tech — Sistema de Orçamentos

Site estático em HTML, CSS e JavaScript puro para receber orçamentos de assistência técnica e gerenciá-los pelo Firebase.

## Configuração do Firebase

1. Crie um projeto no [Firebase Console](https://console.firebase.google.com/) e adicione um aplicativo **Web**.
2. Em **Authentication > Sign-in method**, ative **E-mail/senha**. Em **Users**, crie manualmente cada administrador. Não existe cadastro público no site.
3. Crie o banco em **Firestore Database**, no modo de produção.
4. Esta versão gratuita não usa Firebase Storage: as duas fotos são comprimidas no navegador e gravadas no próprio documento do Firestore.
5. Copie o objeto de configuração do aplicativo Web e preencha todos os valores em `js/firebase-config.js`. As chaves de configuração Web são públicas por design; a proteção é feita pelas regras abaixo.
6. Em **Firestore Database > Rules**, copie o conteúdo de `firestore.rules` e publique.
7. Ainda no Firestore, crie manualmente o documento `configuracao/contadorOrcamentos` com o campo numérico `ultimo` igual a `0`. Ele é necessário para o primeiro protocolo ser `ORC-000001`.
8. Não é necessário ativar o Firebase Storage nem fazer upgrade para o plano Blaze.

## Como funciona o protocolo

O navegador reserva o próximo número com uma transação atômica no documento contador. Transações concorrentes são repetidas pelo Firestore quando necessário, portanto dois pedidos não recebem o mesmo protocolo.

## Testar e publicar

Para testar localmente, abra a pasta por um servidor estático (por exemplo, a extensão Live Server do VS Code). Não abra o HTML diretamente pelo explorador, pois módulos JavaScript exigem HTTP. Depois, publique todos os arquivos em Firebase Hosting, Netlify, Vercel ou qualquer hospedagem estática com HTTPS.

Após publicar, inclua o domínio em **Authentication > Settings > Authorized domains**, se necessário.

## Segurança e limites

- Pessoas sem login só criam documentos de orçamento; elas não podem listar, ler, alterar ou apagar orçamentos no Firestore. Cada foto é reduzida para até cerca de 300 KB antes do envio, respeitando o limite de 1 MiB por documento do Firestore.
- Administradores autenticados podem visualizar e gerir os pedidos.
- O modo gratuito é adequado para um volume moderado de orçamentos. Para fotos maiores ou maior escala, uma versão futura pode migrar para Storage, Cloudinary ou outro serviço de arquivos.
- A observação administrativa só é gravada pelo painel e jamais aparece na página pública.

## Estrutura

`index.html` é a solicitação pública; `login.html` autentica administradores; `admin.html` contém o painel. Os módulos em `js/` usam Firebase 10 via CDN. O projeto já está estruturado para evoluir com WhatsApp, PDF, ordem de serviço, estoque e histórico sem implementá-los agora.
