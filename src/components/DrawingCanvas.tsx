import React, { useRef, useState, useEffect } from 'react';
import { getStroke } from 'perfect-freehand';
import { useStore } from '../store';
import type { Tool, Point, Stroke, Layer } from '../store';

declare global {
  interface Window {
    __imageCache: Record<string, HTMLImageElement>;
  }
}

// Fonction utilitaire pour le rendu d'un trait (stroke)
const renderStroke = (ctx: CanvasRenderingContext2D, stroke: Stroke, layerBackground: 'transparent' | 'white') => {
  if (stroke.points.length === 0) return;

  ctx.globalAlpha = stroke.opacity ?? 1;

  if (stroke.tool === 'ruler') {
    if (stroke.points.length < 2) return;
    ctx.globalCompositeOperation = 'source-over';
    ctx.beginPath();
    ctx.moveTo(stroke.points[0].x, stroke.points[0].y);
    ctx.lineTo(stroke.points[1].x, stroke.points[1].y);
    ctx.lineWidth = stroke.size;
    ctx.strokeStyle = stroke.color;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.stroke();
  } else if (stroke.tool === 'circle') {
    if (stroke.points.length < 2) return;
    const start = stroke.points[0];
    const end = stroke.points[1];
    
    const radiusX = Math.abs(end.x - start.x) / 2;
    const radiusY = Math.abs(end.y - start.y) / 2;
    const centerX = Math.min(start.x, end.x) + radiusX;
    const centerY = Math.min(start.y, end.y) + radiusY;
    
    ctx.globalCompositeOperation = 'source-over';
    ctx.beginPath();
    ctx.ellipse(centerX, centerY, radiusX, radiusY, 0, 0, 2 * Math.PI);
    ctx.lineWidth = stroke.size;
    ctx.strokeStyle = stroke.color;
    ctx.stroke();
  } else if (stroke.tool === 'image' && stroke.imageUrl) {
    ctx.globalCompositeOperation = 'source-over';
    if (!window.__imageCache) window.__imageCache = {};
    let img = window.__imageCache[stroke.imageUrl];
    if (!img) {
      img = new Image();
      img.src = stroke.imageUrl;
      img.onload = () => {
        const event = new Event('resize'); 
        window.dispatchEvent(event);
      };
      window.__imageCache[stroke.imageUrl] = img;
    }
    if (img.complete && img.naturalWidth !== 0) {
      const point = stroke.points[0] || { x: 0, y: 0 };
      const maxWidth = 800;
      let w = stroke.imageWidth || img.width;
      let h = stroke.imageHeight || img.height;
      
      // Initial constraints
      if (!stroke.imageWidth && w > maxWidth) {
        h = h * (maxWidth / w);
        w = maxWidth;
      }
      
      ctx.save();
      const cx = point.x + w / 2;
      const cy = point.y + h / 2;
      ctx.translate(cx, cy);
      if (stroke.rotation) {
        ctx.rotate(stroke.rotation);
      }
      ctx.drawImage(img, -w / 2, -h / 2, w, h);
      ctx.restore();
    }
  } else {
    // Pinceau et Gomme
    const outlinePoints = getStroke(
      stroke.points.map(p => [p.x, p.y, p.pressure]),
      {
        size: stroke.size,
        thinning: 0.5,
        smoothing: 0.5,
        streamline: 0.5,
        simulatePressure: stroke.points[0].pressure === 0.5,
      }
    );

    if (!outlinePoints.length) return;
    
    const d = outlinePoints.reduce(
      (acc, [x0, y0], i, arr) => {
        const [x1, y1] = arr[(i + 1) % arr.length];
        acc.push(x0, y0, (x0 + x1) / 2, (y0 + y1) / 2);
        return acc;
      },
      ['M', ...outlinePoints[0], 'Q']
    );
    d.push('Z');
    
    const pathData = d.join(' ');
    const path = new Path2D(pathData);

    if (stroke.tool === 'eraser') {
      if (layerBackground === 'white') {
        ctx.globalCompositeOperation = 'source-over';
        ctx.fillStyle = '#ffffff';
      } else {
        ctx.globalCompositeOperation = 'destination-out';
        ctx.fillStyle = '#000000';
      }
    } else {
      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = stroke.color;
    }
    ctx.fill(path);
  }
};

