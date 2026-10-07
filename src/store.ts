import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type Tool = 'brush' | 'eraser' | 'ruler' | 'circle' | 'image' | 'pan' | 'move';

export interface Point {
  x: number;
  y: number;
  pressure: number;
}

export interface Layer {
  id: string;
  name: string;
  visible: boolean;
  opacity: number;
  background: 'transparent' | 'white';
  offsetX: number;
  offsetY: number;
}

export interface Stroke {
  id: string;
  tool: Exclude<Tool, 'pan' | 'move'>;
  points: Point[];
  color: string;
  size: number;
  opacity: number;
  imageUrl?: string;
  imageWidth?: number;
  imageHeight?: number;
  rotation?: number;
  layerId: string;
}

export interface AppState {
  currentTool: Tool;
  color: string;
  strokeWidth: number;
  strokeOpacity: number;
  
  projectId: string | null;
  projectName: string;
  projectWidth: number | null;
  projectHeight: number | null;
  
  // Viewport State
  zoom: number;
  pan: { x: number; y: number };
  
  // Layers State
  layers: Layer[];
  activeLayerId: string;
  
  // History State
  strokes: Stroke[];
  undoneStrokes: Stroke[];

  // Actions
  setProjectSize: (width: number, height: number) => void;
  resetProject: () => void;
  closeProject: () => void;
  loadProject: (stateData: Partial<AppState>) => void;
  setProjectName: (name: string) => void;
  
  setTool: (tool: Tool) => void;
  setColor: (color: string) => void;
  setStrokeWidth: (width: number) => void;
  setStrokeOpacity: (opacity: number) => void;
  
  setZoom: (zoom: number) => void;
  setPan: (pan: { x: number; y: number } | ((prev: {x: number, y: number}) => {x: number, y: number})) => void;
  
  addLayer: () => void;
  removeLayer: (id: string) => void;
  setActiveLayer: (id: string) => void;
  toggleLayerVisibility: (id: string) => void;
  setLayerOpacity: (id: string, opacity: number) => void;
  moveLayer: (id: string, direction: 'up' | 'down') => void;
  reorderLayer: (id: string, newIndex: number) => void;
  setLayerBackground: (id: string, background: 'transparent' | 'white') => void;
  setLayerOffset: (id: string, dx: number, dy: number) => void;
  
  addStroke: (stroke: Stroke) => void;
  updateStroke: (id: string, updates: Partial<Stroke>) => void;
  undo: () => void;
  redo: () => void;
}

