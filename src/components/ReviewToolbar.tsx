import React from 'react'
import {
  ChevronLeft,
  ChevronRight,
  ZoomIn,
  ZoomOut,
  Maximize2,
  PanelRightOpen,
  PanelRightClose,
  FileCheck,
  StickyNote,
  Highlighter,
  Strikethrough,
  Underline,
  Square,
  MousePointer,
  Hand,
} from 'lucide-react'
import { ReviewTool, ReviewMarkType } from '../types/drawing'

interface ReviewToolbarProps {
  currentPage: number
  numPages: number
  zoom: number
  activeTool: ReviewTool
  onToolChange: (tool: ReviewTool) => void
  onPageChange: (newPage: number) => void
  onZoomChange: (newZoom: number) => void
  onResetView?: () => void
  onFitToWindow?: () => void
  // 審査進捗
  isCurrentPageVerified: boolean
  onToggleCurrentPageVerified: () => void
  verifiedPageCount: number
  totalCommentsCount: number
  unresolvedCount: number
  // 右サイドバー開閉
  isSidebarOpen: boolean
  onToggleSidebar: () => void
}

export const ReviewToolbar: React.FC<ReviewToolbarProps> = ({
  currentPage,
  numPages,
  zoom,
  activeTool,
  onToolChange,
  onPageChange,
  onZoomChange,
  onFitToWindow,
  isCurrentPageVerified,
  onToggleCurrentPageVerified,
  totalCommentsCount,
  unresolvedCount,
  isSidebarOpen,
  onToggleSidebar,
}) => {
  return (
    <div className="bg-slate-900/95 border-b border-slate-800 px-3 py-2 flex flex-wrap items-center justify-between gap-2 shadow-md z-20 text-xs select-none">
      {/* 左ブロック: ページナビゲーション & ズーム */}
      <div className="flex items-center gap-1.5 flex-wrap">
        {/* ページ送り */}
        <div className="flex items-center bg-slate-950 p-1 rounded-lg border border-slate-800">
          <button
            onClick={() => onPageChange(Math.max(0, currentPage - 1))}
            disabled={currentPage <= 0}
            className="p-1 rounded text-slate-400 hover:text-white hover:bg-slate-800 disabled:opacity-30 disabled:hover:bg-transparent cursor-pointer"
            title="前のページ"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className="px-2 font-mono font-bold text-slate-200 text-xs">
            {currentPage + 1} / {numPages}
          </span>
          <button
            onClick={() => onPageChange(Math.min(numPages - 1, currentPage + 1))}
            disabled={currentPage >= numPages - 1}
            className="p-1 rounded text-slate-400 hover:text-white hover:bg-slate-800 disabled:opacity-30 disabled:hover:bg-transparent cursor-pointer"
            title="次のページ"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>

        {/* ズーム */}
        <div className="flex items-center bg-slate-950 p-1 rounded-lg border border-slate-800">
          <button
            onClick={() => onZoomChange(Math.max(0.3, zoom - 0.15))}
            className="p-1 rounded text-slate-400 hover:text-white hover:bg-slate-800 cursor-pointer"
            title="縮小"
          >
            <ZoomOut className="w-4 h-4" />
          </button>
          <span className="px-2 font-mono text-slate-300 min-w-[48px] text-center">
            {Math.round(zoom * 100)}%
          </span>
          <button
            onClick={() => onZoomChange(Math.min(3.0, zoom + 0.15))}
            className="p-1 rounded text-slate-400 hover:text-white hover:bg-slate-800 cursor-pointer"
            title="拡大"
          >
            <ZoomIn className="w-4 h-4" />
          </button>
          {onFitToWindow && (
            <button
              onClick={onFitToWindow}
              className="p-1 ml-1 rounded text-slate-400 hover:text-indigo-400 hover:bg-slate-800 cursor-pointer"
              title="ウィンドウ幅に合わせる"
            >
              <Maximize2 className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* 中央ブロック: 📑 指摘付箋 ＆ 4大テキストマークアップ（マーカー・取り消し線・下線・囲み枠） */}
      <div className="flex items-center gap-1.5 flex-wrap">
        {/* 指摘付箋 (Sticky Note) */}
        <button
          onClick={() => onToolChange(activeTool === 'pin' ? 'select' : 'pin')}
          className={`px-3 py-1.5 rounded-lg font-bold flex items-center gap-1.5 transition cursor-pointer shadow-sm ${
            activeTool === 'pin'
              ? 'bg-gradient-to-r from-amber-500 to-yellow-500 text-slate-950 ring-2 ring-yellow-400/50'
              : 'bg-slate-800/90 text-amber-300 border border-amber-500/30 hover:bg-amber-950/40'
          }`}
          title="クリックした位置に淡色パステル付箋（メモ欄付き）を配置します"
        >
          <StickyNote className="w-3.5 h-3.5" />
          <span>📑 指摘付箋</span>
        </button>

        {/* テキストマークアップ・パレット */}
        <div className="flex items-center bg-slate-950 p-1 rounded-lg border border-slate-800 gap-1">
          {/* 🖍️ マーカー (半透明蛍光ペン) */}
          <button
            onClick={() => onToolChange(activeTool === 'highlight' ? 'select' : 'highlight')}
            className={`px-2.5 py-1 rounded text-xs font-bold flex items-center gap-1.5 transition cursor-pointer ${
              activeTool === 'highlight'
                ? 'bg-amber-400 text-slate-950 shadow-sm font-extrabold ring-1 ring-amber-300'
                : 'text-amber-300 hover:bg-slate-800'
            }`}
            title="ドラッグして文字や図面に半透明の蛍光マーカーを引きます（下の文字が綺麗に透けます）"
          >
            <Highlighter className="w-3.5 h-3.5" />
            <span>マーカー</span>
          </button>

          {/* ̶S̶ 取り消し線 (ストライクスルー) */}
          <button
            onClick={() => onToolChange(activeTool === 'strike' ? 'select' : 'strike')}
            className={`px-2.5 py-1 rounded text-xs font-bold flex items-center gap-1.5 transition cursor-pointer ${
              activeTool === 'strike'
                ? 'bg-rose-600 text-white shadow-sm ring-1 ring-rose-400'
                : 'text-rose-400 hover:bg-slate-800'
            }`}
            title="ドラッグして誤字や不要な文字・数値の中央に取り消し線を引きます"
          >
            <Strikethrough className="w-3.5 h-3.5" />
            <span>取り消し線</span>
          </button>

          {/* <u>U</u> 下線 (アンダーライン) */}
          <button
            onClick={() => onToolChange(activeTool === 'underline' ? 'select' : 'underline')}
            className={`px-2.5 py-1 rounded text-xs font-bold flex items-center gap-1.5 transition cursor-pointer ${
              activeTool === 'underline'
                ? 'bg-blue-600 text-white shadow-sm ring-1 ring-blue-400'
                : 'text-blue-400 hover:bg-slate-800'
            }`}
            title="ドラッグして注目箇所や確認したい文字・数値の下にアンダーラインを引きます"
          >
            <Underline className="w-3.5 h-3.5" />
            <span>下線</span>
          </button>

          {/* ▢ 囲み枠 (四角・注目エリア囲み) */}
          <button
            onClick={() => onToolChange(activeTool === 'box' ? 'select' : 'box')}
            className={`px-2.5 py-1 rounded text-xs font-bold flex items-center gap-1.5 transition cursor-pointer ${
              activeTool === 'box'
                ? 'bg-indigo-600 text-white shadow-sm ring-1 ring-indigo-400'
                : 'text-indigo-400 hover:bg-slate-800'
            }`}
            title="ドラッグして図面の一角や注目テキストを四角い枠で囲みます"
          >
            <Square className="w-3.5 h-3.5" />
            <span>囲み枠</span>
          </button>
        </div>

        {/* 選択 & 手のひら */}
        <div className="flex items-center bg-slate-950 p-1 rounded-lg border border-slate-800 gap-1">
          <button
            onClick={() => onToolChange('select')}
            className={`p-1.5 rounded transition cursor-pointer ${
              activeTool === 'select'
                ? 'bg-slate-700 text-white'
                : 'text-slate-400 hover:text-white hover:bg-slate-800'
            }`}
            title="マーカーや枠線、付箋をクリックして選択・削除（Deleteキーで削除）"
          >
            <MousePointer className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => onToolChange('pan')}
            className={`p-1.5 rounded transition cursor-pointer ${
              activeTool === 'pan'
                ? 'bg-slate-700 text-white'
                : 'text-slate-400 hover:text-white hover:bg-slate-800'
            }`}
            title="手のひらツール（用紙をドラッグしてスクロール移動、Space長押しでも可能）"
          >
            <Hand className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* 右ブロック: ページ確認済トグル & 指摘一覧パネル開閉 */}
      <div className="flex items-center gap-2">
        {/* ページ確認済チェックトグル */}
        <button
          onClick={onToggleCurrentPageVerified}
          className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition cursor-pointer active:scale-95 shadow-sm ${
            isCurrentPageVerified
              ? 'bg-emerald-600 hover:bg-emerald-500 text-white ring-1 ring-emerald-400'
              : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700'
          }`}
          title="このページの審査・確認が完了したことをマークします"
        >
          <FileCheck className={`w-4 h-4 ${isCurrentPageVerified ? 'text-white' : 'text-emerald-400'}`} />
          <span>{isCurrentPageVerified ? '✓ 現ページ確認済' : '現ページを確認済みにする'}</span>
        </button>

        {/* 指摘一覧パネル開閉ボタン */}
        <button
          onClick={onToggleSidebar}
          className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition cursor-pointer ${
            isSidebarOpen
              ? 'bg-indigo-600 text-white shadow-sm'
              : 'bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700'
          }`}
          title="指摘一覧・審査進捗パネルを開閉"
        >
          {isSidebarOpen ? (
            <PanelRightClose className="w-4 h-4 text-white" />
          ) : (
            <PanelRightOpen className="w-4 h-4 text-indigo-400" />
          )}
          <span>指摘一覧</span>
          {totalCommentsCount > 0 && (
            <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-bold ${
              unresolvedCount > 0 ? 'bg-rose-500 text-white animate-pulse' : 'bg-slate-700 text-slate-200'
            }`}>
              {unresolvedCount > 0 ? `${unresolvedCount}件 未解決` : '全解決'}
            </span>
          )}
        </button>
      </div>
    </div>
  )
}
