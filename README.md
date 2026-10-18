# Yap MCP: private, on-device speech to text for AI assistants

Give Claude, Cursor, VS Code, Windsurf or any MCP client the ability to **transcribe audio files on your own computer**, and to **search what you dictated with the Yap app**. No upload, no API key, no account.

Yap MCP runs the same speech engine as the [Yap dictation app](https://yapapp.cc/mcp): NVIDIA Parakeet TDT v3 through sherpa-onnx, on your CPU. Audio never leaves your machine; the only network request is a one-time, checksum-verified download of the speech model (about 670 MB) from Hugging Face.

## Tools

| Tool | What it does |
| --- | --- |
| `transcribe_audio` | Transcribes a local audio or video file of any length: WAV, MP3, M4A/AAC, MP4, FLAC, OGG, Opus, WebM, AIFF, CAF and more. Detects the language automatically among 25 European languages. Optional start-time stamps per passage and Yap's cleanup (capitalization, punctuation, "um" removed). |
| `search_dictations` | Searches the dictation history the Yap app keeps on this computer (Mac and Windows), newest first. Read-only. |
| `prepare_speech_model` | Downloads and verifies the speech model ahead of the first transcription, or reports its status. |

Ask your assistant things like "transcribe ~/Downloads/interview.m4a with timestamps", "summarize the voice memo on my desktop", or "what did I dictate about the budget this week?".

## Install

Requires Node.js 20 or newer (22.13+ for `search_dictations`). macOS (Apple Silicon and Intel), Windows x64 and Linux x64/arm64.

**Claude Desktop, one click**: download [yap.mcpb](https://github.com/founden-bot/yap-mcp/releases/latest/download/yap.mcpb) and open it (macOS and Windows). Or add to `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "yap": { "command": "npx", "args": ["-y", "github:founden-bot/yap-mcp"] }
  }
}
```

**Claude Code**:

```sh
claude mcp add yap -- npx -y github:founden-bot/yap-mcp
```

**Cursor, Windsurf, VS Code, Cline, Zed and other clients**: add a stdio server with command `npx` and arguments `-y github:founden-bot/yap-mcp`.

The first transcription downloads the model once (a few minutes on a typical connection) and answers with the progress while it does; after that, everything runs offline. Transcription runs about ten times faster than real time on a modern laptop, so an hour of audio takes about six minutes.

## Languages

English, German, French, Spanish, Italian, Portuguese, Dutch, Polish, Russian, Ukrainian, Swedish, Danish, Finnish, Czech, Slovak, Hungarian, Romanian, Bulgarian, Greek, Croatian, Slovenian, Latvian, Lithuanian, Estonian and Maltese.

## Privacy

- Audio is read from the path you give, decoded in memory and discarded. Nothing is uploaded, logged or stored.
- `search_dictations` opens the Yap history database read-only and returns only the dictations that match; that text then goes to the assistant you are using, like anything else you show it.
- Settings: `YAP_MCP_CACHE` moves the model cache (default: `~/Library/Caches/yap-mcp` on macOS, `%LOCALAPPDATA%\yap-mcp` on Windows, `~/.cache/yap-mcp` on Linux). On Windows, a model already downloaded by the Yap app is reused.

## Dictate instead of type

Yap MCP handles recordings. To speak into any app as you work (your editor, Slack, email, the Claude and ChatGPT apps), use [Yap](https://yapapp.cc): hold a key, talk, and the text appears where your cursor is, transcribed on your computer.

## License

MIT for this code. The speech model is NVIDIA Parakeet TDT 0.6B v3 (CC-BY-4.0), ONNX conversion by the sherpa-onnx project (Apache-2.0).

Made by [Yap](https://yapapp.cc), O-mega Enterprise Inc. Questions: hello@yapapp.cc