// Composant qui rend un seul calque
const LayerCanvas = ({ layer, strokes, width, height, isActive, currentStroke }: { layer: Layer, strokes: Stroke[], width: number, height: number, isActive: boolean, currentStroke: Stroke | null }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const draw = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      ctx.clearRect(0, 0, canvas.width, canvas.height);

      ctx.save();
      ctx.translate(layer.offsetX || 0, layer.offsetY || 0);

      if (layer.background === 'white') {
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(-(layer.offsetX || 0), -(layer.offsetY || 0), canvas.width, canvas.height);
      }

      // On dessine tous les traits du calque
      strokes.forEach(stroke => renderStroke(ctx, stroke, layer.background));
      
      // Si c'est le calque actif, on dessine aussi le trait en cours
      if (isActive && currentStroke) {
        renderStroke(ctx, currentStroke, layer.background);
      }
      
      ctx.restore();
      ctx.globalCompositeOperation = 'source-over'; // reset
    };

    draw();
    // Le setTimeout permet d'éviter un bug d'effacement du buffer canvas par certains navigateurs lors des transitions DOM.
    const timeoutId = setTimeout(draw, 50);
    return () => clearTimeout(timeoutId);
  }, [strokes, currentStroke, isActive, layer.opacity, layer.visible, layer.background, layer.offsetX, layer.offsetY, width, height]);

  return (
    <canvas
      ref={canvasRef}
      width={width}
      height={height}
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        opacity: layer.opacity,
        display: layer.visible ? 'block' : 'none',
        pointerEvents: 'none'
      }}
    />
  );
};

const ImageTransformOverlay = ({ stroke, layer, zoom }: { stroke: Stroke, layer: Layer, zoom: number }) => {
  const { updateStroke } = useStore();
  const img = window.__imageCache?.[stroke.imageUrl || ''];
  
  if (!img) return null;

  const point = stroke.points[0];
  const maxWidth = 800;
  
  // Dimensions par défaut si non définies
  let w = stroke.imageWidth || img.width;
  let h = stroke.imageHeight || img.height;
  if (!stroke.imageWidth && w > maxWidth) {
    h = h * (maxWidth / w);
    w = maxWidth;
  }

  // Coordonnées finales (incluant l'offset du calque)
  const x = point.x + (layer.offsetX || 0);
  const y = point.y + (layer.offsetY || 0);

  const handleResize = (e: React.PointerEvent, corner: string) => {
    e.stopPropagation(); // Évite de déclencher le pan/move global
    e.currentTarget.setPointerCapture(e.pointerId);
    
    let startX = e.clientX;
    let startY = e.clientY;
    let startW = w;
    let startH = h;
    let startPX = point.x;
    let startPY = point.y;

    const onPointerMove = (moveEvent: PointerEvent) => {
      // Note: redimensionner un objet déjà tourné demande des maths complexes,
      // pour le moment on garde une approximation simple de la taille avec la souris.
      const dx = (moveEvent.clientX - startX) / zoom;
      
      let newW = startW;
      let newH = startH;
      let newX = startPX;
      let newY = startPY;

      if (corner === 'br') {
        newW = Math.max(20, startW + dx);
        newH = newW * (startH / startW);
      } else if (corner === 'tl') {
        newW = Math.max(20, startW - dx);
        newH = newW * (startH / startW);
        newX = startPX + (startW - newW);
        newY = startPY + (startH - newH);
      }

      updateStroke(stroke.id, { 
        imageWidth: newW, 
        imageHeight: newH,
        points: [{ x: newX, y: newY, pressure: 0.5 }]
      });
    };

    const onPointerUp = (upEvent: PointerEvent) => {
      (e.target as HTMLElement).releasePointerCapture(upEvent.pointerId);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
    };

    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
  };

  const handleRotate = (e: React.PointerEvent) => {
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    
    // Le centre de l'image
    const cx = x + w / 2;
    const cy = y + h / 2;

    const onPointerMove = (moveEvent: PointerEvent) => {
      // Trouver la position de la souris dans le canvas
      const containerRect = document.querySelector('.main-canvas-container')?.getBoundingClientRect();
      if (!containerRect) return;
      
      const mx = ((moveEvent.clientX - containerRect.left) / zoom) - (layer.offsetX || 0);
      const my = ((moveEvent.clientY - containerRect.top) / zoom) - (layer.offsetY || 0);
      
      // Centre de l'image (sans l'offset car mx/my ont l'offset soustrait)
      const centerImgX = point.x + w / 2;
      const centerImgY = point.y + h / 2;

      // Calcul de l'angle
      const angle = Math.atan2(my - centerImgY, mx - centerImgX);
      
      // On ajoute PI/2 car la poignée de rotation est en haut (à -90 degrés)
      updateStroke(stroke.id, { rotation: angle + Math.PI / 2 });
    };

    const onPointerUp = (upEvent: PointerEvent) => {
      (e.target as HTMLElement).releasePointerCapture(upEvent.pointerId);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
    };

    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
  };

  const handleSize = 10 / zoom;

  return (
    <div style={{
      position: 'absolute',
      left: x,
      top: y,
      width: w,
      height: h,
      border: `${2 / zoom}px dashed #4a90e2`,
      pointerEvents: 'none',
      transform: `rotate(${stroke.rotation || 0}rad)`,
      transformOrigin: 'center center'
    }}>
      {/* Poignée de rotation (en haut au centre) */}
      <div 
        onPointerDown={handleRotate}
        style={{
          position: 'absolute', left: '50%', top: -30 / zoom - handleSize/2, width: handleSize, height: handleSize,
          transform: 'translateX(-50%)',
          backgroundColor: '#4a90e2', borderRadius: '50%', cursor: 'grab', pointerEvents: 'auto'
        }} 
      >
        <div style={{ position: 'absolute', left: '50%', top: handleSize, width: `${2 / zoom}px`, height: `${30 / zoom}px`, backgroundColor: '#4a90e2', transform: 'translateX(-50%)' }} />
      </div>

      {/* Coin Supérieur Gauche */}
      <div 
        onPointerDown={(e) => handleResize(e, 'tl')}
        style={{
          position: 'absolute', left: -handleSize/2, top: -handleSize/2, width: handleSize, height: handleSize,
          backgroundColor: '#fff', border: `${1 / zoom}px solid #4a90e2`, cursor: 'nwse-resize', pointerEvents: 'auto', borderRadius: '50%'
        }} 
      />
      {/* Coin Inférieur Droit */}
      <div 
        onPointerDown={(e) => handleResize(e, 'br')}
        style={{
          position: 'absolute', right: -handleSize/2, bottom: -handleSize/2, width: handleSize, height: handleSize,
          backgroundColor: '#fff', border: `${1 / zoom}px solid #4a90e2`, cursor: 'nwse-resize', pointerEvents: 'auto', borderRadius: '50%'
        }} 
      />
    </div>
  );
};

