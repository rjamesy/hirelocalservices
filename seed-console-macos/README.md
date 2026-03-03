# SeedConsole

A macOS SwiftUI app that wraps the HireLocalServices seed runner CLI (`scripts/seed-runner.ts`). Provides a GUI for starting/stopping seed runs, selecting cities and categories, and viewing live log output with parsed stats.

## Requirements

- macOS 14.0+
- Xcode 15.4+
- Node.js with `npx` available in PATH
- The HireLocalServices project with `npm install` completed (needs `node_modules/.bin/tsx`)

## Setup

1. **Open in Xcode**
   ```
   open seed-console-macos/SeedConsole.xcodeproj
   ```

2. **Build and Run** (Cmd+R)

3. **Set Project Path** — The app defaults to `/Users/rjamesy/AndroidStudioProjects/HireLocalServices`. Use the "Browse..." button if your project is elsewhere.

4. **Configure Environment Variables**

   For **Development**: The seed runner loads `.env.local` from the project directory automatically via `dotenv`. Ensure these are set:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `GOOGLE_PLACES_API_KEY`

   For **Production**: Create `~/.seedconsole/prod.env` with production values:
   ```
   mkdir -p ~/.seedconsole
   cat > ~/.seedconsole/prod.env << 'EOF'
   NEXT_PUBLIC_SUPABASE_URL=https://your-prod-project.supabase.co
   SUPABASE_SERVICE_ROLE_KEY=your-prod-service-role-key
   GOOGLE_PLACES_API_KEY=your-google-api-key
   EOF
   chmod 600 ~/.seedconsole/prod.env
   ```

   This file is never committed to git.

5. **Click "Validate"** to confirm all required files and env vars are present.

## Usage

1. Select **Environment** (dev/prod)
2. Optionally filter by **State** to narrow the city dropdown
3. Select **City** and **Category** (or "All")
4. Set **Limit** (max businesses to process)
5. **Dry Run** is ON by default — shows what would be inserted without writing to DB
6. Click **Start**

To run in production with writes enabled:
- Toggle Dry Run OFF
- Check the "I understand this writes to production" confirmation
- Click Start

Click **Stop** at any time to gracefully terminate (SIGINT, then SIGKILL after 5s).

## Safety

- No env var values are ever displayed in the UI
- Dry Run defaults to ON
- Production writes require explicit confirmation
- Process uses `executableURL` + `arguments` array (no shell injection)
- SIGINT for graceful shutdown, SIGKILL only as last resort

## Status Bar

The bottom status bar shows:
- Running/Stopped indicator
- DRY RUN badge (when active)
- PROD badge (when targeting production)
- Live counters: Found, Inserted, Dupes, Errors (parsed from CLI output)
