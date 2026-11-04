import React, { useRef, useState, useEffect, useMemo } from 'react'
import { DeskDoc, DeskItem } from '../types/desk'
import { WorkspaceMode } from '../types/drawing'
import { generateDeskItemThumbnail } from '../utils/deskService'
import {
  X,
  Plus,
  ArrowUp,
  ArrowDown,
  RotateCw,
  Trash2,
  Download,
  FolderOpen,
  Layers,
  Sparkles,
  Printer,
  ChevronDown,
  ChevronUp,
  GripVertical,
  ArrowRight,
  CheckSquare,
  Square,
  Eraser,
  CopyPlus,
} from 'lucide-react'

function formatBytes(bytes?: number | null): string {
  if (!bytes || bytes <= 0) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
}

interface DeskSidebarProps {
  isMainView?: boolean;
  width: number;
  isOpen: boolean;
  sourceItems?: DeskItem[]; // 左ペイン（素材プール）のアイテム列
  items: DeskItem[];        // 右ペイン（編纂ワークスペース）のアイテム列
  docsMap: Map<string, DeskDoc>;
  currentPageIndex: number;
  currentDocName: string | null;
  selectedPageCount?: number;
  onClose: () => void;
  onResizeWidth: (w: number) => void;
  onAddCurrentPage: () => void;
  onAddSelectedPages?: () => void;
  onAddAllPages?: () => void;
  onAddPdfFiles: (files: FileList) => void;

  // 右ペイン（編纂ワークスペース）操作
  onMoveItem: (fromIndex: number, toIndex: number) => void;
  onRotateItem: (id: string) => void;
  onRemoveItem: (id: string) => void;
  onRotateTargetItems?: (itemIds: string[]) => void;
  onRemoveTargetItems?: (itemIds: string[]) => void;
  onClearAll: () => void;

  // 素材から編纂ワークスペースへの抽出
  onExtractItemsToWorkspace?: (items: DeskItem[], targetIndex?: number) => void;

  // 素材プール（左ペイン）操作
  onMoveSourceGroupToIndex?: (fromGroupIndex: number, toGroupIndex: number) => void;
  onRotateSourceGroup?: (startIndex: number, endIndex: number) => void;
  onRemoveSourceGroup?: (startIndex: number, endIndex: number) => void;
  onRotateSourceItems?: (itemIds: string[]) => void;
  onRemoveSourceItems?: (itemIds: string[]) => void;

  // ファイル単体を直接墨消し・描画の作業対象として開く
  onLoadSingleDocAsCurrent?: (docId: string, mode?: WorkspaceMode) => void;

  // 互換用グループ操作（右サイドバー等用）
  onMoveGroup?: (startIndex: number, endIndex: number, direction: 'up' | 'down') => void;
  onMoveGroupToIndex?: (fromGroupIndex: number, toGroupIndex: number) => void;
  onRotateGroup?: (startIndex: number, endIndex: number) => void;
  onRemoveGroup?: (startIndex: number, endIndex: number) => void;

  // 出力アクション
  onExportMergedPdf: () => void;
  onPrintMergedPdf?: () => void;
  onLoadAsCurrentDoc: () => void;
  onSelectDeskItemPreview?: (item: DeskItem) => void;
  isProcessing?: boolean;
}

interface DeskFileGroup {
  groupKey: string;
  docId: string;
  docName: string;
  startIndex: number;
  endIndex: number;
  entries: { item: DeskItem; globalIndex: number }[];
}

