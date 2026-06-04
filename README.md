# RadIA - Transcribe and Summarize

[Português](README.pt.md)

Transcribes audio recordings, summarizes the content with AI, and sends the summary by email.

This project was created to process MP3 recordings of FM radio news, but it can be adapted to other audio workflows that need recurring transcription and summary analysis.

## How It Works

The main flow lives in `radia.js`:

1. Reads local configuration from `.env`.
2. Finds the most recent `.mp3` file in the configured folder `AUDIO_FOLDER`.
3. Checks whether that file was created or modified less than `MAX_FILE_AGE_MINUTES` ago.
4. Uses `ffmpeg` to reject silent recordings where an MP3 exists but contains only silence.
5. Optionally cuts only the first minutes of the audio.
6. Sends the audio to the OpenAI API for transcription.
7. Asks OpenAI to summarize the transcript according to the configured prompt.
8. Saves the transcript and/or summary as `.txt` files, if enabled in the configuration.
9. Sends the summary by email to the configured recipients.

The `run_radia.bat` file makes it easier to run the script on Windows, for example through Task Scheduler. It also records execution output in the `logs` folder, which is useful for troubleshooting.

## Requirements

Here is the high-level checklist. Setup instructions come next:

- Windows, macOS, or Linux to run the main script. The `.bat` file is Windows-specific.
- Node.js 20 or newer and npm.
- `ffmpeg` installed and available in `PATH`.
- An OpenAI API key, or code changes to use another AI provider.
- An SMTP account/server for sending email. A Gmail account with an app password can work.
- A folder containing `.mp3` recordings.
- Optional but recommended: Windows Task Scheduler, cron, or an equivalent scheduler to automate execution.

To check the main requirements:

```bash
node --version
npm --version
ffmpeg -version
```

## Installation

```bash
npm install
```

Create your local configuration from the example file:

```powershell
Copy-Item env.example .env
```

Or, in `cmd.exe`:

```bat
copy env.example .env
```

Then edit `.env` with your paths, credentials, and recipients.

## Running

To validate the syntax:

```bash
npm run check
```

To run manually:

```bash
npm start
```

On Windows, you can also run the batch file, after checking its settings:

```bat
run_radia.bat
```

If you use Task Scheduler, point the task to `run_radia.bat`. The file tries to use the folder where it is stored automatically, so in most cases it can stay in the project root.

## Configuration

The example configuration file is named `env.example`, without the initial dot from `.env`, so it remains visible to people who download the project. Use it as a template for the final `.env` file.

| Variable | Required | Description |
| --- | --- | --- |
| `OPENAI_API_KEY` | Yes | OpenAI API key. |
| `AUDIO_FOLDER` | Yes | Folder containing the `.mp3` recordings, for example `C:\Users\joe\radia\audio`. |
| `MAX_FILE_AGE_MINUTES` | No | Maximum age, in minutes, for accepting the most recent MP3. Default: `60`. |
| `TRANSCRIPTION_MODEL` | No | Transcription model. Default: `gpt-4o-mini-transcribe`. |
| `TRANSCRIPTION_LANGUAGE` | No | Audio language code. Default: `pt`. |
| `TRANSCRIPTION_PROMPT` | No | Optional prompt that guides transcription style/language. By default, the script tells the model the audio is Rádio de Cabo Verde news in European Portuguese with possible Cape Verdean Creole excerpts, and asks it not to drift into Spanish. |
| `SUMMARY_MODEL` | No | Model used to create the summary. Default: `gpt-4o-mini`. |
| `SMTP_HOST` | Yes | SMTP server. |
| `SMTP_PORT` | Yes | SMTP port, usually `587`, `465`, or `25`. |
| `SMTP_SECURE` | No | Uses direct TLS when `true`. Usually `false` for port `587` and `true` for port `465`. |
| `SMTP_USER` | Yes | SMTP username. |
| `SMTP_PASS` | Yes | SMTP password or app password. |
| `EMAIL_FROM` | Yes | Email sender. |
| `EMAIL_TO` | Yes | Recipients. Multiple addresses can be separated by commas. |
| `SAVE_RAW_TRANSCRIPT` | No | Saves the raw transcript when `true`. |
| `SAVE_SUMMARY` | No | Saves the summary as a `.txt` file when `true`. |
| `PROCESS_FIRST_MINUTES_ONLY` | No | When `true`, sends only the beginning of the recording for transcription. |
| `FIRST_MINUTES` | No | Number of minutes to use when `PROCESS_FIRST_MINUTES_ONLY=true`. Default: `10`. |

## Project Structure

- `radia.js`: main script that validates configuration, finds the audio file, transcribes, summarizes, and sends email.
- `run_radia.bat`: Windows wrapper, useful for scheduled runs and logs.
- `env.example`: visible local configuration template.
- `package.json`: npm dependencies and commands.
- `package-lock.json`: exact installed dependency versions.
- `.gitignore`: files and folders that should not be committed.
- `.gitattributes`: line-ending normalization between Windows and GitHub.
- `CHANGELOG.md`: notable changes between versions.
- `LICENSE`: ISC license.
- `logs/`: created by the batch file at runtime; kept out of Git.

## Changelog

See [CHANGELOG.md](CHANGELOG.md).

## License

ISC.
