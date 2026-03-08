import React, { useEffect, useRef, useState, useCallback } from 'react';
import * as d3 from 'd3';
import { toPng } from 'html-to-image';
import { Download, ZoomIn, ZoomOut, Maximize, BookOpen, ChevronRight, ChevronLeft } from 'lucide-react';
import { TAI_SYLLABUS, MindMapNode } from './constants';

interface HierarchyNode extends d3.HierarchyNode<MindMapNode> {
  _children?: MindMapNode[];
  x0?: number;
  y0?: number;
}

const width = 1200;
const height = 800;
const nodeWidth = 240;
const nodeHeight = 50;
const horizontalSpacing = 300;

export default function App() {
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [isExporting, setIsExporting] = useState(false);

  const update = useCallback((
    source: HierarchyNode, 
    svg: d3.Selection<SVGSVGElement, unknown, null, undefined>, 
    g: d3.Selection<SVGGElement, unknown, null, undefined>, 
    tree: d3.TreeLayout<MindMapNode>,
    root: HierarchyNode
  ) => {
    const duration = 750;

    // Compute the new tree layout.
    tree(root);

    const nodes = root.descendants();
    const links = root.links();

    // Normalize for fixed-depth.
    nodes.forEach(d => { d.y = d.depth * horizontalSpacing; });

    // --- Nodes ---
    const node = g.selectAll<SVGGElement, HierarchyNode>('g.node')
      .data(nodes, (d: any) => d.id || (d.id = Math.random().toString(36).substr(2, 9)));

    // Enter any new nodes at the parent's previous position.
    const nodeEnter = node.enter().append('g')
      .attr('class', 'node')
      .attr('transform', d => `translate(${source.y0 || 0},${source.x0 || 0})`)
      .on('click', (event, d) => {
        if (d.children) {
          d._children = d.children;
          d.children = undefined;
        } else {
          d.children = d._children;
          d._children = undefined;
        }
        update(d, svg, g, tree, root);
      });

    // Node Background
    nodeEnter.append('rect')
      .attr('rx', 8)
      .attr('ry', 8)
      .attr('x', -nodeWidth / 2)
      .attr('y', -nodeHeight / 2)
      .attr('width', nodeWidth)
      .attr('height', nodeHeight)
      .attr('class', d => d.depth === 0 ? 'fill-indigo-100 stroke-indigo-300' : 'fill-blue-100 stroke-blue-300')
      .attr('stroke-width', 1);

    // Node Text
    nodeEnter.append('text')
      .attr('class', 'node-label text-[12px] font-medium fill-slate-800 select-none pointer-events-none')
      .attr('dy', '.35em')
      .attr('text-anchor', 'middle')
      .text(d => d.data.name)
      .each(function(d) {
        const self = d3.select(this);
        const text = d.data.name;
        if (text.length > 35) {
          self.text(text.substring(0, 32) + '...');
        }
      });

    // Expand/Collapse Indicator
    const indicator = nodeEnter.append('g')
      .attr('class', 'indicator')
      .attr('style', d => (d.children || d._children) ? '' : 'display: none');

    indicator.append('circle')
      .attr('cx', nodeWidth / 2 + 15)
      .attr('r', 8)
      .attr('class', 'fill-blue-200 stroke-blue-400')
      .attr('stroke-width', 1);

    indicator.append('text')
      .attr('class', 'indicator-text text-[10px] font-bold fill-blue-600 select-none pointer-events-none')
      .attr('x', nodeWidth / 2 + 15)
      .attr('dy', '.35em')
      .attr('text-anchor', 'middle')
      .text(d => d.children ? '<' : '>');

    // Transition nodes to their new position.
    const nodeUpdate = node.merge(nodeEnter).transition()
      .duration(duration)
      .attr('transform', d => `translate(${d.y},${d.x})`);

    nodeUpdate.select('.indicator-text')
      .text(d => d.children ? '<' : '>');

    nodeUpdate.select('.indicator')
      .attr('style', d => (d.children || d._children) ? '' : 'display: none');

    // Transition exiting nodes to the parent's new position.
    const nodeExit = node.exit().transition()
      .duration(duration)
      .attr('transform', d => `translate(${source.y},${source.x})`)
      .remove();

    // --- Links ---
    const link = g.selectAll<SVGPathElement, d3.HierarchyLink<MindMapNode>>('path.link')
      .data(links, (d: any) => d.target.id);

    // Enter any new links at the parent's previous position.
    const linkEnter = link.enter().insert('path', 'g')
      .attr('class', 'link')
      .attr('stroke', '#94a3b8')
      .attr('stroke-width', 1.5)
      .attr('fill', 'none')
      .attr('d', d => {
        const o = { x: source.x0 || 0, y: source.y0 || 0 };
        return diagonal(o, o);
      });

    // Transition links to their new position.
    link.merge(linkEnter).transition()
      .duration(duration)
      .attr('d', d => diagonal(d.source, d.target));

    // Transition exiting nodes to the parent's new position.
    link.exit().transition()
      .duration(duration)
      .attr('d', d => {
        const o = { x: source.x, y: source.y };
        return diagonal(o, o);
      })
      .remove();

    // Stash the old positions for transition.
    nodes.forEach(d => {
      d.x0 = d.x;
      d.y0 = d.y;
    });

    function diagonal(s: any, d: any) {
      const startX = s.y + nodeWidth / 2;
      const startY = s.x;
      const endX = d.y - nodeWidth / 2;
      const endY = d.x;
      
      return `M ${startX} ${startY}
              C ${(startX + endX) / 2} ${startY},
                ${(startX + endX) / 2} ${endY},
                ${endX} ${endY}`;
    }
  }, []);

  useEffect(() => {
    if (!svgRef.current) return;

    const svg = d3.select(svgRef.current)
      .attr("viewBox", `0 0 ${width} ${height}`)
      .style("background-color", "#ffffff");

    svg.selectAll("*").remove();

    const g = svg.append("g")
      .attr("transform", `translate(150, ${height / 2})`);

    const zoom = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.3, 2])
      .on("zoom", (event) => {
        g.attr("transform", event.transform);
      });

    svg.call(zoom);

    const tree = d3.tree<MindMapNode>()
      .nodeSize([80, horizontalSpacing]);

    const root = d3.hierarchy(TAI_SYLLABUS) as HierarchyNode;
    root.x0 = height / 2;
    root.y0 = 0;

    update(root, svg, g, tree, root);

    // Initial positioning
    svg.call(zoom.transform, d3.zoomIdentity.translate(150, height / 2).scale(0.8));

  }, [update]);

  const handleDownload = async () => {
    if (!containerRef.current) return;
    setIsExporting(true);
    try {
      const dataUrl = await toPng(containerRef.current, {
        backgroundColor: '#ffffff',
        quality: 1,
        pixelRatio: 2,
      });
      const link = document.createElement('a');
      link.download = 'temario-tai-mapa-mental.png';
      link.href = dataUrl;
      link.click();
    } catch (err) {
      console.error('Error exporting image:', err);
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-900 flex flex-col">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <div className="bg-indigo-600 p-2 rounded-lg">
            <BookOpen className="text-white w-5 h-5" />
          </div>
          <div>
            <h1 className="text-lg font-bold tracking-tight">TAI Mind Map Explorer</h1>
            <p className="text-xs text-slate-500 font-medium uppercase tracking-wider">Temario Oposición AGE</p>
          </div>
        </div>
        
        <div className="flex items-center gap-2">
          <button 
            onClick={handleDownload}
            disabled={isExporting}
            className="flex items-center gap-2 bg-slate-900 hover:bg-slate-800 text-white px-4 py-2 rounded-full text-sm font-medium transition-all active:scale-95 disabled:opacity-50"
          >
            {isExporting ? (
              <span className="animate-pulse">Exportando...</span>
            ) : (
              <>
                <Download className="w-4 h-4" />
                Descargar Mapa
              </>
            )}
          </button>
        </div>
      </header>

      <main className="flex-1 flex overflow-hidden relative">
        {/* Mind Map Canvas */}
        <div className="flex-1 relative bg-white overflow-hidden" ref={containerRef}>
          <svg 
            ref={svgRef} 
            className="w-full h-full cursor-grab active:cursor-grabbing"
          />
          
          {/* Legend/Controls Overlay */}
          <div className="absolute bottom-6 left-6 flex flex-col gap-2">
            <div className="bg-white/80 backdrop-blur-md p-3 rounded-2xl border border-slate-200 shadow-sm">
              <div className="flex items-center gap-4 text-[10px] font-bold uppercase tracking-widest text-slate-500">
                <div className="flex items-center gap-1.5">
                  <div className="w-3 h-3 rounded bg-indigo-100 border border-indigo-300" />
                  <span>Raíz</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="w-3 h-3 rounded bg-blue-100 border border-blue-300" />
                  <span>Bloque / Tema</span>
                </div>
              </div>
            </div>
          </div>

          <div className="absolute top-6 right-6 flex flex-col gap-2">
            <div className="bg-white/80 backdrop-blur-md p-1 rounded-full border border-slate-200 shadow-sm flex flex-col gap-1">
              <button className="p-2 hover:bg-white rounded-full transition-colors text-slate-600" title="Zoom In">
                <ZoomIn className="w-5 h-5" />
              </button>
              <button className="p-2 hover:bg-white rounded-full transition-colors text-slate-600" title="Zoom Out">
                <ZoomOut className="w-5 h-5" />
              </button>
              <button className="p-2 hover:bg-white rounded-full transition-colors text-slate-600" title="Reset View">
                <Maximize className="w-5 h-5" />
              </button>
            </div>
          </div>

          <div className="absolute top-6 left-6">
             <div className="bg-indigo-50 border border-indigo-100 p-4 rounded-2xl max-w-xs shadow-sm">
                <h3 className="text-xs font-bold text-indigo-700 uppercase tracking-wider mb-1">Instrucciones</h3>
                <p className="text-[11px] text-indigo-800 leading-relaxed">
                  Haz clic en los nodos con el símbolo <span className="font-bold">{'>'}</span> para expandir los temas. Arrastra para moverte y usa la rueda para hacer zoom.
                </p>
             </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="bg-white border-t border-slate-200 px-6 py-3 flex items-center justify-between text-[10px] font-medium text-slate-400 uppercase tracking-widest">
        <span>© 2024 TAI Oposiciones - AGE</span>
        <div className="flex gap-4">
          <span className="flex items-center gap-1"><ChevronLeft className="w-3 h-3"/> Interactúa con los nodos</span>
        </div>
      </footer>
    </div>
  );
}
