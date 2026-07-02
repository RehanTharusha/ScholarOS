import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Search, X } from 'lucide-react'
import { Input } from '@/components/ui/input'

export type GraphNode = {
  id: string
  label: string
  degree: number
  radius: number
  group: string
  color: string
  stroke: string
}

export type GraphEdge = {
  source: string
  target: string
}

type GraphViewProps = {
  nodes: GraphNode[]
  edges: GraphEdge[]
  isLoading?: boolean
  error?: string | null
  onSelectNode?: (id: string) => void
  courses?: string[]
  selectedCourse?: string | null
  onCourseChange?: (course: string | null) => void
  masteryByTopic?: Map<string, number>
  showGaps?: boolean
}

type NodePosition = {
  x: number
  y: number
  vx: number
  vy: number
}

const ALPHA_START = 1
const ALPHA_DECAY = 0.0028
const ALPHA_MIN = 0.001
const ALPHA_REHEAT = 0.3
const VELOCITY_DECAY = 0.6
const REPULSION = 5800
const SPRING_LENGTH = 80
const SPRING_STRENGTH = 0.008
const MIN_DISTANCE = 34
const CLUSTER_STRENGTH = 0.003
const CLUSTER_RADIUS_MIN = 120
const CLUSTER_RADIUS_MAX = 240
const CLUSTER_RADIUS_STEP = 45
const NODE_STROKE_COLOR = '#ffffff'
const ACTIVE_NODE_STROKE_COLOR = '#ffffff'

function edgeColor(): string {
  return getComputedStyle(document.documentElement).getPropertyValue('--border').trim() || '#4a4a4a'
}

function labelColor(): string {
  return getComputedStyle(document.documentElement).getPropertyValue('--muted-foreground').trim() || '#9ca3af'
}
const LABEL_MIN_ZOOM = 0.55
const HIT_RADIUS = 28
const GLOW_RADIUS_MULT = 2.2
const GLOW_OPACITY = 0.35

function masteryColor(node: GraphNode, masteryByTopic?: Map<string, number>): string {
  const mastery = masteryByTopic?.get(node.label)
  if (mastery === undefined) return node.color
  const root = document.documentElement
  if (mastery >= 75) return getComputedStyle(root).getPropertyValue('--color-emerald-600').trim() || '#16A34A'
  if (mastery >= 50) return getComputedStyle(root).getPropertyValue('--color-amber-600').trim() || '#D97706'
  return getComputedStyle(root).getPropertyValue('--color-red-600').trim() || '#DC2626'
}

function computeGroupCenters(nodes: GraphNode[]): Map<string, { x: number; y: number }> {
  const groups = Array.from(new Set(nodes.map((n) => n.group || 'root')))
  if (groups.length === 0) return new Map()
  const radius = Math.min(CLUSTER_RADIUS_MAX, Math.max(CLUSTER_RADIUS_MIN, groups.length * CLUSTER_RADIUS_STEP))
  const centers = new Map<string, { x: number; y: number }>()
  groups.forEach((group, i) => {
    const angle = (i / groups.length) * Math.PI * 2
    centers.set(group, { x: radius * Math.cos(angle), y: radius * Math.sin(angle) })
  })
  return centers
}

function computeConnectedNodes(nodeId: string | null, edges: GraphEdge[]): Set<string> | null {
  if (!nodeId) return null
  const set = new Set([nodeId])
  for (const e of edges) {
    if (e.source === nodeId) set.add(e.target)
    if (e.target === nodeId) set.add(e.source)
  }
  return set
}

function computeSearchMatches(
  query: string,
  nodes: GraphNode[],
  edges: GraphEdge[],
): { matches: Set<string>; directMatches: Set<string> } | null {
  if (!query.trim()) return null
  const q = query.toLowerCase()
  const directMatches = new Set<string>()
  for (const n of nodes) {
    if (n.label.toLowerCase().includes(q) || n.id.toLowerCase().includes(q)) {
      directMatches.add(n.id)
    }
  }
  const matches = new Set(directMatches)
  for (const e of edges) {
    if (directMatches.has(e.source)) matches.add(e.target)
    if (directMatches.has(e.target)) matches.add(e.source)
  }
  return { matches, directMatches }
}

