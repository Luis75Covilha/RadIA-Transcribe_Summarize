# Transcreve e resume

[English](README.md)

Transcreve gravações de áudio, resume o conteúdo com IA e envia o resumo por email.

O projeto nasceu para processar gravações de noticiários de rádio em formato MP3, mas pode ser adaptado para outros áudios em que seja necessário este tipo de análise recorrente. 

## Como Funciona

O fluxo principal está em `radia.js`:

1. Lê a configuração local a partir de `.env`.
2. Procura o ficheiro `.mp3` mais recente na pasta indicada.
3. Confirma se esse ficheiro foi criado ou alterado há menos de `MAX_FILE_AGE_MINUTES`.
4. Usa `ffmpeg` para rejeitar gravações mudas (há mp3, mas só silêncio).
5. Opcionalmente corta apenas os primeiros minutos do áudio.
6. Envia o áudio para transcrição pela API da OpenAI.
7. Pede à OpenAI um resumo da transcrição (de acordo com o 'prompt').
8. Guarda a transcrição e/ou o resumo em ficheiros `.txt`, se isso estiver ativo na configuração.
9. Envia o resumo por email para os destinatários configurados.

O ficheiro `run_radia.bat` existe para facilitar a execução no Windows, por exemplo através do Programador de Tarefas, e anota como correu a execução (útil para ver de erros) na pasta `logs`.

## Requisitos

Eis os requisitos, para termos uma visão geral. As instruções estão logo a seguir:
- Windows, macOS ou Linux para correr o script principal. O ficheiro `.bat` é específico para Windows.
- Node.js 20 ou superior e npm.
- `ffmpeg` instalado e disponível no `PATH`.
- Uma chave da API da OpenAI (ou ajustar para outra IA). 
- Uma conta/servidor SMTP para envio de email (nós usamos conta gratuita Gmail, com senha SMTP).
- Uma pasta com gravações `.mp3`.
- Preferível: acesso ao Programador de Tarefas do Windows, cron ou equivalente, para automatizar a execução.

Para confirmar os requisitos principais:

```bash
node --version
npm --version
ffmpeg -version
```

## Instalação

```bash
npm install
```

Cria a configuração local a partir do exemplo:

```powershell
Copy-Item env.example .env
```

Ou, em `cmd.exe`:

```bat
copy env.example .env
```

Depois edita `.env` com os teus caminhos, credenciais e destinatários.

## Execução

Para validar a sintaxe:

```bash
npm run check
```

Para correr manualmente:

```bash
npm start
```

No Windows, também podes executar, com o cuidado de ajustar as configurações do .bat :

```bat
run_radia.bat
```

Se usares o Programador de Tarefas, aponta a tarefa para `run_radia.bat`. O ficheiro tenta usar automaticamente a pasta onde está guardado, por isso normalmente basta mantê-lo na raiz do projeto.

## Configuração

O ficheiro de exemplo chama-se `env.example`(sem o ponto final inicial - .env - para ficar visível a quem descarregar o projeto). Usar como modelo para o .env definitivo. 

| Variável | Obrigatória | Descrição |
| --- | --- | --- |
| `OPENAI_API_KEY` | Sim | Chave da API da OpenAI. |
| `AUDIO_FOLDER` | Sim | Pasta onde estão as gravações `.mp3`, por exemplo, C:\Users\Utilizador\radia\audio |
| `MAX_FILE_AGE_MINUTES` | Não | Idade máxima, em minutos, para aceitar o MP3 mais recente. Predefinição: `60`. |
| `TRANSCRIPTION_MODEL` | Não | Modelo de transcrição. Predefinição: `gpt-4o-mini-transcribe`. |
| `TRANSCRIPTION_LANGUAGE` | Não | Código da língua do áudio. Predefinição: `pt`. |
| `TRANSCRIPTION_PROMPT` | Não | Prompt opcional para orientar o estilo/língua da transcrição. Por defeito, o script indica que o áudio é um noticiário da Rádio de Cabo Verde em português europeu, com possíveis excertos em crioulo cabo-verdiano, e pede para não derivar para espanhol. |
| `SUMMARY_MODEL` | Não | Modelo usado para criar o resumo. Predefinição: `gpt-4o-mini`. |
| `SMTP_HOST` | Sim | Servidor SMTP. |
| `SMTP_PORT` | Sim | Porta SMTP, normalmente `587`, `465` ou `25`. |
| `SMTP_SECURE` | Não | Usa TLS direto quando `true`. Normalmente `false` para porta `587` e `true` para porta `465`. |
| `SMTP_USER` | Sim | Utilizador SMTP. |
| `SMTP_PASS` | Sim | Palavra-passe ou app password SMTP. |
| `EMAIL_FROM` | Sim | Remetente do email. |
| `EMAIL_TO` | Sim | Destinatários. Pode ter vários emails separados por vírgula. |
| `SAVE_RAW_TRANSCRIPT` | Não | Guarda a transcrição em bruto quando `true`. |
| `SAVE_SUMMARY` | Não | Guarda o resumo em `.txt` quando `true`. |
| `PROCESS_FIRST_MINUTES_ONLY` | Não | Quando `true`, envia apenas o início da gravação para transcrição. |
| `FIRST_MINUTES` | Não | Número de minutos a aproveitar quando `PROCESS_FIRST_MINUTES_ONLY=true`. Predefinição: `10`. |

## Estrutura

- `radia.js`: script principal que valida a configuração, encontra o áudio, transcreve, resume e envia email.
- `run_radia.bat`: wrapper para Windows, útil para execuções agendadas e logs.
- `env.example`: modelo visível de configuração local.
- `package.json`: dependências e comandos npm.
- `package-lock.json`: versões exatas das dependências instaladas.
- `.gitignore`: ficheiros e pastas que não devem ir para o repositório.
- `.gitattributes`: normalização de finais de linha entre Windows e GitHub.
- `CHANGELOG.md`: alterações relevantes entre versões.
- `LICENSE`: licença ISC do projeto.
- `logs/`: criada em execução pelo `.bat`; fica fora do Git.

## Changelog

Ver [CHANGELOG.md](CHANGELOG.md).

## Licença

ISC.