export function DrawingCanvas() {
  const { currentTool, color, strokeWidth, strokeOpacity, strokes, addStroke, layers, activeLayerId, zoom, pan, setZoom, setPan, setLayerOffset, projectWidth, projectHeight } = useStore();
  
  const [currentStroke, setCurrentStroke] = useState<Stroke | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const lastPanPoint = useRef<{x: number, y: number} | null>(null);
  const lastMovePoint = useRef<{x: number, y: number} | null>(null);
  
  const width = projectWidth || 1200;
  const height = projectHeight || 800;
  const containerRef = useRef<HTMLDivElement>(null);

  const cursorRef = useRef<HTMLDivElement>(null);

  // Gestion du Zoom natif
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    
    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      if (e.ctrlKey || e.metaKey) {
        // Zoom
        const zoomDelta = e.deltaY > 0 ? -0.1 : 0.1;
        setZoom(Math.max(0.1, Math.min(5, useStore.getState().zoom + zoomDelta)));
      } else {
        // Pan
        setPan((prev) => ({ x: prev.x - e.deltaX, y: prev.y - e.deltaY }));
      }
    };
    
    container.addEventListener('wheel', handleWheel, { passive: false });
    return () => container.removeEventListener('wheel', handleWheel);
  }, [setZoom, setPan]);

  const updateCursorPosition = (e: React.PointerEvent) => {
    if (cursorRef.current && (currentTool === 'brush' || currentTool === 'eraser')) {
      cursorRef.current.style.display = 'block';
      cursorRef.current.style.left = `${e.clientX}px`;
      cursorRef.current.style.top = `${e.clientY}px`;
      cursorRef.current.style.width = `${strokeWidth * zoom}px`;
      cursorRef.current.style.height = `${strokeWidth * zoom}px`;
    } else if (cursorRef.current) {
      cursorRef.current.style.display = 'none';
    }
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    
    if (currentTool === 'pan' || e.button === 1) {
      lastPanPoint.current = { x: e.clientX, y: e.clientY };
      setIsDrawing(true);
      return;
    }
    
    if (currentTool === 'move') {
      lastMovePoint.current = { x: e.clientX, y: e.clientY };
      setIsDrawing(true);
      return;
    }
    
    const rect = e.currentTarget.getBoundingClientRect();
    const activeLayer = layers.find(l => l.id === activeLayerId);
    const offsetX = activeLayer?.offsetX || 0;
    const offsetY = activeLayer?.offsetY || 0;
    
    const x = ((e.clientX - rect.left) / zoom) - offsetX;
    const y = ((e.clientY - rect.top) / zoom) - offsetY;
    const pressure = e.pressure !== 0 ? e.pressure : 0.5;

    setIsDrawing(true);
    setCurrentStroke({
      id: `stroke-${Date.now()}`,
      tool: currentTool as Exclude<Tool, 'pan' | 'move'>,
      color,
      size: strokeWidth,
      opacity: strokeOpacity,
      points: [{ x, y, pressure }],
      layerId: activeLayerId
    });
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    updateCursorPosition(e);

    if (!isDrawing) return;

    if (lastPanPoint.current) {
      const dx = e.clientX - lastPanPoint.current.x;
      const dy = e.clientY - lastPanPoint.current.y;
      setPan((prev) => ({ x: prev.x + dx, y: prev.y + dy }));
      lastPanPoint.current = { x: e.clientX, y: e.clientY };
      return;
    }
    
    if (lastMovePoint.current && currentTool === 'move') {
      const dx = (e.clientX - lastMovePoint.current.x) / zoom;
      const dy = (e.clientY - lastMovePoint.current.y) / zoom;
      setLayerOffset(activeLayerId, dx, dy);
      lastMovePoint.current = { x: e.clientX, y: e.clientY };
      return;
    }

    if (!currentStroke) return;

    const rect = e.currentTarget.getBoundingClientRect();
    const activeLayer = layers.find(l => l.id === activeLayerId);
    const offsetX = activeLayer?.offsetX || 0;
    const offsetY = activeLayer?.offsetY || 0;

    const x = ((e.clientX - rect.left) / zoom) - offsetX;
    const y = ((e.clientY - rect.top) / zoom) - offsetY;
    const pressure = e.pressure !== 0 ? e.pressure : 0.5;

    setCurrentStroke(prev => {
      if (!prev) return null;
      if (currentTool === 'ruler' || currentTool === 'circle') {
        return { ...prev, points: [prev.points[0], { x, y, pressure }] };
      }
      return { ...prev, points: [...prev.points, { x, y, pressure }] };
    });
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    setIsDrawing(false);
    
    if (lastPanPoint.current) {
      lastPanPoint.current = null;
    } else if (lastMovePoint.current) {
      lastMovePoint.current = null;
    } else if (currentStroke) {
      addStroke(currentStroke);
      setCurrentStroke(null);
    }
    
    e.currentTarget.releasePointerCapture(e.pointerId);
  };

  const handlePointerLeave = () => {
    if (cursorRef.current && !isDrawing) {
      cursorRef.current.style.display = 'none';
    }
  };

  return (
    <div 
      style={{ width: '100%', height: '100%', overflow: 'hidden', position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }} 
      ref={containerRef}
      onPointerMove={updateCursorPosition}
      onPointerLeave={handlePointerLeave}
    >
      {/* Curseur personnalisé */}
      <div 
        ref={cursorRef}
        style={{
          position: 'fixed',
          pointerEvents: 'none',
          borderRadius: '50%',
          border: '1px solid rgba(0,0,0,0.5)',
          boxShadow: '0 0 0 1px rgba(255,255,255,0.5)',
          transform: 'translate(-50%, -50%)',
          zIndex: 9999,
          display: 'none',
          mixBlendMode: 'difference'
        }}
      />
      <div 
        className="main-canvas-container"
        style={{
          flexShrink: 0,
          width,
          height,
          transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
          transformOrigin: 'center center',
          // Damier pour représenter la transparence globale
          backgroundColor: '#e5e5e5',
          backgroundImage: `
            linear-gradient(45deg, #f3f3f3 25%, transparent 25%, transparent 75%, #f3f3f3 75%, #f3f3f3),
            linear-gradient(45deg, #f3f3f3 25%, transparent 25%, transparent 75%, #f3f3f3 75%, #f3f3f3)
          `,
          backgroundSize: '20px 20px',
          backgroundPosition: '0 0, 10px 10px',
          boxShadow: '0 4px 20px rgba(0, 0, 0, 0.5)',
          cursor: (currentTool === 'brush' || currentTool === 'eraser') ? 'none' : currentTool === 'pan' ? 'grab' : currentTool === 'move' ? 'move' : 'crosshair',
        }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onContextMenu={(e) => e.preventDefault()}
      >
      {/* On rend les calques dans l'ordre inverse pour que le premier calque du tableau soit visuellement au-dessus */}
      {[...layers].reverse().map(layer => {
        const layerStrokes = strokes.filter(s => s.layerId === layer.id);
        const isActive = activeLayerId === layer.id;
        
        return (
          <LayerCanvas 
            key={layer.id}
            layer={layer}
            strokes={layerStrokes}
            width={width}
            height={height}
            isActive={isActive}
            currentStroke={currentStroke}
          />
        );
      })}
      
      {/* Overlay de transformation d'image (affiché uniquement si l'outil move est actif et qu'on a une image sur le calque actif) */}
      {currentTool === 'move' && activeLayerId && (() => {
        const activeLayerStrokes = strokes.filter(s => s.layerId === activeLayerId);
        const imageStroke = activeLayerStrokes.find(s => s.tool === 'image');
        const activeLayer = layers.find(l => l.id === activeLayerId);
        if (imageStroke && activeLayer) {
          return <ImageTransformOverlay stroke={imageStroke} layer={activeLayer} zoom={zoom} />;
        }
        return null;
      })()}
      </div>
    </div>
  );
}
