# Changelog

All notable changes to this project will be documented in this file.

This project follows a simple chronological changelog format inspired by [Keep a Changelog](https://keepachangelog.com/).

## [Unreleased]

### Added

- Add a transcription prompt to keep Rádio de Cabo Verde transcripts anchored in European Portuguese when Cape Verdean Creole excerpts appear.

### Planned

- View recording time in hours:mins:secs instead of all-seconds.
- Clean old logs automatically.
- Allow attaching the transcript to the email in addition to the summary.
- Make the summary prompt configurable.
- Optionally add a recording module, removing the need for external tools.
- Add unit tests for configuration validation, newest MP3 selection, and `ffmpeg` parsing.

## [1.0.0] - 2026-05-31

### Added

- Initial public-ready version of the project.
- Audio transcription workflow using the OpenAI API.
- AI-generated summary workflow for radio news transcripts.
- Email delivery through SMTP.
- `ffmpeg` silence detection before sending audio for transcription.
- Optional processing of only the first minutes of each recording.
- Optional saving of raw transcripts and generated summaries.
- Windows batch runner with execution logs.
- English and Portuguese README files.
- Visible `env.example` configuration template.
