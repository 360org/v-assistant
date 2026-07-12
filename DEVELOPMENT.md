# Development workflow

Dev live → test → commit → cut a version. Nothing ships until it's green.

## 1. Run it live

**Web preview (fastest, hot reload):**

```bash
npm install     # first time
npm run dev      # → http://localhost:1420
```

"Continue with OpenRouter" is a real sign-in on localhost; other vendors
route through OpenRouter's models. Credentials live in the browser here.

**Docker (Colima) — nothing installed on the host:**

Runtime is [Colima](https://github.com/abiosoft/colima), not Docker Desktop.
One-time setup:

```bash
brew install colima docker docker-compose
```

Then use the `dev.sh` helper — it boots Colima automatically when needed:

```bash
./dev.sh up        # start → http://localhost:1420 (first run ~1 min)
./dev.sh logs      # follow the dev server output
./dev.sh restart   # restart after a config change
./dev.sh stop      # pause (keeps the container)
./dev.sh start     # resume
./dev.sh down      # stop and remove (keeps node_modules volume)
./dev.sh reset     # rebuild from scratch (fresh node_modules)
./dev.sh shell     # a shell inside the dev container
./dev.sh status    # Colima + container status
```

No Node or Rust on your machine — everything runs in the container. Your
source is bind-mounted in, so editing files on the host hot-reloads the app.
`node_modules` stays in a named volume (container-built binaries never touch
the host). This runs the **web** app (Vault uses browser storage); real
sign-in with OpenRouter works on localhost.

Under the hood `dev.sh` wraps `docker compose -f docker-compose.dev.yml`, so
you can still use Compose directly if you prefer.

**Desktop app (the real thing, hot reload):**

```bash
npm run tauri dev
```

Opens the actual V Assistant window. Needs the Rust toolchain and your OS
webview libs (WebKitGTK on Linux, WebView2 on Windows, built-in on macOS).
Credentials live in the OS keychain (Vault). (The desktop window is a native
GUI, so it can't run inside Docker — use it directly on your machine.)

## 2. Test before committing

One command runs the production build **and** every end-to-end check
(agent tools, Telegram, scheduler, sign-in, role isolation, self-improve,
connectors):

```bash
npm run check
```

Rust side (desktop shell + sandbox):

```bash
cd src-tauri
cargo check
cargo run --example oauth_loopback_check
cargo run --features sandbox --example sandbox_check
```

Only commit when `npm run check` is green. CI runs the same checks on every
push, so a red build never merges.

## 3. Commit

```bash
git add -A && git commit -m "…"
git push
```

## 4. Cut a versioned release

```bash
npm run version:set 0.1.1        # bumps package.json, tauri.conf.json, Cargo.*
# move CHANGELOG.md "Unreleased" → "[0.1.1]"
npm run check                    # green
git commit -am "release: v0.1.1"
git tag v0.1.1 && git push --tags
```

Pushing the `vX.Y.Z` tag triggers the **Release** workflow, which builds the
installers for macOS (Apple Silicon + Intel), Windows and Linux and publishes
them to a GitHub Release. You can also run that workflow by hand from the
Actions tab.
