import React, { useRef, useEffect } from 'react';
import { getStroke } from 'perfect-freehand';
import { useStore } from '../store';
import type { Tool, Stroke, Layer } from '../store';

declare global {
  interface Window {
    __imageCache: Record<string, HTMLImageElement>;
  }
}

// Fonction utilitaire pour le rendu d'un trait (stroke) — exportée pour l'export PNG
export const renderStroke = (ctx: CanvasRenderingContext2D, stroke: Stroke, layerBackground: 'transparent' | 'white') => {
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
  // Toujours réinitialiser après chaque stroke pour éviter la contamination
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
};

export interface LayerCanvasRef {
  redrawWithDraft: (draftStroke: Stroke | null) => void;
  commitStroke: (stroke: Stroke) => void;
}

const LayerCanvas = React.forwardRef<LayerCanvasRef, { layer: Layer, allStrokes: Stroke[], width: number, height: number, zoom: number }>(({ layer, allStrokes, width, height, zoom }, ref) => {
  const visibleCanvasRef = useRef<HTMLCanvasElement>(null);
  const cacheCanvasRef = useRef<HTMLCanvasElement | null>(null);
  
  if (!cacheCanvasRef.current && typeof document !== 'undefined') {
    cacheCanvasRef.current = document.createElement('canvas');
  }
  
  const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;

  // La taille du canvas inclut le zoom pour garantir une qualité nette (pas de pixelisation)
  const physicalWidth  = Math.round(width  * zoom * dpr);
  const physicalHeight = Math.round(height * zoom * dpr);
  const cacheWidth  = physicalWidth;
  const cacheHeight = physicalHeight;

  // Optimisation du rendu avec la technique du "dirty rectangle" (boîte englobante)
  // Cela permet de ne redessiner que la petite zone modifiée par le trait en cours,
  // ce qui évite les lags même avec un très grand canvas zoomé à 300%.
  const redrawWithDraft = (draftStroke: Stroke | null) => {
    const visibleCanvas = visibleCanvasRef.current;
    const cacheCanvas = cacheCanvasRef.current;
    if (!visibleCanvas || !cacheCanvas) return;
    const ctx = visibleCanvas.getContext('2d');
    if (!ctx) return;

    if (draftStroke && draftStroke.points.length > 0) {
      let minX = Infinity;
      let minY = Infinity;
      let maxX = -Infinity;
      let maxY = -Infinity;
      for (const p of draftStroke.points) {
        if (p.x < minX) minX = p.x;
        if (p.y < minY) minY = p.y;
        if (p.x > maxX) maxX = p.x;
        if (p.y > maxY) maxY = p.y;
      }
      
      let margin = draftStroke.size * 2 + 50;
      if (draftStroke.tool === 'image') {
        margin += Math.max(draftStroke.imageWidth || 800, draftStroke.imageHeight || 800);
      }
      
      const pxX = (minX + (layer.offsetX || 0) - margin) * zoom * dpr;
      const pxY = (minY + (layer.offsetY || 0) - margin) * zoom * dpr;
      const pxMaxX = (maxX + (layer.offsetX || 0) + margin) * zoom * dpr;
      const pxMaxY = (maxY + (layer.offsetY || 0) + margin) * zoom * dpr;
      
      const dx = Math.max(0, Math.floor(pxX));
      const dy = Math.max(0, Math.floor(pxY));
      const dw = Math.min(visibleCanvas.width - dx, Math.ceil(pxMaxX - dx));
      const dh = Math.min(visibleCanvas.height - dy, Math.ceil(pxMaxY - dy));
      
      if (dw > 0 && dh > 0) {
        ctx.clearRect(dx, dy, dw, dh);
        if (cacheCanvas.width > 0 && cacheCanvas.height > 0) {
          ctx.drawImage(cacheCanvas, dx, dy, dw, dh, dx, dy, dw, dh);
        }
      }
    } else {
      ctx.clearRect(0, 0, visibleCanvas.width, visibleCanvas.height);
      if (cacheCanvas.width > 0 && cacheCanvas.height > 0) {
        ctx.drawImage(cacheCanvas, 0, 0);
      }
    }

    if (draftStroke) {
      ctx.save();
      ctx.scale(zoom * dpr, zoom * dpr);
      ctx.translate(layer.offsetX || 0, layer.offsetY || 0);
      renderStroke(ctx, draftStroke, layer.background);
      ctx.restore();
    }
  };

  // Valide un trait IMMÉDIATEMENT dans le cache (évite le flash/point à la fin du trait)
  const commitStroke = (stroke: Stroke) => {
    const cacheCanvas = cacheCanvasRef.current;
    if (!cacheCanvas) return;
    const ctx = cacheCanvas.getContext('2d');
    if (!ctx) return;
    ctx.save();
    ctx.scale(zoom * dpr, zoom * dpr);
    ctx.translate(layer.offsetX || 0, layer.offsetY || 0);
    renderStroke(ctx, stroke, layer.background);
    ctx.restore();
    redrawWithDraft(null);
  };

  React.useImperativeHandle(ref, () => ({
    redrawWithDraft,
    commitStroke,
  }), [zoom, dpr, layer.offsetX, layer.offsetY, layer.background]);

  useEffect(() => {
    const cacheCanvas = cacheCanvasRef.current;
    if (!cacheCanvas) return;

    if (cacheCanvas.width !== cacheWidth || cacheCanvas.height !== cacheHeight) {
      cacheCanvas.width = cacheWidth;
      cacheCanvas.height = cacheHeight;
    }

    const ctx = cacheCanvas.getContext('2d');
    if (!ctx) return;
    
    ctx.clearRect(0, 0, cacheCanvas.width, cacheCanvas.height);
    ctx.save();
    ctx.scale(zoom * dpr, zoom * dpr); 
    ctx.translate(layer.offsetX || 0, layer.offsetY || 0);

    if (layer.background === 'white') {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(-(layer.offsetX || 0), -(layer.offsetY || 0), width, height);
    }

    const layerStrokes = allStrokes.filter(s => s.layerId === layer.id);
    layerStrokes.forEach(stroke => renderStroke(ctx, stroke, layer.background));
    
    ctx.restore();
    
    redrawWithDraft(null);
  }, [allStrokes, layer.id, layer.background, layer.offsetX, layer.offsetY, width, height, dpr, zoom]);

  return (
    <canvas
      ref={visibleCanvasRef}
      width={physicalWidth}
      height={physicalHeight}
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        opacity: layer.opacity,
        display: layer.visible ? 'block' : 'none',
        pointerEvents: 'none'
      }}
    />
  );
});

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
    let startW = w;
    let startH = h;
    let startPX = point.x;
    let startPY = point.y;

    const onPointerMove = (moveEvent: PointerEvent) => {
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
    
    const onPointerMove = (moveEvent: PointerEvent) => {
      const containerRect = document.querySelector('.main-canvas-container')?.getBoundingClientRect();
      if (!containerRect) return;
      
      const mx = ((moveEvent.clientX - containerRect.left) / zoom) - (layer.offsetX || 0);
      const my = ((moveEvent.clientY - containerRect.top) / zoom) - (layer.offsetY || 0);
      
      const centerImgX = point.x + w / 2;
      const centerImgY = point.y + h / 2;

      const angle = Math.atan2(my - centerImgY, mx - centerImgX);
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

  const handleSize = 10;

  return (
    <div style={{
      position: 'absolute',
      left: x * zoom,
      top: y * zoom,
      width: w * zoom,
      height: h * zoom,
      border: `2px dashed #4a90e2`,
      pointerEvents: 'none',
      transform: `rotate(${stroke.rotation || 0}rad)`,
      transformOrigin: 'center center'
    }}>
      <div 
        onPointerDown={handleRotate}
        style={{
          position: 'absolute', left: '50%', top: -30 - handleSize/2, width: handleSize, height: handleSize,
          transform: 'translateX(-50%)',
          backgroundColor: '#4a90e2', borderRadius: '50%', cursor: 'grab', pointerEvents: 'auto'
        }} 
      >
        <div style={{ position: 'absolute', left: '50%', top: handleSize, width: `2px`, height: `30px`, backgroundColor: '#4a90e2', transform: 'translateX(-50%)' }} />
      </div>
      <div 
        onPointerDown={(e) => handleResize(e, 'tl')}
        style={{
          position: 'absolute', left: -handleSize/2, top: -handleSize/2, width: handleSize, height: handleSize,
          backgroundColor: '#fff', border: `1px solid #4a90e2`, cursor: 'nwse-resize', pointerEvents: 'auto', borderRadius: '50%'
        }} 
      />
      <div 
        onPointerDown={(e) => handleResize(e, 'br')}
        style={{
          position: 'absolute', right: -handleSize/2, bottom: -handleSize/2, width: handleSize, height: handleSize,
          backgroundColor: '#fff', border: `1px solid #4a90e2`, cursor: 'nwse-resize', pointerEvents: 'auto', borderRadius: '50%'
        }} 
      />
    </div>
  );
};

export function DrawingCanvas() {
  const { currentTool, color, strokeWidth, strokeOpacity, strokes, addStroke, layers, activeLayerId, zoom, pan, setZoom, setPan, setLayerOffset, projectWidth, projectHeight } = useStore();
  
  // Utilisation de refs pour éviter les re-rendus React à chaque pixel de mouvement ! (Évite le lag)
  const currentStrokeRef = useRef<Stroke | null>(null);
  const layerRefs = useRef<Record<string, LayerCanvasRef>>({});
  const rafRef = useRef<number | null>(null);
  // isDrawingRef = source de vérité synchrone (pas de batch React)
  const isDrawingRef = useRef(false);

  const lastPanPoint = useRef<{x: number, y: number} | null>(null);
  const lastMovePoint = useRef<{x: number, y: number} | null>(null);
  
  const width = projectWidth || 1200;
  const height = projectHeight || 800;
  const containerRef = useRef<HTMLDivElement>(null);
  const innerCanvasRef = useRef<HTMLDivElement>(null);

  const cursorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    
    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      if (e.ctrlKey || e.metaKey) {
        const zoomFactor = e.deltaY > 0 ? 0.9 : 1.1;
        setZoom(Math.max(0.1, Math.min(3, useStore.getState().zoom * zoomFactor)));
      } else {
        setPan((prev) => ({ x: prev.x - e.deltaX, y: prev.y - e.deltaY }));
      }
    };
    
    container.addEventListener('wheel', handleWheel, { passive: false });
    return () => container.removeEventListener('wheel', handleWheel);
  }, [setZoom, setPan]);

  const updateCursorPosition = (e: React.PointerEvent) => {
    if (cursorRef.current && (currentTool === 'brush' || currentTool === 'eraser')) {
      cursorRef.current.style.display = 'block';
      // L'utilisation de transform GPU est beaucoup plus fluide que modifier left/top
      cursorRef.current.style.transform = `translate(${e.clientX}px, ${e.clientY}px) translate(-50%, -50%)`;
      cursorRef.current.style.width = `${strokeWidth * zoom}px`;
      cursorRef.current.style.height = `${strokeWidth * zoom}px`;
    } else if (cursorRef.current) {
      cursorRef.current.style.display = 'none';
    }
  };

  const drawDraft = () => {
    if (activeLayerId && layerRefs.current[activeLayerId]) {
      layerRefs.current[activeLayerId].redrawWithDraft(currentStrokeRef.current);
    }
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    
    if (currentTool === 'pan' || e.button === 1) {
      lastPanPoint.current = { x: e.clientX, y: e.clientY };
      isDrawingRef.current = true;
      return;
    }
    
    if (currentTool === 'move') {
      lastMovePoint.current = { x: e.clientX, y: e.clientY };
      isDrawingRef.current = true;
      return;
    }

    // Ne pas dessiner sur un calque invisible
    const activeLayer = layers.find(l => l.id === activeLayerId);
    if (!activeLayer?.visible) return;
    
    const rect = innerCanvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const offsetX = activeLayer?.offsetX || 0;
    const offsetY = activeLayer?.offsetY || 0;
    
    const x = ((e.clientX - rect.left) / zoom) - offsetX;
    const y = ((e.clientY - rect.top) / zoom) - offsetY;
    // Pour le stylet, utiliser la vraie pression ; pour souris/doigt, simuler 0.5
    const pressure = e.pointerType === 'pen' ? (e.pressure > 0 ? e.pressure : 0.5) : 0.5;

    isDrawingRef.current = true;
    currentStrokeRef.current = {
      id: `stroke-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      tool: currentTool as Exclude<Tool, 'pan' | 'move'>,
      color,
      size: strokeWidth,
      opacity: strokeOpacity,
      points: [{ x, y, pressure }],
      layerId: activeLayerId
    };

    if (rafRef.current === null) {
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = null;
        drawDraft();
      });
    }
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    updateCursorPosition(e);

    if (!isDrawingRef.current) return;

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

    if (!currentStrokeRef.current) return;

    const rect = innerCanvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const activeLayer = layers.find(l => l.id === activeLayerId);
    const offsetX = activeLayer?.offsetX || 0;
    const offsetY = activeLayer?.offsetY || 0;

    const x = ((e.clientX - rect.left) / zoom) - offsetX;
    const y = ((e.clientY - rect.top) / zoom) - offsetY;
    const pressure = e.pointerType === 'pen' ? (e.pressure > 0 ? e.pressure : 0.5) : 0.5;

    if (currentTool === 'ruler' || currentTool === 'circle') {
      currentStrokeRef.current.points[1] = { x, y, pressure };
    } else {
      currentStrokeRef.current.points.push({ x, y, pressure });
    }

    if (rafRef.current === null) {
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = null;
        drawDraft();
      });
    }
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    isDrawingRef.current = false;
    
    if (lastPanPoint.current) {
      lastPanPoint.current = null;
    } else if (lastMovePoint.current) {
      lastMovePoint.current = null;
    } else if (currentStrokeRef.current) {
      // Annuler tout RAF en attente
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      const stroke = currentStrokeRef.current;
      currentStrokeRef.current = null;

      // 1. Committer le trait IMMÉDIATEMENT dans le cache visuel (aucun flash, aucun point parasite)
      layerRefs.current[activeLayerId]?.commitStroke(stroke);
      // 2. Persister dans le store Zustand (déclenche useEffect de rebuild, idempotent)
      addStroke(stroke);
    }
    
    e.currentTarget.releasePointerCapture(e.pointerId);
  };

  const handlePointerLeave = () => {
    if (cursorRef.current && !isDrawingRef.current) {
      cursorRef.current.style.display = 'none';
    }
  };

  return (
    <div 
      style={{ width: '100%', height: '100%', overflow: 'hidden', position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: (currentTool === 'pan') ? 'grab' : 'auto' }} 
      ref={containerRef}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerLeave={handlePointerLeave}
    >
      <div 
        ref={cursorRef}
        style={{
          position: 'fixed',
          pointerEvents: 'none',
          borderRadius: '50%',
          border: '1px solid rgba(0,0,0,0.5)',
          boxShadow: '0 0 0 1px rgba(255,255,255,0.5)',
          left: 0,
          top: 0,
          transform: 'translate(-50%, -50%)',
          zIndex: 9999,
          display: 'none',
          mixBlendMode: 'difference'
        }}
      />
      <div 
        ref={innerCanvasRef}
        className="main-canvas-container"
        style={{
          flexShrink: 0,
          width: width * zoom,
          height: height * zoom,
          transform: `translate(${pan.x}px, ${pan.y}px)`,
          transformOrigin: 'center center',
          backgroundColor: '#e5e5e5',
          backgroundImage: `
            linear-gradient(45deg, #f3f3f3 25%, transparent 25%, transparent 75%, #f3f3f3 75%, #f3f3f3),
            linear-gradient(45deg, #f3f3f3 25%, transparent 25%, transparent 75%, #f3f3f3 75%, #f3f3f3)
          `,
          backgroundSize: `${20 * zoom}px ${20 * zoom}px`,
          backgroundPosition: `0 0, ${10 * zoom}px ${10 * zoom}px`,
          boxShadow: '0 4px 20px rgba(0, 0, 0, 0.5)',
          cursor: (currentTool === 'brush' || currentTool === 'eraser') ? 'none' : currentTool === 'pan' ? 'grab' : currentTool === 'move' ? 'move' : 'crosshair',
        }}
        onContextMenu={(e) => e.preventDefault()}
      >
      {[...layers].reverse().map(layer => {
        return (
          <LayerCanvas 
            key={layer.id}
            ref={(el) => { 
              if (el) layerRefs.current[layer.id] = el; 
              else delete layerRefs.current[layer.id];
            }}
            layer={layer}
            allStrokes={strokes}
            width={width}
            height={height}
            zoom={zoom}
          />
        );
      })}
      
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

      {/* Indicateur de Zoom */}
      <div style={{
        position: 'absolute',
        bottom: '20px',
        right: '20px',
        backgroundColor: 'rgba(0, 0, 0, 0.6)',
        color: 'white',
        padding: '6px 12px',
        borderRadius: '6px',
        fontSize: '14px',
        pointerEvents: 'none',
        zIndex: 9999,
        fontFamily: 'monospace',
        fontWeight: 'bold',
        backdropFilter: 'blur(4px)'
      }}>
        {Math.round(zoom * 100)}%
      </div>
    </div>
  );
}
