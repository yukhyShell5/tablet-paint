import { create } from 'zustand';
import { get, set, del } from 'idb-keyval';
import type { AppState } from './store';

export interface ProjectMeta {
  id: string;
  name: string;
  updatedAt: number;
  width: number;
  height: number;
  thumbnail?: string;
}

interface ProjectsState {
  projects: ProjectMeta[];
  loadProjects: () => Promise<void>;
  saveProject: (id: string, name: string, stateData: Partial<AppState>) => Promise<void>;
  deleteProject: (id: string) => Promise<void>;
}

export const useProjectsStore = create<ProjectsState>((setStore) => ({
  projects: [],
  loadProjects: async () => {
    const list = await get<ProjectMeta[]>('tablet-paint-projects-index') || [];
    setStore({ projects: list.sort((a, b) => b.updatedAt - a.updatedAt) });
  },
  saveProject: async (id, name, stateData) => {
    // Purge functions for IndexedDB Structured Clone Algorithm
    const dataToSave = {
      projectId: stateData.projectId,
      projectName: stateData.projectName,
      projectWidth: stateData.projectWidth,
      projectHeight: stateData.projectHeight,
      layers: stateData.layers,
      activeLayerId: stateData.activeLayerId,
      strokes: stateData.strokes,
      undoneStrokes: stateData.undoneStrokes,
      zoom: stateData.zoom,
      pan: stateData.pan,
      currentTool: stateData.currentTool,
      color: stateData.color,
      strokeWidth: stateData.strokeWidth,
      strokeOpacity: stateData.strokeOpacity,
    };
    await set(`project-data-${id}`, dataToSave);
    // Update index
    const list = await get<ProjectMeta[]>('tablet-paint-projects-index') || [];
    const existing = list.find(p => p.id === id);
    let newList;
    if (existing) {
      existing.updatedAt = Date.now();
      existing.name = name;
      existing.width = stateData.projectWidth || 1000;
      existing.height = stateData.projectHeight || 1000;
      newList = [...list];
    } else {
      newList = [...list, { 
        id, 
        name, 
        updatedAt: Date.now(), 
        width: stateData.projectWidth || 1000, 
        height: stateData.projectHeight || 1000 
      }];
    }
    await set('tablet-paint-projects-index', newList);
    setStore({ projects: newList.sort((a, b) => b.updatedAt - a.updatedAt) });
  },
  deleteProject: async (id) => {
    await del(`project-data-${id}`);
    const list = await get<ProjectMeta[]>('tablet-paint-projects-index') || [];
    const newList = list.filter(p => p.id !== id);
    await set('tablet-paint-projects-index', newList);
    setStore({ projects: newList });
  }
}));

export const loadProjectData = async (id: string) => {
  return await get(`project-data-${id}`);
};
