# NIGHTSHIFT — Private Desktop Voice Chat & Screen Sharing

**NIGHTSHIFT** is a real-time, high-performance, minimalist desktop voice communication and screen-sharing application engineered for a private community of 10–15 close friends.

Unlike Discord, NIGHTSHIFT adopts a dark graphite and restrained lime visual system (#17191C, #1D2024, #24282D, #30343A, #F0F1ED, #969CA5, #C4D36A) built for zero-fatigue late-night gaming comms, watch parties, and casual hanging out.

---

## Features

- **Real-Time Voice Comms**: WebRTC audio powered by LiveKit Cloud with low-latency Opus encoding, automatic gain control, noise suppression, and echo cancellation.
- **Real Screen Sharing**: Stream full desktop displays or specific application windows with custom thumbnail previews using Electron's native `desktopCapturer`.
- **Real Speaking Indicators**: Visual glowing ring indicators driven by real-time participant audio levels from WebRTC tracks.
- **Hardware-Isolated Deafen**: Silences incoming remote audio tracks instantly without modifying your microphone state.
- **Persistent Voice Rooms**:
  - `Late lobby` — Casual nighttime hanging out and gaming.
  - `Ranked queue` — Competitive comms, low distraction.
  - `Watch party` — Screen sharing, YouTube, and movie watching.
  - `Just chatting` — Open mic banter.
- **Zero-Account Onboarding & Cryptographic Invites**: Instant device-tied identity with shareable single-click invite links (`nightshift://invite/CODE`).
- **Audio Diagnostics**: Built-in microphone input meter using the Web Audio API (`AudioContext` + `AnalyserNode`) and output device selection.
- **Geographic Resilience**: Designed for distributed users across different regions (including Iran and international networks) with LiveKit TURN over TLS/TCP fallback.

---

## Tech Stack

### Desktop Application (`apps/desktop`)
- **Runtime**: Electron 32 (Context Isolation, Sandboxed, Node Integration disabled)
- **Framework**: React 18 + TypeScript (Strict mode)
- **Bundler**: Vite 5
- **Styling**: Tailwind CSS (Custom dark graphite palette)
- **Icons**: Lucide React
- **State Management**: Zustand
- **Media Engine**: LiveKit Client SDK (`livekit-client`)

### Backend Server (`apps/server`)
- **Runtime**: Node.js + TypeScript
- **Framework**: Fastify 4 + CORS + Sensible
- **Database & ORM**: SQLite (`nightshift.db`) + Prisma ORM
- **Media Token Authority**: LiveKit Server SDK (`livekit-server-sdk`)
- **Validation**: Zod 3

### Shared Library (`packages/shared`)
- Strongly typed DTOs, schemas, constants, and color definitions shared between backend and desktop app.

---

## Repository Structure

```
nightshift/
├── package.json              # Monorepo workspace configuration (npm workspaces)
├── .env                      # Local environment configuration
├── .env.example              # Template environment variables
├── packages/
│   └── shared/               # Shared Zod schemas, TypeScript types, and constants
└── apps/
    ├── server/               # Fastify API, Prisma SQLite ORM, LiveKit token generation
    │   ├── prisma/           # Database schema and seed script
    │   ├── src/              # Routes, services, config
    │   └── test/             # Vitest unit & end-to-end integration tests
    └── desktop/              # Electron & React desktop client
        ├── electron/         # Electron main process & secure preload bridge
        ├── src/              # React components, stores, styles, audio hooks
        └── dist/             # Production build artifacts
```

---

## Prerequisites

- **Node.js**: v18.0.0 or higher (v20+ recommended, tested on v26)
- **npm**: v9.0.0 or higher (tested on npm 11)
- **Git**
- **Windows 10/11** (for the native desktop build)

---

## Quick Start (Local Development)

### 1. Install Dependencies
In the root directory, install all workspace packages:
```bash
npm install
```

### 2. Configure Environment Variables
Copy `.env.example` to `.env` (or configure your existing `.env`):
```env
LIVEKIT_URL=wss://voiceline-qy3slc6n.livekit.cloud
LIVEKIT_API_KEY=APIr7js7v7NxHjD
LIVEKIT_API_SECRET=VQkZ672DPv1iqtqY3AmIDef9rtYYeslWjfJjbVjoFfwA
SERVER_PORT=3001
SERVER_HOST=127.0.0.1
DATABASE_URL=file:./nightshift.db
APP_BASE_URL=http://localhost:5173
```

### 3. Initialize & Seed Database
Run the Prisma migrations and seed the 4 default rooms:
```bash
npm run db:migrate
npm run db:seed
```

### 4. Start the Application
Run both the Fastify server and Vite desktop renderer concurrently:
```bash
npm run dev
```
- **Backend API**: `http://127.0.0.1:3001`
- **Frontend App**: `http://localhost:5173`

To launch the native Electron desktop shell:
```bash
npm run dev:electron
```

---

## Testing & Quality Assurance

### Run Automated Tests
Execute the unit and integration test suite (Fastify routes, auth, room joining, LiveKit JWT generation, invitation validation):
```bash
npm run test
```

### Run TypeScript Typechecking
Verify TypeScript types across all workspaces:
```bash
npm run typecheck
```

### Build Production Bundle
Build the shared library, backend, and desktop application bundle:
```bash
npm run build
```

---

## Packaging a Windows Installer

To build a standalone Windows executable (`.exe` or portable package):
```bash
npm run dist
```
This uses `electron-builder` to package the compiled application into `apps/desktop/dist/` with code signing and NSIS installer options.

---

## Geographically Distributed Network Connectivity

Users connecting from different countries or restricted ISP networks (e.g. Iran) may experience UDP filtering or high packet loss on standard WebRTC ports. NIGHTSHIFT addresses this through:

1. **LiveKit Cloud Global Edge Routing**: Automatic connection to the nearest low-latency media node.
2. **TURN over TLS / TCP Fallback**: Port 443 fallback ensures media packets traverse restrictive firewalls.
3. **Adaptive Bitrate Streaming (Dynacast)**: Video resolution and bitrate scale down dynamically to preserve audio clarity when packet loss occurs.
4. **Latency Diagnostics**: Check real-time connection status in the Settings > Application tab.

---

## API Documentation

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/health` | Health status and LiveKit cloud reachability |
| `POST` | `/api/auth/register` | Register or restore device session with display name |
| `GET` | `/api/auth/me` | Fetch active user profile by `x-device-id` header |
| `PATCH` | `/api/auth/profile` | Update user display name |
| `GET` | `/api/rooms` | List all voice rooms with active participant count |
| `POST` | `/api/rooms` | Create a new room |
| `POST` | `/api/rooms/:id/join` | Join room and issue short-lived LiveKit access token |
| `POST` | `/api/invitations` | Generate a cryptographically random invitation code |
| `GET` | `/api/invitations/:code/validate` | Validate an invitation code and check expiration |
| `POST` | `/api/invitations/:code/claim` | Increment usage counter on an invitation |

---

## License

Private project for friends. All rights reserved.
