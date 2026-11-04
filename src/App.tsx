import React, { useState, useRef, useEffect } from 'react'
import { Header } from './components/Header'
import { Toolbar } from './components/Toolbar'
import { PdfViewer } from './components/PdfViewer'
import { ThumbnailSidebar } from './components/ThumbnailSidebar'
import { DeskSidebar } from './components/DeskSidebar'
import { ReviewToolbar } from './components/ReviewToolbar'
import { ReviewSidebar } from './components/ReviewSidebar'
import { DeskDoc, DeskItem } from './types/desk'
import { createDeskItemsFromPdfFile, buildMergedPdfFromDesk } from './utils/deskService'
import {
  getMuPdf,
  getPdfInfo,
  renderPageImage,
  searchPageKeyword,
  extractTextRectsInBBox,
  applyRedactions,
  saveEditablePdf,
  extractEditableState,
  compactPdf,
  mergePdfFiles,
  extractPages,
  deletePagesFromPdf,
  loadPdfBookmarks,
  RedactRect,
  PdfDocumentInfo,
  CompactLevel,
} from './utils/mupdfService'
import {
  AppMode,
  WorkspaceMode,
  DrawingTool,
  FillMode,
  ArrowHead,
  DrawingItem,
  HistoryAction,
  BookmarkItem,
  RulerMeasureMode,
  ReviewComment,
  ReviewStamp,
  ReviewTool,
  ProofreadingMark,
} from './types/drawing'
import {
  FileUp,
  ShieldCheck,
  FileCheck,
  Zap,
  Sparkles,
  Lock,
  Eraser,
  CheckCircle2,
  PenTool,
  FolderKanban,
  Minimize2,
  Download,
  Layers,
  ClipboardCheck,
  CheckSquare,
} from 'lucide-react'

function formatBytes(bytes?: number | null): string {
  if (!bytes || bytes <= 0) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
}

