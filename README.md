<div align="center">

# Collab Whiteboard

**Real-time collaborative whiteboard for macOS**

![Electron](https://img.shields.io/badge/Electron-2B2E3A?style=for-the-badge&logo=electron&logoColor=9FEAF9)
![React](https://img.shields.io/badge/React-20232A?style=for-the-badge&logo=react&logoColor=61DAFB)
![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?style=for-the-badge&logo=typescript&logoColor=white)
![Socket.IO](https://img.shields.io/badge/Socket.IO-010101?style=for-the-badge&logo=socketdotio&logoColor=white)
![macOS](https://img.shields.io/badge/macOS-000000?style=for-the-badge&logo=apple&logoColor=white)

[**Download for macOS**](#download) / [Features](#features) / [Getting Started](#getting-started)

</div>

![Collab Whiteboard Demo](demo.gif)

## Download

**macOS only** (Windows/Linux coming soon...)

1. Go to the [**Releases**](../../releases/latest) page
2. Download the latest `.dmg` file
3. Open it, drag **Collab Whiteboard** into your Applications folder
4. Launch and start drawing

> **Note:** If macOS blocks the app on first launch, go to **System Settings → Privacy & Security** and click **Open Anyway**.

## Features

**Drawing & Editing**
- Pen tool, shapes, text boxes, and sticky notes
- Move, resize, and delete objects
- Color and style customization
- Undo / redo, clear board

**File Management**
- Save and load board files locally
- Export board as PNG

**Collaboration**
- Create a room - your current board becomes the shared board
- Others join via room code and instantly receive the latest state
- Live cursors and presence bubbles
- Synced board titles and real-time drawing / object movement
- Silent reconnect with automatic board resync

## Tech Stack

<div align="center">

| Layer | Tech |
|---|---|
| Desktop Shell | Electron / Electron Builder |
| Frontend | React / TypeScript / Vite |
| Canvas | Konva / React Konva |
| Backend | Node.js / Socket.IO |
| Hosting | DigitalOcean Droplet |

</div>

## 💡 How Collaboration Works

1. **Create a room** - generates a room code, your current board becomes the shared state
2. **Share the code** - other users enter it to join
3. **Sync** - all drawing, movement, and edits broadcast in real time via Socket.IO
4. **Reconnect** - on disconnect, users silently rejoin and resync the latest board automatically
