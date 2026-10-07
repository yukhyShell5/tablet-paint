import { useEffect, useState, useRef } from 'react';
import { Pen, Eraser, Ruler, Circle, Image as ImageIcon, Download, Undo, Redo, Layers, Eye, EyeOff, Plus, Trash2, ArrowUp, ArrowDown, Hand, ZoomIn, ZoomOut, Maximize, Move, File, Save, FolderOpen, Pencil } from 'lucide-react';
import { useStore } from './store';
import { useProjectsStore, loadProjectData } from './projectsStore';
import type { Tool } from './store';
import { DrawingCanvas, renderStroke } from './components/DrawingCanvas';
import './App.css';

function App() {
  const { 
    currentTool, color, strokeWidth, strokeOpacity,
    setTool, setColor, setStrokeWidth, setStrokeOpacity,
    undo, redo, strokes, undoneStrokes,
    addStroke,
    projectWidth, projectHeight, setProjectSize, closeProject, loadProject,
    layers, activeLayerId, addLayer, removeLayer, setActiveLayer, toggleLayerVisibility, moveLayer, reorderLayer,
    setZoom, setPan
  } = useStore();

  const zoomInterval = useRef<number | null>(null);

  const startZoomIn = () => {
    if (zoomInterval.current) return;
    setZoom(Math.min(3, useStore.getState().zoom * 1.1));
    zoomInterval.current = window.setInterval(() => {
      setZoom(Math.min(3, useStore.getState().zoom * 1.05));
    }, 100);
  };

  const startZoomOut = () => {
    if (zoomInterval.current) return;
    setZoom(Math.max(0.1, useStore.getState().zoom / 1.1));
    zoomInterval.current = window.setInterval(() => {
      setZoom(Math.max(0.1, useStore.getState().zoom / 1.05));
    }, 100);
  };

  const stopZoom = () => {
    if (zoomInterval.current) {
      clearInterval(zoomInterval.current);
      zoomInterval.current = null;
    }
  };

  const handleResetView = () => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  };

  const [draggedLayerIndex, setDraggedLayerIndex] = useState<number | null>(null);
  const [activeSettingsTool, setActiveSettingsTool] = useState<Tool | null>(null);

  const [customWidth, setCustomWidth] = useState<string>('1000');
  const [customHeight, setCustomHeight] = useState<string>('1000');
  const { projects, deleteProject } = useProjectsStore();

  useEffect(() => {
    // Initial load
    useProjectsStore.getState().loadProjects();

    // Auto-save avec debounce de 1500ms pour ne pas sauvegarder à chaque trait
    let saveTimeout: number | null = null;
    const unsub = useStore.subscribe((state) => {
      if (state.projectId && state.projectWidth && state.projectHeight) {
        if (saveTimeout) clearTimeout(saveTimeout);
        saveTimeout = window.setTimeout(() => {
          useProjectsStore.getState().saveProject(state.projectId!, state.projectName, state);
        }, 1500);
      }
    });

    return () => {
      unsub();
      if (saveTimeout) clearTimeout(saveTimeout);
    };
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        if (e.shiftKey) {
          redo();
        } else {
          undo();
        }
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
        redo();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [undo, redo]);

  const handleOpenProject = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.tpt,application/json';
    input.onchange = (e: any) => {
      const file = e.target?.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const data = JSON.parse(e.target?.result as string);
          if (data && data.layers && data.strokes) {
            // Toujours générer un nouvel ID et nom lors d'un import
            data.projectId = `proj-${Date.now()}`;
            data.projectName = `Projet importé ${new Date().toLocaleDateString()}`;
            loadProject(data);
          } else {
            alert('Fichier de projet invalide.');
          }
        } catch (error) {
          alert('Erreur lors de la lecture du fichier de projet.');
        }
      };
      reader.readAsText(file);
    };
    input.click();
  };

  if (!projectWidth || !projectHeight) {
    return (
      <div className="welcome-screen">
        <h1>Nouveau Projet</h1>
        <p>Choisissez un format pour commencer à dessiner :</p>
        <div className="format-grid">
          <button onClick={() => setProjectSize(1920, 1080)}>
            <strong>Paysage FHD</strong>
            <span>1920 × 1080 px</span>
          </button>
          <button onClick={() => setProjectSize(1080, 1920)}>
            <strong>Portrait FHD</strong>
            <span>1080 × 1920 px</span>
          </button>
          <button onClick={() => setProjectSize(1200, 800)}>
            <strong>Web Standard</strong>
            <span>1200 × 800 px</span>
          </button>
          <button onClick={() => setProjectSize(1080, 1080)}>
            <strong>Carré (Insta)</strong>
            <span>1080 × 1080 px</span>
          </button>
          <button onClick={() => setProjectSize(2480, 3508)}>
            <strong>A4 (300dpi)</strong>
            <span>2480 × 3508 px</span>
          </button>
          
          <div className="custom-format-card">
            <strong>Personnalisé</strong>
            <div className="custom-inputs">
              <input 
                type="number" 
                value={customWidth} 
                onChange={(e) => setCustomWidth(e.target.value)} 
                min="10"
                placeholder="L"
              />
              <span>×</span>
              <input 
                type="number" 
                value={customHeight} 
                onChange={(e) => setCustomHeight(e.target.value)} 
                min="10"
                placeholder="H"
              />
            </div>
            <button 
              className="create-btn"
              onClick={() => {
                const w = Math.max(10, parseInt(customWidth) || 1000);
                const h = Math.max(10, parseInt(customHeight) || 1000);
                setProjectSize(w, h);
              }}
            >
              Créer
            </button>
          </div>
        </div>
        
        <button 
          className="open-project-btn" 
          onClick={handleOpenProject}
          style={{ marginTop: '20px', padding: '10px 20px', display: 'flex', alignItems: 'center', gap: '10px', backgroundColor: '#333', color: 'white', border: '1px solid #555', borderRadius: '8px', cursor: 'pointer', fontSize: '1rem' }}
        >
          <FolderOpen size={20} />
          Importer un fichier de projet (.tpt)
        </button>

        {projects.length > 0 && (
          <div className="projects-gallery" style={{ marginTop: '40px', width: '100%', maxWidth: '800px' }}>
            <h2 style={{ textAlign: 'left', marginBottom: '20px', borderBottom: '1px solid #333', paddingBottom: '10px' }}>Projets récents</h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '20px' }}>
              {projects.map(p => (
                <div key={p.id} className="project-card" style={{ backgroundColor: '#2a2a2a', border: '1px solid #444', borderRadius: '8px', padding: '15px', position: 'relative', textAlign: 'left' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '5px' }}>
                    <h3 style={{ fontSize: '1.1rem', margin: 0 }}>{p.name}</h3>
                    <button 
                      onClick={async () => {
                        const newName = window.prompt('Nouveau nom du projet :', p.name);
                        if (newName && newName.trim() !== '') {
                          const data = await loadProjectData(p.id);
                          if (data) {
                            data.projectName = newName.trim();
                            useProjectsStore.getState().saveProject(p.id, data.projectName, data);
                          }
                        }
                      }}
                      style={{ background: 'none', border: 'none', color: '#aaa', cursor: 'pointer', padding: '2px' }}
                      title="Renommer le projet"
                    >
                      <Pencil size={16} />
                    </button>
                  </div>
                  <p style={{ fontSize: '0.8rem', color: '#888', marginBottom: '15px' }}>
                    {p.width} × {p.height} px<br />
                    Modifié le {new Date(p.updatedAt).toLocaleDateString()}
                  </p>
                  <div style={{ display: 'flex', gap: '10px' }}>
                    <button 
                      onClick={async () => {
                        const data = await loadProjectData(p.id);
                        if (data) loadProject(data);
                      }}
                      style={{ flex: 1, padding: '8px', backgroundColor: '#4a90e2', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
                    >
                      Ouvrir
                    </button>
                    <button 
                      onClick={() => {
                        if (window.confirm('Supprimer ce projet ?')) {
                          deleteProject(p.id);
                        }
                      }}
                      style={{ padding: '8px', backgroundColor: '#e74c3c', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  const handleSaveProject = () => {
    const state = useStore.getState();
    const projectData = {
      projectWidth: state.projectWidth,
      projectHeight: state.projectHeight,
      layers: state.layers,
      activeLayerId: state.activeLayerId,
      strokes: state.strokes,
      undoneStrokes: state.undoneStrokes,
    };
    const blob = new Blob([JSON.stringify(projectData)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'projet.tpt';
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleExport = () => {
    const state = useStore.getState();
    const pw = state.projectWidth || 1200;
    const ph = state.projectHeight || 800;

    const exportCanvas = document.createElement('canvas');
    exportCanvas.width = pw;
    exportCanvas.height = ph;
    const ctx = exportCanvas.getContext('2d');
    if (!ctx) return;

    // Dessiner les calques dans l'ordre inverse (bas → haut) en espace projet (1:1, sans zoom)
    const orderedLayers = [...state.layers].reverse();
    for (const layer of orderedLayers) {
      if (!layer.visible) continue;

      // Canvas offscreen par calque pour isoler l'opacité
      const layerCanvas = document.createElement('canvas');
      layerCanvas.width = pw;
      layerCanvas.height = ph;
      const lctx = layerCanvas.getContext('2d');
      if (!lctx) continue;

      lctx.save();
      lctx.translate(layer.offsetX || 0, layer.offsetY || 0);

      if (layer.background === 'white') {
        lctx.fillStyle = '#ffffff';
        lctx.fillRect(-(layer.offsetX || 0), -(layer.offsetY || 0), pw, ph);
      }

      const layerStrokes = state.strokes.filter(s => s.layerId === layer.id);
      layerStrokes.forEach(stroke => renderStroke(lctx, stroke, layer.background));

      lctx.restore();

      // Composer en respectant l'opacité du calque
      ctx.globalAlpha = layer.opacity;
      ctx.drawImage(layerCanvas, 0, 0);
      ctx.globalAlpha = 1;
    }

    const dataUrl = exportCanvas.toDataURL('image/png');
    const a = document.createElement('a');
    a.href = dataUrl;
    a.download = 'tablet-paint-export.png';
    a.click();
  };

  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const dataUrl = event.target?.result as string;
      if (dataUrl) {
        const newLayerId = `img-layer-${Date.now()}`;
        
        // 1. Créer un nouveau calque spécifique pour l'image
        useStore.setState((state) => ({
          layers: [
            { id: newLayerId, name: file.name, visible: true, opacity: 1, background: 'transparent', offsetX: 0, offsetY: 0 }, 
            ...state.layers
          ],
          activeLayerId: newLayerId
        }));
        
        // 2. Ajouter l'image comme un trait spécial sur ce nouveau calque
        addStroke({
          id: `stroke-${Date.now()}`,
          tool: 'image',
          points: [{ x: 0, y: 0, pressure: 0.5 }],
          color: '#000000',
          size: 1,
          opacity: 1,
          imageUrl: dataUrl,
          layerId: newLayerId
        });
      }
    };
    reader.readAsDataURL(file);
    // Reset l'input pour pouvoir ré-importer la même image
    e.target.value = '';
  };


  const tools: { id: Tool; icon: React.ReactNode; label: string }[] = [
    { id: 'brush', icon: <Pen size={24} />, label: 'Pinceau' },
    { id: 'eraser', icon: <Eraser size={24} />, label: 'Gomme' },
    { id: 'ruler', icon: <Ruler size={24} />, label: 'Règle (Ligne droite)' },
    { id: 'circle', icon: <Circle size={24} />, label: 'Cercle / Ellipse' },
    { id: 'move', icon: <Move size={24} />, label: 'Déplacer le calque' },
    { id: 'pan', icon: <Hand size={24} />, label: 'Naviguer (Pan)' },
  ];

  return (
    <div className="app-container">
      {/* Barre d'outils latérale */}
      <aside className="toolbar">
        <div className="tools-group">
          {tools.map((t) => (
            <div key={t.id} className="tool-wrapper" style={{ position: 'relative' }}>
              <button
                className={`tool-btn ${currentTool === t.id ? 'active' : ''}`}
                onClick={() => {
                  if (currentTool === t.id && ['brush', 'eraser', 'ruler', 'circle'].includes(t.id)) {
                    setActiveSettingsTool(activeSettingsTool === t.id ? null : t.id);
                  } else {
                    setTool(t.id);
                    if (['brush', 'eraser', 'ruler', 'circle'].includes(t.id)) {
                      setActiveSettingsTool(t.id);
                    } else {
                      setActiveSettingsTool(null);
                    }
                  }
                }}
                title={t.label}
              >
                {t.icon}
              </button>
              
              {activeSettingsTool === t.id && (
                <div className="tool-settings-popover">
                  <div className="popover-header">
                    <span>{t.label}</span>
                    <button className="close-popover" onClick={(e) => { e.stopPropagation(); setActiveSettingsTool(null); }}>×</button>
                  </div>
                  
                  {t.id !== 'eraser' && (
                    <div className="setting-row">
                      <label>Couleur</label>
                      <input 
                        type="color" 
                        value={color} 
                        onChange={(e) => setColor(e.target.value)} 
                        className="color-picker-small"
                      />
                    </div>
                  )}
                  
                  <div className="setting-row">
                    <label>Taille : {strokeWidth}px</label>
                    <input 
                      type="range" 
                      min="1" 
                      max="100" 
                      value={strokeWidth}
                      onChange={(e) => setStrokeWidth(parseInt(e.target.value))}
                    />
                  </div>
                  
                  {t.id !== 'eraser' && (
                    <div className="setting-row">
                      <label>Opacité : {Math.round(strokeOpacity * 100)}%</label>
                      <input 
                        type="range" 
                        min="1" 
                        max="100" 
                        value={strokeOpacity * 100}
                        onChange={(e) => setStrokeOpacity(parseInt(e.target.value) / 100)}
                      />
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>

        <div className="divider"></div>

        <div className="actions-group">
          <button 
            className="tool-btn action-btn" 
            title="Zoomer" 
            onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); startZoomIn(); }}
            onPointerUp={(e) => { e.currentTarget.releasePointerCapture(e.pointerId); stopZoom(); }}
            onPointerLeave={stopZoom}
            onPointerCancel={stopZoom}
          ><ZoomIn size={24} /></button>
          <button 
            className="tool-btn action-btn" 
            title="Dézoomer" 
            onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); startZoomOut(); }}
            onPointerUp={(e) => { e.currentTarget.releasePointerCapture(e.pointerId); stopZoom(); }}
            onPointerLeave={stopZoom}
            onPointerCancel={stopZoom}
          ><ZoomOut size={24} /></button>
          <button className="tool-btn action-btn" title="Réinitialiser la vue" onClick={handleResetView}><Maximize size={24} /></button>
        </div>

        <div className="divider"></div>

        <div className="actions-group">
          <button 
            className="tool-btn action-btn" 
            title="Annuler (Undo)" 
            onClick={undo}
            disabled={strokes.length === 0}
            style={{ opacity: strokes.length === 0 ? 0.3 : 1 }}
          >
            <Undo size={24} />
          </button>
          <button 
            className="tool-btn action-btn" 
            title="Refaire (Redo)" 
            onClick={redo}
            disabled={undoneStrokes.length === 0}
            style={{ opacity: undoneStrokes.length === 0 ? 0.3 : 1 }}
          >
            <Redo size={24} />
          </button>
          <label className="tool-btn action-btn" title="Importer une image (JPG/PNG)">
            <input 
              type="file" 
              accept="image/png, image/jpeg" 
              style={{ display: 'none' }} 
              onChange={handleImport} 
            />
            <ImageIcon size={24} />
          </label>
          <button 
            className="tool-btn action-btn" 
            title="Retour à l'accueil / Galerie"
            onClick={() => {
              closeProject();
            }}
          >
            <File size={24} />
          </button>
          <button 
            className="tool-btn action-btn" 
            title="Ouvrir un projet (.tpt)"
            onClick={handleOpenProject}
          >
            <FolderOpen size={24} />
          </button>
          <button 
            className="tool-btn action-btn" 
            title="Sauvegarder le projet (.tpt)"
            onClick={handleSaveProject}
          >
            <Save size={24} />
          </button>
          <button 
            className="tool-btn action-btn" 
            title="Exporter l'image (PNG)"
            onClick={handleExport}
          >
            <Download size={24} />
          </button>
        </div>
      </aside>

      {/* Zone de dessin */}
      <main className="canvas-container">
        <DrawingCanvas key={`${projectWidth}-${projectHeight}`} />
      </main>

      {/* Panneau des calques (Right Sidebar) */}
      <aside className="layers-panel">
        <div className="layers-header">
          <Layers size={20} />
          <span>Calques</span>
          <button className="icon-btn" onClick={addLayer} title="Nouveau calque">
            <Plus size={18} />
          </button>
        </div>
        
        <div className="layers-list">
          {layers.map((layer, index) => (
            <div 
              key={layer.id} 
              draggable
              onDragStart={(e) => {
                setDraggedLayerIndex(index);
                e.dataTransfer.effectAllowed = 'move';
              }}
              onDragOver={(e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';
              }}
              onDrop={(e) => {
                e.preventDefault();
                if (draggedLayerIndex !== null && draggedLayerIndex !== index) {
                  reorderLayer(layers[draggedLayerIndex].id, index);
                }
                setDraggedLayerIndex(null);
              }}
              className={`layer-item ${activeLayerId === layer.id ? 'active' : ''} ${draggedLayerIndex === index ? 'dragging' : ''}`}
              onClick={() => setActiveLayer(layer.id)}
            >
              <button 
                className="icon-btn visibility-btn" 
                onClick={(e) => { e.stopPropagation(); toggleLayerVisibility(layer.id); }}
              >
                {layer.visible ? <Eye size={16} /> : <EyeOff size={16} color="#666" />}
              </button>
              
              <span className="layer-name">{layer.name}</span>
              
              <div className="layer-actions">
                <button 
                  className="icon-btn" 
                  onClick={(e) => { e.stopPropagation(); moveLayer(layer.id, 'up'); }}
                  disabled={index === 0}
                >
                  <ArrowUp size={14} />
                </button>
                <button 
                  className="icon-btn" 
                  onClick={(e) => { e.stopPropagation(); moveLayer(layer.id, 'down'); }}
                  disabled={index === layers.length - 1}
                >
                  <ArrowDown size={14} />
                </button>
                <button 
                  className="icon-btn delete-btn" 
                  onClick={(e) => { e.stopPropagation(); removeLayer(layer.id); }}
                  disabled={layers.length <= 1}
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          ))}
        </div>
        
        {/* Paramètres du calque actif */}
        {activeLayerId && (
          <div className="layer-settings">
            <h4>Paramètres du calque</h4>
            {layers.find(l => l.id === activeLayerId) && (() => {
              const activeLayer = layers.find(l => l.id === activeLayerId)!;
              return (
                <div className="setting-group">
                  <label>Fond :</label>
                  <select 
                    value={activeLayer.background} 
                    onChange={(e) => useStore.getState().setLayerBackground(activeLayer.id, e.target.value as 'transparent' | 'white')}
                    className="layer-select"
                  >
                    <option value="transparent">Transparent</option>
                    <option value="white">Blanc</option>
                  </select>
                </div>
              );
            })()}
          </div>
        )}
      </aside>
    </div>
  );
}

export default App;