export function GraphView({
  nodes,
  edges,
  error,
  onSelectNode,
  courses,
  selectedCourse,
  onCourseChange,
  masteryByTopic,
  showGaps,
}: GraphViewProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const positionsRef = useRef<Map<string, NodePosition>>(new Map())
  const alphaRef = useRef(ALPHA_START)
  const panRef = useRef({ x: 0, y: 0 })
  const zoomRef = useRef(0.6)
  const dirtyRef = useRef(true)
  const rafRef = useRef(0)
  const hasCenteredRef = useRef(false)
  const viewportRef = useRef({ width: 0, height: 0 })
  const dprRef = useRef(1)

  const dragRef = useRef<{
    id: string
    offsetX: number
    offsetY: number
    moved: boolean
  } | null>(null)
  const panStartRef = useRef<{
    startX: number
    startY: number
    originX: number
    originY: number
  } | null>(null)
  const hoveredNodeIdRef = useRef<string | null>(null)
  const nodesRef = useRef<GraphNode[]>([])
  const edgeListRef = useRef<GraphEdge[]>([])
  const nodeGroupMapRef = useRef<Map<string, string>>(new Map())
  const groupCentersRef = useRef<Map<string, { x: number; y: number }>>(new Map())
  const searchRef = useRef<{ matches: Set<string>; directMatches: Set<string> } | null>(null)
  const selectedGroupRef = useRef<string | null>(null)
  const masteryByTopicRef = useRef<Map<string, number> | undefined>(undefined)
  const effectiveNodesRef = useRef<GraphNode[]>([])
  const effectiveEdgesRef = useRef<GraphEdge[]>([])

  const [searchQuery, setSearchQueryState] = useState('')
  const [selectedGroup, setSelectedGroupState] = useState<string | null>(null)
  const [cursorStyle, setCursorStyle] = useState<'grab' | 'grabbing' | 'pointer'>('grab')
  const [searchMatchCount, setSearchMatchCount] = useState(0)
  const edgeList = useMemo(() => edges.filter((e) => e.source !== e.target), [edges])

  const filteredNodes = useMemo(() => {
    if (!selectedCourse) return nodes
    return nodes.filter((n) => n.group === selectedCourse)
  }, [nodes, selectedCourse])

  const filteredEdges = useMemo(() => {
    if (!selectedCourse) return edgeList
    const ids = new Set(filteredNodes.map((n) => n.id))
    return edgeList.filter((e) => ids.has(e.source) && ids.has(e.target))
  }, [edgeList, filteredNodes, selectedCourse])

  const effectiveNodes = selectedCourse ? filteredNodes : nodes
  const effectiveEdges = selectedCourse ? filteredEdges : edgeList

  const gaps = useMemo(() => {
    return nodes.filter((n) => {
      const c = edges.filter((e) => e.source === n.id || e.target === n.id).length
      return c <= 1
    })
  }, [nodes, edges])

  const gapDetails = useMemo(() => {
    if (!showGaps) return []
    return gaps.map((n) => {
      const c = edges.filter((e) => e.source === n.id || e.target === n.id).length
      const m = masteryByTopic?.get(n.label)
      const reasons: string[] = []
      if (c === 0) reasons.push('isolated note')
      else if (c === 1) reasons.push('only 1 connection')
      if (m !== undefined && m < 50) reasons.push(`${Math.round(m)}% mastery`)
      return { ...n, connectionCount: c, mastery: m, reasons }
    })
  }, [gaps, masteryByTopic, showGaps, edges])

  const legendItems = useMemo(() => {
    const grouped = new Map<string, { group: string; label: string; color: string; stroke: string }>()
    nodes.forEach((node) => {
      const group = node.group || 'root'
      if (grouped.has(group)) return
      grouped.set(group, {
        group,
        label: group === 'root' ? 'knowledge' : group,
        color: node.color,
        stroke: node.stroke,
      })
    })
    return Array.from(grouped.values()).sort((a, b) => a.label.localeCompare(b.label))
  }, [nodes])

  const setSearchQuery = useCallback((q: string) => {
    searchQuerySyncRef.current = q
    setSearchQueryState(q)
    dirtyRef.current = true
  }, [])

  const setSelectedGroup = useCallback((g: string | null) => {
    selectedGroupRef.current = g
    setSelectedGroupState(g)
    dirtyRef.current = true
  }, [])

  const searchQuerySyncRef = useRef('')

  // Sync derived data to refs
  useEffect(() => {
    nodesRef.current = effectiveNodes
    edgeListRef.current = effectiveEdges
    effectiveNodesRef.current = effectiveNodes
    effectiveEdgesRef.current = effectiveEdges

    const ngm = new Map<string, string>()
    nodes.forEach((n) => ngm.set(n.id, n.group || 'root'))
    nodeGroupMapRef.current = ngm
    groupCentersRef.current = computeGroupCenters(nodes)
    masteryByTopicRef.current = masteryByTopic

    searchRef.current = computeSearchMatches(searchQuerySyncRef.current, effectiveNodes, effectiveEdges)
    dirtyRef.current = true
  }, [effectiveNodes, effectiveEdges, nodes, masteryByTopic])

  useEffect(() => {
    const matches = computeSearchMatches(searchQuery, effectiveNodesRef.current, effectiveEdgesRef.current)
    searchRef.current = matches
    setSearchMatchCount(matches?.directMatches.size ?? 0)
    dirtyRef.current = true
  }, [searchQuery])

  // Initialize / reset positions when effectiveNodes change
  useEffect(() => {
    const prevPositions = positionsRef.current
    const nextPositions = new Map<string, NodePosition>()
    const count = effectiveNodes.length
    const radius = Math.max(110, Math.min(220, count * 9))
    let hasNewNodes = false

    effectiveNodes.forEach((node, i) => {
      const existing = prevPositions.get(node.id)
      if (existing) {
        nextPositions.set(node.id, { ...existing })
      } else {
        hasNewNodes = true
        const angle = (i / count) * Math.PI * 2
        nextPositions.set(node.id, {
          x: radius * Math.cos(angle),
          y: radius * Math.sin(angle),
          vx: 0,
          vy: 0,
        })
      }
    })

    positionsRef.current = nextPositions
    // Only reheat if there are new nodes
    if (hasNewNodes) {
      alphaRef.current = ALPHA_START
    }
    dirtyRef.current = true
  }, [effectiveNodes])

  // Resize observer
  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0]
      if (!entry) return
      const { width, height } = entry.contentRect
      viewportRef.current = { width, height }
      dprRef.current = window.devicePixelRatio || 1
      const canvas = canvasRef.current
      if (canvas) {
        canvas.width = Math.round(width * dprRef.current)
        canvas.height = Math.round(height * dprRef.current)
        canvas.style.width = `${width}px`
        canvas.style.height = `${height}px`
      }
      if (!hasCenteredRef.current) {
        panRef.current = { x: width / 2, y: height / 2 }
        hasCenteredRef.current = true
      }
      dirtyRef.current = true
    })
    observer.observe(container)
    return () => observer.disconnect()
  }, [])

  const simulateStep = useCallback(() => {
    const alpha = alphaRef.current
    if (alpha < ALPHA_MIN && !dragRef.current) return

    const positions = positionsRef.current
    const ids = nodesRef.current.map((n) => n.id)
    const ngm = nodeGroupMapRef.current
    const gc = groupCentersRef.current
    const edges = edgeListRef.current

    // Accumulate forces per node
    const forces = new Map<string, { x: number; y: number }>()
    for (const id of ids) forces.set(id, { x: 0, y: 0 })

    // Repulsion between all node pairs (Coulomb-like)
    for (let i = 0; i < ids.length; i++) {
      const idA = ids[i]
      const posA = positions.get(idA)
      if (!posA) continue
      for (let j = i + 1; j < ids.length; j++) {
        const idB = ids[j]
        const posB = positions.get(idB)
        if (!posB) continue
        const dx = posB.x - posA.x
        const dy = posB.y - posA.y
        const dist = Math.max(MIN_DISTANCE, Math.hypot(dx, dy))
        const strength = REPULSION / (dist * dist)
        const fx = (strength * dx) / dist
        const fy = (strength * dy) / dist
        const fA = forces.get(idA)
        const fB = forces.get(idB)
        if (fA) { fA.x -= fx; fA.y -= fy }
        if (fB) { fB.x += fx; fB.y += fy }
      }
    }

    // Spring forces along edges
    for (const edge of edges) {
      const posA = positions.get(edge.source)
      const posB = positions.get(edge.target)
      if (!posA || !posB) continue
      const dx = posB.x - posA.x
      const dy = posB.y - posA.y
      const dist = Math.max(20, Math.hypot(dx, dy))
      const delta = dist - SPRING_LENGTH
      const strength = delta * SPRING_STRENGTH
      const fx = (strength * dx) / dist
      const fy = (strength * dy) / dist
      const fA = forces.get(edge.source)
      const fB = forces.get(edge.target)
      if (fA) { fA.x += fx; fA.y += fy }
      if (fB) { fB.x -= fx; fB.y -= fy }
    }

    // Cluster centering — pull nodes toward their group center
    for (const id of ids) {
      const pos = positions.get(id)
      const force = forces.get(id)
      if (!pos || !force) continue
      const group = ngm.get(id) ?? 'root'
      const center = gc.get(group)
      if (!center) continue
      force.x += (center.x - pos.x) * CLUSTER_STRENGTH
      force.y += (center.y - pos.y) * CLUSTER_STRENGTH
    }

    // Integrate velocities (d3-force style: decay first, then add force × alpha)
    for (const id of ids) {
      const pos = positions.get(id)
      const force = forces.get(id)
      if (!pos || !force) continue
      if (dragRef.current?.id === id) {
        pos.vx = 0
        pos.vy = 0
        continue
      }
      pos.vx *= VELOCITY_DECAY
      pos.vy *= VELOCITY_DECAY
      pos.vx += force.x * alpha
      pos.vy += force.y * alpha
      pos.x += pos.vx
      pos.y += pos.vy
    }

    alphaRef.current *= 1 - ALPHA_DECAY
    dirtyRef.current = true
  }, [])

  const draw = useCallback(() => {
    if (!dirtyRef.current) return
    dirtyRef.current = false

    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const { width, height } = viewportRef.current
    if (width === 0 || height === 0) return

    const dpr = dprRef.current
    const positions = positionsRef.current
    const nodes = effectiveNodesRef.current
    const edges = effectiveEdgesRef.current
    const ngm = nodeGroupMapRef.current
    const hoveredId = hoveredNodeIdRef.current
    const search = searchRef.current
    const selGroup = selectedGroupRef.current
    const mbt = masteryByTopicRef.current
    const zoom = zoomRef.current
    const pan = panRef.current

    // --- Resize canvas buffer if needed ---
    const bw = Math.round(width * dpr)
    const bh = Math.round(height * dpr)
    if (canvas.width !== bw || canvas.height !== bh) {
      canvas.width = bw
      canvas.height = bh
      canvas.style.width = `${width}px`
      canvas.style.height = `${height}px`
    }

    // --- Clear ---
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.clearRect(0, 0, canvas.width, canvas.height)

    // --- Set transform: dpr + pan/zoom ---
    ctx.setTransform(dpr, 0, 0, dpr, pan.x * dpr, pan.y * dpr)
    ctx.scale(zoom, zoom)

    // --- Viewport culling ---
    const invZoom = 1 / zoom
    const viewLeft = -pan.x * invZoom - 100
    const viewTop = -pan.y * invZoom - 100
    const viewRight = viewLeft + width * invZoom + 200
    const viewBottom = viewTop + height * invZoom + 200

    // --- Compute connected set ---
    const connected = hoveredId ? computeConnectedNodes(hoveredId, edges) : null

    // --- Draw edges ---
    for (let ei = 0; ei < edges.length; ei++) {
      const edge = edges[ei]
      const source = positions.get(edge.source)
      const target = positions.get(edge.target)
      if (!source || !target) continue

      // Cull if both endpoints are off-screen
      const minX = Math.min(source.x, target.x)
      const maxX = Math.max(source.x, target.x)
      const minY = Math.min(source.y, target.y)
      const maxY = Math.max(source.y, target.y)
      if (maxX < viewLeft || minX > viewRight || maxY < viewTop || minY > viewBottom) continue

      const sourceGroup = ngm.get(edge.source) ?? 'root'
      const targetGroup = ngm.get(edge.target) ?? 'root'

      let strokeOpacity = 0.35
      let strokeWidth = 1
      let strokeColor = edgeColor()

      if (selGroup) {
        const isGroupEdge = sourceGroup === selGroup && targetGroup === selGroup
        strokeOpacity = isGroupEdge ? 0.55 : 0.05
        strokeWidth = isGroupEdge ? 1.5 : 0.5
      } else if (search) {
        const isSearchEdge = search.matches.has(edge.source) && search.matches.has(edge.target)
        strokeOpacity = isSearchEdge ? 0.6 : 0.05
        strokeWidth = isSearchEdge ? 1.5 : 0.5
      } else if (hoveredId) {
        const isActiveEdge = edge.source === hoveredId || edge.target === hoveredId
        if (isActiveEdge) {
          const activeNode = nodes.find((n) => n.id === hoveredId)
          strokeColor = activeNode ? activeNode.color : edgeColor()
          strokeOpacity = 0.8
          strokeWidth = 2
        } else {
          strokeOpacity = 0.08
        }
      }

      const dx = target.x - source.x
      const dy = target.y - source.y
      const dist = Math.hypot(dx, dy)

      ctx.beginPath()
      if (dist > 0) {
        const curvature = 0.08
        const cx = (source.x + target.x) / 2 + (-dy / dist) * dist * curvature
        const cy = (source.y + target.y) / 2 + (dx / dist) * dist * curvature
        ctx.moveTo(source.x, source.y)
        ctx.quadraticCurveTo(cx, cy, target.x, target.y)
      } else {
        ctx.moveTo(source.x, source.y)
        ctx.lineTo(target.x, target.y)
      }

      ctx.strokeStyle = strokeColor
      ctx.globalAlpha = strokeOpacity
      ctx.lineWidth = strokeWidth / zoom // normalize so width is consistent
      ctx.stroke()
    }
    ctx.globalAlpha = 1

    // --- Draw nodes ---
    const showLabels = zoom >= LABEL_MIN_ZOOM
    const labelDetailZoom = zoom >= 0.8

    for (let ni = 0; ni < nodes.length; ni++) {
      const node = nodes[ni]
      const pos = positions.get(node.id)
      if (!pos) continue

      // Cull off-screen nodes
      if (pos.x + 50 < viewLeft || pos.x - 50 > viewRight) continue
      if (pos.y + 50 < viewTop || pos.y - 50 > viewBottom) continue

      const nodeGroup = node.group || 'root'
      const isHovered = hoveredId === node.id
      const isConnected = connected ? connected.has(node.id) : true
      const isDirectMatch = search ? search.directMatches.has(node.id) : false
      const isSearchMatch = search ? search.matches.has(node.id) : true
      const isGroupMatch = selGroup ? nodeGroup === selGroup : true
      const isPrimary = hoveredId === node.id || isDirectMatch || (selGroup && isGroupMatch)

      let nodeOpacity = 1
      if (selGroup) {
        nodeOpacity = isGroupMatch ? 1 : 0.12
      } else if (search) {
        nodeOpacity = isDirectMatch ? 1 : isSearchMatch ? 0.5 : 0.12
      } else if (hoveredId) {
        nodeOpacity = isConnected ? 1 : 0.2
      }

      const color = masteryColor(node, mbt)
      const r = node.radius

      // Glow
      if (isPrimary || isHovered) {
        ctx.beginPath()
        ctx.arc(pos.x, pos.y, r * GLOW_RADIUS_MULT, 0, Math.PI * 2)
        ctx.fillStyle = color
        ctx.globalAlpha = nodeOpacity * GLOW_OPACITY
        ctx.fill()
      }

      // Main circle
      ctx.globalAlpha = nodeOpacity
      ctx.beginPath()
      ctx.arc(pos.x, pos.y, r, 0, Math.PI * 2)
      ctx.fillStyle = color
      ctx.fill()

      // Stroke
      ctx.lineWidth = isHovered || isDirectMatch ? 3 : 2
      ctx.strokeStyle = isHovered || isDirectMatch ? ACTIVE_NODE_STROKE_COLOR : NODE_STROKE_COLOR
      ctx.stroke()

      // Label
      if (showLabels) {
        const labelAlpha = labelDetailZoom ? 0.85 : 0.5
        ctx.globalAlpha = nodeOpacity * labelAlpha
        ctx.font = `${Math.round(11 / Math.max(zoom, 0.5))}px ui-sans-serif, system-ui, sans-serif`
        ctx.textAlign = 'center'
        ctx.textBaseline = 'top'
        ctx.fillStyle = labelColor()
        ctx.fillText(node.label, pos.x, pos.y + r + 6)
      }
    }

    ctx.globalAlpha = 1
    ctx.setTransform(1, 0, 0, 1, 0, 0)

    // --- Draw hover tooltip ---
    if (hoveredId) {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      const hoveredPos = positions.get(hoveredId)
      const hoveredNode = nodes.find((n) => n.id === hoveredId)
      if (hoveredPos && hoveredNode) {
        const screenX = hoveredPos.x * zoom + pan.x
        const screenY = hoveredPos.y * zoom + pan.y
        const label = hoveredNode.label
        ctx.font = '12px ui-sans-serif, system-ui, sans-serif'
        const metrics = ctx.measureText(label)
        const tw = metrics.width + 16
        const th = 26
        const tx = screenX - tw / 2
        const ty = screenY + hoveredNode.radius * zoom + 10

        ctx.fillStyle = 'rgba(0, 0, 0, 0.8)'
        ctx.beginPath()
        ctx.roundRect(tx, ty, tw, th, 6)
        ctx.fill()

        ctx.fillStyle = '#ffffff'
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.fillText(label, screenX, ty + th / 2)
      }
      ctx.setTransform(1, 0, 0, 1, 0, 0)
    }
  }, [])

  // Main render loop: simulate + draw
  useEffect(() => {
    let active = true
    const tick = () => {
      if (!active) return
      simulateStep()
      draw()
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => {
      active = false
      cancelAnimationFrame(rafRef.current)
    }
  }, [simulateStep, draw])

  // --- Pointer / interaction handlers ---

  const screenToGraph = useCallback((clientX: number, clientY: number) => {
    const container = containerRef.current
    if (!container) return { x: 0, y: 0 }
    const rect = container.getBoundingClientRect()
    const pan = panRef.current
    const zoom = zoomRef.current
    return {
      x: (clientX - rect.left - pan.x) / zoom,
      y: (clientY - rect.top - pan.y) / zoom,
    }
  }, [])

  const findNodeAtPoint = useCallback((graphX: number, graphY: number) => {
    const nodes = effectiveNodesRef.current
    const positions = positionsRef.current
    let closest: string | null = null
    let closestDist = HIT_RADIUS
    for (const node of nodes) {
      const pos = positions.get(node.id)
      if (!pos) continue
      const dist = Math.hypot(pos.x - graphX, pos.y - graphY)
      if (dist < closestDist) {
        closestDist = dist
        closest = node.id
      }
    }
    return closest
  }, [])

  const handlePointerDown = useCallback((event: React.PointerEvent) => {
    if (event.button !== 0) return
    event.preventDefault()
    const graphPoint = screenToGraph(event.clientX, event.clientY)
    const hitNode = findNodeAtPoint(graphPoint.x, graphPoint.y)

    if (hitNode) {
      const pos = positionsRef.current.get(hitNode)!
      dragRef.current = {
        id: hitNode,
        offsetX: graphPoint.x - pos.x,
        offsetY: graphPoint.y - pos.y,
        moved: false,
      }
      setCursorStyle('grabbing')
      alphaRef.current = Math.max(alphaRef.current, ALPHA_REHEAT)
      dirtyRef.current = true
      const target = event.currentTarget as HTMLElement
      target.setPointerCapture(event.pointerId)
    } else {
      panStartRef.current = {
        startX: event.clientX,
        startY: event.clientY,
        originX: panRef.current.x,
        originY: panRef.current.y,
      }
      setCursorStyle('grabbing')
      const target = event.currentTarget as HTMLElement
      target.setPointerCapture(event.pointerId)
    }
  }, [screenToGraph, findNodeAtPoint])

  const handlePointerMove = useCallback((event: React.PointerEvent) => {
    const drag = dragRef.current
    if (drag) {
      const graphPoint = screenToGraph(event.clientX, event.clientY)
      const pos = positionsRef.current.get(drag.id)
      if (pos) {
        pos.x = graphPoint.x - drag.offsetX
        pos.y = graphPoint.y - drag.offsetY
        pos.vx = 0
        pos.vy = 0
        drag.moved = true
        dirtyRef.current = true
      }
      return
    }

    const panning = panStartRef.current
    if (panning) {
      panRef.current = {
        x: panning.originX + (event.clientX - panning.startX),
        y: panning.originY + (event.clientY - panning.startY),
      }
      dirtyRef.current = true
      return
    }

    // Hover detection
    const graphPoint = screenToGraph(event.clientX, event.clientY)
    const hitNode = findNodeAtPoint(graphPoint.x, graphPoint.y)
    hoveredNodeIdRef.current = hitNode
    setCursorStyle(hitNode ? 'pointer' : 'grab')
    dirtyRef.current = true
  }, [screenToGraph, findNodeAtPoint])

  const handlePointerUp = useCallback(() => {
    const drag = dragRef.current
    if (drag) {
      if (!drag.moved) {
        onSelectNode?.(drag.id)
      }
      dragRef.current = null
      alphaRef.current = Math.max(alphaRef.current, 0.1)
      dirtyRef.current = true
    }
    panStartRef.current = null
    setCursorStyle('grab')
  }, [onSelectNode])

  const handlePointerLeave = useCallback(() => {
    handlePointerUp()
    hoveredNodeIdRef.current = null
    setCursorStyle('grab')
    dirtyRef.current = true
  }, [handlePointerUp])

  const handleWheel = useCallback((event: React.WheelEvent) => {
    event.preventDefault()
    const container = containerRef.current
    if (!container) return

    const rawDelta = event.deltaY
    const normalizedDelta = event.deltaMode === 1 ? rawDelta * 16 : event.deltaMode === 2 ? rawDelta * viewportRef.current.height : rawDelta
    const sensitivity = Math.abs(normalizedDelta) < 40 ? 0.004 : 0.0022
    const zoomFactor = Math.exp(-normalizedDelta * sensitivity)

    const prevZoom = zoomRef.current
    const nextZoom = Math.min(2.5, Math.max(0.1, prevZoom * zoomFactor))
    if (nextZoom === prevZoom) return

    const rect = container.getBoundingClientRect()
    const cursorX = event.clientX - rect.left
    const cursorY = event.clientY - rect.top
    const pan = panRef.current
    const graphX = (cursorX - pan.x) / prevZoom
    const graphY = (cursorY - pan.y) / prevZoom

    zoomRef.current = nextZoom
    panRef.current = {
      x: cursorX - graphX * nextZoom,
      y: cursorY - graphY * nextZoom,
    }
    dirtyRef.current = true
  }, [])

  return (
    <div ref={containerRef} className="graph-view relative h-full w-full">
      {error ? (
        <div className="absolute inset-0 z-10 flex items-center justify-center text-sm text-destructive">
          {error}
        </div>
      ) : null}

      {!error && nodes.length === 0 ? (
        <div className="absolute inset-0 flex items-center justify-center text-sm text-muted-foreground">
          No notes found.
        </div>
      ) : null}

      <canvas
        ref={canvasRef}
        className="absolute inset-0 h-full w-full"
        style={{ cursor: cursorStyle, touchAction: 'none' }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerLeave}
        onWheel={handleWheel}
      />

      {courses && courses.length > 0 ? (
        <div
          className="absolute left-3 top-3 z-20 flex flex-wrap gap-1.5"
          onPointerDown={(event) => event.stopPropagation()}
        >
          <button
            onClick={() => onCourseChange?.(null)}
            className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
              !selectedCourse
                ? 'bg-foreground text-background'
                : 'bg-muted text-muted-foreground hover:bg-muted-foreground/20'
            }`}
          >
            All
          </button>
          {courses.map((course) => (
            <button
              key={course}
              onClick={() => onCourseChange?.(course)}
              className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                selectedCourse === course
                  ? 'bg-foreground text-background'
                  : 'bg-muted text-muted-foreground hover:bg-muted-foreground/20'
              }`}
            >
              {course}
            </button>
          ))}
        </div>
      ) : null}

      {legendItems.length > 0 ? (
        <div
          className="absolute right-3 top-3 z-20 rounded-md border border-border/80 bg-background/90 px-3 py-2 text-xs text-foreground shadow-sm backdrop-blur"
          onPointerDown={(event) => event.stopPropagation()}
        >
          <div className="mb-2 text-[0.7rem] font-semibold uppercase tracking-wide text-muted-foreground">
            Folders
          </div>
          <div className="grid gap-1">
            {legendItems.map((item) => {
              const isSelected = selectedGroup === item.group
              return (
                <button
                  key={item.group}
                  onClick={() => setSelectedGroup(isSelected ? null : item.group)}
                  className={`flex items-center gap-2 rounded px-1.5 py-1 text-left transition-colors hover:bg-foreground/10 ${
                    isSelected ? 'bg-foreground/15' : ''
                  }`}
                >
                  <span
                    className="inline-flex h-2.5 w-2.5 rounded-full"
                    style={{ backgroundColor: item.color, boxShadow: `0 0 0 1px ${item.stroke}` }}
                  />
                  <span className="truncate">{item.label}</span>
                  <X className={`ml-auto size-3 ${isSelected ? 'text-muted-foreground' : 'invisible'}`} />
                </button>
              )
            })}
          </div>
        </div>
      ) : null}

      {showGaps && gapDetails.length > 0 ? (
        <div
          className="absolute bottom-4 left-4 z-20 max-h-48 w-64 overflow-y-auto rounded-md border border-border/80 bg-background/90 px-3 py-2 text-xs shadow-sm backdrop-blur"
          onPointerDown={(event) => event.stopPropagation()}
        >
          <div className="mb-1.5 text-[0.7rem] font-semibold uppercase tracking-wide text-destructive">
            Knowledge Gaps ({gapDetails.length})
          </div>
          <div className="grid gap-1">
            {gapDetails.map((gap) => (
              <div
                key={gap.id}
                className="cursor-pointer rounded px-1.5 py-1 text-muted-foreground transition-colors hover:bg-foreground/10 hover:text-foreground"
                onClick={() => onSelectNode?.(gap.id)}
              >
                <span className="font-medium text-foreground">{gap.label}</span>
                {gap.reasons.length > 0 ? (
                  <span className="ml-1.5">
                    {' \u2014 '}
                    {gap.reasons.join(', ')}
                  </span>
                ) : null}
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <div
        className="absolute bottom-4 left-1/2 z-20 -translate-x-1/2"
        onPointerDown={(event) => event.stopPropagation()}
      >
        <div className="relative flex items-center">
          <Search className="absolute left-3 size-4 text-muted-foreground" />
          <Input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search nodes..."
            className="w-64 pl-9 pr-20 shadow-lg backdrop-blur"
          />
          <div className="absolute right-3 flex items-center gap-2">
            {searchQuery && (
              <>
                <span className="text-xs text-muted-foreground">
                  {searchMatchCount}
                </span>
                <button
                  onClick={() => setSearchQuery('')}
                  className="text-muted-foreground hover:text-foreground"
                >
                  <X className="size-4" />
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}