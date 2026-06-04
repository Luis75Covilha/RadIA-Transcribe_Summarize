// radia.js
//
// O que este script faz:
// 1. Procura o ficheiro .mp3 mais recente numa pasta.
// 2. Verifica se foi criado/modificado há menos de X minutos.
// 3. Usa ffmpeg para confirmar que o ficheiro não é apenas silêncio.
// 4. Envia o MP3 para a API da OpenAI para transcrição.
// 5. Resume a transcrição com IA.
// 6. Guarda a transcrição e/ou o resumo, se configurado.
// 7. Envia o resumo por email.
//
// Requisitos:
// npm install openai nodemailer dotenv
//
// Também precisa de ffmpeg instalado e disponível no PATH:
// ffmpeg -version

require("dotenv").config();

const fs = require("fs");
const path = require("path");
const { execFile } = require("child_process");
const OpenAI = require("openai");
const nodemailer = require("nodemailer");

// -------------------------
// Configuração principal
// -------------------------

const CONFIG = {
  audioFolder: process.env.AUDIO_FOLDER,
  maxFileAgeMinutes: Number(process.env.MAX_FILE_AGE_MINUTES || 60),

  // Modelo recomendado para custo/velocidade.
  // Podes trocar para "gpt-4o-transcribe" se quiseres tentar mais qualidade.
  transcriptionModel: process.env.TRANSCRIPTION_MODEL || "gpt-4o-mini-transcribe",

  // Português. A API aceita códigos de língua como "pt".
  language: process.env.TRANSCRIPTION_LANGUAGE || "pt",

  transcriptionPrompt:
    process.env.TRANSCRIPTION_PROMPT ||
    [
      "Áudio de noticiário da Rádio de Cabo Verde.",
      "A língua principal é português europeu.",
      "Podem surgir excertos em crioulo cabo-verdiano.",
      "Quando a fala for portuguesa, transcreve em português, não em espanhol.",
      "Se surgir crioulo cabo-verdiano, transcreve esse excerto da forma mais fiel possível.",
      "Depois de um excerto em crioulo, quando o locutor voltar ao português, volta imediatamente a transcrever em português.",
      "Não traduzas nem convertas a transcrição para espanhol.",
    ].join(" "),

  // A API tem limite de upload por ficheiro.
  // Mantemos 25 MB como limite de segurança.
  maxFileSizeBytes: 25 * 1024 * 1024,

  // Parâmetros de silêncio para ffmpeg.
  // noise=-35dB: tudo abaixo deste volume é tratado como silêncio.
  // d=2: só considera silêncio se durar pelo menos 20 segundos.
  silenceNoiseThreshold: "-35dB",
  silenceMinDurationSeconds: 20,
};

// Cliente OpenAI.
// A chave vem automaticamente de process.env.OPENAI_API_KEY.
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// -------------------------
// Função auxiliar: validar .env
// -------------------------

function validateEnvironment() {
  const requiredVars = [
    "OPENAI_API_KEY",
    "AUDIO_FOLDER",
    "SMTP_HOST",
    "SMTP_PORT",
    "SMTP_USER",
    "SMTP_PASS",
    "EMAIL_FROM",
    "EMAIL_TO",
  ];

  const missing = requiredVars.filter((name) => !process.env[name]);

  if (missing.length > 0) {
    throw new Error(
      "Faltam variáveis no ficheiro .env: " + missing.join(", ")
    );
  }

  if (!fs.existsSync(CONFIG.audioFolder)) {
    throw new Error(`A pasta de áudio não existe: ${CONFIG.audioFolder}`);
  }
}

// -------------------------
// Procurar o MP3 mais recente
// -------------------------

function getNewestMp3(folderPath) {
  const entries = fs.readdirSync(folderPath, { withFileTypes: true });

  const mp3Files = entries
    .filter((entry) => entry.isFile())
    .filter((entry) => entry.name.toLowerCase().endsWith(".mp3"))
    .map((entry) => {
      const fullPath = path.join(folderPath, entry.name);
      const stats = fs.statSync(fullPath);

      return {
        name: entry.name,
        fullPath,
        stats,

        // Em Windows, birthtime costuma ser a data de criação.
        // mtime é a data da última modificação.
        // Para este caso, usamos a mais recente das duas.
        effectiveTime: Math.max(
          stats.birthtimeMs || 0,
          stats.mtimeMs || 0
        ),
      };
    })
    .sort((a, b) => b.effectiveTime - a.effectiveTime);

  return mp3Files[0] || null;
}

// -------------------------
// Confirmar se o ficheiro é recente
// -------------------------