export const useStore = create<AppState>()(
  persist(
    (set) => ({
  currentTool: 'brush',
  color: '#000000',
  strokeWidth: 5,
  strokeOpacity: 1,
  
  projectId: null,
  projectName: 'Nouveau projet',
  projectWidth: null,
  projectHeight: null,
  
  zoom: 1,
  pan: { x: 0, y: 0 },
  
  // Par défaut, le premier calque a un fond blanc pour la zone de dessin
  layers: [{ id: 'layer-1', name: 'Arrière-plan', visible: true, opacity: 1, background: 'white', offsetX: 0, offsetY: 0 }],
  activeLayerId: 'layer-1',

  strokes: [],
  undoneStrokes: [],

  setProjectSize: (width, height) => set({ 
    projectId: `proj-${Date.now()}`,
    projectName: `Projet ${new Date().toLocaleDateString()}`,
    projectWidth: width, 
    projectHeight: height,
    layers: [{ id: 'layer-1', name: 'Arrière-plan', visible: true, opacity: 1, background: 'white', offsetX: 0, offsetY: 0 }],
    activeLayerId: 'layer-1',
    strokes: [],
    undoneStrokes: [],
    zoom: 1,
    pan: { x: 0, y: 0 }
  }),
  resetProject: () => set({
    projectId: `proj-${Date.now()}`,
    projectName: `Projet ${new Date().toLocaleDateString()}`,
    projectWidth: null,
    projectHeight: null,
    layers: [{ id: 'layer-1', name: 'Arrière-plan', visible: true, opacity: 1, background: 'white', offsetX: 0, offsetY: 0 }],
    activeLayerId: 'layer-1',
    strokes: [],
    undoneStrokes: [],
    zoom: 1,
    pan: { x: 0, y: 0 }
  }),
  closeProject: () => set({
    projectId: null,
    projectWidth: null,
    projectHeight: null
  }),
  loadProject: (stateData) => set(stateData),
  setProjectName: (name) => set({ projectName: name }),

  setTool: (tool) => set({ currentTool: tool }),
  setColor: (color) => set({ color }),
  setStrokeWidth: (width) => set({ strokeWidth: width }),
  setStrokeOpacity: (opacity) => set({ strokeOpacity: opacity }),

  setZoom: (zoom) => set({ zoom }),
  setPan: (panUpdater) => set((state) => ({ 
    pan: typeof panUpdater === 'function' ? panUpdater(state.pan) : panUpdater 
  })),

  addLayer: () => set((state) => {
    const newId = `layer-${Date.now()}`;
    return {
      layers: [{ id: newId, name: `Calque ${state.layers.length + 1}`, visible: true, opacity: 1, background: 'transparent', offsetX: 0, offsetY: 0 }, ...state.layers],
      activeLayerId: newId
    };
  }),
  
  removeLayer: (id) => set((state) => {
    if (state.layers.length <= 1) return state; // Impossible de supprimer le dernier calque
    const newLayers = state.layers.filter(l => l.id !== id);
    const newActiveId = state.activeLayerId === id ? newLayers[0].id : state.activeLayerId;
    return { layers: newLayers, activeLayerId: newActiveId };
  }),
  
  setActiveLayer: (id) => set({ activeLayerId: id }),
  
  toggleLayerVisibility: (id) => set((state) => ({
    layers: state.layers.map(l => l.id === id ? { ...l, visible: !l.visible } : l)
  })),
  
  setLayerOpacity: (id, opacity) => set((state) => ({
    layers: state.layers.map(l => l.id === id ? { ...l, opacity } : l)
  })),
  
  moveLayer: (id, direction) => set((state) => {
    const index = state.layers.findIndex(l => l.id === id);
    if (index < 0) return state;
    if (direction === 'up' && index === 0) return state;
    if (direction === 'down' && index === state.layers.length - 1) return state;
    
    const newLayers = [...state.layers];
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    const temp = newLayers[index];
    newLayers[index] = newLayers[targetIndex];
    newLayers[targetIndex] = temp;
    return { layers: newLayers };
  }),

  reorderLayer: (id, newIndex) => set((state) => {
    const oldIndex = state.layers.findIndex(l => l.id === id);
    if (oldIndex < 0 || newIndex < 0 || newIndex >= state.layers.length || oldIndex === newIndex) return state;
    
    const newLayers = [...state.layers];
    const [movedLayer] = newLayers.splice(oldIndex, 1);
    newLayers.splice(newIndex, 0, movedLayer);
    
    return { layers: newLayers };
  }),

  setLayerBackground: (id, background) => set((state) => ({
    layers: state.layers.map(l => l.id === id ? { ...l, background } : l)
  })),
  
  setLayerOffset: (id, dx, dy) => set((state) => ({
    layers: state.layers.map(l => l.id === id ? { ...l, offsetX: l.offsetX + dx, offsetY: l.offsetY + dy } : l)
  })),

  addStroke: (stroke) => set((state) => ({
    strokes: [...state.strokes, stroke],
    undoneStrokes: [] // Efface l'historique "refaire" quand on dessine un nouveau trait
  })),

  updateStroke: (id, updates) => set((state) => ({
    strokes: state.strokes.map(s => s.id === id ? { ...s, ...updates } : s)
  })),

  undo: () => set((state) => {
    if (state.strokes.length === 0) return state;
    const newStrokes = [...state.strokes];
    const lastStroke = newStrokes.pop();
    if (!lastStroke) return state;
    
    return {
      strokes: newStrokes,
      undoneStrokes: [...state.undoneStrokes, lastStroke]
    };
  }),

  redo: () => set((state) => {
    if (state.undoneStrokes.length === 0) return state;
    const newUndone = [...state.undoneStrokes];
    const nextStroke = newUndone.pop();
    if (!nextStroke) return state;

    return {
      undoneStrokes: newUndone,
      strokes: [...state.strokes, nextStroke]
    };
  }),
    }),
    {
      name: 'tablet-paint-storage',
      partialize: (state) => ({ 
        projectId: state.projectId,
        projectName: state.projectName, 
        projectWidth: state.projectWidth,
        projectHeight: state.projectHeight,
        layers: state.layers, 
        strokes: state.strokes, 
        activeLayerId: state.activeLayerId,
        strokeWidth: state.strokeWidth,
        strokeOpacity: state.strokeOpacity,
        color: state.color,
      }),
    }
  )
);
