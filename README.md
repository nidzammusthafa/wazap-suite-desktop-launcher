# WazapSuite Desktop Launcher

A modern, secure, and robust desktop launcher for the WazapSuite application. Built with Electron, it manages the lifecycle of the bundled NestJS server, handles licensing, provides Cloudflare Tunnel integration, and serves as the entry point for the user.

![Version](https://img.shields.io/badge/version-1.0.0-blue.svg)
![Electron](https://img.shields.io/badge/Electron-33.0.0-blueviolet.svg)
![NestJS](https://img.shields.io/badge/Server-NestJS-red.svg)

## 🚀 Key Features

- **Server Management**: Automatically bundles, extracts, and manages the lifecycle (Start/Stop/Restart) of the local NestJS server (`main.exe`).
- **Cloudflare Tunnel**: Integrated `cloudflared` support to expose the local server to the internet securely without port forwarding.
- **License System**: Hardware-ID based licensing system with online validation.
- **Dashboard UI**: A modern, dark-themed dashboard to monitor server status, view logs, and configure settings.
- **Auto-Updates**: Built-in support for over-the-air updates via `electron-updater`.
- **Configuration**: UI-based settings for Server Port, Chrome Path, and Tunnel Configuration.

## 🛠️ Architecture

This project is part of the WazapSuite ecosystem:

1.  **Desktop Launcher (This Project)**: Electron app that acts as a process manager and UI wrapper.
2.  **Server (`new-server`)**: The backend logic (WhatsApp Web.js, API), compiled into a single executable (`main.exe`) using Node.js SEA (Single Executable Applications).
3.  **Client (`new-client`)**: The frontend interface, hosted on Vercel or bundled locally.

## 📦 Prerequisites

- Node.js 18+ (LTS recommended)
- NPM or Yarn
- **Important**: You must build the server executable before building the desktop app.

## 💻 Development Setup

1.  **Install Dependencies**:

    ```bash
    cd desktop
    npm install
    ```

2.  **Prepare Resources**:
    Ensure the server executable is built in `../new-server/dist/main.exe`.

    ```bash
    # In ../new-server
    npm run build:sea
    ```

3.  **Run in Development Mode**:
    ```bash
    npm run dev
    ```
    This will compile TypeScript and launch the Electron app with DevTools enabled.

## 🏗️ Build & Distribution

To create a production installer (`.exe`):

1.  **Build the Server**:
    Ensure `new-server` is built and `main.exe` exists in `new-server/dist/`.

2.  **Run Distribution Script**:

    ```bash
    npm run dist
    ```

    **What happens during build?**
    - **TypeScript Compilation**: Source code is compiled to `dist/`.
    - **Resource Bundling (`scripts/prepare.js`)**:
      - Copies `main.exe`, `prisma/`, and `.env` from `new-server`.
      - Downloads the latest `cloudflared.exe` from Cloudflare.
      - Bundles everything into `resources/server.zip`.
    - **Packaging**: Electron Builder packages the app and the `server.zip` into a tailored installer (NSIS).

3.  **Output**:
    The installer will be generated in `desktop/out-v10/`.

## ⚙️ Configuration

The application stores user configuration in `%APPDATA%\WazapSuite\config.json`.

| Key               | Description                             | Default                          |
| ----------------- | --------------------------------------- | -------------------------------- |
| `serverPort`      | Port for the local NestJS server        | `4000`                           |
| `chromePath`      | Custom path to Google Chrome executable | `""` (Auto-detect)               |
| `licenseKey`      | The active license key                  | `undefined`                      |
| `tunneling`       | Cloudflare tunnel settings              | `{ enabled: false }`             |
| `hostedClientUrl` | URL of the hosted frontend              | `https://wazap-suite.vercel.app` |

## 🧩 Project Structure

```
desktop/
├── src/
│   ├── main/                 # Main Process (Node.js)
│   │   ├── index.ts          # Entry point
│   │   ├── server-manager.ts # Server lifecycle logic
│   │   ├── tunnel-manager.ts # Cloudflare tunnel logic
│   │   ├── license-manager.ts# License validation
│   │   └── ipc/              # IPC Handlers
│   ├── preload/              # Context Bridge (Security)
│   └── renderer/             # UI (Frontend)
│       ├── index.html        # Main Dashboard HTML
│       └── styles/           # CSS Styles (Slate/Indigo Theme)
├── scripts/
│   ├── prepare.js            # Build script to bundle server & cloudflared
│   └── copy-assets.js        # Helper to copy static assets
├── resources/                # Static assets (icons, etc.)
└── electron-builder.yml      # Builder configuration
```

## 🔧 Troubleshooting

- **Server fails to start**: Check the "System Logs" tab in the dashboard. Common issues include port conflicts (Port 4000 in use) or missing dependencies (Visual C++ Redistributable).
- **Tunnel fails to connect**: Ensure you have an active internet connection. The app attempts to download `cloudflared` during build; if it's missing, the tunnel feature will be disabled.
- **License Error**: Ensure the license server (`https://wazap-suite-licence.vercel.app`) is reachable.

## 📜 License

Copyright © 2026 WazapSuite. All rights reserved.
Proprietary software. Unauthorized copying or distribution is strictly prohibited.