function isFileRecent(fileInfo, maxAgeMinutes) {
  const now = Date.now();
  const ageMs = now - fileInfo.effectiveTime;
  const ageMinutes = ageMs / 1000 / 60;

  return {
    isRecent: ageMinutes <= maxAgeMinutes,
    ageMinutes,
  };
}

// -------------------------
// Verificar se o MP3 tem áudio
// -------------------------
//
// Estratégia:
// Usamos ffmpeg com o filtro silencedetect.
// O ffmpeg escreve informação no stderr.
// Se o ficheiro inteiro for silêncio, a duração total de silêncio
// será quase igual à duração total do ficheiro.
//
// Nota:
// Isto é uma verificação prática, não perfeita.
// Um áudio com ruído de fundo pode não ser considerado "silêncio".
// Uma gravação muito baixa pode ser classificada como silêncio,
// dependendo do limiar definido em silenceNoiseThreshold.

function runFfmpegSilenceDetect(filePath) {
  return new Promise((resolve, reject) => {
    const args = [
      "-hide_banner",
      "-i",
      filePath,
      "-af",
      `silencedetect=noise=${CONFIG.silenceNoiseThreshold}:d=${CONFIG.silenceMinDurationSeconds}`,
      "-f",
      "null",
      "-",
    ];

    execFile("ffmpeg", args, { windowsHide: true }, (error, stdout, stderr) => {
      // O ffmpeg pode devolver código diferente de zero em alguns casos.
      // Se houver stderr com informação útil, tentamos analisar.
      const output = `${stdout}\n${stderr}`;

      if (!output.includes("Duration:")) {
        return reject(
          new Error(
            "Não foi possível analisar o áudio com ffmpeg. Confirma se o ffmpeg está instalado e no PATH."
          )
        );
      }

      resolve(output);
    });
  });
}

function parseDurationInSeconds(ffmpegOutput) {
  const match = ffmpegOutput.match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/);

  if (!match) {
    return null;
  }

  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  const seconds = Number(match[3]);

  return hours * 3600 + minutes * 60 + seconds;
}

function parseSilencePeriods(ffmpegOutput) {
  const silenceStartRegex = /silence_start:\s*([\d.]+)/g;
  const silenceEndRegex = /silence_end:\s*([\d.]+)\s*\|\s*silence_duration:\s*([\d.]+)/g;

  const starts = [];
  const periods = [];

  let startMatch;
  while ((startMatch = silenceStartRegex.exec(ffmpegOutput)) !== null) {
    starts.push(Number(startMatch[1]));
  }

  let endMatch;
  while ((endMatch = silenceEndRegex.exec(ffmpegOutput)) !== null) {
    periods.push({
      end: Number(endMatch[1]),
      duration: Number(endMatch[2]),
    });
  }

  return { starts, periods };
}

async function hasAudibleAudio(filePath) {
  const ffmpegOutput = await runFfmpegSilenceDetect(filePath);

  const duration = parseDurationInSeconds(ffmpegOutput);
  const { periods } = parseSilencePeriods(ffmpegOutput);

  if (!duration || duration <= 0) {
    throw new Error("Não foi possível determinar a duração do áudio.");
  }

  const totalSilence = periods.reduce((sum, period) => {
    return sum + period.duration;
  }, 0);

  const silenceRatio = totalSilence / duration;

  // Critério prático:
  // Se 95% ou mais do ficheiro for silêncio, rejeitamos.
  const isMostlySilent = silenceRatio >= 0.95;

  return {
    hasAudio: !isMostlySilent,
    duration,
    totalSilence,
    silenceRatio,
  };
}

// -------------------------
// Criar ficheiro temporário com os primeiros X minutos
// -------------------------
//
// Não altera o MP3 original.
// Cria uma cópia temporária apenas com o início do áudio.
// É esse ficheiro temporário que será enviado à API da OpenAI.

function createFirstMinutesAudioFile(filePath, minutes) {
  return new Promise((resolve, reject) => {
    const parsed = path.parse(filePath);

    const tempPath = path.join(
      parsed.dir,
      `${parsed.name}_primeiros_${minutes}min_temp.mp3`
    );

    const args = [
      "-y",
      "-i",
      filePath,

      // Duração a aproveitar desde o início.
      "-t",
      `00:${String(minutes).padStart(2, "0")}:00`,

      // Ignora vídeo, se por acaso existir.
      "-vn",

      // Reencoda para um MP3 leve e adequado a voz.
      "-ar",
      "16000",
      "-ac",
      "1",
      "-b:a",
      "64k",

      tempPath,
    ];

    execFile("ffmpeg", args, { windowsHide: true }, (error, stdout, stderr) => {
      if (error) {
        return reject(
          new Error(
            `Falha ao criar ficheiro temporário de ${minutes} minutos:\n${stderr || error.message}`
          )
        );
      }

      if (!fs.existsSync(tempPath)) {
        return reject(
          new Error("O ffmpeg terminou, mas o ficheiro temporário não foi criado.")
        );
      }

      resolve(tempPath);
    });
  });
}