export const DeskSidebar: React.FC<DeskSidebarProps> = ({
  isMainView = false,
  width,
  isOpen,
  sourceItems,
  items,
  docsMap,
  currentPageIndex,
  currentDocName,
  selectedPageCount = 0,
  onClose,
  onResizeWidth,
  onAddCurrentPage,
  onAddSelectedPages,
  onAddAllPages,
  onAddPdfFiles,
  onMoveItem,
  onRotateItem,
  onRemoveItem,
  onRotateTargetItems,
  onRemoveTargetItems,
  onClearAll,
  onExtractItemsToWorkspace,
  onMoveSourceGroupToIndex,
  onRotateSourceGroup,
  onRemoveSourceGroup,
  onRotateSourceItems,
  onRemoveSourceItems,
  onLoadSingleDocAsCurrent,
  onMoveGroup,
  onMoveGroupToIndex,
  onRotateGroup,
  onRemoveGroup,
  onExportMergedPdf,
  onPrintMergedPdf,
  onLoadAsCurrentDoc,
  onSelectDeskItemPreview,
  isProcessing = false,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [thumbnails, setThumbnails] = useState<Map<string, string>>(new Map())
  const [isResizing, setIsResizing] = useState(false)
  const resizeStartXRef = useRef<number>(0)
  const resizeStartWidthRef = useRef<number>(width)

  // 素材プール用のアイテム列（未指定時は items を素材としても扱う）
  const sourceItemsToUse = sourceItems || items

  // ファイル単位表示でページ一覧を展開しているファイルの docId 集合
  const [expandedDocIds, setExpandedDocIds] = useState<Set<string>>(new Set())

  // 複数選択ステート（左ペイン: 素材用、右ペイン: 編纂用）
  const [selectedSourceIds, setSelectedSourceIds] = useState<Set<string>>(new Set())
  const [selectedTargetIds, setSelectedTargetIds] = useState<Set<string>>(new Set())

  // アイテムが空になった際や変更時に選択状態をクリーンアップ
  useEffect(() => {
    if (items.length === 0 && selectedTargetIds.size > 0) {
      setSelectedTargetIds(new Set())
    }
  }, [items.length])

  useEffect(() => {
    if (sourceItemsToUse.length === 0 && selectedSourceIds.size > 0) {
      setSelectedSourceIds(new Set())
    }
  }, [sourceItemsToUse.length])

  // 左右ペインの幅比率（％）: 初期値50%、localStorage に保存
  const [splitRatio, setSplitRatio] = useState<number>(() => {
    const saved = localStorage.getItem('giov_desk_split_ratio')
    return saved ? Math.min(80, Math.max(20, parseFloat(saved))) : 50
  })
  const [isSplitting, setIsSplitting] = useState(false)
  const splitContainerRef = useRef<HTMLDivElement>(null)

  // ドラッグ＆ドロップ状態
  const [draggingSourceGroupIdx, setDraggingSourceGroupIdx] = useState<number | null>(null)
  const [dragOverSourceGroupIdx, setDragOverSourceGroupIdx] = useState<number | null>(null)
  const [draggingTargetIdx, setDraggingTargetIdx] = useState<number | null>(null)
  const [dragOverTargetIdx, setDragOverTargetIdx] = useState<number | null>(null)
  const [isWorkspaceDragOver, setIsWorkspaceDragOver] = useState(false)

  // 連続する同一 docId のアイテムをファイル単位のグループに集約（左ペイン用）
  const sourceFileGroups = useMemo<DeskFileGroup[]>(() => {
    const groups: DeskFileGroup[] = []
    for (let i = 0; i < sourceItemsToUse.length; i++) {
      const it = sourceItemsToUse[i]
      const prev = groups[groups.length - 1]
      if (prev && prev.docId === it.docId) {
        prev.endIndex = i
        prev.entries.push({ item: it, globalIndex: i })
      } else {
        groups.push({
          groupKey: `${it.docId}_g${groups.length}`,
          docId: it.docId,
          docName: it.docName,
          startIndex: i,
          endIndex: i,
          entries: [{ item: it, globalIndex: i }],
        })
      }
    }
    return groups
  }, [sourceItemsToUse])

  const toggleDocExpand = (docId: string) => {
    setExpandedDocIds((prev) => {
      const next = new Set(prev)
      if (next.has(docId)) {
        next.delete(docId)
      } else {
        next.add(docId)
      }
      return next
    })
  }

  // 左右ペイン両方の全アイテムを合算してサムネイル管理
  const allDeskItems = useMemo(() => {
    const list = [...items]
    if (sourceItems) {
      list.push(...sourceItems)
    }
    return list
  }, [items, sourceItems])

  // アイテムのサムネイルを非同期生成 ＆ 削除されたアイテムの ObjectURL をメモリ解放
  useEffect(() => {
    let active = true
    const activeKeys = new Set(allDeskItems.map((item) => `${item.id}_rot${item.rotation}`))

    setThumbnails((prev) => {
      let changed = false
      const next = new Map(prev)
      for (const [k, url] of next.entries()) {
        if (!activeKeys.has(k)) {
          if (url && url.startsWith('blob:')) {
            try {
              URL.revokeObjectURL(url)
            } catch {}
          }
          next.delete(k)
          changed = true
        }
      }
      return changed ? next : prev
    })

    allDeskItems.forEach(async (item) => {
      const key = `${item.id}_rot${item.rotation}`
      if (thumbnails.has(key)) return

      const doc = docsMap.get(item.docId)
      if (!doc) return

      const url = await generateDeskItemThumbnail(doc.bytes, item.pageIndex, item.rotation)
      if (!active) {
        if (url && url.startsWith('blob:')) URL.revokeObjectURL(url)
        return
      }
      if (url) {
        setThumbnails((prev) => new Map(prev).set(key, url))
      }
    })
    return () => {
      active = false
    }
  }, [allDeskItems, docsMap])

  // ドラッグリサイズ処理（サイドバー表示時のみ）
  useEffect(() => {
    if (!isResizing) return

    const handlePointerMove = (e: PointerEvent) => {
      const deltaX = resizeStartXRef.current - e.clientX
      const newWidth = Math.min(750, Math.max(260, resizeStartWidthRef.current + deltaX))
      onResizeWidth(newWidth)
    }

    const handlePointerUp = () => {
      setIsResizing(false)
    }

    window.addEventListener('pointermove', handlePointerMove)
    window.addEventListener('pointerup', handlePointerUp)
    return () => {
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('pointerup', handlePointerUp)
    }
  }, [isResizing, onResizeWidth])

  // 左右ペインスプリッターのドラッグ調整処理
  useEffect(() => {
    if (!isSplitting) return

    const handlePointerMove = (e: PointerEvent) => {
      const container = splitContainerRef.current
      if (!container) return
      const rect = container.getBoundingClientRect()
      const x = e.clientX - rect.left
      const ratio = (x / rect.width) * 100
      // 20% 〜 80% に安全クランプ
      const clamped = Math.min(80, Math.max(20, ratio))
      setSplitRatio(clamped)
    }

    const handlePointerUp = () => {
      setIsSplitting(false)
      setSplitRatio((current) => {
        try {
          localStorage.setItem('giov_desk_split_ratio', current.toFixed(1))
        } catch {}
        return current
      })
    }

    window.addEventListener('pointermove', handlePointerMove)
    window.addEventListener('pointerup', handlePointerUp)
    return () => {
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('pointerup', handlePointerUp)
    }
  }, [isSplitting])

  const handleResetSplit = () => {
    setSplitRatio(50)
    try {
      localStorage.setItem('giov_desk_split_ratio', '50')
    } catch {}
  }

  // 左ペイン選択トグル
  const toggleSelectSourceItem = (id: string, e?: React.MouseEvent) => {
    e?.stopPropagation()
    setSelectedSourceIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  // 右ペイン選択トグル
  const toggleSelectTargetItem = (id: string, e?: React.MouseEvent) => {
    e?.stopPropagation()
    setSelectedTargetIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  // 左ペイン全選択 / 解除
  const handleToggleSelectAllSource = () => {
    if (selectedSourceIds.size === sourceItemsToUse.length) {
      setSelectedSourceIds(new Set())
    } else {
      setSelectedSourceIds(new Set(sourceItemsToUse.map((it) => it.id)))
    }
  }

  // 右ペイン全選択 / 解除
  const handleToggleSelectAllTarget = () => {
    if (selectedTargetIds.size === items.length) {
      setSelectedTargetIds(new Set())
    } else {
      setSelectedTargetIds(new Set(items.map((it) => it.id)))
    }
  }

  // 選択した素材ページを右のワークスペースへ抽出
  const handleExtractSelectedSource = () => {
    const selected = sourceItemsToUse.filter((it) => selectedSourceIds.has(it.id))
    if (selected.length === 0) return
    onExtractItemsToWorkspace?.(selected)
    setSelectedSourceIds(new Set())
  }

  // 選択した素材ページを一括回転
  const handleRotateSelectedSource = () => {
    if (selectedSourceIds.size === 0) return
    onRotateSourceItems?.(Array.from(selectedSourceIds))
  }

  // 選択した素材ページを一括削除
  const handleRemoveSelectedSource = () => {
    if (selectedSourceIds.size === 0) return
    onRemoveSourceItems?.(Array.from(selectedSourceIds))
    setSelectedSourceIds(new Set())
  }

  // 選択した編纂ページを一括回転
  const handleRotateSelectedTarget = () => {
    if (selectedTargetIds.size === 0) return
    if (onRotateTargetItems) {
      onRotateTargetItems(Array.from(selectedTargetIds))
    } else {
      selectedTargetIds.forEach((id) => onRotateItem(id))
    }
  }

  // 選択した編纂ページを一括削除
  const handleRemoveSelectedTarget = () => {
    if (selectedTargetIds.size === 0) return
    if (onRemoveTargetItems) {
      onRemoveTargetItems(Array.from(selectedTargetIds))
    } else {
      selectedTargetIds.forEach((id) => onRemoveItem(id))
    }
    setSelectedTargetIds(new Set())
  }

  if (!isOpen && !isMainView) return null

  // ==========================================================
  // 【1】全画面作業机ビュー（isMainView === true: 左右2ペイン構成）
  // ==========================================================
  if (isMainView) {
    return (
      <div className="flex-1 flex flex-col bg-slate-950 select-none overflow-hidden z-10">
        {/* 隠しファイルinput */}
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept=".pdf,application/pdf"
          className="hidden"
          onChange={(e) => {
            if (e.target.files && e.target.files.length > 0) {
              onAddPdfFiles(e.target.files)
              e.target.value = ''
            }
          }}
        />

        {/* トップヘッダー */}
        <div className="px-6 py-3.5 bg-slate-900/95 border-b border-slate-800 flex flex-wrap items-center justify-between gap-3 shadow-md">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-emerald-500/20 text-emerald-400 rounded-xl border border-emerald-500/30">
              <Layers className="w-5 h-5" />
            </div>
            <div>
              <div className="text-sm sm:text-base font-extrabold text-slate-100 flex items-center gap-2">
                <span>🗂️ 作業机（PDFファイル結合・ページ抽出ワークスペース）</span>
              </div>
              <div className="text-xs text-slate-400 mt-0.5">
                左の読み込みファイルから必要なページを右の編纂机へ抽出・並べ替えし、新しいPDFを組み立てます
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            <button
              onClick={() => fileInputRef.current?.click()}
              className="px-3.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-bold flex items-center gap-1.5 transition active:scale-95 cursor-pointer"
            >
              <Plus className="w-4 h-4 text-emerald-400" />
              <span>PDFを追加</span>
            </button>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg bg-slate-800/80 hover:bg-slate-700 text-slate-400 hover:text-white transition cursor-pointer"
              title="作業机を閉じる"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* メインエリア: 左右2ペイン分割（ドラッグリサイザー対応） */}
        <div ref={splitContainerRef} className="flex-1 flex overflow-hidden relative">
          {/* ===================================================== */}
          {/* 👈 左ペイン: 読み込みファイル（素材プール） */}
          {/* ===================================================== */}
          <div
            style={{ width: `${splitRatio}%` }}
            className="flex flex-col border-r border-slate-800 bg-slate-950/70 overflow-hidden shrink-0"
          >
            {/* 左ペインヘッダー */}
            <div className="px-4 py-3 bg-slate-900/80 border-b border-slate-800 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-sm font-extrabold text-slate-100 flex items-center gap-1.5">
                  <span>📚 読み込みファイル</span>
                  <span className="text-xs text-slate-400 font-normal">（素材）</span>
                </span>
                <span className="text-xs font-mono px-2 py-0.5 rounded-full bg-slate-800 text-emerald-300 border border-slate-700 font-bold shrink-0">
                  {sourceFileGroups.length} ファイル / {sourceItemsToUse.length} 頁
                </span>
              </div>

              <div className="flex items-center gap-1.5 shrink-0">
                {sourceItemsToUse.length > 0 && (
                  <button
                    onClick={() => onExtractItemsToWorkspace?.(sourceItemsToUse)}
                    className="px-2.5 py-1.5 rounded-lg bg-emerald-600/30 hover:bg-emerald-600/50 text-emerald-200 border border-emerald-500/40 text-xs font-bold flex items-center gap-1 transition active:scale-95 cursor-pointer"
                    title="左にあるすべてのページのコピーを右の編纂机へ一括追加します"
                  >
                    <CopyPlus className="w-3.5 h-3.5 text-emerald-400" />
                    <span>全頁を右の机へ</span>
                  </button>
                )}
                <button
                  onClick={handleToggleSelectAllSource}
                  className="px-2 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium border border-slate-700 transition cursor-pointer"
                  title="左の素材ページを全選択 / 解除"
                >
                  {selectedSourceIds.size === sourceItemsToUse.length && sourceItemsToUse.length > 0 ? (
                    <span className="text-emerald-400 font-bold">全解除</span>
                  ) : (
                    <span>全選択</span>
                  )}
                </button>
              </div>
            </div>

            {/* 左ペイン複数選択一括バー */}
            {selectedSourceIds.size > 0 && (
              <div className="px-4 py-2 bg-emerald-950/90 border-b border-emerald-500/40 flex items-center justify-between gap-2 animate-fade-in">
                <div className="flex items-center gap-2 text-xs font-bold text-emerald-200">
                  <CheckSquare className="w-4 h-4 text-emerald-400" />
                  <span>{selectedSourceIds.size} ページ選択中</span>
                </div>

                <div className="flex items-center gap-1.5">
                  <button
                    onClick={handleExtractSelectedSource}
                    className="px-3 py-1 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-black flex items-center gap-1 transition shadow-md cursor-pointer active:scale-95"
                    title="選択したページを右の編纂ワークスペースへ抽出"
                  >
                    <span>👉 右の机へ抽出</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={handleRotateSelectedSource}
                    className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold flex items-center gap-1 transition cursor-pointer"
                    title="選択したページを一括90°回転"
                  >
                    <RotateCw className="w-3.5 h-3.5 text-emerald-400" />
                  </button>
                  <button
                    onClick={handleRemoveSelectedSource}
                    className="p-1.5 rounded-lg bg-slate-800 hover:bg-rose-900/60 text-rose-300 text-xs font-semibold flex items-center gap-1 transition cursor-pointer"
                    title="選択したページを素材から削除"
                  >
                    <Trash2 className="w-3.5 h-3.5 text-rose-400" />
                  </button>
                  <button
                    onClick={() => setSelectedSourceIds(new Set())}
                    className="px-2 py-1 rounded-lg text-slate-400 hover:text-white text-xs transition cursor-pointer"
                  >
                    解除
                  </button>
                </div>
              </div>
            )}

            {/* 左ペイン本体: ファイルカードグリッド */}
            <div
              className="flex-1 overflow-y-auto p-4 space-y-4"
              onDragOver={(e) => {
                e.preventDefault()
                e.dataTransfer.dropEffect = 'copy'
              }}
              onDrop={(e) => {
                e.preventDefault()
                e.stopPropagation()
                if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
                  onAddPdfFiles(e.dataTransfer.files)
                }
              }}
            >
              {sourceItemsToUse.length === 0 ? (
                /* 素材が空のときのドロップ案内 */
                <div
                  onClick={() => fileInputRef.current?.click()}
                  className="h-full min-h-[360px] border-2 border-dashed border-slate-800 hover:border-emerald-500/50 rounded-2xl p-8 flex flex-col items-center justify-center text-center bg-slate-900/40 hover:bg-slate-900/70 transition cursor-pointer group"
                >
                  <div className="w-16 h-16 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center mb-4 group-hover:scale-105 transition">
                    <FolderOpen className="w-8 h-8" />
                  </div>
                  <div className="text-base font-extrabold text-white mb-1.5">
                    結合・整理したいPDFファイルをここにドラッグ＆ドロップ
                  </div>
                  <div className="text-xs text-slate-400 max-w-sm mx-auto mb-5 leading-relaxed">
                    複数PDFを同時に追加できます。追加したPDFはファイル単位で管理でき、中身を展開して特定ページだけ右の机へ抽出できます。
                  </div>
                  <button
                    type="button"
                    className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white text-xs font-bold flex items-center gap-1.5 shadow-lg shadow-emerald-600/25 transition active:scale-95 pointer-events-none"
                  >
                    <Plus className="w-4 h-4" />
                    <span>PDFファイルを選択</span>
                  </button>
                </div>
              ) : (
                /* ファイルカードグリッド */
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
                  {sourceFileGroups.map((group, gIdx) => {
                    const firstEntry = group.entries[0]
                    const firstThumbKey = `${firstEntry.item.id}_rot${firstEntry.item.rotation}`
                    const firstThumbUrl = thumbnails.get(firstThumbKey)
                    const isExpanded = expandedDocIds.has(group.docId)
                    const isMultiPage = group.entries.length >= 2

                    return (
                      <React.Fragment key={group.groupKey}>
                        <div
                          draggable={true}
                          onDragStart={(e) => {
                            e.dataTransfer.setData('text/plain', `fileGroup:${gIdx}`)
                            e.dataTransfer.effectAllowed = 'move'
                            setDraggingSourceGroupIdx(gIdx)
                          }}
                          onDragOver={(e) => {
                            if (draggingSourceGroupIdx !== null && draggingSourceGroupIdx !== gIdx) {
                              e.preventDefault()
                              e.dataTransfer.dropEffect = 'move'
                              setDragOverSourceGroupIdx(gIdx)
                            }
                          }}
                          onDragLeave={() => {
                            if (dragOverSourceGroupIdx === gIdx) {
                              setDragOverSourceGroupIdx(null)
                            }
                          }}
                          onDrop={(e) => {
                            e.preventDefault()
                            e.stopPropagation()
                            if (draggingSourceGroupIdx !== null && draggingSourceGroupIdx !== gIdx) {
                              onMoveSourceGroupToIndex?.(draggingSourceGroupIdx, gIdx)
                            }
                            setDraggingSourceGroupIdx(null)
                            setDragOverSourceGroupIdx(null)
                          }}
                          onDragEnd={() => {
                            setDraggingSourceGroupIdx(null)
                            setDragOverSourceGroupIdx(null)
                          }}
                          className={`group/card relative bg-slate-900/90 border rounded-2xl p-3 flex flex-col justify-between transition-all select-none shadow-md ${
                            draggingSourceGroupIdx === gIdx
                              ? 'opacity-30 border-dashed border-emerald-400 scale-95'
                              : dragOverSourceGroupIdx === gIdx
                              ? 'border-blue-400 ring-2 ring-blue-500/50 bg-slate-800'
                              : isExpanded
                              ? 'border-emerald-500/60 ring-1 ring-emerald-500/30 bg-slate-850'
                              : 'border-slate-800 hover:border-emerald-500/40 hover:bg-slate-850'
                          }`}
                        >
                          {/* カード上部: 番号 ＆ 移動 ＆ 削除 */}
                          <div className="flex items-center justify-between gap-1 pb-2 border-b border-slate-800/80">
                            <div className="flex items-center gap-1.5 min-w-0">
                              <span className="px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 font-mono text-[10px] font-black shrink-0">
                                #{gIdx + 1}
                              </span>
                              <div
                                className="text-xs font-bold text-slate-200 truncate cursor-grab active:cursor-grabbing"
                                title={group.docName}
                              >
                                {group.docName}
                              </div>
                            </div>

                            <div className="flex items-center gap-1 shrink-0">
                              <button
                                onClick={() => onRemoveSourceGroup?.(group.startIndex, group.endIndex)}
                                className="p-1 rounded hover:bg-rose-900/60 text-slate-400 hover:text-rose-300 transition cursor-pointer"
                                title="このファイルを素材から外す"
                              >
                                <Trash2 className="w-3 h-3 text-rose-400" />
                              </button>
                            </div>
                          </div>

                          {/* カード中央: サムネイル（複数ページ紙スタック） */}
                          <div
                            onClick={() => toggleDocExpand(group.docId)}
                            className="relative my-2.5 w-full flex items-center justify-center cursor-pointer group/thumb"
                            title="クリックでこのファイルの中身（全ページ）を展開 / 折りたたみ"
                          >
                            <div className="relative w-full max-w-[140px] aspect-[1/1.3] flex items-center justify-center">
                              {isMultiPage && (
                                <>
                                  {group.entries.length >= 3 && (
                                    <div className="absolute inset-0 bg-slate-700/70 rounded-lg border border-slate-600/80 shadow-sm translate-x-2 -translate-y-1.5 pointer-events-none transition-transform group-hover/thumb:translate-x-3 group-hover/thumb:-translate-y-2" />
                                  )}
                                  <div className="absolute inset-0 bg-slate-800/90 rounded-lg border border-slate-600 shadow-sm translate-x-1 -translate-y-0.5 pointer-events-none transition-transform group-hover/thumb:translate-x-1.5 group-hover/thumb:-translate-y-1" />
                                </>
                              )}

                              <div className="relative w-full h-full bg-slate-950 rounded-lg overflow-hidden border border-slate-700 shadow-md flex items-center justify-center z-10 group-hover/thumb:border-emerald-500/70 transition">
                                {firstThumbUrl ? (
                                  <img
                                    src={firstThumbUrl}
                                    alt={group.docName}
                                    className="w-full h-full object-contain pointer-events-none"
                                  />
                                ) : (
                                  <div className="w-4 h-4 rounded-full border-2 border-emerald-500/30 border-t-emerald-500 animate-spin" />
                                )}

                                <div className="absolute bottom-1 right-1 bg-slate-950/90 border border-emerald-500/70 text-emerald-300 px-1.5 py-0.2 rounded font-mono text-[9px] font-black flex items-center gap-0.5 shadow">
                                  <Layers className="w-2.5 h-2.5 text-emerald-400" />
                                  <span>全 {group.entries.length} 頁</span>
                                </div>
                              </div>
                            </div>
                          </div>

                          {/* カード下部: 墨消しで開く ＆ 全頁右へ ＆ 展開ボタン */}
                          <div className="pt-2 border-t border-slate-800/80 space-y-1.5">
                            <div className="flex items-center gap-1.5">
                              {/* ★新機能: このファイルを直接墨消しで開く */}
                              <button
                                onClick={(e) => {
                                  e.stopPropagation()
                                  onLoadSingleDocAsCurrent?.(group.docId, 'redact')
                                }}
                                className="flex-1 py-1.5 px-2 rounded-lg bg-rose-950/40 hover:bg-rose-900/70 text-rose-300 border border-rose-500/40 hover:border-rose-400 text-[11px] font-bold flex items-center justify-center gap-1 transition cursor-pointer active:scale-95"
                                title="このPDFファイルをそのまま墨消し（不可逆黒塗り）の作業対象として開きます"
                              >
                                <Eraser className="w-3 h-3 text-rose-400" />
                                <span>墨消しで開く</span>
                              </button>

                              {/* このファイルの全ページを右の編纂机へ抽出 */}
                              <button
                                onClick={(e) => {
                                  e.stopPropagation()
                                  onExtractItemsToWorkspace?.(group.entries.map((e) => e.item))
                                }}
                                className="flex-1 py-1.5 px-2 rounded-lg bg-emerald-600/30 hover:bg-emerald-600/50 text-emerald-200 border border-emerald-500/50 text-[11px] font-bold flex items-center justify-center gap-1 transition cursor-pointer active:scale-95"
                                title="このファイルの全ページを右の編纂机へ一括追加します"
                              >
                                <CopyPlus className="w-3 h-3 text-emerald-400" />
                                <span>全頁を右へ</span>
                              </button>
                            </div>

                            <div className="flex items-center gap-1.5">
                              {/* 全頁回転 */}
                              <button
                                onClick={(e) => {
                                  e.stopPropagation()
                                  onRotateSourceGroup?.(group.startIndex, group.endIndex)
                                }}
                                className="py-1 px-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 text-[10px] font-semibold flex items-center justify-center gap-1 transition cursor-pointer"
                                title="このファイルの全ページを90°回転"
                              >
                                <RotateCw className="w-3 h-3 text-emerald-400" />
                                <span>回転</span>
                              </button>

                              {/* ページ展開ボタン */}
                              <button
                                onClick={(e) => {
                                  e.stopPropagation()
                                  toggleDocExpand(group.docId)
                                }}
                                className={`flex-1 py-1 px-2 rounded-lg border text-[10px] font-bold flex items-center justify-center gap-1 transition cursor-pointer ${
                                  isExpanded
                                    ? 'bg-emerald-600/30 border-emerald-500/60 text-emerald-200'
                                    : 'bg-slate-800 hover:bg-slate-700 border-slate-700 text-slate-300'
                                }`}
                              >
                                {isExpanded ? (
                                  <>
                                    <ChevronUp className="w-3 h-3 text-emerald-400" />
                                    <span>閉じる</span>
                                  </>
                                ) : (
                                  <>
                                    <ChevronDown className="w-3 h-3 text-slate-400" />
                                    <span>頁を展開 ({group.entries.length})</span>
                                  </>
                                )}
                              </button>
                            </div>
                          </div>
                        </div>

                        {/* 展開されたページ一覧トレイ（全列フルワイド展開） */}
                        {isExpanded && (
                          <div className="col-span-full p-3.5 bg-slate-900/95 border-2 border-emerald-500/50 rounded-2xl shadow-xl space-y-2.5">
                            <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                              <div className="text-xs font-bold text-white flex items-center gap-2">
                                <span>📄 {group.docName}</span>
                                <span className="text-[10px] font-mono text-emerald-300 px-1.5 py-0.2 rounded bg-emerald-500/20">
                                  {group.entries.length} ページ
                                </span>
                              </div>
                              <button
                                onClick={() => toggleDocExpand(group.docId)}
                                className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-[11px] font-medium transition cursor-pointer"
                              >
                                閉じる
                              </button>
                            </div>

                            {/* ファイル内ページサムネイルグリッド */}
                            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2.5">
                              {group.entries.map(({ item }) => {
                                const thumbKey = `${item.id}_rot${item.rotation}`
                                const thumbUrl = thumbnails.get(thumbKey)
                                const isSelected = selectedSourceIds.has(item.id)

                                return (
                                  <div
                                    key={item.id}
                                    draggable={true}
                                    onDragStart={(e) => {
                                      // 複数選択中なら選択中の全アイテムIDを渡す
                                      const ids = selectedSourceIds.has(item.id)
                                        ? Array.from(selectedSourceIds)
                                        : [item.id]
                                      e.dataTransfer.setData('giov/desk-extract', JSON.stringify({ itemIds: ids }))
                                      e.dataTransfer.effectAllowed = 'copy'
                                    }}
                                    onClick={() => toggleSelectSourceItem(item.id)}
                                    className={`relative bg-slate-950 border rounded-xl p-2 flex flex-col gap-1.5 transition shadow cursor-pointer select-none group/item ${
                                      isSelected
                                        ? 'border-emerald-400 ring-2 ring-emerald-500/50 bg-slate-900'
                                        : 'border-slate-800 hover:border-emerald-500/50'
                                    }`}
                                  >
                                    <div className="w-full aspect-[1/1.3] bg-slate-950 rounded-lg overflow-hidden border border-slate-800 relative flex items-center justify-center">
                                      {thumbUrl ? (
                                        <img
                                          src={thumbUrl}
                                          alt={`p.${item.pageNumber}`}
                                          className="w-full h-full object-contain pointer-events-none"
                                        />
                                      ) : (
                                        <div className="w-3.5 h-3.5 rounded-full border-2 border-emerald-500/30 border-t-emerald-500 animate-spin" />
                                      )}

                                      {/* 左上: チェックボックス */}
                                      <div
                                        onClick={(e) => toggleSelectSourceItem(item.id, e)}
                                        className="absolute top-1 left-1 bg-black/80 rounded p-0.5 text-white transition hover:scale-110"
                                      >
                                        {isSelected ? (
                                          <CheckSquare className="w-3.5 h-3.5 text-emerald-400" />
                                        ) : (
                                          <Square className="w-3.5 h-3.5 text-slate-400" />
                                        )}
                                      </div>

                                      {/* 右上: 右の机へ追加ボタン */}
                                      <button
                                        onClick={(e) => {
                                          e.stopPropagation()
                                          onExtractItemsToWorkspace?.([item])
                                        }}
                                        className="absolute top-1 right-1 opacity-0 group-hover/item:opacity-100 transition bg-emerald-600 hover:bg-emerald-500 text-white p-1 rounded shadow cursor-pointer"
                                        title="このページを右の編纂机へ抽出"
                                      >
                                        <ArrowRight className="w-3 h-3" />
                                      </button>

                                      <span className="absolute bottom-1 left-1 bg-black/75 text-slate-300 text-[9px] px-1 rounded font-mono font-bold">
                                        p.{item.pageNumber}
                                      </span>

                                      {item.rotation !== 0 && (
                                        <span className="absolute bottom-1 right-1 bg-black/80 text-[9px] text-amber-400 px-1 rounded font-mono font-bold">
                                          {item.rotation}°
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                )
                              })}
                            </div>
                          </div>
                        )}
                      </React.Fragment>
                    )
                  })}
                </div>
              )}
            </div>
          </div>

          {/* ===================================================== */}
          {/* ┃ 左右ペイン境界スプリッターバー（ドラッグで幅調整） */}
          {/* ===================================================== */}
          <div
            onPointerDown={(e) => {
              e.preventDefault()
              setIsSplitting(true)
            }}
            onDoubleClick={handleResetSplit}
            title="ドラッグで左右の幅を調整 / ダブルクリックで 50:50 にリセット"
            className={`w-2.5 -ml-1.5 -mr-1.5 z-30 cursor-col-resize group relative flex items-center justify-center transition-colors select-none ${
              isSplitting ? 'bg-emerald-500/30' : 'bg-transparent hover:bg-emerald-500/20'
            }`}
          >
            <div
              className={`w-1 h-16 rounded-full transition-all ${
                isSplitting
                  ? 'bg-emerald-400 shadow-[0_0_12px_rgba(52,211,153,0.9)] scale-y-110'
                  : 'bg-slate-700/80 group-hover:bg-emerald-400 group-hover:shadow-[0_0_8px_rgba(52,211,153,0.6)]'
              }`}
            />
          </div>

          {/* ===================================================== */}
          {/* 👉 右ペイン: 編纂ワークスペース（出力バインダー） */}
          {/* ===================================================== */}
          <div
            style={{ width: `${100 - splitRatio}%` }}
            className={`flex flex-col bg-slate-900/40 overflow-hidden transition-colors shrink-0 ${
              isWorkspaceDragOver ? 'bg-emerald-950/20 ring-2 ring-inset ring-emerald-500/40' : ''
            }`}
            onDragOver={(e) => {
              e.preventDefault()
              e.dataTransfer.dropEffect = 'copy'
              if (!isWorkspaceDragOver) setIsWorkspaceDragOver(true)
            }}
            onDragLeave={() => setIsWorkspaceDragOver(false)}
            onDrop={(e) => {
              e.preventDefault()
              e.stopPropagation()
              setIsWorkspaceDragOver(false)

              // 1. 左の素材からの抽出ドロップ
              const extractData = e.dataTransfer.getData('giov/desk-extract')
              if (extractData) {
                try {
                  const { itemIds } = JSON.parse(extractData)
                  const itemsToExtract = sourceItemsToUse.filter((it) => itemIds.includes(it.id))
                  if (itemsToExtract.length > 0) {
                    onExtractItemsToWorkspace?.(itemsToExtract)
                    setSelectedSourceIds(new Set())
                    return
                  }
                } catch {}
              }

              // 2. 外部PDFファイルの直接ドロップ
              if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
                onAddPdfFiles(e.dataTransfer.files)
              }
            }}
          >
            {/* 右ペインヘッダー */}
            <div className="px-4 py-3 bg-slate-900/95 border-b border-slate-800 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-sm font-extrabold text-white flex items-center gap-1.5">
                  <span>📑 編纂ワークスペース</span>
                  <span className="text-xs text-slate-400 font-normal">（出力用）</span>
                </span>
                <span className="text-xs font-mono px-2 py-0.5 rounded-full bg-slate-800 text-blue-300 border border-slate-700 font-bold shrink-0">
                  計 {items.length} 頁
                </span>
              </div>

              <div className="flex items-center gap-1.5 shrink-0">
                {items.length > 0 && (
                  <>
                    <button
                      onClick={handleToggleSelectAllTarget}
                      className="px-2 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium border border-slate-700 transition cursor-pointer"
                      title="右の編纂ページを全選択 / 解除"
                    >
                      {selectedTargetIds.size === items.length && items.length > 0 ? (
                        <span className="text-blue-400 font-bold">全解除</span>
                      ) : (
                        <span>全選択</span>
                      )}
                    </button>
                    <button
                      onClick={onClearAll}
                      className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-rose-900/60 text-slate-400 hover:text-rose-300 text-xs font-medium border border-slate-700 transition cursor-pointer"
                      title="編纂ワークスペースを空にする"
                    >
                      クリア
                    </button>
                  </>
                )}
              </div>
            </div>

            {/* 右ペイン複数選択一括バー */}
            {selectedTargetIds.size > 0 && (
              <div className="px-4 py-2 bg-blue-950/90 border-b border-blue-500/40 flex items-center justify-between gap-2 animate-fade-in">
                <div className="flex items-center gap-2 text-xs font-bold text-blue-200">
                  <CheckSquare className="w-4 h-4 text-blue-400" />
                  <span>{selectedTargetIds.size} ページ選択中</span>
                </div>

                <div className="flex items-center gap-1.5">
                  <button
                    onClick={handleRotateSelectedTarget}
                    className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold flex items-center gap-1 transition cursor-pointer"
                    title="選択したページを一括90°回転"
                  >
                    <RotateCw className="w-3.5 h-3.5 text-blue-400" />
                    <span>回転</span>
                  </button>
                  <button
                    onClick={handleRemoveSelectedTarget}
                    className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-rose-900/60 text-rose-300 text-xs font-semibold flex items-center gap-1 transition cursor-pointer"
                    title="選択したページを編纂机から削除"
                  >
                    <Trash2 className="w-3.5 h-3.5 text-rose-400" />
                    <span>削除</span>
                  </button>
                  <button
                    onClick={() => setSelectedTargetIds(new Set())}
                    className="px-2 py-1 rounded-lg text-slate-400 hover:text-white text-xs transition cursor-pointer"
                  >
                    解除
                  </button>
                </div>
              </div>
            )}

            {/* 右ペイン本体: 抽出されたページ一覧 */}
            <div className="flex-1 overflow-y-auto p-4">
              {items.length === 0 ? (
                /* 空のときのプレースホルダー */
                <div className="h-full min-h-[360px] border-2 border-dashed border-slate-800 rounded-2xl p-8 flex flex-col items-center justify-center text-center bg-slate-900/20">
                  <div className="w-16 h-16 rounded-2xl bg-blue-500/10 border border-blue-500/20 text-blue-400 flex items-center justify-center mb-4">
                    <Sparkles className="w-8 h-8" />
                  </div>
                  <div className="text-base font-extrabold text-white mb-1.5">
                    👈 左の書類からページをドラッグ＆ドロップ、または選択してここに追加
                  </div>
                  <div className="text-xs text-slate-400 max-w-sm mx-auto leading-relaxed">
                    左のファイルカードにある<strong>「全頁を右へ」</strong>ボタンを押すと、ファイル全体を素早く一括投入できます。
                  </div>
                </div>
              ) : (
                /* 抽出されたページのグリッド（マウスドラッグ並べ替え対応） */
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
                  {items.map((item, idx) => {
                    const thumbKey = `${item.id}_rot${item.rotation}`
                    const thumbUrl = thumbnails.get(thumbKey)
                    const isSelected = selectedTargetIds.has(item.id)
                    const isDragging = draggingTargetIdx === idx
                    const isDragOver = dragOverTargetIdx === idx && draggingTargetIdx !== idx

                    return (
                      <div
                        key={item.id}
                        draggable={true}
                        onDragStart={(e) => {
                          e.dataTransfer.setData('text/plain', String(idx))
                          e.dataTransfer.effectAllowed = 'move'
                          setDraggingTargetIdx(idx)
                        }}
                        onDragOver={(e) => {
                          e.preventDefault()
                          e.dataTransfer.dropEffect = 'move'
                          if (dragOverTargetIdx !== idx) {
                            setDragOverTargetIdx(idx)
                          }
                        }}
                        onDragLeave={() => {
                          if (dragOverTargetIdx === idx) {
                            setDragOverTargetIdx(null)
                          }
                        }}
                        onDrop={(e) => {
                          e.preventDefault()
                          e.stopPropagation()
                          if (draggingTargetIdx !== null && draggingTargetIdx !== idx) {
                            onMoveItem(draggingTargetIdx, idx)
                          }
                          setDraggingTargetIdx(null)
                          setDragOverTargetIdx(null)
                        }}
                        onDragEnd={() => {
                          setDraggingTargetIdx(null)
                          setDragOverTargetIdx(null)
                        }}
                        onClick={() => toggleSelectTargetItem(item.id)}
                        className={`group relative bg-slate-900 border rounded-xl p-2.5 flex flex-col gap-1.5 transition shadow-md cursor-grab active:cursor-grabbing select-none ${
                          isDragging
                            ? 'opacity-30 scale-95 border-dashed border-emerald-500'
                            : isDragOver
                            ? 'border-blue-400 ring-2 ring-blue-500/50 bg-slate-800'
                            : isSelected
                            ? 'border-blue-400 ring-2 ring-blue-500/40 bg-slate-850'
                            : 'border-slate-800 hover:border-emerald-500/50'
                        }`}
                      >
                        <div className="w-full aspect-[1/1.3] bg-slate-950 rounded-lg overflow-hidden border border-slate-800 relative flex items-center justify-center">
                          {thumbUrl ? (
                            <img
                              src={thumbUrl}
                              alt={`p.${item.pageNumber}`}
                              className="w-full h-full object-contain pointer-events-none"
                            />
                          ) : (
                            <div className="w-4 h-4 rounded-full border-2 border-emerald-500/30 border-t-emerald-500 animate-spin" />
                          )}

                          {/* 左上: 順序バッジ ＆ チェックボックス */}
                          <div className="absolute top-1 left-1 flex items-center gap-1">
                            <span className="bg-black/85 text-emerald-300 text-[10px] px-1.5 py-0.2 rounded font-mono font-bold">
                              #{idx + 1}
                            </span>
                            <div
                              onClick={(e) => toggleSelectTargetItem(item.id, e)}
                              className="bg-black/80 rounded p-0.5 text-white transition hover:scale-110"
                            >
                              {isSelected ? (
                                <CheckSquare className="w-3.5 h-3.5 text-blue-400" />
                              ) : (
                                <Square className="w-3.5 h-3.5 text-slate-400" />
                              )}
                            </div>
                          </div>

                          {item.rotation !== 0 && (
                            <span className="absolute bottom-1 right-1 bg-black/85 text-[9px] text-amber-400 px-1 rounded font-mono font-bold">
                              {item.rotation}°
                            </span>
                          )}

                          <div className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition bg-black/70 p-1 rounded text-slate-400">
                            <GripVertical className="w-3.5 h-3.5" />
                          </div>
                        </div>

                        <div className="min-w-0">
                          <div
                            className="text-[11px] font-semibold text-slate-200 truncate"
                            title={item.docName}
                          >
                            {item.docName}
                          </div>
                          <div className="text-[10px] text-slate-400 font-mono">
                            元 p.{item.pageNumber}
                          </div>
                        </div>

                        <div
                          className="flex items-center justify-between pt-1 border-t border-slate-800"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <div className="flex items-center gap-1">
                            <button
                              disabled={idx === 0}
                              onClick={() => onMoveItem(idx, idx - 1)}
                              className="p-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white disabled:opacity-20 transition cursor-pointer"
                              title="前へ移動"
                            >
                              <ArrowUp className="w-3 h-3" />
                            </button>
                            <button
                              disabled={idx === items.length - 1}
                              onClick={() => onMoveItem(idx, idx + 1)}
                              className="p-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white disabled:opacity-20 transition cursor-pointer"
                              title="次へ移動"
                            >
                              <ArrowDown className="w-3 h-3" />
                            </button>
                          </div>

                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => onRotateItem(item.id)}
                              className="p-1 rounded bg-slate-800 hover:bg-emerald-600/80 text-slate-300 hover:text-white transition cursor-pointer"
                              title="90°回転"
                            >
                              <RotateCw className="w-3 h-3 text-emerald-400" />
                            </button>
                            <button
                              onClick={() => onRemoveItem(item.id)}
                              className="p-1 rounded bg-slate-800 hover:bg-rose-600/80 text-slate-300 hover:text-white transition cursor-pointer"
                              title="編纂机から外す"
                            >
                              <Trash2 className="w-3 h-3 text-rose-400" />
                            </button>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

            {/* 右ペインフッター: 出力アクション */}
            {items.length > 0 && (
              <div className="px-6 py-4 bg-slate-900/95 border-t border-slate-800 flex flex-wrap items-center justify-between gap-4 shadow-xl">
                <div className="text-xs text-slate-300">
                  編纂ワークスペースの計{' '}
                  <strong className="text-emerald-300 font-mono text-sm">{items.length}</strong>{' '}
                  ページを出力します
                </div>

                <div className="flex flex-wrap items-center gap-2.5">
                  <button
                    onClick={onLoadAsCurrentDoc}
                    disabled={isProcessing}
                    className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold flex items-center justify-center gap-1.5 border border-slate-700 transition active:scale-95 cursor-pointer disabled:opacity-50"
                    title="編纂したPDFをそのまま墨消し・描画モードの作業対象として開きます"
                  >
                    <Sparkles className="w-3.5 h-3.5 text-blue-400" />
                    <span>この編纂内容を墨消し・校正で開く</span>
                  </button>

                  {onPrintMergedPdf && (
                    <button
                      onClick={onPrintMergedPdf}
                      disabled={isProcessing}
                      className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-100 text-xs font-semibold flex items-center justify-center gap-1.5 border border-slate-700 transition active:scale-95 cursor-pointer disabled:opacity-50"
                      title="編纂したページを直接印刷します"
                    >
                      <Printer className="w-4 h-4 text-blue-400 shrink-0" />
                      <span>印刷</span>
                    </button>
                  )}

                  <button
                    onClick={onExportMergedPdf}
                    disabled={isProcessing}
                    className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-extrabold text-sm flex items-center justify-center gap-2 shadow-lg shadow-emerald-600/25 transition active:scale-95 cursor-pointer disabled:opacity-50"
                  >
                    <Download className="w-4 h-4 shrink-0" />
                    <span>束ねてPDF保存 ({items.length}頁)</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    )
  }

  // ==========================================================
  // 【2】通常サイドバービュー（isMainView === false: コンパクト表示）
  // ==========================================================
  const cols = width < 320 ? 1 : width < 480 ? 2 : 3

  return (
    <aside
      style={{ width: `${width}px` }}
      className="relative shrink-0 border-l border-slate-800 bg-slate-900/90 backdrop-blur-md flex flex-col select-none shadow-2xl z-20 transition-all duration-75"
    >
      {/* リサイザーバー */}
      <div
        onPointerDown={(e) => {
          e.preventDefault()
          setIsResizing(true)
          resizeStartXRef.current = e.clientX
          resizeStartWidthRef.current = width
        }}
        onDoubleClick={() => onResizeWidth(340)}
        title="ドラッグで幅を調整 / ダブルクリックで標準幅に戻す"
        className={`absolute left-0 top-0 bottom-0 w-3.5 -ml-1.5 cursor-col-resize hover:bg-blue-500/20 transition-colors z-40 group flex items-center justify-center ${
          isResizing ? 'bg-blue-500/30' : 'bg-transparent'
        }`}
      >
        <div className="w-1 h-16 bg-slate-500/60 rounded-full group-hover:bg-blue-400 transition-all" />
      </div>

      {/* ヘッダー */}
      <div className="px-4 py-3 bg-slate-950/60 border-b border-slate-800 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Layers className="w-4 h-4 text-emerald-400" />
          <span className="text-sm font-bold text-white">作業机</span>
          <span className="text-xs font-mono text-emerald-300 bg-slate-800 px-2 py-0.2 rounded-full">
            {items.length} 頁
          </span>
        </div>
        <button
          onClick={onClose}
          className="p-1 rounded text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* サイドバー本体 */}
      <div className="flex-1 overflow-y-auto p-3">
        {items.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center p-4 text-xs text-slate-400">
            <FolderOpen className="w-10 h-10 text-slate-600 mb-2" />
            <span>作業机は空です</span>
            <span className="text-[11px] text-slate-500 mt-1">
              左のサムネイルからページを追加してください
            </span>
          </div>
        ) : (
          <div className={`grid gap-2.5 ${cols === 1 ? 'grid-cols-1' : cols === 2 ? 'grid-cols-2' : 'grid-cols-3'}`}>
            {items.map((item, idx) => {
              const thumbKey = `${item.id}_rot${item.rotation}`
              const thumbUrl = thumbnails.get(thumbKey)
              return (
                <div
                  key={item.id}
                  onClick={() => onSelectDeskItemPreview?.(item)}
                  className="bg-slate-950 border border-slate-800 rounded-xl p-2 flex flex-col gap-1 shadow cursor-pointer"
                >
                  <div className="w-full aspect-[1/1.3] bg-slate-900 rounded overflow-hidden relative flex items-center justify-center">
                    {thumbUrl ? (
                      <img src={thumbUrl} alt="" className="w-full h-full object-contain" />
                    ) : (
                      <div className="w-3 h-3 rounded-full border border-emerald-500/30 border-t-emerald-500 animate-spin" />
                    )}
                    <span className="absolute top-1 left-1 bg-black/75 text-[9px] text-emerald-300 px-1 rounded font-mono">
                      #{idx + 1}
                    </span>
                  </div>
                  <div className="text-[10px] text-slate-300 truncate">{item.docName}</div>
                  <div className="flex items-center justify-between pt-1 border-t border-slate-800">
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        onRotateItem(item.id)
                      }}
                      className="p-1 rounded hover:bg-slate-800 text-slate-300"
                    >
                      <RotateCw className="w-2.5 h-2.5 text-emerald-400" />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        onRemoveItem(item.id)
                      }}
                      className="p-1 rounded hover:bg-slate-800 text-slate-300"
                    >
                      <Trash2 className="w-2.5 h-2.5 text-rose-400" />
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* サイドバーフッター */}
      {items.length > 0 && (
        <div className="p-3 border-t border-slate-800 bg-slate-950/80 flex flex-col gap-2">
          <button
            onClick={onExportMergedPdf}
            disabled={isProcessing}
            className="w-full py-2.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 text-white text-xs font-bold flex items-center justify-center gap-1.5 shadow transition cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            <span>束ねて出力 ({items.length}頁)</span>
          </button>
        </div>
      )}
    </aside>
  )
}
