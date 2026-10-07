# Tablet Paint 🎨

A lightweight, high-performance web-based drawing application specifically optimized for graphics tablets. Built entirely on the frontend with React, it features a native-feeling canvas engine with pressure-like simulation, infinite local saves, and professional layer management.

## ✨ Features

- **Optimized for Graphics Tablets**: UI designed to stay out of the way. No keyboard shortcuts required.
- **Custom Canvas Engine**: Dynamic cursors, smooth stroke rendering, and a custom blending system (eraser perfectly handles both white and transparent backgrounds).
- **Layer System**: Full support for multiple layers, opacity, visibility toggling, reordering, and background modes.
- **Persistent Local Gallery**: Your projects are automatically and continuously saved in your browser using IndexedDB. No data is ever lost.
- **Project Import/Export**: Save your complete workspace as a `.tpt` (Tablet Paint Tool) file to back it up or share it, and load it later.
- **PNG Export**: Instantly flatten and export your masterpieces to standard PNG formats.
- **Infinite Undo/Redo**: Non-destructive history for all your strokes.

## 🛠️ Tech Stack

- **Framework**: [React 18](https://react.dev/) + [TypeScript](https://www.typescriptlang.org/)
- **Bundler**: [Vite](https://vitejs.dev/)
- **State Management**: [Zustand](https://zustand-demo.pmnd.rs/)
- **Database**: [idb-keyval](https://github.com/jakearchibald/idb-keyval) (IndexedDB wrapper for local storage)
- **Icons**: [Lucide React](https://lucide.dev/)
- **Package Manager**: [Bun](https://bun.sh/)

## 🚀 Getting Started

### Prerequisites

You need to have [Bun](https://bun.sh/) installed on your machine.

### Installation

1. Clone the repository:
```bash
git clone https://github.com/your-username/tablet-paint.git
cd tablet-paint
```

2. Install the dependencies:
```bash
bun install
```

3. Start the development server:
```bash
bun run dev
```

4. Open your browser and navigate to `http://localhost:5173`.

## 📂 Project Structure

```
tablet-paint/
├── public/                 # Static assets
├── src/
│   ├── components/
│   │   └── DrawingCanvas.tsx  # Core HTML5 Canvas rendering engine
│   ├── App.tsx             # Main UI layout, Toolbar, and Welcome Screen
│   ├── store.ts            # Zustand global state (Tools, Layers, History)
│   ├── projectsStore.ts    # IndexedDB persistence & Gallery management
│   ├── App.css             # Styles and layout
│   └── main.tsx            # React entry point
├── package.json
└── vite.config.ts
```

## 🏗️ Building for Production

To create a production-ready build (ideal for GitHub Pages or Vercel):

```bash
bun run build
```
The optimized static files will be generated in the `dist/` directory.

## 📄 License

This project is open-source and available under the [MIT License](LICENSE).