// -------------------------
// Transcrever com OpenAI
// -------------------------

async function transcribeAudio(filePath) {
  const transcription = await openai.audio.transcriptions.create({
    file: fs.createReadStream(filePath),
    model: CONFIG.transcriptionModel,
    language: CONFIG.language,
    prompt: CONFIG.transcriptionPrompt,

    // Formato simples.
    // Para alguns modelos/formatos, podes usar "json" ou "text".
    response_format: "json",
  });

  return transcription.text || "";
}

// -------------------------
// Enviar email
// -------------------------

async function sendEmail({ subject, body, attachmentPath }) {
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT),
    secure: String(process.env.SMTP_SECURE).toLowerCase() === "true",
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });

  const attachments = [];

  if (attachmentPath) {
    attachments.push({
      filename: path.basename(attachmentPath),
      path: attachmentPath,
    });
  }

  await transporter.sendMail({
    from: process.env.EMAIL_FROM,
    to: process.env.EMAIL_TO,
    subject,
    text: body,
    attachments,
  });
}

// -------------------------
// Guardar transcrição em TXT
// -------------------------

function saveTranscript(audioFilePath, transcriptText) {
  const parsed = path.parse(audioFilePath);

  const outputPath = path.join(
    parsed.dir,
    `${parsed.name}_transcricao.txt`
  );

  fs.writeFileSync(outputPath, transcriptText, "utf8");

  return outputPath;
}

// -------------------------
// Processar a transcrição com OpenAI
// -------------------------
//
// Esta função pega na transcrição em bruto e pede à OpenAI
// para devolver um resumo das principais histórias do noticiário.
//
// O prompt é o que definiste, com uma pequena instrução adicional
// para a resposta vir pronta a enviar por email.

async function summarizeRadioNewsTranscript(rawTranscript) {
  const prompt = `
Analisa esta transcrição de um noticiário da Rádio de Cabo Verde, em português. 
Toma nota dos títulos da edição que o locutor costuma ler no início do noticiário.
Depois, resume as principais histórias.
A transcrição pode saltar de um assunto para outro sem parágrafo ou pontuação clara. Podem surgir pedaços de texto em crioulo cabo-verdiano, que pode ter sido mal interpretado pelo serviço de transcrição.
Devolve um texto claro, em português europeu, pronto a enviar por email.

Estrutura pretendida:
1. Título curto do resumo.
2. Títulos ou sumário da edição lidos pelo locutor no início do noticiário (indica se não os houver)
3. Lista das principais histórias, cada uma com:
   - título curto;
   - resumo em 2 a 4 frases;
   - eventuais números, nomes, locais ou instituições relevantes;
   - indicação breve se houver partes incertas por falhas da transcrição.
4. No fim, acrescenta uma secção "Possíveis dúvidas da transcrição", apenas se houver trechos confusos ou ambíguos.

Não inventes factos. Se uma parte estiver pouco clara, assinala a incerteza.
`.trim();

  const response = await openai.responses.create({
    model: process.env.SUMMARY_MODEL || "gpt-4o-mini",
    input: [
      {
        role: "system",
        content:
          "És um assistente editorial que resume noticiários radiofónicos em português europeu, com rigor jornalístico e sem inventar informação.",
      },
      {
        role: "user",
        content: `${prompt}\n\nTRANSCRIÇÃO:\n\n${rawTranscript}`,
      },
    ],
  });

  return response.output_text || "";
}

// -------------------------
// Guardar texto processado em TXT
// -------------------------

function saveSummary(audioFilePath, summaryText) {
  const parsed = path.parse(audioFilePath);

  const outputPath = path.join(
    parsed.dir,
    `${parsed.name}_resumo_noticias.txt`
  );

  fs.writeFileSync(outputPath, summaryText, "utf8");

  return outputPath;
}

// -------------------------
// Função principal
// -------------------------