export default function App() {
  const [pdfBytes, setPdfBytes] = useState<Uint8Array | null>(null)
  const [fileName, setFileName] = useState<string | null>(null)
  const [docInfo, setDocInfo] = useState<PdfDocumentInfo | null>(null)
  const [currentPage, setCurrentPage] = useState<number>(0)
  const [zoom, setZoom] = useState<number>(1.0)
  const [resetViewTrigger, setResetViewTrigger] = useState<number>(0)
  const [fitViewTrigger, setFitViewTrigger] = useState<number>(0)
  const [colorMode, setColorMode] = useState<'black' | 'white'>('black')
  const [selectMode, setSelectMode] = useState<'text' | 'rect'>('text')
  const [redactions, setRedactions] = useState<RedactRect[]>([])

  // ページごとの回転角度 (pageIndex -> 0 | 90 | 180 | 270)
  const [pageRotations, setPageRotations] = useState<Record<number, number>>({})

  // しおり（目次）ツリー
  const [bookmarks, setBookmarks] = useState<BookmarkItem[]>([])

  // 抽出対象として選択中のページセット
  const [selectedPagesForExtract, setSelectedPagesForExtract] = useState<Set<number>>(new Set())

  // ワークスペースモード ('redact' | 'draw' | 'organize' | 'optimize') と入り口画面フラグ
  const [isHomeScreen, setIsHomeScreen] = useState<boolean>(true)
  const [workspaceMode, setWorkspaceMode] = useState<WorkspaceMode>('redact')
  const pendingEntryModeRef = useRef<WorkspaceMode | null>(null)
  const [optimizeLevel, setOptimizeLevel] = useState<CompactLevel>('standard')
  const [lastOptimizeResult, setLastOptimizeResult] = useState<{
    originalSize: number;
    compactedSize: number;
    optimizedImagesCount: number;
  } | null>(null)

  // 描画・校正モード用 state
  const [appMode, setAppMode] = useState<AppMode>('eraser')
  const [activeTool, setActiveTool] = useState<DrawingTool>('text')
  const [drawColor, setDrawColor] = useState<string>('#ef4444') // 初期色は赤
  const [lineWidth, setLineWidth] = useState<number>(2)
  const [fontSize, setFontSize] = useState<number>(16)
  const [fillMode, setFillMode] = useState<FillMode>('none')
  const [arrowHead, setArrowHead] = useState<ArrowHead>('end')
  const [checkSize, setCheckSize] = useState<number>(14)
  const [drawings, setDrawings] = useState<DrawingItem[]>([])

  // 🔍 審査・確認（Review / Audit）用 state
  const [reviewComments, setReviewComments] = useState<ReviewComment[]>([])
  const [reviewStamps, setReviewStamps] = useState<ReviewStamp[]>([])
  const [proofreadingMarks, setProofreadingMarks] = useState<ProofreadingMark[]>([])
  const [verifiedPages, setVerifiedPages] = useState<Set<number>>(new Set())
  const [activeReviewTool, setActiveReviewTool] = useState<ReviewTool>('pin')
  const [isReviewSidebarOpen, setIsReviewSidebarOpen] = useState<boolean>(true)
  const [selectedReviewCommentId, setSelectedReviewCommentId] = useState<string | null>(null)
  const [selectedProofreadingMarkId, setSelectedProofreadingMarkId] = useState<string | null>(null)

  // 物差しの縮尺 (1:100 が図面標準) と計測モード ('distance' | 'area')
  const [rulerScale, setRulerScale] = useState<number>(100)
  const [rulerMeasureMode, setRulerMeasureMode] = useState<RulerMeasureMode>('distance')

  // 操作履歴 (Undo 用)
  const [history, setHistory] = useState<HistoryAction[]>([])

  // ページごとのレンダリング画像キャッシュ
  const [pageImages, setPageImages] = useState<Map<number, string>>(new Map())
  const [thumbnails, setThumbnails] = useState<Map<number, string>>(new Map())

  // ローディング状態
  const [isLoadingPdf, setIsLoadingPdf] = useState<boolean>(false)
  const [isProcessing, setIsProcessing] = useState<boolean>(false)
  const [successToast, setSuccessToast] = useState<string | null>(null)
  const [lastAddedRect, setLastAddedRect] = useState<RedactRect | null>(null)

  // 左右ペイン幅の永続化管理
  const [leftSidebarWidth, setLeftSidebarWidth] = useState<number>(() => {
    const saved = localStorage.getItem('giov_left_sidebar_width')
    return saved ? parseInt(saved, 10) || 256 : 256
  })
  const [rightSidebarWidth, setRightSidebarWidth] = useState<number>(() => {
    const saved = localStorage.getItem('giov_right_sidebar_width')
    return saved ? parseInt(saved, 10) || 340 : 340
  })

  const handleResizeLeftSidebar = (w: number) => {
    const clamped = Math.min(650, Math.max(180, w))
    setLeftSidebarWidth(clamped)
    localStorage.setItem('giov_left_sidebar_width', clamped.toString())
  }
  const handleResizeRightSidebar = (w: number) => {
    const clamped = Math.min(750, Math.max(260, w))
    setRightSidebarWidth(clamped)
    localStorage.setItem('giov_right_sidebar_width', clamped.toString())
  }

  // 作業机の state (初期状態は閉じた状態 false: これまでの通常使用を完全維持)
  const [isDeskOpen, setIsDeskOpen] = useState<boolean>(false)

  // 🚀 Web配信最適化: アイドル時間を利用したWASMとフォントの先行プリロード（初回ファイル投入時の体感ラグをゼロ化）
  useEffect(() => {
    const preload = () => {
      getMuPdf().catch(() => {})
    }
    if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
      ;(window as any).requestIdleCallback(preload, { timeout: 2500 })
    } else {
      setTimeout(preload, 1000)
    }
  }, [])
  // deskSourceItems: 左ペイン（素材プール: 読み込んだ全PDFファイルとその全ページ）
  const [deskSourceItems, setDeskSourceItems] = useState<DeskItem[]>([])
  // deskItems: 右ペイン（編纂ワークスペース: 抽出・結合対象のページ群）
  const [deskItems, setDeskItems] = useState<DeskItem[]>([])
  const [deskDocs, setDeskDocs] = useState<Map<string, DeskDoc>>(new Map())

  const fileInputRef = useRef<HTMLInputElement>(null)
  const loadGenRef = useRef<number>(0)
  // 各ページが現在どの解像度倍率（scale）でレンダリングされているかを管理（拡大時の動的ハイレゾ再描画用）
  const pageRenderScalesRef = useRef<Map<number, number>>(new Map())

  // 現在のズーム倍率とデバイスピクセル比に応じた最適なレンダリング倍率 (1.5 〜 4.5) を算出
  const getTargetRenderScale = (z: number) => {
    const dpr = typeof window !== 'undefined' ? Math.min(window.devicePixelRatio || 1, 1.5) : 1
    return Math.min(4.5, Math.max(1.5, Math.round(1.5 * z * dpr * 10) / 10))
  }

  // 古い ObjectURL を安全にメモリ解放するヘルパー
  const revokeUrlMap = (map: Map<number, string>) => {
    for (const url of map.values()) {
      if (url && url.startsWith('blob:')) {
        try {
          URL.revokeObjectURL(url)
        } catch {}
      }
    }
  }

  // サムネイルをバックグラウンドで4ページずつ段階生成するヘルパー（初期表示をブロックしない）
  const generateThumbnailsInBatches = async (
    bytes: Uint8Array,
    pages: { index: number }[],
    rotations: Record<number, number>,
    genId: number
  ) => {
    const BATCH_SIZE = 4
    for (let i = 0; i < pages.length; i += BATCH_SIZE) {
      if (loadGenRef.current !== genId) return
      const slice = pages.slice(i, i + BATCH_SIZE)
      const batchResults = await Promise.all(
        slice.map(async (p) => {
          const rot = rotations[p.index] || 0
          const thumb = await renderPageImage(bytes, p.index, 0.3, rot)
          return [p.index, thumb] as [number, string]
        })
      )
      if (loadGenRef.current !== genId) {
        // 途中で別PDFが開かれた場合は生成したURLを即座に破棄
        for (const [, url] of batchResults) {
          if (url.startsWith('blob:')) URL.revokeObjectURL(url)
        }
        return
      }
      setThumbnails((prev) => {
        const next = new Map(prev)
        for (const [idx, url] of batchResults) {
          const oldUrl = next.get(idx)
          if (oldUrl && oldUrl !== url && oldUrl.startsWith('blob:')) {
            URL.revokeObjectURL(oldUrl)
          }
          next.set(idx, url)
        }
        return next
      })
    }
  }

  // PDF ファイルのロード処理（一時保存データの自動検出・復元にも対応）
  const loadPdf = async (file: File) => {
    const genId = ++loadGenRef.current
    try {
      setIsLoadingPdf(true)
      setFileName(file.name)
      const buffer = await file.arrayBuffer()
      const rawBytes = new Uint8Array(buffer)

      // 一時保存（再編集可）データ (/GV_Draft) の有無をチェック
      const restored = await extractEditableState(rawBytes)
      const bytes = restored ? restored.cleanPdfBytes : rawBytes
      const restoredRotations = restored?.state.pageRotations || {}

      setPdfBytes(bytes)

      // メタ情報としおり情報の取得
      const [info, bms] = await Promise.all([
        getPdfInfo(bytes, restoredRotations),
        loadPdfBookmarks(bytes),
      ])
      setDocInfo(info)
      setBookmarks(
        restored?.state.bookmarks && restored.state.bookmarks.length > 0
          ? restored.state.bookmarks
          : bms
      )
      setPageRotations(restoredRotations)
      setSelectedPagesForExtract(new Set())
      setCurrentPage(0)
      setRedactions(restored?.state.redactions || [])
      setDrawings(restored?.state.drawings || [])
      if (restored?.state.colorMode) setColorMode(restored.state.colorMode)
      if (restored?.state.rulerScale) setRulerScale(restored.state.rulerScale)
      setHistory([])
      setLastAddedRect(null)
      setPageImages((prev) => {
        revokeUrlMap(prev)
        return new Map()
      })
      setThumbnails((prev) => {
        revokeUrlMap(prev)
        return new Map()
      })

      // 最初のページの高画質画像を生成した時点で即座に画面を表示！
      const firstPageRot = restoredRotations[0] || 0
      const initScale = getTargetRenderScale(zoom)
      const firstPageImg = await renderPageImage(bytes, 0, initScale, firstPageRot)
      pageRenderScalesRef.current = new Map([[0, initScale]])
      setPageImages(new Map([[0, firstPageImg]]))
      setIsLoadingPdf(false)

      if (restored) {
        const rCount = restored.state.redactions?.length || 0
        const dCount = restored.state.drawings?.length || 0
        showToast(
          `🔓 一時保存（再編集可）PDFを検出！墨消し枠 ${rCount}箇所・校正描画 ${dCount}件を再編集可能な状態で復元しました。`
        )
      }

      // サムネイルはバックグラウンドで段階的に非同期生成
      generateThumbnailsInBatches(bytes, info.pages, restoredRotations, genId).catch((err) =>
        console.warn('サムネイル生成エラー:', err)
      )
    } catch (err) {
      console.error('PDF読み込みエラー:', err)
      alert('PDFファイルの読み込みに失敗しました。正しいPDFファイルかご確認ください。')
      setIsLoadingPdf(false)
    }
  }

  // ページ切り替え時、または回転変更時にプレビュー画像をオンデマンド生成
  useEffect(() => {
    if (!pdfBytes || !docInfo) return
    const rot = pageRotations[currentPage] || 0
    if (!pageImages.has(currentPage)) {
      const targetScale = getTargetRenderScale(zoom)
      pageRenderScalesRef.current.set(currentPage, targetScale)
      renderPageImage(pdfBytes, currentPage, targetScale, rot).then((url) => {
        setPageImages((prev) => new Map(prev).set(currentPage, url))
      })
    }
  }, [currentPage, pdfBytes, docInfo, pageRotations])

  // 拡大表示（ズームイン）した際、現在ページの解像度が不足していれば高精細（ハイレゾ）で動的に再レンダリング
  useEffect(() => {
    if (!pdfBytes || !docInfo) return
    const targetScale = getTargetRenderScale(zoom)
    const currentScale = pageRenderScalesRef.current.get(currentPage) || 1.5
    if (targetScale <= currentScale + 0.15) return

    let cancelled = false
    const timer = setTimeout(() => {
      const rot = pageRotations[currentPage] || 0
      renderPageImage(pdfBytes, currentPage, targetScale, rot)
        .then((url) => {
          if (cancelled) {
            if (url.startsWith('blob:')) URL.revokeObjectURL(url)
            return
          }
          pageRenderScalesRef.current.set(currentPage, targetScale)
          setPageImages((prev) => {
            const old = prev.get(currentPage)
            if (old && old !== url && old.startsWith('blob:')) {
              URL.revokeObjectURL(old)
            }
            return new Map(prev).set(currentPage, url)
          })
        })
        .catch((err) => console.warn('高解像度再描画エラー:', err))
    }, 180)

    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [zoom, currentPage, pdfBytes, docInfo, pageRotations])

  // ワークスペースモードの切り替えと連動状態の適用
  const handleWorkspaceModeChange = (mode: WorkspaceMode) => {
    setWorkspaceMode(mode)
    setIsHomeScreen(false)
    if (mode === 'redact') {
      setAppMode('eraser')
    } else if (mode === 'draw') {
      setAppMode('draw')
      if (activeTool === 'pan') {
        setActiveTool('text')
      }
    } else if (mode === 'organize') {
      setIsDeskOpen(true)
    } else if (mode === 'optimize') {
      setLastOptimizeResult(null)
    }
  }

  // 入り口カードをクリックしたときに、そのモードの専用画面を立ち上げる
  const enterWorkspaceMode = (mode: WorkspaceMode) => {
    handleWorkspaceModeChange(mode)
    setIsHomeScreen(false)
  }

  // 指定モードでPDFファイル群を開く
  const openFilesInMode = async (files: FileList | File[], mode: WorkspaceMode) => {
    const validFiles = Array.from(files).filter(
      (f) => f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf')
    )
    if (validFiles.length === 0) {
      alert('PDFファイルを選択またはドロップしてください。')
      return
    }
    handleWorkspaceModeChange(mode)
    setIsHomeScreen(false)
    setLastOptimizeResult(null)

    if (mode === 'organize') {
      // 作業机モードでは、選択・ドロップされたPDFファイル群をそのまま作業机に投入する
      const dt = new DataTransfer()
      validFiles.forEach((f) => dt.items.add(f))
      await handleAddPdfFilesToDesk(dt.files)
      return
    }

    await loadPdf(validFiles[0])
  }

  // ファイル選択ダイアログ起動
  const triggerFileOpenWithMode = (mode: WorkspaceMode) => {
    pendingEntryModeRef.current = mode
    fileInputRef.current?.click()
  }

  // ファイルドラッグ＆ドロップ受付
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      openFilesInMode(e.dataTransfer.files, workspaceMode)
    }
  }

  // 消しゴム矩形の追加 (マウス領域ドラッグ時)
  const handleAddRedaction = async (rectData: Omit<RedactRect, 'id'>) => {
    // 直前選択領域としては囲んだ全体を保持（全頁一括適用の際に元の範囲を使えるように）
    const baseAreaRect: RedactRect = {
      ...rectData,
      id: `area_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    }
    setLastAddedRect(baseAreaRect)

    // テキスト吸着モードの場合: 指定矩形内のテキスト行バウンディングボックスを抽出（ページ回転角も反映）
    if (selectMode === 'text' && pdfBytes) {
      try {
        const textRects = await extractTextRectsInBBox(
          pdfBytes,
          rectData.pageIndex,
          [rectData.x0, rectData.y0, rectData.x1, rectData.y1],
          pageRotations[rectData.pageIndex] || 0
        )
        if (textRects.length > 0) {
          const newRects: RedactRect[] = textRects.map(([x0, y0, x1, y1]) => ({
            id: `text_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            x0,
            y0,
            x1,
            y1,
            pageIndex: rectData.pageIndex,
            color: rectData.color,
          }))
          setRedactions((prev) => [...prev, ...newRects])
          setHistory((prev) => [
            ...prev,
            { type: 'add_redactions', redactionIds: newRects.map((r) => r.id) },
          ])
          showToast(`✨ 囲み内のテキスト（${newRects.length}行）に吸着選択しました！`)
          return
        }
        // テキストが存在しない余白や図面・線を囲んだ場合は、フォールバックとして矩形全体を消去枠にする
      } catch (err) {
        console.warn('テキスト吸着抽出エラー（自由矩形フォールバック）:', err)
      }
    }

    // 自由矩形モード、またはテキストが検出されなかった場合（図面・印鑑・写真など）
    const newRect: RedactRect = {
      ...rectData,
      id: `redact_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    }
    setRedactions((prev) => [...prev, newRect])
    setHistory((prev) => [
      ...prev,
      { type: 'add_redaction', redactionId: newRect.id },
    ])
  }

  // 直前に囲んだ領域を全ページに一括展開
  const handleApplyAreaToAllPages = async () => {
    if (!lastAddedRect || !docInfo || !pdfBytes) return
    if (docInfo.numPages <= 1) {
      showToast('ℹ️ この文書は1ページのみのため、全ページ適用の必要はありません。')
      return
    }

    setIsProcessing(true)
    try {
      const otherPages = docInfo.pages.filter((p) => p.index !== lastAddedRect.pageIndex)
      const newRects: RedactRect[] = []

      for (const p of otherPages) {
        // テキスト吸着モードの場合は各ページ内の該当テキスト行を抽出（各ページの回転角も反映）
        if (selectMode === 'text') {
          const textRects = await extractTextRectsInBBox(
            pdfBytes,
            p.index,
            [lastAddedRect.x0, lastAddedRect.y0, lastAddedRect.x1, lastAddedRect.y1],
            pageRotations[p.index] || 0
          )
          if (textRects.length > 0) {
            for (const [x0, y0, x1, y1] of textRects) {
              newRects.push({
                id: `copy_text_${Date.now()}_p${p.index}_${Math.random().toString(36).substr(2, 7)}`,
                x0,
                y0,
                x1,
                y1,
                pageIndex: p.index,
                color: lastAddedRect.color,
              })
            }
            continue
          }
        }

        // 自由矩形モード、またはテキストが0件だった場合は同じ矩形を展開
        newRects.push({
          ...lastAddedRect,
          id: `copy_${Date.now()}_p${p.index}_${Math.random().toString(36).substr(2, 7)}`,
          pageIndex: p.index,
        })
      }

      setRedactions((prev) => [...prev, ...newRects])
      setHistory((prev) => [
        ...prev,
        { type: 'add_redactions', redactionIds: newRects.map((r) => r.id) },
      ])
      showToast(`✨ 直前に囲んだ領域を、全 ${docInfo.numPages} ページに一括展開しました！（計${newRects.length}箇所追加）`)
    } catch (err) {
      console.error('全ページ展開エラー:', err)
      showToast('全ページ展開中にエラーが発生しました。')
    } finally {
      setIsProcessing(false)
    }
  }

  // 消しゴム矩形の削除
  const handleRemoveRedaction = (id: string) => {
    const target = redactions.find((r) => r.id === id)
    if (target) {
      setHistory((prev) => [...prev, { type: 'remove_redaction', redaction: target }])
    }
    setRedactions((prev) => prev.filter((r) => r.id !== id))
    if (lastAddedRect && lastAddedRect.id === id) {
      setLastAddedRect(null)
    }
  }

  // 現在ページの消しゴム枠をクリア
  const handleClearPageRedactions = () => {
    const pageReds = redactions.filter((r) => r.pageIndex === currentPage)
    if (pageReds.length > 0) {
      setHistory((prev) => [
        ...prev,
        { type: 'clear_page', redactions: pageReds, drawings: [] },
      ])
    }
    setRedactions((prev) => prev.filter((r) => r.pageIndex !== currentPage))
    if (lastAddedRect && lastAddedRect.pageIndex === currentPage) {
      setLastAddedRect(null)
    }
  }

  // 全ページの消しゴム枠を一括クリア
  const handleClearAllRedactions = () => {
    if (redactions.length === 0) return
    if (window.confirm(`全ページの消しゴム枠（合計 ${redactions.length} 箇所）をすべて解除しますか？`)) {
      setHistory((prev) => [
        ...prev,
        { type: 'clear_all', redactions: [...redactions], drawings: [] },
      ])
      setRedactions([])
      setLastAddedRect(null)
      showToast('🗑️ 全ページの消しゴム枠をすべて解除しました。')
    }
  }

  // 描画アイテムの追加
  const handleAddDrawing = (item: Omit<DrawingItem, 'id'>) => {
    const newItem: DrawingItem = {
      ...item,
      id: `draw_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    }
    setDrawings((prev) => [...prev, newItem])
    setHistory((prev) => [...prev, { type: 'add_drawing', drawingId: newItem.id }])
  }

  // 描画アイテムの削除
  const handleRemoveDrawing = (id: string) => {
    const target = drawings.find((d) => d.id === id)
    if (target) {
      setHistory((prev) => [...prev, { type: 'remove_drawing', drawing: target }])
    }
    setDrawings((prev) => prev.filter((d) => d.id !== id))
  }

  // 描画アイテムの更新（移動・変形・テキスト再編集）
  const handleUpdateDrawing = (
    id: string,
    updates: Partial<DrawingItem>,
    recordHistory: boolean = true,
    prevOverride?: Partial<DrawingItem>
  ) => {
    setDrawings((prev) => {
      const target = prev.find((d) => d.id === id)
      if (!target) return prev

      if (recordHistory) {
        const src = prevOverride || target
        const prevProps: Partial<DrawingItem> = {}
        if (src.x !== undefined) prevProps.x = src.x
        if (src.y !== undefined) prevProps.y = src.y
        if (src.w !== undefined) prevProps.w = src.w
        if (src.h !== undefined) prevProps.h = src.h
        if (src.rotation !== undefined) prevProps.rotation = src.rotation
        if (src.text !== undefined) prevProps.text = src.text
        if (src.bgWhite !== undefined) prevProps.bgWhite = src.bgWhite
        if (src.fontSize !== undefined) prevProps.fontSize = src.fontSize
        if (src.points) prevProps.points = src.points.map((p) => ({ ...p }))

        setHistory((h) => [...h, { type: 'move_drawing', id, prev: prevProps }])
      }

      return prev.map((d) => (d.id === id ? { ...d, ...updates } : d))
    })
  }

  // 元に戻す (Undo)
  const handleUndo = () => {
    if (history.length === 0) return
    const newHist = [...history]
    const action = newHist.pop()!

    switch (action.type) {
      case 'add_redaction':
        setRedactions((r) => r.filter((item) => item.id !== action.redactionId))
        break
      case 'add_redactions':
        setRedactions((r) => r.filter((item) => !action.redactionIds.includes(item.id)))
        break
      case 'remove_redaction':
        setRedactions((r) => [...r, action.redaction])
        break
      case 'add_drawing':
        setDrawings((d) => d.filter((item) => item.id !== action.drawingId))
        break
      case 'remove_drawing':
        setDrawings((d) => [...d, action.drawing])
        break
      case 'move_drawing':
        setDrawings((prev) =>
          prev.map((item) => (item.id === action.id ? { ...item, ...action.prev } : item))
        )
        break
      case 'clear_page':
      case 'clear_all':
        setRedactions((r) => [...r, ...action.redactions])
        setDrawings((d) => [...d, ...action.drawings])
        break
    }
    setHistory(newHist)
    showToast('↩️ 直前の操作を元に戻しました。')
  }

  // キーボードショートカット (Ctrl+Z / Cmd+Z で Undo)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const activeTag = document.activeElement?.tagName?.toLowerCase()
      if (activeTag === 'input' || activeTag === 'textarea') {
        return
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') {
        if (!e.shiftKey) {
          e.preventDefault()
          handleUndo()
        }
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [history])

  // キーワード一括検索消しゴム
  const handleKeywordSearch = async (keyword: string, searchAllPages: boolean) => {
    if (!pdfBytes || !docInfo) return
    setIsProcessing(true)

    try {
      const targetPageIndices = searchAllPages
        ? docInfo.pages.map((p) => p.index)
        : [currentPage]

      let totalFound = 0
      const newRects: RedactRect[] = []

      for (const pIndex of targetPageIndices) {
        const hits = await searchPageKeyword(
          pdfBytes,
          pIndex,
          keyword,
          pageRotations[pIndex] || 0
        )
        totalFound += hits.length
        for (const [x0, y0, x1, y1] of hits) {
          newRects.push({
            id: `search_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            x0,
            y0,
            x1,
            y1,
            pageIndex: pIndex,
            color: colorMode,
          })
        }
      }

      if (totalFound > 0) {
        setRedactions((prev) => [...prev, ...newRects])
        const scopeText = searchAllPages ? `全 ${targetPageIndices.length} ページ中、` : '現ページで '
        showToast(`✨ 「${keyword}」に該当する ${scopeText}${totalFound} 箇所を消しゴム指定しました！`)
      } else {
        const scopeText = searchAllPages ? '全ページ' : '現在のページ'
        showToast(`🔍 ${scopeText}で「${keyword}」に一致するテキストは見つかりませんでした。`)
      }
    } catch (err) {
      console.error('キーワード検索エラー:', err)
      alert('キーワード検索中にエラーが発生しました。')
    } finally {
      setIsProcessing(false)
    }
  }

  // ページの回転処理 (90°単位)
  const handleRotatePage = async (pageIndex: number, deltaDeg: number) => {
    if (!pdfBytes) return
    const currentRot = pageRotations[pageIndex] || 0
    const newRot = (((currentRot + deltaDeg) % 360) + 360) % 360
    const newRotations = { ...pageRotations, [pageIndex]: newRot }
    setPageRotations(newRotations)

    try {
      // docInfo の更新 (幅と高さのスワップなど)
      const newDocInfo = await getPdfInfo(pdfBytes, newRotations)
      setDocInfo(newDocInfo)

      // サムネイルとプレビュー画像の再生成
      const targetScale = getTargetRenderScale(zoom)
      const [thumbUrl, mainUrl] = await Promise.all([
        renderPageImage(pdfBytes, pageIndex, 0.3, newRot),
        pageIndex === currentPage
          ? renderPageImage(pdfBytes, pageIndex, targetScale, newRot)
          : Promise.resolve(null),
      ])

      setThumbnails((prev) => {
        const old = prev.get(pageIndex)
        if (old && old.startsWith('blob:')) URL.revokeObjectURL(old)
        return new Map(prev).set(pageIndex, thumbUrl)
      })
      if (mainUrl) {
        pageRenderScalesRef.current.set(pageIndex, targetScale)
        setPageImages((prev) => {
          const old = prev.get(pageIndex)
          if (old && old.startsWith('blob:')) URL.revokeObjectURL(old)
          return new Map(prev).set(pageIndex, mainUrl)
        })
      } else {
        pageRenderScalesRef.current.delete(pageIndex)
        setPageImages((prev) => {
          const next = new Map(prev)
          const old = next.get(pageIndex)
          if (old && old.startsWith('blob:')) URL.revokeObjectURL(old)
          next.delete(pageIndex)
          return next
        })
      }
      showToast(`🔄 ページ ${pageIndex + 1} を ${newRot}° に回転しました。`)
    } catch (err) {
      console.error('回転プレビュー更新エラー:', err)
    }
  }

  // 他のPDFファイルを追加結合（マージ）
  const handleMergePdfs = async (files: FileList) => {
    if (!pdfBytes || files.length === 0) return
    const genId = ++loadGenRef.current
    setIsProcessing(true)
    try {
      const additionalPdfs: Uint8Array[] = []
      for (let i = 0; i < files.length; i++) {
        const file = files[i]
        const buf = await file.arrayBuffer()
        additionalPdfs.push(new Uint8Array(buf))
      }

      const mergedBytes = await mergePdfFiles(pdfBytes, additionalPdfs)
      setPdfBytes(mergedBytes)

      // メタ情報としおり情報の更新
      const [newDocInfo, newBms] = await Promise.all([
        getPdfInfo(mergedBytes, pageRotations),
        loadPdfBookmarks(mergedBytes),
      ])
      setDocInfo(newDocInfo)
      setBookmarks(newBms)

      // 現在ページのプレビュー画像を再生成
      const targetScale = getTargetRenderScale(zoom)
      const mainUrl = await renderPageImage(
        mergedBytes,
        currentPage,
        targetScale,
        pageRotations[currentPage] || 0
      )
      pageRenderScalesRef.current = new Map([[currentPage, targetScale]])
      setPageImages((prev) => {
        revokeUrlMap(prev)
        return new Map([[currentPage, mainUrl]])
      })

      showToast(`📄✨ ${files.length} 件のPDFファイルを結合しました！（全 ${newDocInfo.numPages} ページ）`)
      setIsProcessing(false)

      // サムネイル再生成（バックグラウンド段階実行）
      generateThumbnailsInBatches(mergedBytes, newDocInfo.pages, pageRotations, genId).catch(
        (err) => console.warn('結合後サムネイル生成エラー:', err)
      )
    } catch (err) {
      console.error('PDF結合エラー:', err)
      alert('PDFファイルの結合中にエラーが発生しました。ファイル形式をご確認ください。')
      setIsProcessing(false)
    }
  }

  // 選択ページの抽出保存（分割）
  const handleExtractPages = async (indices: number[]) => {
    if (!pdfBytes || indices.length === 0) return
    setIsProcessing(true)
    try {
      const extractedBytes = await extractPages(pdfBytes, indices, pageRotations)
      const blob = new Blob([extractedBytes as BlobPart], { type: 'application/pdf' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      const baseName = fileName ? fileName.replace(/\.pdf$/i, '') : 'document'
      const pageRangeStr =
        indices.length <= 5
          ? `p${indices.map((i) => i + 1).join('-')}`
          : `${indices.length}pages`
      a.download = `${baseName}_抽出_${pageRangeStr}.pdf`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)

      showToast(`✂️ 選択した ${indices.length} ページを新規PDFとして抽出・保存しました！`)
    } catch (err) {
      console.error('ページ抽出エラー:', err)
      alert('ページの抽出保存中にエラーが発生しました。')
    } finally {
      setIsProcessing(false)
    }
  }

  // ページの削除
  const handleDeletePage = async (pageIndex: number) => {
    if (!pdfBytes || !docInfo) return
    if (docInfo.numPages <= 1) {
      alert('文書内に1ページしかないため、削除できません。')
      return
    }

    if (
      !window.confirm(
        `ページ ${pageIndex + 1} を完全に削除しますか？\n（この操作は元に戻せません）`
      )
    ) {
      return
    }

    setIsProcessing(true)
    try {
      const newBytes = await deletePagesFromPdf(pdfBytes, [pageIndex])
      setPdfBytes(newBytes)

      // インデックスのシフト調整
      // 1. redactions
      setRedactions((prev) =>
        prev
          .filter((r) => r.pageIndex !== pageIndex)
          .map((r) => (r.pageIndex > pageIndex ? { ...r, pageIndex: r.pageIndex - 1 } : r))
      )
      // 2. drawings
      setDrawings((prev) =>
        prev
          .filter((d) => d.pageIndex !== pageIndex)
          .map((d) => (d.pageIndex > pageIndex ? { ...d, pageIndex: d.pageIndex - 1 } : d))
      )
      // 3. pageRotations
      const newRotations: Record<number, number> = {}
      for (const [k, v] of Object.entries(pageRotations)) {
        const idx = Number(k)
        if (idx < pageIndex) {
          newRotations[idx] = v
        } else if (idx > pageIndex) {
          newRotations[idx - 1] = v
        }
      }
      setPageRotations(newRotations)

      // 4. selectedPagesForExtract
      setSelectedPagesForExtract((prev) => {
        const next = new Set<number>()
        for (const idx of prev) {
          if (idx < pageIndex) next.add(idx)
          else if (idx > pageIndex) next.add(idx - 1)
        }
        return next
      })

      // 新しい docInfo と bookmarks を取得
      const [newDocInfo, newBms] = await Promise.all([
        getPdfInfo(newBytes, newRotations),
        loadPdfBookmarks(newBytes),
      ])
      setDocInfo(newDocInfo)
      setBookmarks(newBms)

      // currentPage の調整
      const newCurrentPage = Math.min(currentPage, newDocInfo.numPages - 1)
      setCurrentPage(newCurrentPage)

      // メイン画像再生成
      const targetScale = getTargetRenderScale(zoom)
      const mainUrl = await renderPageImage(
        newBytes,
        newCurrentPage,
        targetScale,
        newRotations[newCurrentPage] || 0
      )
      pageRenderScalesRef.current = new Map([[newCurrentPage, targetScale]])
      setPageImages((prev) => {
        revokeUrlMap(prev)
        return new Map([[newCurrentPage, mainUrl]])
      })
      setThumbnails((prev) => {
        revokeUrlMap(prev)
        return new Map()
      })

      showToast(`🗑️ ページ ${pageIndex + 1} を削除しました。（残り ${newDocInfo.numPages} ページ）`)
      setIsProcessing(false)

      // サムネイル再生成（バックグラウンド段階実行）
      const genId = ++loadGenRef.current
      generateThumbnailsInBatches(newBytes, newDocInfo.pages, newRotations, genId).catch(
        (err) => console.warn('削除後サムネイル生成エラー:', err)
      )
    } catch (err) {
      console.error('ページ削除エラー:', err)
      alert('ページの削除中にエラーが発生しました。')
      setIsProcessing(false)
    }
  }

  // 抽出用チェックボックス選択の切り替え
  const handleTogglePageSelectForExtract = (pageIndex: number) => {
    setSelectedPagesForExtract((prev) => {
      const next = new Set(prev)
      if (next.has(pageIndex)) {
        next.delete(pageIndex)
      } else {
        next.add(pageIndex)
      }
      return next
    })
  }

  const handleSelectAllPagesForExtract = () => {
    if (!docInfo) return
    setSelectedPagesForExtract(new Set(docInfo.pages.map((p) => p.index)))
  }

  const handleClearPageSelectionForExtract = () => {
    setSelectedPagesForExtract(new Set())
  }

  // しおり操作
  const handleAddBookmark = (pageIndex: number, title?: string) => {
    const newTitle = title || `ページ ${pageIndex + 1}`
    const newItem: BookmarkItem = {
      id: `bm_${Date.now()}_${Math.random().toString(36).substr(2, 7)}`,
      title: newTitle,
      page: pageIndex,
      children: [],
    }
    setBookmarks((prev) => [...prev, newItem])
    showToast(`📑 しおり「${newTitle}」を追加しました。`)
  }

  const handleUpdateBookmark = (id: string, newTitle: string) => {
    const updateRecursive = (items: BookmarkItem[]): BookmarkItem[] => {
      return items.map((it) => {
        if (it.id === id) {
          return { ...it, title: newTitle }
        }
        if (it.children && it.children.length > 0) {
          return { ...it, children: updateRecursive(it.children) }
        }
        return it
      })
    }
    setBookmarks((prev) => updateRecursive(prev))
    showToast(`📑 しおりを「${newTitle}」に更新しました。`)
  }

  const handleDeleteBookmark = (id: string) => {
    const deleteRecursive = (items: BookmarkItem[]): BookmarkItem[] => {
      return items
        .filter((it) => it.id !== id)
        .map((it) => {
          if (it.children && it.children.length > 0) {
            return { ...it, children: deleteRecursive(it.children) }
          }
          return it
        })
    }
    setBookmarks((prev) => deleteRecursive(prev))
    showToast('🗑️ しおりを削除しました。')
  }

  // 墨消し＆描画＆回転＆しおり反映クリーンPDFダウンロード
  const handleSave = async () => {
    if (!pdfBytes) return

    const hasRotations =
      Object.keys(pageRotations).length > 0 &&
      Object.values(pageRotations).some((r) => r !== 0)
    const hasBookmarks = bookmarks.length > 0

    if (
      redactions.length === 0 &&
      drawings.length === 0 &&
      !hasRotations &&
      !hasBookmarks
    ) {
      showToast('⚠️ 墨消し、描画、ページ回転、またはしおりの編集を行ってから保存してください。')
      return
    }

    setIsProcessing(true)

    try {
      // 物理墨消し ＆ 描画アノテーション合成 ＆ ページ回転 ＆ しおりツリー埋め込み
      const cleanBytes = await applyRedactions(
        pdfBytes,
        redactions,
        colorMode,
        drawings,
        pageRotations,
        bookmarks
      )

      // ダウンロードトリガー (安全にBlob化)
      const blob = new Blob([cleanBytes as BlobPart], { type: 'application/pdf' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      const baseName = fileName ? fileName.replace(/\.pdf$/i, '') : 'document'

      const suffixParts: string[] = []
      if (redactions.length > 0) suffixParts.push('墨消し')
      if (drawings.length > 0) suffixParts.push('校正')
      if (hasRotations) suffixParts.push('回転')
      if (hasBookmarks) suffixParts.push('しおり')
      const suffix = suffixParts.length > 0 ? `${suffixParts.join('・')}済` : '保存済'

      a.download = `${baseName}_${suffix}.pdf`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)

      const summaryParts: string[] = []
      if (redactions.length > 0) summaryParts.push(`墨消し${redactions.length}箇所`)
      if (drawings.length > 0) summaryParts.push(`描画・校正${drawings.length}件`)
      if (hasRotations) summaryParts.push(`ページ回転`)
      if (hasBookmarks) summaryParts.push(`しおり${bookmarks.length}件`)

      showToast(`🎉 【${summaryParts.join(' ＋ ')}】の反映が完了しました！消去箇所以外のテキスト選択・OCR適性は100%保持されています。`)
    } catch (err) {
      console.error('保存処理エラー:', err)
      alert('PDFの保存処理中にエラーが発生しました。')
    } finally {
      setIsProcessing(false)
    }
  }

  // 一時保存（再編集可）PDFのダウンロード（物理切除を行わず、後から当アプリで再編集可能）
  const handleSaveDraft = async () => {
    if (!pdfBytes) return

    const hasRotations =
      Object.keys(pageRotations).length > 0 &&
      Object.values(pageRotations).some((r) => r !== 0)
    const hasBookmarks = bookmarks.length > 0

    if (
      redactions.length === 0 &&
      drawings.length === 0 &&
      !hasRotations &&
      !hasBookmarks
    ) {
      showToast('⚠️ 墨消し、描画、ページ回転、またはしおりの編集を行ってから一時保存してください。')
      return
    }

    setIsProcessing(true)
    try {
      const draftBytes = await saveEditablePdf(
        pdfBytes,
        redactions,
        colorMode,
        drawings,
        pageRotations,
        bookmarks,
        rulerScale
      )

      const blob = new Blob([draftBytes as BlobPart], { type: 'application/pdf' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      const baseName = fileName ? fileName.replace(/(_一時保存\(再編集可\))?\.pdf$/i, '') : 'document'
      a.download = `${baseName}_一時保存(再編集可).pdf`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)

      showToast(
        '💾 一時保存（再編集可）PDFを保存しました！通常のビューアでも閲覧でき、当アプリで再度開くとすべての要素を再編集できます。'
      )
    } catch (err) {
      console.error('一時保存エラー:', err)
      alert('一時保存PDFの生成中にエラーが発生しました。')
    } finally {
      setIsProcessing(false)
    }
  }

  // PDF軽量化（コンパクト保存 / 作業データ反映）テキスト選択100%維持
  const handleCompactPdf = async (
    level: CompactLevel,
    action: 'apply' | 'download'
  ): Promise<{ originalSize: number; compactedSize: number; optimizedImagesCount: number } | null> => {
    if (!pdfBytes) return null
    setIsProcessing(true)
    try {
      if (action === 'apply') {
        const res = await compactPdf(pdfBytes, level)
        setPdfBytes(res.bytes)
        const newInfo = await getPdfInfo(res.bytes, pageRotations)
        setDocInfo(newInfo)
        const targetScale = getTargetRenderScale(zoom)
        const mainUrl = await renderPageImage(
          res.bytes,
          currentPage,
          targetScale,
          pageRotations[currentPage] || 0
        )
        pageRenderScalesRef.current = new Map([[currentPage, targetScale]])
        setPageImages((prev) => {
          revokeUrlMap(prev)
          return new Map([[currentPage, mainUrl]])
        })
        const savedPct =
          res.compactedSize < res.originalSize
            ? Math.round(((res.originalSize - res.compactedSize) / res.originalSize) * 100)
            : 0
        showToast(
          `📦 作業データを軽量化しました！（▲${savedPct}% 削減 ／ テキスト選択100%維持）`
        )
        return {
          originalSize: res.originalSize,
          compactedSize: res.compactedSize,
          optimizedImagesCount: res.optimizedImagesCount,
        }
      } else {
        const hasRotations =
          Object.keys(pageRotations).length > 0 &&
          Object.values(pageRotations).some((r) => r !== 0)
        const hasEdits =
          redactions.length > 0 ||
          drawings.length > 0 ||
          hasRotations ||
          bookmarks.length > 0

        const sourceBytes = hasEdits
          ? await applyRedactions(
              pdfBytes,
              redactions,
              colorMode,
              drawings,
              pageRotations,
              bookmarks
            )
          : pdfBytes

        const res = await compactPdf(sourceBytes, level)
        const blob = new Blob([res.bytes as BlobPart], { type: 'application/pdf' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        const baseName = fileName ? fileName.replace(/\.pdf$/i, '') : 'document'
        a.download = `${baseName}_軽量化.pdf`
        document.body.appendChild(a)
        a.click()
        document.body.removeChild(a)
        URL.revokeObjectURL(url)

        const origSize = pdfBytes.byteLength
        const savedPct =
          res.compactedSize < origSize
            ? Math.round(((origSize - res.compactedSize) / origSize) * 100)
            : 0
        showToast(
          `📦 軽量化PDFを保存しました！（▲${savedPct}% 削減 ／ テキスト選択100%維持）`
        )
        return {
          originalSize: origSize,
          compactedSize: res.compactedSize,
          optimizedImagesCount: res.optimizedImagesCount,
        }
      }
    } catch (err) {
      console.error('PDF軽量化エラー:', err)
      alert('PDFの軽量化処理中にエラーが発生しました。')
      return null
    } finally {
      setIsProcessing(false)
    }
  }

  // 任意のPDFバイト列をブラウザのネイティブ印刷ダイアログで直接印刷するヘルパー
  const triggerPdfPrint = (targetPdfBytes: Uint8Array) => {
    const blob = new Blob([targetPdfBytes as BlobPart], { type: 'application/pdf' })
    const url = URL.createObjectURL(blob)

    // 既存の印刷用 iframe があれば除去
    const oldFrame = document.getElementById('giov-print-frame') as HTMLIFrameElement | null
    if (oldFrame) {
      oldFrame.remove()
    }

    const iframe = document.createElement('iframe')
    iframe.id = 'giov-print-frame'
    iframe.style.position = 'fixed'
    iframe.style.right = '0'
    iframe.style.bottom = '0'
    iframe.style.width = '1px'
    iframe.style.height = '1px'
    iframe.style.opacity = '0'
    iframe.style.pointerEvents = 'none'
    iframe.src = url

    iframe.onload = () => {
      setTimeout(() => {
        try {
          iframe.contentWindow?.focus()
          iframe.contentWindow?.print()
        } catch (err) {
          console.warn('iframe print fallback to window.open:', err)
          window.open(url, '_blank')
        }
      }, 300)
    }

    document.body.appendChild(iframe)
    // 印刷完了後（十分な時間経過後）にURLを解放
    setTimeout(() => {
      URL.revokeObjectURL(url)
    }, 120000)
  }

  // メイン画面のPDF（現在の墨消し・校正・回転を反映した状態）を直接印刷
  const handlePrint = async () => {
    if (!pdfBytes) return
    setIsProcessing(true)
    try {
      const hasEdits =
        redactions.length > 0 ||
        drawings.length > 0 ||
        Object.values(pageRotations).some((r) => r !== 0) ||
        bookmarks.length > 0

      const bytesToPrint = hasEdits
        ? await applyRedactions(
            pdfBytes,
            redactions,
            colorMode,
            drawings,
            pageRotations,
            bookmarks
          )
        : pdfBytes

      triggerPdfPrint(bytesToPrint)
      showToast('🖨️ 印刷ダイアログを起動しました')
    } catch (err) {
      console.error('印刷処理エラー:', err)
      alert('印刷データの準備中にエラーが発生しました。')
    } finally {
      setIsProcessing(false)
    }
  }

  // 作業机で束ねたPDFを直接印刷
  const handlePrintMergedPdf = async () => {
    if (deskItems.length === 0) return
    setIsProcessing(true)
    try {
      const mergedBytes = await buildMergedPdfFromDesk(deskItems, deskDocs)
      triggerPdfPrint(mergedBytes)
      showToast(`🖨️ 作業机の編纂PDF（計 ${deskItems.length} 頁）の印刷ダイアログを起動しました`)
    } catch (err) {
      console.error('作業机印刷エラー:', err)
      alert('作業机の印刷データ準備中にエラーが発生しました。')
    } finally {
      setIsProcessing(false)
    }
  }

  const showToast = (msg: string) => {
    setSuccessToast(msg)
    setTimeout(() => {
      setSuccessToast(null)
    }, 4500)
  }

  // 現在開いているドキュメントを固有IDで deskDocs のプールに安全に登録するヘルパー
  const registerCurrentDocToDesk = (): string | null => {
    if (!pdfBytes || !fileName || !docInfo) return null
    const docId = `doc_${fileName.replace(/[^a-zA-Z0-9_-]/g, '_')}_${pdfBytes.byteLength}`
    setDeskDocs((prev) => {
      const next = new Map(prev)
      if (!next.has(docId)) {
        next.set(docId, {
          id: docId,
          name: fileName,
          bytes: pdfBytes,
          pageCount: docInfo.numPages,
        })
      }
      return next
    })
    return docId
  }

  // 指定ページを作業机に追加
  const handleAddToDesk = (pageIdx: number) => {
    if (!docInfo || !pdfBytes || !fileName) return
    const page = docInfo.pages[pageIdx]
    if (!page) return
    const docId = registerCurrentDocToDesk()
    if (!docId) return

    const newItem: DeskItem = {
      id: `item_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      docId,
      docName: fileName,
      pageIndex: pageIdx,
      pageNumber: pageIdx + 1,
      rotation: pageRotations[pageIdx] || 0,
      widthPt: page.width,
      heightPt: page.height,
    }

    setDeskItems((prev) => [...prev, newItem])
    setDeskSourceItems((prev) => [...prev, newItem])
    setIsDeskOpen(true)
    showToast(`p.${pageIdx + 1} を作業机に追加しました`)
  }

  // 選択中の複数ページを一括で作業机に追加
  const handleAddSelectedToDesk = (indices: number[]) => {
    if (!docInfo || !pdfBytes || !fileName || indices.length === 0) return
    const docId = registerCurrentDocToDesk()
    if (!docId) return

    const newItems: DeskItem[] = indices.map((idx) => {
      const page = docInfo.pages[idx]
      return {
        id: `item_${Date.now()}_${idx}_${Math.random().toString(36).substring(2, 6)}`,
        docId,
        docName: fileName,
        pageIndex: idx,
        pageNumber: idx + 1,
        rotation: pageRotations[idx] || 0,
        widthPt: page ? page.width : 595,
        heightPt: page ? page.height : 842,
      }
    })

    setDeskItems((prev) => [...prev, ...newItems])
    setDeskSourceItems((prev) => [...prev, ...newItems])
    setIsDeskOpen(true)
    showToast(`${indices.length} ページを作業机に追加しました`)
  }

  // 現在のPDFの全ページを一括で作業机に追加
  const handleAddAllPagesToDesk = () => {
    if (!docInfo || !pdfBytes || !fileName) return
    const allIndices = docInfo.pages.map((p) => p.index)
    handleAddSelectedToDesk(allIndices)
  }

  // 画像挿入ハンドラ
  const handleInsertImage = async (file: File) => {
    try {
      const url = URL.createObjectURL(file)
      const img = new Image()
      img.src = url
      await new Promise((resolve, reject) => {
        img.onload = () => resolve(true)
        img.onerror = reject
      })

      const buf = await file.arrayBuffer()
      const bytes = new Uint8Array(buf)

      const naturalW = img.naturalWidth || 200
      const naturalH = img.naturalHeight || 200
      // 用紙幅に収まるよう標準幅 160pt（約240px）にスケーリング
      const targetW = 160
      const scale = targetW / naturalW
      const targetH = Math.round(naturalH * scale)

      const curPage = docInfo?.pages[currentPage]
      const targetX = curPage ? Math.round((curPage.width - targetW) / 2) : 100
      const targetY = curPage ? Math.round((curPage.height - targetH) / 2) : 100

      handleAddDrawing({
        pageIndex: currentPage,
        tool: 'image',
        color: '#000000',
        fillMode: 'none',
        lineWidth: 1,
        fontSize: 16,
        x: targetX,
        y: targetY,
        w: targetW,
        h: targetH,
        aspectRatio: targetW / targetH,
        imageUrl: url,
        imageBytes: bytes,
        imageMime: file.type,
        rotation: 0,
      })

      showToast(`🖼️ 画像「${file.name}」を挿入しました`)
    } catch (err) {
      console.error('画像挿入エラー:', err)
      alert('画像の読み込みに失敗しました。')
    }
  }

  // 外部PDFファイル群を作業机に追加
  const handleAddPdfFilesToDesk = async (files: FileList) => {
    if (files.length === 0) return
    try {
      setIsProcessing(true)
      const newItems: DeskItem[] = []
      const newDocs: DeskDoc[] = []

      for (let i = 0; i < files.length; i++) {
        const file = files[i]
        const docId = `ext_${Date.now()}_${i}_${Math.random().toString(36).substring(2, 6)}`
        const res = await createDeskItemsFromPdfFile(file, docId)
        newDocs.push(res.doc)
        newItems.push(...res.items)
      }

      setDeskDocs((prev) => {
        const next = new Map(prev)
        newDocs.forEach((d) => next.set(d.id, d))
        return next
      })
      // 素材プール（左ペイン）に投入
      setDeskSourceItems((prev) => [...prev, ...newItems])
      setIsDeskOpen(true)
      showToast(`${files.length} 件のPDF（計 ${newItems.length} 頁）を読み込みました`)
    } catch (err) {
      console.error('外部PDF追加エラー:', err)
      alert('PDFファイルの追加に失敗しました。')
    } finally {
      setIsProcessing(false)
    }
  }

  // 素材プールから編纂ワークスペースへのページ抽出（追加）
  const handleExtractItemsToDesk = (itemsToExtract: DeskItem[], targetIndex?: number) => {
    if (itemsToExtract.length === 0) return
    const clones: DeskItem[] = itemsToExtract.map((it) => ({
      ...it,
      id: `extract_${Date.now()}_${Math.random().toString(36).substring(2, 7)}_${it.pageIndex}`,
    }))
    setDeskItems((prev) => {
      if (typeof targetIndex === 'number' && targetIndex >= 0 && targetIndex <= prev.length) {
        const next = [...prev]
        next.splice(targetIndex, 0, ...clones)
        return next
      }
      return [...prev, ...clones]
    })
    showToast(`📑 ${clones.length} ページを編纂ワークスペースに抽出しました`)
  }

  // 作業机の特定のPDFファイル単体を直接メイン画面（墨消し・描画モード）の作業対象として開く
  const handleLoadSingleDeskDoc = async (docId: string, targetMode: WorkspaceMode = 'redact') => {
    const doc = deskDocs.get(docId)
    if (!doc) return
    const hasUnsaved = redactions.length > 0 || drawings.length > 0
    if (
      hasUnsaved &&
      !window.confirm(
        `「${doc.name}」を作業対象として開きますか？\n（現在編集中の墨消しや描画はリセットされます）`
      )
    ) {
      return
    }

    try {
      setIsProcessing(true)
      const file = new File([doc.bytes as BlobPart], doc.name, {
        type: 'application/pdf',
      })
      await loadPdf(file)
      setIsDeskOpen(false)
      handleWorkspaceModeChange(targetMode)
      showToast(`✨ 「${doc.name}」を作業対象として読み込みました！`)
    } catch (err) {
      console.error('個別ファイル読み込みエラー:', err)
      alert('ファイルの読み込みに失敗しました。')
    } finally {
      setIsProcessing(false)
    }
  }

  // 素材プール（左ペイン）アイテムの一括回転・一括削除
  const handleRotateSourceItems = (itemIds: string[]) => {
    const set = new Set(itemIds)
    setDeskSourceItems((prev) =>
      prev.map((it) => (set.has(it.id) ? { ...it, rotation: (it.rotation + 90) % 360 } : it))
    )
  }
  const handleRemoveSourceItems = (itemIds: string[]) => {
    const set = new Set(itemIds)
    setDeskSourceItems((prev) => prev.filter((it) => !set.has(it.id)))
    showToast(`🗑️ 選択した ${itemIds.length} ページを素材から削除しました`)
  }
  const handleRotateSourceGroup = (startIndex: number, endIndex: number) => {
    setDeskSourceItems((prev) =>
      prev.map((it, idx) =>
        idx >= startIndex && idx <= endIndex ? { ...it, rotation: (it.rotation + 90) % 360 } : it
      )
    )
    showToast(`📄 ファイル内の全 ${endIndex - startIndex + 1} ページを一括で90°回転しました`)
  }
  const handleRemoveSourceGroup = (startIndex: number, endIndex: number) => {
    const count = endIndex - startIndex + 1
    setDeskSourceItems((prev) => prev.filter((_, idx) => idx < startIndex || idx > endIndex))
    showToast(`🗑️ ファイル（${count} ページ）を作業机から外しました`)
  }
  const handleMoveSourceGroupToIndex = (fromGroupIdx: number, toGroupIdx: number) => {
    if (fromGroupIdx === toGroupIdx) return
    setDeskSourceItems((prev) => {
      const groups: DeskItem[][] = []
      for (let i = 0; i < prev.length; i++) {
        const it = prev[i]
        const lastGroup = groups[groups.length - 1]
        if (lastGroup && lastGroup[0].docId === it.docId) {
          lastGroup.push(it)
        } else {
          groups.push([it])
        }
      }
      if (
        fromGroupIdx < 0 ||
        fromGroupIdx >= groups.length ||
        toGroupIdx < 0 ||
        toGroupIdx >= groups.length
      ) {
        return prev
      }
      const [movedGroup] = groups.splice(fromGroupIdx, 1)
      groups.splice(toGroupIdx, 0, movedGroup)
      return groups.flat()
    })
    showToast(`🗂️ ファイルの順序を入れ替えました`)
  }

  // 編纂ワークスペース（右ペイン）アイテムの並べ替え
  const handleMoveDeskItem = (fromIdx: number, toIdx: number) => {
    setDeskItems((prev) => {
      if (toIdx < 0 || toIdx >= prev.length) return prev
      const next = [...prev]
      const [moved] = next.splice(fromIdx, 1)
      next.splice(toIdx, 0, moved)
      return next
    })
  }

  // 編纂ワークスペースアイテムの90度回転
  const handleRotateDeskItem = (id: string) => {
    setDeskItems((prev) =>
      prev.map((item) =>
        item.id === id ? { ...item, rotation: (item.rotation + 90) % 360 } : item
      )
    )
  }

  // 編纂ワークスペースアイテムの削除
  const handleRemoveDeskItem = (id: string) => {
    setDeskItems((prev) => prev.filter((item) => item.id !== id))
  }

  // 編纂ワークスペースアイテムの一括回転・一括削除
  const handleRotateTargetItems = (itemIds: string[]) => {
    const set = new Set(itemIds)
    setDeskItems((prev) =>
      prev.map((it) => (set.has(it.id) ? { ...it, rotation: (it.rotation + 90) % 360 } : it))
    )
  }
  const handleRemoveTargetItems = (itemIds: string[]) => {
    const set = new Set(itemIds)
    setDeskItems((prev) => prev.filter((it) => !set.has(it.id)))
    showToast(`🗑️ 選択した ${itemIds.length} ページを作業机から削除しました`)
  }

  // 作業机のファイル単位グループ順序入れ替え (startIndex .. endIndex の塊を前後のファイル塊と入れ替える)
  const handleMoveDeskGroup = (startIndex: number, endIndex: number, direction: 'up' | 'down') => {
    setDeskItems((prev) => {
      if (startIndex < 0 || endIndex >= prev.length || startIndex > endIndex) return prev
      const next = [...prev]
      const currentSlice = next.slice(startIndex, endIndex + 1)

      if (direction === 'up') {
        if (startIndex === 0) return prev
        const prevEnd = startIndex - 1
        const prevDocId = next[prevEnd].docId
        let prevStart = prevEnd
        while (prevStart > 0 && next[prevStart - 1].docId === prevDocId) {
          prevStart--
        }
        const prevSlice = next.slice(prevStart, prevEnd + 1)
        next.splice(prevStart, prevSlice.length + currentSlice.length, ...currentSlice, ...prevSlice)
        return next
      } else {
        if (endIndex >= next.length - 1) return prev
        const nextStart = endIndex + 1
        const nextDocId = next[nextStart].docId
        let nextEnd = nextStart
        while (nextEnd < next.length - 1 && next[nextEnd + 1].docId === nextDocId) {
          nextEnd++
        }
        const nextSlice = next.slice(nextStart, nextEnd + 1)
        next.splice(startIndex, currentSlice.length + nextSlice.length, ...nextSlice, ...currentSlice)
        return next
      }
    })
  }

  // 作業机のファイル単位グループ内全ページ一括90度回転
  const handleRotateDeskGroup = (startIndex: number, endIndex: number) => {
    setDeskItems((prev) =>
      prev.map((item, idx) =>
        idx >= startIndex && idx <= endIndex
          ? { ...item, rotation: (item.rotation + 90) % 360 }
          : item
      )
    )
    showToast(`📄 ファイル内の全 ${endIndex - startIndex + 1} ページを一括で90°回転しました`)
  }

  // 作業机のファイル単位グループの任意位置への移動（マウスドラッグ＆ドロップ用）
  const handleMoveDeskGroupToIndex = (fromGroupIdx: number, toGroupIdx: number) => {
    if (fromGroupIdx === toGroupIdx) return
    setDeskItems((prev) => {
      // 連続する同一 docId ごとにグループ分け
      const groups: DeskItem[][] = []
      for (let i = 0; i < prev.length; i++) {
        const it = prev[i]
        const lastGroup = groups[groups.length - 1]
        if (lastGroup && lastGroup[0].docId === it.docId) {
          lastGroup.push(it)
        } else {
          groups.push([it])
        }
      }
      if (
        fromGroupIdx < 0 ||
        fromGroupIdx >= groups.length ||
        toGroupIdx < 0 ||
        toGroupIdx >= groups.length
      ) {
        return prev
      }
      const [movedGroup] = groups.splice(fromGroupIdx, 1)
      groups.splice(toGroupIdx, 0, movedGroup)
      return groups.flat()
    })
    showToast(`🗂️ ファイルの順序を入れ替えました`)
  }

  // 作業机のファイル単位グループ一括削除
  const handleRemoveDeskGroup = (startIndex: number, endIndex: number) => {
    const count = endIndex - startIndex + 1
    setDeskItems((prev) => prev.filter((_, idx) => idx < startIndex || idx > endIndex))
    showToast(`🗑️ ファイル（${count} ページ）を作業机から外しました`)
  }

  // 作業机全クリア
  const handleClearAllDesk = () => {
    setDeskItems([])
    showToast('🧹 編纂ワークスペースをクリアしました')
  }

  // 作業机の編纂PDFを出力ダウンロード
  const handleExportMergedPdf = async () => {
    if (deskItems.length === 0) return
    try {
      setIsProcessing(true)
      const mergedBytes = await buildMergedPdfFromDesk(deskItems, deskDocs)
      const blob = new Blob([mergedBytes as BlobPart], { type: 'application/pdf' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `編纂書類_${new Date().toISOString().slice(0, 10)}.pdf`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)

      showToast(`計 ${deskItems.length} ページの編纂PDFを出力しました`)
    } catch (err) {
      console.error('PDF編纂出力エラー:', err)
      alert('PDFの編纂・結合に失敗しました。')
    } finally {
      setIsProcessing(false)
    }
  }

  // 作業机の編纂PDFをメイン画面（墨消し・描画モード）で作業対象として開く
  const handleLoadDeskAsCurrentDoc = async () => {
    if (deskItems.length === 0) return
    const hasUnsaved = redactions.length > 0 || drawings.length > 0
    if (hasUnsaved && !window.confirm('作業机で編纂した内容をメイン画面で開きますか？\n（現在編集中の墨消しや描画はリセットされます）')) return

    try {
      setIsProcessing(true)
      const mergedBytes = await buildMergedPdfFromDesk(deskItems, deskDocs)
      const mergedName = `編纂書類_${new Date().toISOString().slice(0, 10)}.pdf`
      const file = new File([mergedBytes as BlobPart], mergedName, {
        type: 'application/pdf',
      })

      // 1. メイン画面の読み込みファイルを最新の編纂PDFに入れ替え
      await loadPdf(file)

      // 2. 右ペイン（編集ワークスペース）を空にする
      setDeskItems([])

      // 3. パターンB: 左ペイン（素材プール）も、新しく出来上がった「編纂書類.pdf」に入れ替え
      const newDocId = `doc_${Date.now()}_merged`
      const { doc: newDoc, items: newSourceItems } = await createDeskItemsFromPdfFile(file, newDocId)
      setDeskDocs(new Map([[newDocId, newDoc]]))
      setDeskSourceItems(newSourceItems)

      // 4. 作業机を閉じて墨消しモードへ遷移
      setIsDeskOpen(false)
      handleWorkspaceModeChange('redact')
      showToast('✨ 編纂したPDFをメイン画面に読み込みました！作業机の素材も編纂後の書類に更新されました。')
    } catch (err) {
      console.error('メイン読み込みエラー:', err)
      alert('編纂PDFの読み込みに失敗しました。')
    } finally {
      setIsProcessing(false)
    }
  }

  // 作業机カードクリック時のプレビュー連携
  const handleSelectDeskItemPreview = (item: DeskItem) => {
    if (!pdfBytes || !fileName) return
    const currentDocId = `doc_${fileName.replace(/[^a-zA-Z0-9_-]/g, '_')}_${pdfBytes.byteLength}`
    if (item.docId === currentDocId || item.docId === 'current_doc') {
      setCurrentPage(item.pageIndex)
    }
  }

  // 入り口（初期画面）へ戻る・リセット
  const handleReset = () => {
    const hasUnsaved =
      redactions.length > 0 ||
      drawings.length > 0 ||
      Object.values(pageRotations).some((r) => r !== 0) ||
      deskItems.length > 0
    if (!hasUnsaved || window.confirm('現在の作業内容をリセットして入り口（モード選択画面）へ戻りますか？')) {
      ++loadGenRef.current
      setIsHomeScreen(true)
      setIsDeskOpen(false)
      setPdfBytes(null)
      setFileName(null)
      setDocInfo(null)
      setBookmarks([])
      setPageRotations({})
      setSelectedPagesForExtract(new Set())
      setRedactions([])
      setDrawings([])
      setHistory([])
      setDeskItems([])
      setDeskDocs(new Map())
      setReviewComments([])
      setReviewStamps([])
      setProofreadingMarks([])
      setVerifiedPages(new Set())
      setSelectedReviewCommentId(null)
      setSelectedProofreadingMarkId(null)
      setLastAddedRect(null)
      setLastOptimizeResult(null)
      setPageImages((prev) => {
        revokeUrlMap(prev)
        return new Map()
      })
      setThumbnails((prev) => {
        revokeUrlMap(prev)
        return new Map()
      })
    }
  }

  // 🔍 審査・確認（Review / Audit）用ハンドラ群
  const handleAddReviewComment = (data: Omit<ReviewComment, 'id' | 'number' | 'createdAt'>) => {
    const nextNumber =
      reviewComments.length > 0 ? Math.max(...reviewComments.map((c) => c.number)) + 1 : 1
    const newComment: ReviewComment = {
      id: `rev-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      number: nextNumber,
      color: data.color || 'yellow',
      createdAt: Date.now(),
      ...data,
    }
    setReviewComments((prev) => [...prev, newComment])
    setSelectedReviewCommentId(newComment.id)
  }

  const handleUpdateReviewComment = (id: string, updates: Partial<ReviewComment>) => {
    setReviewComments((prev) =>
      prev.map((c) => (c.id === id ? { ...c, ...updates } : c))
    )
  }

  const handleRemoveReviewComment = (id: string) => {
    setReviewComments((prev) => prev.filter((c) => c.id !== id))
    if (selectedReviewCommentId === id) {
      setSelectedReviewCommentId(null)
    }
  }

  const handleToggleCommentStatus = (id: string) => {
    setReviewComments((prev) =>
      prev.map((c) =>
        c.id === id
          ? { ...c, status: c.status === 'unresolved' ? 'resolved' : 'unresolved' }
          : c
      )
    )
  }

  const handleAddReviewStamp = (data: Omit<ReviewStamp, 'id' | 'createdAt'>) => {
    const newStamp: ReviewStamp = {
      id: `stamp-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      createdAt: Date.now(),
      ...data,
    }
    setReviewStamps((prev) => [...prev, newStamp])
  }

  const handleRemoveReviewStamp = (id: string) => {
    setReviewStamps((prev) => prev.filter((s) => s.id !== id))
  }

  const handleAddProofreadingMark = (data: Omit<ProofreadingMark, 'id' | 'createdAt'>) => {
    const newMark: ProofreadingMark = {
      id: `mark-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      createdAt: Date.now(),
      ...data,
    }
    setProofreadingMarks((prev) => [...prev, newMark])
    setSelectedProofreadingMarkId(newMark.id)
  }

  const handleRemoveProofreadingMark = (id: string) => {
    setProofreadingMarks((prev) => prev.filter((m) => m.id !== id))
    setSelectedProofreadingMarkId((prev) => (prev === id ? null : prev))
  }

  const handleTogglePageVerified = (pageIndex: number) => {
    setVerifiedPages((prev) => {
      const next = new Set(prev)
      if (next.has(pageIndex)) {
        next.delete(pageIndex)
      } else {
        next.add(pageIndex)
      }
      return next
    })
  }

  const unresolvedReviewCount = reviewComments.filter((c) => c.status === 'unresolved').length

  const currentPageRedactions = redactions.filter((r) => r.pageIndex === currentPage)
  const currentPageDrawings = drawings.filter((d) => d.pageIndex === currentPage)

  return (
    <div
      onDragOver={(e) => e.preventDefault()}
      onDrop={handleDrop}
      className="flex flex-col h-screen bg-slate-950 text-slate-100 overflow-hidden font-sans"
    >
      {/* 非表示のファイル選択入力 */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept="application/pdf,.pdf"
        className="hidden"
        onChange={(e) => {
          if (e.target.files && e.target.files.length > 0) {
            const targetMode = pendingEntryModeRef.current || workspaceMode
            pendingEntryModeRef.current = null
            openFilesInMode(e.target.files, targetMode)
            e.target.value = ''
          }
        }}
      />

      {/* ヘッダー */}
      <Header
        isHomeScreen={isHomeScreen}
        fileName={fileName}
        fileSize={pdfBytes?.byteLength ?? null}
        workspaceMode={workspaceMode}
        onWorkspaceModeChange={handleWorkspaceModeChange}
        totalRedactions={redactions.length}
        totalDrawings={drawings.length}
        unresolvedReviews={unresolvedReviewCount}
        verifiedPageCount={verifiedPages.size}
        numPages={docInfo?.numPages || 0}
        hasOtherEdits={
          Object.values(pageRotations).some((r) => r !== 0) || bookmarks.length > 0
        }
        isProcessing={isProcessing}
        isDeskOpen={isDeskOpen}
        deskItemCount={deskItems.length}
        hubSignature={docInfo?.hubSignature}
        onUploadClick={() => {
          pendingEntryModeRef.current = workspaceMode
          fileInputRef.current?.click()
        }}
        onSaveClick={handleSave}
        onSaveDraftClick={handleSaveDraft}
        onCompactClick={handleCompactPdf}
        onPrintClick={handlePrint}
        onResetClick={handleReset}
        onToggleDesk={() => setIsDeskOpen((prev) => !prev)}
      />

      {/* トースト通知 */}
      {successToast && (
        <div className="fixed top-16 right-6 z-50 bg-emerald-950 border border-emerald-500/80 text-emerald-200 px-4 py-3 rounded-xl shadow-2xl flex items-center gap-3 animate-fade-in ring-1 ring-emerald-400/50">
          <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
          <span className="text-xs font-semibold">{successToast}</span>
        </div>
      )}

      {isHomeScreen ? (
        /* 🏠 入り口（ホーム画面）: 目的別の4つのモード選択カード */
        <div className="flex-1 flex flex-col items-center justify-center p-4 sm:p-8 bg-slate-950 text-slate-100 overflow-y-auto relative">
          <div className="max-w-4xl w-full flex flex-col items-center">
            {/* タイトルバッジ */}
            <div className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full bg-blue-950/50 border border-blue-500/40 text-blue-300 text-xs font-semibold mb-3 shadow-sm">
              <ShieldCheck className="w-4 h-4 text-blue-400" />
              <span>GioV PDF Hub — 完全ローカル・オフライン完結</span>
            </div>

            <h2 className="text-2xl sm:text-3xl font-extrabold text-white text-center mb-2 tracking-tight">
              作業モードを選択してスタート
            </h2>
            <p className="text-xs sm:text-sm text-slate-400 text-center mb-6 max-w-xl">
              カードをクリックすると、その作業専用のシンプルな画面が立ち上がります（カードへ直接PDFをドロップして開くことも可能です）。
            </p>

            {/* 4つの入り口カード (2x2 グリッド) */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 w-full">
              {/* ① 🧹 墨消しカード */}
              <div
                onClick={() => enterWorkspaceMode('redact')}
                onDragOver={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                }}
                onDrop={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                  if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
                    openFilesInMode(e.dataTransfer.files, 'redact')
                  }
                }}
                className="group p-6 rounded-2xl border border-slate-800 hover:border-rose-500/80 bg-slate-900/60 hover:bg-slate-900/95 transition flex flex-col justify-between cursor-pointer shadow-xl relative overflow-hidden"
              >
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <div className="w-12 h-12 rounded-xl bg-rose-500/15 border border-rose-500/30 flex items-center justify-center text-rose-400 group-hover:scale-110 transition">
                      <Eraser className="w-6 h-6" />
                    </div>
                    <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-rose-500/15 text-rose-300 border border-rose-500/30">
                      完全不可逆 Redaction
                    </span>
                  </div>
                  <h3 className="text-lg font-extrabold text-white mb-1.5 group-hover:text-rose-300 transition">
                    🧹 墨消し（黒塗り・白塗り）
                  </h3>
                  <p className="text-xs text-slate-400 leading-relaxed mb-4">
                    テキスト自動吸着・自由矩形・キーワード一括検索で、個人情報や機密箇所をPDF内部データから物理的に完全消去します。
                  </p>
                </div>
                <div className="flex items-center justify-between pt-3 border-t border-slate-800/80 text-xs font-bold text-rose-400 group-hover:text-rose-300">
                  <span>墨消し画面を開く →</span>
                  <Eraser className="w-4 h-4" />
                </div>
              </div>

              {/* ② ✏️ 描画・計測カード */}
              <div
                onClick={() => enterWorkspaceMode('draw')}
                onDragOver={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                }}
                onDrop={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                  if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
                    openFilesInMode(e.dataTransfer.files, 'draw')
                  }
                }}
                className="group p-6 rounded-2xl border border-slate-800 hover:border-blue-500/80 bg-slate-900/60 hover:bg-slate-900/95 transition flex flex-col justify-between cursor-pointer shadow-xl relative overflow-hidden"
              >
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <div className="w-12 h-12 rounded-xl bg-blue-500/15 border border-blue-500/30 flex items-center justify-center text-blue-400 group-hover:scale-110 transition">
                      <PenTool className="w-6 h-6" />
                    </div>
                    <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-blue-500/15 text-blue-300 border border-blue-500/30">
                      朱書き校正・透明物差し
                    </span>
                  </div>
                  <h3 className="text-lg font-extrabold text-white mb-1.5 group-hover:text-blue-300 transition">
                    ✏️ 描画・計測（文字・図形・寸法）
                  </h3>
                  <p className="text-xs text-slate-400 leading-relaxed mb-4">
                    文字入力、矢印・円・多角形・チェックマーク、印鑑・画像の挿入、縮尺対応の透明物差し（距離・面積計測）で図面や書類を校正します。
                  </p>
                </div>
                <div className="flex items-center justify-between pt-3 border-t border-slate-800/80 text-xs font-bold text-blue-400 group-hover:text-blue-300">
                  <span>描画・計測画面を開く →</span>
                  <PenTool className="w-4 h-4" />
                </div>
              </div>

              {/* ③ 🗂️ 作業机・ページ整理カード */}
              <div
                onClick={() => enterWorkspaceMode('organize')}
                onDragOver={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                }}
                onDrop={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                  if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
                    openFilesInMode(e.dataTransfer.files, 'organize')
                  }
                }}
                className="group p-6 rounded-2xl border border-slate-800 hover:border-emerald-500/80 bg-slate-900/60 hover:bg-slate-900/95 transition flex flex-col justify-between cursor-pointer shadow-xl relative overflow-hidden"
              >
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <div className="w-12 h-12 rounded-xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-400 group-hover:scale-110 transition">
                      <FolderKanban className="w-6 h-6" />
                    </div>
                    <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                      複数PDF結合・抽出・回転
                    </span>
                  </div>
                  <h3 className="text-lg font-extrabold text-white mb-1.5 group-hover:text-emerald-300 transition">
                    🗂️ 作業机・ページ整理（結合・並替）
                  </h3>
                  <p className="text-xs text-slate-400 leading-relaxed mb-4">
                    作業机を開いた状態で開始し、複数PDFから必要なページだけを集めて順序入替・結合出力したり、ページ抽出・回転・しおり整理を行います。
                  </p>
                </div>
                <div className="flex items-center justify-between pt-3 border-t border-slate-800/80 text-xs font-bold text-emerald-400 group-hover:text-emerald-300">
                  <span>作業机・ページ整理画面を開く →</span>
                  <Layers className="w-4 h-4" />
                </div>
              </div>

              {/* ④ 📦 軽量化カード */}
              <div
                onClick={() => enterWorkspaceMode('optimize')}
                onDragOver={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                }}
                onDrop={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                  if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
                    openFilesInMode(e.dataTransfer.files, 'optimize')
                  }
                }}
                className="group p-6 rounded-2xl border border-slate-800 hover:border-amber-500/80 bg-slate-900/60 hover:bg-slate-900/95 transition flex flex-col justify-between cursor-pointer shadow-xl relative overflow-hidden"
              >
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <div className="w-12 h-12 rounded-xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-400 group-hover:scale-110 transition">
                      <Minimize2 className="w-6 h-6" />
                    </div>
                    <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-amber-500/15 text-amber-300 border border-amber-500/30">
                      テキスト選択100%維持
                    </span>
                  </div>
                  <h3 className="text-lg font-extrabold text-white mb-1.5 group-hover:text-amber-300 transition">
                    📦 軽量化（コンパクト圧縮）
                  </h3>
                  <p className="text-xs text-slate-400 leading-relaxed mb-4">
                    文字の選択・検索やベクター図面の鮮明さを100%保ったまま、埋め込み画像と不要データだけをピンポイント圧縮して容量を削減します。
                  </p>
                </div>
                <div className="flex items-center justify-between pt-3 border-t border-slate-800/80 text-xs font-bold text-amber-400 group-hover:text-amber-300">
                  <span>軽量化画面を開く →</span>
                  <Minimize2 className="w-4 h-4" />
                </div>
              </div>

              {/* ⑤ 🔍 書類審査・確認カード */}
              <div
                onClick={() => enterWorkspaceMode('review')}
                onDragOver={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                }}
                onDrop={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                  if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
                    openFilesInMode(e.dataTransfer.files, 'review')
                  }
                }}
                className="group p-6 rounded-2xl border border-slate-800 hover:border-indigo-500/80 bg-slate-900/60 hover:bg-slate-900/95 transition flex flex-col justify-between cursor-pointer shadow-xl relative overflow-hidden md:col-span-2"
              >
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <div className="w-12 h-12 rounded-xl bg-indigo-500/15 border border-indigo-500/30 flex items-center justify-center text-indigo-400 group-hover:scale-110 transition">
                      <ClipboardCheck className="w-6 h-6" />
                    </div>
                    <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-gradient-to-r from-indigo-500/20 to-rose-500/20 text-indigo-300 border border-indigo-500/30">
                      淡色付箋・マーカー・下線・囲み
                    </span>
                  </div>
                  <h3 className="text-lg font-extrabold text-white mb-1.5 group-hover:text-indigo-300 transition">
                    🔍 書類審査・校正（専用ワークスペース）
                  </h3>
                  <p className="text-xs text-slate-400 leading-relaxed mb-4">
                    半透明蛍光マーカー・取り消し線・下線・囲み枠の直感的なテキストマークアップと、6色淡色パステル付箋、確認済進捗管理で、設計図面や各種書類の審査・照合をシンプルかつ確実に行います。
                  </p>
                </div>
                <div className="flex items-center justify-between pt-3 border-t border-slate-800/80 text-xs font-bold text-indigo-400 group-hover:text-indigo-300">
                  <span>審査・確認画面を開く →</span>
                  <ClipboardCheck className="w-4 h-4" />
                </div>
              </div>
            </div>

            {/* 安心のセキュリティ・特徴フッター */}
            <div className="mt-8 grid grid-cols-1 sm:grid-cols-3 gap-3 w-full text-xs text-slate-400">
              <div className="bg-slate-900/40 border border-slate-800/80 p-3 rounded-xl flex items-start gap-2.5">
                <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                <div>
                  <span className="font-semibold text-slate-200">完全オフライン処理：</span>
                  外部サーバーへの送信ゼロ。機密文書も端末内で安全に完結。
                </div>
              </div>

              <div className="bg-slate-900/40 border border-slate-800/80 p-3 rounded-xl flex items-start gap-2.5">
                <Eraser className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                <div>
                  <span className="font-semibold text-slate-200">真のRedaction：</span>
                  黒塗り・白塗り箇所は内部テキスト・画像ごと完全消去し復元不能。
                </div>
              </div>

              <div className="bg-slate-900/40 border border-slate-800/80 p-3 rounded-xl flex items-start gap-2.5">
                <FileCheck className="w-4 h-4 text-blue-400 shrink-0 mt-0.5" />
                <div>
                  <span className="font-semibold text-slate-200">一時保存＆再編集：</span>
                  途中経過を一時保存したPDFは、後から開いて何度でも再編集可能。
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : workspaceMode === 'optimize' ? (
        /* 📦 軽量化モード専用画面（ファイル選択前も選択後もこの1画面でシンプルに完結） */
        <div className="flex-1 flex flex-col items-center justify-center p-4 sm:p-8 bg-slate-950 overflow-y-auto">
          <div className="max-w-xl w-full bg-slate-900 border border-slate-800 rounded-2xl p-6 sm:p-8 shadow-2xl space-y-6">
            <div className="flex items-start justify-between gap-4 border-b border-slate-800 pb-4">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-2xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-400 shrink-0">
                  <Minimize2 className="w-6 h-6" />
                </div>
                <div>
                  <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-300 border border-amber-500/30">
                    テキスト選択・ベクター図面 100%維持
                  </span>
                  <h2 className="text-lg sm:text-xl font-extrabold text-white mt-1">
                    PDF軽量化・コンパクト圧縮
                  </h2>
                </div>
              </div>
            </div>

            {/* ファイル未選択時はドロップゾーン、選択済みならファイル情報カード */}
            {!pdfBytes || !docInfo ? (
              <div
                onClick={() => triggerFileOpenWithMode('optimize')}
                className="p-8 border-2 border-dashed border-amber-500/40 hover:border-amber-400 rounded-2xl bg-slate-950/70 hover:bg-slate-950 transition flex flex-col items-center justify-center text-center cursor-pointer group"
              >
                <div className="w-14 h-14 rounded-2xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-400 mb-3 group-hover:scale-105 transition">
                  <FileUp className="w-7 h-7" />
                </div>
                <div className="text-base font-bold text-white mb-1">
                  軽量化したいPDFをここにドラッグ＆ドロップ
                </div>
                <p className="text-xs text-slate-400 mb-4">
                  または下のボタンをクリックしてファイルを選択してください
                </p>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    triggerFileOpenWithMode('optimize')
                  }}
                  className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-slate-950 text-xs sm:text-sm font-extrabold shadow-lg shadow-amber-500/20 flex items-center gap-2 cursor-pointer"
                >
                  <FileUp className="w-4 h-4" />
                  <span>PDFファイルを選択</span>
                </button>
              </div>
            ) : (
              <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-between gap-4">
                <div className="min-w-0">
                  <div className="text-xs text-slate-400">対象ファイル ({docInfo.numPages} ページ)</div>
                  <div className="text-sm font-bold text-blue-300 truncate mt-0.5" title={fileName || ''}>
                    {fileName}
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <div className="text-xs text-slate-400">現在のサイズ</div>
                  <div className="text-base font-mono font-extrabold text-white mt-0.5">
                    {formatBytes(pdfBytes.byteLength)}
                  </div>
                </div>
              </div>
            )}

            {/* 圧縮レベルの選択 */}
            <div className="space-y-2.5">
              <div className="text-xs font-bold text-slate-300">圧縮レベルを選択してください:</div>

              <label
                onClick={() => setOptimizeLevel('standard')}
                className={`block p-3.5 rounded-xl border cursor-pointer transition ${
                  optimizeLevel === 'standard'
                    ? 'bg-amber-500/10 border-amber-500/60 ring-1 ring-amber-400/30'
                    : 'bg-slate-800/40 border-slate-700/70 hover:bg-slate-800/70'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs sm:text-sm font-bold text-white flex items-center gap-2">
                    <input
                      type="radio"
                      checked={optimizeLevel === 'standard'}
                      onChange={() => setOptimizeLevel('standard')}
                      className="accent-amber-400"
                    />
                    標準（推奨：画質とサイズの最適バランス）
                  </span>
                  <span className="text-[10px] px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 font-semibold">
                    おすすめ
                  </span>
                </div>
                <p className="text-xs text-slate-400 mt-1.5 pl-6">
                  文字・線画は100%無劣化。埋め込み写真・画像のみ長辺最大 1600px / JPEG品質 75% に最適化し、不要ゴミデータを完全除去します。
                </p>
              </label>

              <label
                onClick={() => setOptimizeLevel('high')}
                className={`block p-3.5 rounded-xl border cursor-pointer transition ${
                  optimizeLevel === 'high'
                    ? 'bg-amber-500/10 border-amber-500/60 ring-1 ring-amber-400/30'
                    : 'bg-slate-800/40 border-slate-700/70 hover:bg-slate-800/70'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs sm:text-sm font-bold text-white flex items-center gap-2">
                    <input
                      type="radio"
                      checked={optimizeLevel === 'high'}
                      onChange={() => setOptimizeLevel('high')}
                      className="accent-amber-400"
                    />
                    高圧縮（メール添付・電子納品・容量制限対策）
                  </span>
                  <span className="text-[10px] px-2 py-0.5 rounded bg-rose-500/20 text-rose-300 font-semibold">
                    最小サイズ
                  </span>
                </div>
                <p className="text-xs text-slate-400 mt-1.5 pl-6">
                  文字・線画は100%無劣化。埋め込み写真・画像を長辺最大 1200px / JPEG品質 55% に高圧縮し、ファイルサイズを劇的に削減します。
                </p>
              </label>

              <label
                onClick={() => setOptimizeLevel('lossless')}
                className={`block p-3.5 rounded-xl border cursor-pointer transition ${
                  optimizeLevel === 'lossless'
                    ? 'bg-amber-500/10 border-amber-500/60 ring-1 ring-amber-400/30'
                    : 'bg-slate-800/40 border-slate-700/70 hover:bg-slate-800/70'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs sm:text-sm font-bold text-white flex items-center gap-2">
                    <input
                      type="radio"
                      checked={optimizeLevel === 'lossless'}
                      onChange={() => setOptimizeLevel('lossless')}
                      className="accent-amber-400"
                    />
                    ロスレス（画質も完全無劣化・構造クリーンアップのみ）
                  </span>
                  <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 font-semibold">
                    完全無劣化
                  </span>
                </div>
                <p className="text-xs text-slate-400 mt-1.5 pl-6">
                  画像の画質も一切変更せず、PDF内部に残った不要データ・重複オブジェクトの掃除とストリーム圧縮のみを行います。
                </p>
              </label>
            </div>

            {/* 軽量化結果表示 */}
            {lastOptimizeResult && (
              <div className="p-4 rounded-xl bg-emerald-950/70 border border-emerald-500/50 text-emerald-200 space-y-1.5 animate-fade-in">
                <div className="font-bold text-sm text-emerald-300 flex items-center justify-between">
                  <span>
                    ✨ 軽量化完了: {formatBytes(lastOptimizeResult.originalSize)} →{' '}
                    {formatBytes(lastOptimizeResult.compactedSize)}
                  </span>
                  <span className="px-2.5 py-0.5 rounded-full bg-emerald-500/30 text-emerald-100 font-mono text-xs font-extrabold">
                    {lastOptimizeResult.compactedSize < lastOptimizeResult.originalSize
                      ? `▲ ${Math.round(
                          ((lastOptimizeResult.originalSize - lastOptimizeResult.compactedSize) /
                            lastOptimizeResult.originalSize) *
                            100
                        )}% 削減`
                      : '最適化済'}
                  </span>
                </div>
                <div className="text-xs text-emerald-300/80">
                  ・最適化された埋め込み画像: {lastOptimizeResult.optimizedImagesCount} 件 ／ テキスト選択・検索100%維持
                </div>
              </div>
            )}

            {/* アクションボタン（ファイル選択済みのときのみ有効化） */}
            {pdfBytes && docInfo && (
              <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2 border-t border-slate-800">
                <button
                  onClick={() => triggerFileOpenWithMode('optimize')}
                  disabled={isProcessing}
                  className="w-full sm:w-auto px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-semibold flex items-center justify-center gap-1.5 transition cursor-pointer"
                >
                  <FileUp className="w-4 h-4 text-slate-300" />
                  <span>別のPDFを選択</span>
                </button>

                <div className="flex flex-wrap items-center gap-2.5 w-full sm:w-auto justify-end">
                  <button
                    onClick={async () => {
                      const res = await handleCompactPdf(optimizeLevel, 'apply')
                      if (res) setLastOptimizeResult(res)
                    }}
                    disabled={isProcessing}
                    className="flex-1 sm:flex-initial px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-amber-300 border border-amber-500/40 text-xs font-bold transition cursor-pointer disabled:opacity-50"
                    title="軽量化したデータを現在の作業ファイルに反映します"
                  >
                    ✨ 作業データに反映
                  </button>
                  <button
                    onClick={async () => {
                      const res = await handleCompactPdf(optimizeLevel, 'download')
                      if (res) setLastOptimizeResult(res)
                    }}
                    disabled={isProcessing}
                    className="flex-1 sm:flex-initial px-5 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-slate-950 text-xs sm:text-sm font-extrabold transition shadow-lg shadow-amber-500/25 cursor-pointer flex items-center justify-center gap-2 disabled:opacity-50"
                  >
                    <Download className="w-4 h-4" />
                    <span>軽量化PDFを保存</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      ) : workspaceMode === 'organize' ? (
        /* 🗂️ 作業机・整理モード専用メイン画面（作業机そのものを主役として全画面表示） */
        <div className="flex-1 flex overflow-hidden">
          <DeskSidebar
            isMainView={true}
            width={rightSidebarWidth}
            isOpen={true}
            sourceItems={deskSourceItems}
            items={deskItems}
            docsMap={deskDocs}
            currentPageIndex={currentPage}
            currentDocName={fileName}
            selectedPageCount={selectedPagesForExtract.size}
            onClose={() => setIsDeskOpen(false)}
            onResizeWidth={handleResizeRightSidebar}
            onAddCurrentPage={() => handleAddToDesk(currentPage)}
            onAddSelectedPages={() =>
              handleAddSelectedToDesk(Array.from(selectedPagesForExtract).sort((a, b) => a - b))
            }
            onAddAllPages={handleAddAllPagesToDesk}
            onAddPdfFiles={handleAddPdfFilesToDesk}
            onMoveItem={handleMoveDeskItem}
            onRotateItem={handleRotateDeskItem}
            onRemoveItem={handleRemoveDeskItem}
            onRotateTargetItems={handleRotateTargetItems}
            onRemoveTargetItems={handleRemoveTargetItems}
            onExtractItemsToWorkspace={handleExtractItemsToDesk}
            onMoveSourceGroupToIndex={handleMoveSourceGroupToIndex}
            onRotateSourceGroup={handleRotateSourceGroup}
            onRemoveSourceGroup={handleRemoveSourceGroup}
            onRotateSourceItems={handleRotateSourceItems}
            onRemoveSourceItems={handleRemoveSourceItems}
            onLoadSingleDocAsCurrent={handleLoadSingleDeskDoc}
            onClearAll={handleClearAllDesk}
            onExportMergedPdf={handleExportMergedPdf}
            onPrintMergedPdf={handlePrintMergedPdf}
            onLoadAsCurrentDoc={handleLoadDeskAsCurrentDoc}
            onSelectDeskItemPreview={handleSelectDeskItemPreview}
            isProcessing={isProcessing}
          />
        </div>
      ) : pdfBytes && docInfo ? (
        /* 📄 ファイル読み込み済み */
        workspaceMode === 'review' ? (
          /* 🔍 審査・確認ワークスペース */
          <>
            <ReviewToolbar
              currentPage={currentPage}
              numPages={docInfo.numPages}
              zoom={zoom}
              activeTool={activeReviewTool}
              onToolChange={setActiveReviewTool}
              onPageChange={setCurrentPage}
              onZoomChange={setZoom}
              onResetView={() => setResetViewTrigger(Date.now())}
              onFitToWindow={() => setFitViewTrigger(Date.now())}
              isCurrentPageVerified={verifiedPages.has(currentPage)}
              onToggleCurrentPageVerified={() => handleTogglePageVerified(currentPage)}
              verifiedPageCount={verifiedPages.size}
              totalCommentsCount={reviewComments.length}
              unresolvedCount={unresolvedReviewCount}
              isSidebarOpen={isReviewSidebarOpen}
              onToggleSidebar={() => setIsReviewSidebarOpen((prev) => !prev)}
            />

            <div className="flex-1 flex overflow-hidden">
              {docInfo && (
                <ThumbnailSidebar
                  width={leftSidebarWidth}
                  onResizeWidth={handleResizeLeftSidebar}
                  pages={docInfo.pages}
                  currentPage={currentPage}
                  redactions={redactions}
                  thumbnails={thumbnails}
                  pageRotations={pageRotations}
                  bookmarks={bookmarks}
                  selectedPagesForExtract={selectedPagesForExtract}
                  verifiedPages={verifiedPages}
                  reviewComments={reviewComments}
                  onSelectPage={setCurrentPage}
                  onRotatePage={handleRotatePage}
                  onDeletePage={handleDeletePage}
                  onMergePdfs={handleMergePdfs}
                  onExtractPages={handleExtractPages}
                  onTogglePageSelectForExtract={handleTogglePageSelectForExtract}
                  onSelectAllPagesForExtract={handleSelectAllPagesForExtract}
                  onClearPageSelectionForExtract={handleClearPageSelectionForExtract}
                  onAddToDesk={handleAddToDesk}
                  onAddSelectedToDesk={handleAddSelectedToDesk}
                  onAddBookmark={handleAddBookmark}
                  onUpdateBookmark={handleUpdateBookmark}
                  onDeleteBookmark={handleDeleteBookmark}
                />
              )}

              <PdfViewer
                pageImage={pageImages.get(currentPage) || null}
                pageInfo={docInfo.pages[currentPage] || null}
                currentPage={currentPage}
                numPages={docInfo.numPages}
                redactions={currentPageRedactions}
                colorMode={colorMode}
                zoom={zoom}
                appMode={appMode}
                activeTool={activeTool}
                drawColor={drawColor}
                lineWidth={lineWidth}
                fontSize={fontSize}
                fillMode={fillMode}
                arrowHead={arrowHead}
                checkSize={checkSize}
                drawings={currentPageDrawings}
                rulerScale={rulerScale}
                rulerMeasureMode={rulerMeasureMode}
                workspaceMode="review"
                activeReviewTool={activeReviewTool}
                reviewComments={reviewComments}
                reviewStamps={reviewStamps}
                proofreadingMarks={proofreadingMarks}
                selectedReviewCommentId={selectedReviewCommentId}
                selectedProofreadingMarkId={selectedProofreadingMarkId}
                onSelectReviewComment={setSelectedReviewCommentId}
                onSelectProofreadingMark={setSelectedProofreadingMarkId}
                onAddReviewComment={handleAddReviewComment}
                onUpdateReviewComment={handleUpdateReviewComment}
                onRemoveReviewComment={handleRemoveReviewComment}
                onAddReviewStamp={handleAddReviewStamp}
                onRemoveReviewStamp={handleRemoveReviewStamp}
                onAddProofreadingMark={handleAddProofreadingMark}
                onRemoveProofreadingMark={handleRemoveProofreadingMark}
                resetViewTrigger={resetViewTrigger}
                fitViewTrigger={fitViewTrigger}
                onPageChange={setCurrentPage}
                onZoomChange={setZoom}
                onAddRedaction={handleAddRedaction}
                onRemoveRedaction={handleRemoveRedaction}
                onAddDrawing={handleAddDrawing}
                onUpdateDrawing={handleUpdateDrawing}
                onRemoveDrawing={handleRemoveDrawing}
              />

              <ReviewSidebar
                isOpen={isReviewSidebarOpen}
                onClose={() => setIsReviewSidebarOpen(false)}
                comments={reviewComments}
                verifiedPages={verifiedPages}
                numPages={docInfo.numPages}
                currentPage={currentPage}
                onPageChange={setCurrentPage}
                onToggleCommentStatus={handleToggleCommentStatus}
                onUpdateCommentText={(id, text) => handleUpdateReviewComment(id, { text })}
                onDeleteComment={handleRemoveReviewComment}
                selectedCommentId={selectedReviewCommentId}
                onSelectComment={(id) => {
                  setSelectedReviewCommentId(id)
                  const c = reviewComments.find((x) => x.id === id)
                  if (c) setCurrentPage(c.pageIndex)
                }}
              />
            </div>
          </>
        ) : (
          /* 📄 墨消し / 描画・校正モード */
          <>
            <Toolbar
              workspaceMode={workspaceMode}
              currentPage={currentPage}
              numPages={docInfo.numPages}
              zoom={zoom}
              colorMode={colorMode}
              selectMode={selectMode}
              pageRedactionCount={currentPageRedactions.length}
              totalRedactionCount={redactions.length}
              hasLastSelectedArea={lastAddedRect !== null}
              appMode={appMode}
              activeTool={activeTool}
              drawColor={drawColor}
              lineWidth={lineWidth}
              fontSize={fontSize}
              fillMode={fillMode}
              arrowHead={arrowHead}
              checkSize={checkSize}
              pageDrawingCount={currentPageDrawings.length}
              totalDrawingCount={drawings.length}
              canUndo={history.length > 0}
              isDeskOpen={isDeskOpen}
              onRotateCurrentPage={() => handleRotatePage(currentPage, 90)}
              onAddCurrentPageToDesk={() => handleAddToDesk(currentPage)}
              onAddAllPagesToDesk={handleAddAllPagesToDesk}
              onToggleDesk={() => setIsDeskOpen((prev) => !prev)}
              onPageChange={setCurrentPage}
              onZoomChange={setZoom}
              onColorModeChange={setColorMode}
              onSelectModeChange={setSelectMode}
              onClearPageRedactions={handleClearPageRedactions}
              onClearAllRedactions={handleClearAllRedactions}
              onKeywordSearch={handleKeywordSearch}
              onApplyAreaToAllPages={handleApplyAreaToAllPages}
              onAppModeChange={setAppMode}
              onToolChange={setActiveTool}
              onDrawColorChange={setDrawColor}
              onLineWidthChange={setLineWidth}
              onFontSizeChange={setFontSize}
              onFillModeChange={setFillMode}
              onArrowHeadChange={setArrowHead}
              onCheckSizeChange={setCheckSize}
              onInsertImage={handleInsertImage}
              rulerScale={rulerScale}
              onRulerScaleChange={setRulerScale}
              rulerMeasureMode={rulerMeasureMode}
              onRulerMeasureModeChange={setRulerMeasureMode}
              onUndo={handleUndo}
              onResetView={() => setResetViewTrigger(Date.now())}
              onFitToWindow={() => setFitViewTrigger(Date.now())}
            />

            <div className="flex-1 flex overflow-hidden">
              {docInfo && (
                <ThumbnailSidebar
                  width={leftSidebarWidth}
                  onResizeWidth={handleResizeLeftSidebar}
                  pages={docInfo.pages}
                  currentPage={currentPage}
                  redactions={redactions}
                  thumbnails={thumbnails}
                  pageRotations={pageRotations}
                  bookmarks={bookmarks}
                  selectedPagesForExtract={selectedPagesForExtract}
                  onSelectPage={setCurrentPage}
                  onRotatePage={handleRotatePage}
                  onDeletePage={handleDeletePage}
                  onMergePdfs={handleMergePdfs}
                  onExtractPages={handleExtractPages}
                  onTogglePageSelectForExtract={handleTogglePageSelectForExtract}
                  onSelectAllPagesForExtract={handleSelectAllPagesForExtract}
                  onClearPageSelectionForExtract={handleClearPageSelectionForExtract}
                  onAddToDesk={handleAddToDesk}
                  onAddSelectedToDesk={handleAddSelectedToDesk}
                  onAddBookmark={handleAddBookmark}
                  onUpdateBookmark={handleUpdateBookmark}
                  onDeleteBookmark={handleDeleteBookmark}
                />
              )}

              <PdfViewer
                pageImage={pageImages.get(currentPage) || null}
                pageInfo={docInfo.pages[currentPage] || null}
                currentPage={currentPage}
                numPages={docInfo.numPages}
                redactions={currentPageRedactions}
                colorMode={colorMode}
                zoom={zoom}
                appMode={appMode}
                activeTool={activeTool}
                drawColor={drawColor}
                lineWidth={lineWidth}
                fontSize={fontSize}
                fillMode={fillMode}
                arrowHead={arrowHead}
                checkSize={checkSize}
                drawings={currentPageDrawings}
                rulerScale={rulerScale}
                rulerMeasureMode={rulerMeasureMode}
                resetViewTrigger={resetViewTrigger}
                fitViewTrigger={fitViewTrigger}
                onPageChange={setCurrentPage}
                onZoomChange={setZoom}
                onAddRedaction={handleAddRedaction}
                onRemoveRedaction={handleRemoveRedaction}
                onAddDrawing={handleAddDrawing}
                onUpdateDrawing={handleUpdateDrawing}
                onRemoveDrawing={handleRemoveDrawing}
              />

              <DeskSidebar
                width={rightSidebarWidth}
                isOpen={isDeskOpen}
                sourceItems={deskSourceItems}
                items={deskItems}
                docsMap={deskDocs}
                currentPageIndex={currentPage}
                currentDocName={fileName}
                selectedPageCount={selectedPagesForExtract.size}
                onClose={() => setIsDeskOpen(false)}
                onResizeWidth={handleResizeRightSidebar}
                onAddCurrentPage={() => handleAddToDesk(currentPage)}
                onAddSelectedPages={() =>
                  handleAddSelectedToDesk(Array.from(selectedPagesForExtract).sort((a, b) => a - b))
                }
                onAddAllPages={handleAddAllPagesToDesk}
                onAddPdfFiles={handleAddPdfFilesToDesk}
                onMoveItem={handleMoveDeskItem}
                onRotateItem={handleRotateDeskItem}
                onRemoveItem={handleRemoveDeskItem}
                onRotateTargetItems={handleRotateTargetItems}
                onRemoveTargetItems={handleRemoveTargetItems}
                onExtractItemsToWorkspace={handleExtractItemsToDesk}
                onMoveGroup={handleMoveDeskGroup}
                onRotateGroup={handleRotateDeskGroup}
                onRemoveGroup={handleRemoveDeskGroup}
                onLoadSingleDocAsCurrent={handleLoadSingleDeskDoc}
                onClearAll={handleClearAllDesk}
                onExportMergedPdf={handleExportMergedPdf}
                onPrintMergedPdf={handlePrintMergedPdf}
                onLoadAsCurrentDoc={handleLoadDeskAsCurrentDoc}
                onSelectDeskItemPreview={handleSelectDeskItemPreview}
                isProcessing={isProcessing}
              />
            </div>
          </>
        )
      ) : (
        /* 🎯 モード選択後のファイル待機画面（墨消し / 描画・計測 / 審査・確認モードでここからファイル選択・ドラッグ＆ドロップが可能） */
        <div className="flex-1 flex overflow-hidden">
          <div className="flex-1 flex flex-col items-center justify-center p-4 sm:p-8 bg-slate-950 overflow-y-auto">
            <div className="max-w-xl w-full flex flex-col items-center">
              <div
                onClick={() => triggerFileOpenWithMode(workspaceMode)}
                className={`w-full p-8 sm:p-12 border-2 border-dashed rounded-2xl transition flex flex-col items-center justify-center text-center bg-slate-900/60 hover:bg-slate-900/90 cursor-pointer group shadow-2xl ${
                  workspaceMode === 'redact'
                    ? 'border-rose-500/40 hover:border-rose-500'
                    : workspaceMode === 'review'
                    ? 'border-indigo-500/40 hover:border-indigo-500'
                    : 'border-blue-500/40 hover:border-blue-500'
                }`}
              >
                <div
                  className={`w-16 h-16 rounded-2xl flex items-center justify-center mb-5 group-hover:scale-105 transition ${
                    workspaceMode === 'redact'
                      ? 'bg-rose-500/15 border border-rose-500/30 text-rose-400'
                      : workspaceMode === 'review'
                      ? 'bg-indigo-500/15 border border-indigo-500/30 text-indigo-400'
                      : 'bg-blue-500/15 border border-blue-500/30 text-blue-400'
                  }`}
                >
                  {workspaceMode === 'redact' ? (
                    <Eraser className="w-8 h-8" />
                  ) : workspaceMode === 'review' ? (
                    <ClipboardCheck className="w-8 h-8" />
                  ) : (
                    <PenTool className="w-8 h-8" />
                  )}
                </div>

                <span
                  className={`text-[11px] font-bold px-2.5 py-0.5 rounded-full mb-2 ${
                    workspaceMode === 'redact'
                      ? 'bg-rose-500/15 text-rose-300 border border-rose-500/30'
                      : workspaceMode === 'review'
                      ? 'bg-gradient-to-r from-indigo-500/20 to-rose-500/20 text-indigo-300 border border-indigo-500/30'
                      : 'bg-blue-500/15 text-blue-300 border border-blue-500/30'
                  }`}
                >
                  {workspaceMode === 'redact'
                    ? '🧹 墨消し（不可逆Redaction）モード'
                    : workspaceMode === 'review'
                    ? '🔍 審査・確認（指摘ピン・スタンプ）モード'
                    : '✏️ 描画・計測（朱書き・透明物差し）モード'}
                </span>

                <h3 className="text-lg sm:text-xl font-extrabold text-white mb-2">
                  {workspaceMode === 'redact'
                    ? '墨消しするPDFをここにドラッグ＆ドロップ'
                    : workspaceMode === 'review'
                    ? '審査・確認するPDFをここにドラッグ＆ドロップ'
                    : '描画・計測するPDFをここにドラッグ＆ドロップ'}
                </h3>

                <p className="text-xs text-slate-400 mb-6 max-w-md leading-relaxed">
                  {workspaceMode === 'redact'
                    ? '黒塗り・白塗り、テキスト自動吸着、自由矩形、キーワード一括検索で機密箇所を完全消去します。'
                    : workspaceMode === 'review'
                    ? '審査スタンプ押印、指摘ピン配置、確認済ページ進捗バーで設計図面や書類の照合審査を効率的に行います。'
                    : '文字入力、矢印・円・多角形・チェックマーク、印鑑画像挿入、縮尺対応の透明物差しで図面や書類を校正します。'}
                </p>

                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    triggerFileOpenWithMode(workspaceMode)
                  }}
                  className={`px-6 py-3 rounded-xl text-white text-sm font-bold shadow-lg transition active:scale-95 cursor-pointer flex items-center gap-2 ${
                    workspaceMode === 'redact'
                      ? 'bg-gradient-to-r from-rose-600 to-pink-600 hover:from-rose-500 hover:to-pink-500 shadow-rose-600/25'
                      : workspaceMode === 'review'
                      ? 'bg-gradient-to-r from-indigo-600 to-rose-600 hover:from-indigo-500 hover:to-rose-500 shadow-indigo-600/25'
                      : 'bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 shadow-blue-600/25'
                  }`}
                >
                  <FileUp className="w-4 h-4" />
                  <span>PDFファイルを選択して開く</span>
                </button>
              </div>
            </div>
          </div>

          <DeskSidebar
            width={rightSidebarWidth}
            isOpen={isDeskOpen}
            sourceItems={deskSourceItems}
            items={deskItems}
            docsMap={deskDocs}
            currentPageIndex={currentPage}
            currentDocName={fileName}
            selectedPageCount={selectedPagesForExtract.size}
            onClose={() => setIsDeskOpen(false)}
            onResizeWidth={handleResizeRightSidebar}
            onAddCurrentPage={() => handleAddToDesk(currentPage)}
            onAddSelectedPages={() =>
              handleAddSelectedToDesk(Array.from(selectedPagesForExtract).sort((a, b) => a - b))
            }
            onAddAllPages={handleAddAllPagesToDesk}
            onAddPdfFiles={handleAddPdfFilesToDesk}
            onMoveItem={handleMoveDeskItem}
            onRotateItem={handleRotateDeskItem}
            onRemoveItem={handleRemoveDeskItem}
            onRotateTargetItems={handleRotateTargetItems}
            onRemoveTargetItems={handleRemoveTargetItems}
            onExtractItemsToWorkspace={handleExtractItemsToDesk}
            onMoveGroup={handleMoveDeskGroup}
            onMoveGroupToIndex={handleMoveDeskGroupToIndex}
            onRotateGroup={handleRotateDeskGroup}
            onRemoveGroup={handleRemoveDeskGroup}
            onLoadSingleDocAsCurrent={handleLoadSingleDeskDoc}
            onClearAll={handleClearAllDesk}
            onExportMergedPdf={handleExportMergedPdf}
            onPrintMergedPdf={handlePrintMergedPdf}
            onLoadAsCurrentDoc={handleLoadDeskAsCurrentDoc}
            onSelectDeskItemPreview={handleSelectDeskItemPreview}
            isProcessing={isProcessing}
          />
        </div>
      )}

      {/* 処理中ローディングオーバーレイ */}
      {(isLoadingPdf || isProcessing) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/85 backdrop-blur-md p-4 animate-in fade-in duration-150">
          <div className="bg-slate-900 border border-slate-700/80 rounded-2xl p-8 max-w-md w-full shadow-2xl flex flex-col items-center text-center">
            {/* 大きなスピナー */}
            <div className="relative mb-5">
              <div className="w-16 h-16 rounded-full border-4 border-rose-500/20 border-t-rose-500 animate-spin" />
              <Eraser className="w-8 h-8 text-rose-400 absolute inset-0 m-auto animate-pulse" />
            </div>

            <h3 className="text-lg font-bold text-white mb-2">
              {isLoadingPdf ? 'PDFドキュメントを読み込み中' : 'PDF処理を実行中'}
            </h3>
            
            {/* リアルタイム進捗メッセージ */}
            <p className="text-sm font-medium text-rose-400 mb-4 min-h-[1.5rem]">
              {isLoadingPdf
                ? '端末内部のWebAssemblyエンジンで安全に展開中...'
                : 'テキスト構造と図面品質を保持しながら高速処理中...'}
            </p>

            {/* パルスプログレスバー */}
            <div className="w-full bg-slate-800 rounded-full h-2 mb-4 overflow-hidden relative">
              <div className="bg-gradient-to-r from-rose-600 via-pink-500 to-emerald-400 h-full w-full animate-pulse" />
            </div>

            <div className="text-[11px] text-slate-400 space-y-1">
              <div>・外部へのデータ送信は一切行いません（完全ローカル完結・オフライン処理）</div>
              <div>・消去箇所以外のテキスト選択・OCR適性を100%保持します</div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
