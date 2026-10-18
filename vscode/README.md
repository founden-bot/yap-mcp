# Yap: on-device speech to text for VS Code

Transcribe audio and video files **on your own computer** from GitHub Copilot chat and agent mode, and search what you dictated with the [Yap](https://yapapp.cc/mcp) dictation app. No upload, no API key, no account.

This extension adds the open-source [Yap MCP server](https://github.com/founden-bot/yap-mcp) to VS Code. It runs on VS Code's own Node.js, so there is nothing else to install.

## What you can ask

- "Transcribe ~/Downloads/standup.m4a with timestamps and list the action items."
- "Summarize the voice memo in this folder."
- "What did I dictate about the release notes this week?"

## Tools

| Tool | What it does |
| --- | --- |
| `transcribe_audio` | Transcribes a local audio or video file of any length (WAV, MP3, M4A/AAC, MP4, FLAC, OGG, Opus, WebM, AIFF and more), with optional timestamps. 25 European languages, detected automatically. |
| `search_dictations` | Searches the dictation history the Yap app keeps on this computer. Read-only. |
| `prepare_speech_model` | Downloads and verifies the speech model ahead of the first transcription. |

## How it works

Speech recognition runs locally with NVIDIA Parakeet TDT v3 through sherpa-onnx, the same engine as the Yap app. The first transcription downloads the speech model once (about 670 MB, checksum verified, from Hugging Face); after that everything works offline, about ten times faster than real time on a modern laptop. Audio is decoded in memory and discarded.

Open the Chat view, switch to **Agent** mode and check that the **Yap** tools are enabled in the tools picker. The server also appears under **MCP Servers** in the Extensions view.

## Dictate instead of type

For speaking into the editor itself (and every other app) while you work, use [Yap for Mac and Windows](https://yapapp.cc): hold a key, talk, and the text appears at your cursor, recognized on your computer.

MIT licensed. The speech model is NVIDIA Parakeet TDT 0.6B v3 (CC-BY-4.0). Made by Yap, O-mega Enterprise Inc.