async function main() {
  console.log("A iniciar verificação...");

  validateEnvironment();

  const newestMp3 = getNewestMp3(CONFIG.audioFolder);

  if (!newestMp3) {
    console.log("Não foi encontrado nenhum ficheiro MP3 na pasta.");
    return;
  }

  console.log(`MP3 mais recente: ${newestMp3.fullPath}`);

  const fileSizeMb = newestMp3.stats.size / 1024 / 1024;

  if (newestMp3.stats.size > CONFIG.maxFileSizeBytes) {
    throw new Error(
      `O ficheiro tem ${fileSizeMb.toFixed(
        2
      )} MB. A API de transcrição aceita até cerca de 25 MB por ficheiro.`
    );
  }

  const recency = isFileRecent(newestMp3, CONFIG.maxFileAgeMinutes);

  console.log(
    `Idade aproximada do ficheiro: ${recency.ageMinutes.toFixed(1)} minutos`
  );

  if (!recency.isRecent) {
    console.log(
      `O ficheiro é mais antigo do que ${CONFIG.maxFileAgeMinutes} minutos. Não será transcrito.`
    );
    return;
  }

  console.log("A verificar se o MP3 tem áudio audível...");

  const audioCheck = await hasAudibleAudio(newestMp3.fullPath);

  console.log(`Duração: ${audioCheck.duration.toFixed(1)} segundos`);
  console.log(
    `Percentagem estimada de silêncio: ${(audioCheck.silenceRatio * 100).toFixed(
      1
    )}%`
  );

  if (!audioCheck.hasAudio) {
    console.log("O ficheiro parece ser maioritariamente silêncio. Não será enviado.");
    return;
  }

  console.log("A preparar áudio para enviar à OpenAI...");

  let audioPathForOpenAI = newestMp3.fullPath;

  if (String(process.env.PROCESS_FIRST_MINUTES_ONLY).toLowerCase() === "true") {
    const firstMinutes = Number(process.env.FIRST_MINUTES || 10);

    console.log(`A criar ficheiro temporário com os primeiros ${firstMinutes} minutos...`);

    audioPathForOpenAI = await createFirstMinutesAudioFile(
      newestMp3.fullPath,
      firstMinutes
    );

    console.log(`Ficheiro temporário criado: ${audioPathForOpenAI}`);
  }

  console.log("A enviar para a OpenAI para transcrição...");

  const transcript = await transcribeAudio(audioPathForOpenAI);

  if (!transcript.trim()) {
    throw new Error("A transcrição veio vazia.");
  }

  // Opcional: guardar a transcrição em bruto para arquivo/consulta.
  // O email, porém, vai enviar o resumo processado, não a transcrição em bruto.
  let transcriptPath = null;

  if (String(process.env.SAVE_RAW_TRANSCRIPT).toLowerCase() === "true") {
    transcriptPath = saveTranscript(newestMp3.fullPath, transcript);
    console.log(`Transcrição em bruto guardada em: ${transcriptPath}`);
  }

  console.log("A processar a transcrição e resumir as principais histórias...");

  const summary = await summarizeRadioNewsTranscript(transcript);

  if (!summary.trim()) {
    throw new Error("O resumo veio vazio.");
  }

  let summaryPath = null;

  if (String(process.env.SAVE_SUMMARY).toLowerCase() === "true") {
    summaryPath = saveSummary(newestMp3.fullPath, summary);
    console.log(`Resumo guardado em: ${summaryPath}`);
  }

  const subject = `Resumo do noticiário RCV: ${newestMp3.name}`;

  const body = [
    `Ficheiro analisado: ${newestMp3.name}`,
    `Pasta: ${CONFIG.audioFolder}`,
    `Duração aproximada: ${audioCheck.duration.toFixed(1)} segundos`,
    "",
    "RESUMO DAS PRINCIPAIS HISTÓRIAS:",
    "",
    summary,
  ].join("\n");

  console.log("A enviar email com o resumo...");

  await sendEmail({
    subject,
    body,

    // Anexa o resumo, não a transcrição em bruto.
    attachmentPath: summaryPath,
  });

  if (
    audioPathForOpenAI !== newestMp3.fullPath &&
    fs.existsSync(audioPathForOpenAI)
  ) {
    fs.unlinkSync(audioPathForOpenAI);
    console.log("Ficheiro temporário apagado.");
  }

  console.log("Concluído. Email enviado com o resumo.");
}

// -------------------------
// Arranque com tratamento de erros
// -------------------------

main().catch(async (error) => {
  console.error("ERRO:", error.message);

  // Tenta enviar email de erro, se a configuração de email existir.
  try {
    if (
      process.env.SMTP_HOST &&
      process.env.SMTP_USER &&
      process.env.SMTP_PASS &&
      process.env.EMAIL_FROM &&
      process.env.EMAIL_TO
    ) {
      await sendEmail({
        subject: "Erro na transcrição automática",
        body: `Ocorreu um erro:\n\n${error.stack || error.message}`,
      });
    }
  } catch (emailError) {
    console.error("Também falhou o envio do email de erro:", emailError.message);
  }

  process.exit(1);
});
