import React, { useState } from 'react'
import {
  X,
  MapPin,
  CheckCircle2,
  Clock,
  Trash2,
  Edit2,
  Check,
  FileCheck,
  AlertCircle
} from 'lucide-react'
import { ReviewComment, ReviewCommentColor, STICKY_NOTE_COLORS } from '../types/drawing'

interface ReviewSidebarProps {
  isOpen: boolean
  onClose: () => void
  comments: ReviewComment[]
  verifiedPages: Set<number>
  numPages: number
  currentPage: number
  onPageChange: (page: number) => void
  onToggleCommentStatus: (id: string) => void
  onUpdateCommentText: (id: string, text: string) => void
  onDeleteComment: (id: string) => void
  selectedCommentId?: string | null
  onSelectComment?: (id: string) => void
}

export const ReviewSidebar: React.FC<ReviewSidebarProps> = ({
  isOpen,
  onClose,
  comments,
  verifiedPages,
  numPages,
  currentPage,
  onPageChange,
  onToggleCommentStatus,
  onUpdateCommentText,
  onDeleteComment,
  selectedCommentId,
  onSelectComment,
}) => {
  const [filter, setFilter] = useState<'all' | 'unresolved' | 'resolved'>('all')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingText, setEditingText] = useState<string>('')

  if (!isOpen) return null

  // フィルタリング
  const filteredComments = comments.filter((c) => {
    if (filter === 'unresolved') return c.status === 'unresolved'
    if (filter === 'resolved') return c.status === 'resolved'
    return true
  })

  // 統計
  const unresolvedCount = comments.filter((c) => c.status === 'unresolved').length
  const resolvedCount = comments.filter((c) => c.status === 'resolved').length
  const verifiedCount = verifiedPages.size
  const progressPercent = numPages > 0 ? Math.round((verifiedCount / numPages) * 100) : 0

  const handleStartEdit = (comment: ReviewComment) => {
    setEditingId(comment.id)
    setEditingText(comment.text)
  }

  const handleSaveEdit = (id: string) => {
    if (editingText.trim()) {
      onUpdateCommentText(id, editingText.trim())
    }
    setEditingId(null)
  }

  return (
    <div className="w-80 md:w-96 bg-slate-900 border-l border-slate-800 flex flex-col h-full z-20 shadow-2xl flex-none select-none text-xs text-slate-200">
      {/* パネルヘッダー */}
      <div className="p-3.5 border-b border-slate-800 bg-slate-950 flex items-center justify-between flex-none">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-lg bg-indigo-600/30 border border-indigo-500/40 text-indigo-400 flex items-center justify-center">
            <MapPin className="w-3.5 h-3.5" />
          </div>
          <div>
            <h2 className="font-bold text-white text-sm">審査・指摘一覧</h2>
            <p className="text-[10px] text-slate-400">書類の確認進捗と指摘メモ</p>
          </div>
        </div>
        <button
          onClick={onClose}
          className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
          title="パネルを閉じる"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* 審査進捗サマリーカード */}
      <div className="p-3 bg-slate-900/90 border-b border-slate-800 space-y-2 flex-none">
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-semibold text-slate-300 flex items-center gap-1.5">
            <FileCheck className="w-3.5 h-3.5 text-emerald-400" />
            <span>ページ確認進捗</span>
          </span>
          <span className="font-mono font-bold text-emerald-400">
            {verifiedCount} / {numPages} 頁 ({progressPercent}%)
          </span>
        </div>
        {/* プログレスバー */}
        <div className="w-full bg-slate-950 h-2 rounded-full overflow-hidden border border-slate-800">
          <div
            className="bg-gradient-to-r from-emerald-500 to-teal-400 h-full transition-all duration-300 rounded-full"
            style={{ width: `${progressPercent}%` }}
          />
        </div>

        {/* 指摘件数バッジ */}
        <div className="grid grid-cols-2 gap-2 pt-1 text-[11px]">
          <div className="p-2 rounded-lg bg-rose-950/30 border border-rose-500/30 flex items-center justify-between">
            <span className="text-rose-300 font-medium">未解決指摘</span>
            <span className="font-mono font-bold text-rose-400 text-sm">{unresolvedCount}</span>
          </div>
          <div className="p-2 rounded-lg bg-emerald-950/30 border border-emerald-500/30 flex items-center justify-between">
            <span className="text-emerald-300 font-medium">解決済 (OK)</span>
            <span className="font-mono font-bold text-emerald-400 text-sm">{resolvedCount}</span>
          </div>
        </div>
      </div>

      {/* フィルタタブ */}
      <div className="px-3 py-2 bg-slate-950/80 border-b border-slate-800 flex items-center gap-1 flex-none">
        <button
          onClick={() => setFilter('all')}
          className={`flex-1 py-1 rounded text-[11px] font-bold transition cursor-pointer ${
            filter === 'all'
              ? 'bg-slate-800 text-white shadow-xs'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          すべて ({comments.length})
        </button>
        <button
          onClick={() => setFilter('unresolved')}
          className={`flex-1 py-1 rounded text-[11px] font-bold transition cursor-pointer ${
            filter === 'unresolved'
              ? 'bg-rose-950/70 text-rose-300 border border-rose-500/40 shadow-xs'
              : 'text-slate-400 hover:text-rose-300'
          }`}
        >
          未解決 ({unresolvedCount})
        </button>
        <button
          onClick={() => setFilter('resolved')}
          className={`flex-1 py-1 rounded text-[11px] font-bold transition cursor-pointer ${
            filter === 'resolved'
              ? 'bg-emerald-950/70 text-emerald-300 border border-emerald-500/40 shadow-xs'
              : 'text-slate-400 hover:text-emerald-300'
          }`}
        >
          解決済 ({resolvedCount})
        </button>
      </div>

      {/* 指摘カードリスト */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2.5">
        {filteredComments.length === 0 ? (
          <div className="text-center py-12 px-4 text-slate-500 space-y-2">
            <div className="w-12 h-12 rounded-full bg-slate-800/50 flex items-center justify-center mx-auto text-slate-600">
              <CheckCircle2 className="w-6 h-6" />
            </div>
            <p className="font-bold text-xs text-slate-400">
              {filter === 'unresolved'
                ? '未解決の指摘はありません'
                : filter === 'resolved'
                ? '解決済みの指摘はありません'
                : '指摘ピンがまだありません'}
            </p>
            <p className="text-[11px] text-slate-500 leading-relaxed">
              上部ツールバーの「📑 指摘付箋」または校正記号を選択し、書類上の気になる箇所をクリック・ドラッグすると指摘や校正を追加できます。
            </p>
          </div>
        ) : (
          filteredComments.map((comment) => {
            const isSelected = selectedCommentId === comment.id
            const isEditing = editingId === comment.id
            const isResolved = comment.status === 'resolved'
            const noteColor: ReviewCommentColor = comment.color || 'yellow'
            const styleDef = STICKY_NOTE_COLORS[noteColor]

            return (
              <div
                key={comment.id}
                onClick={() => {
                  onPageChange(comment.pageIndex)
                  onSelectComment?.(comment.id)
                }}
                style={{
                  borderLeftColor: styleDef.hexDot,
                  borderLeftWidth: '4px',
                }}
                className={`p-3 rounded-xl border transition cursor-pointer group relative ${
                  isSelected
                    ? 'bg-slate-800/95 border-indigo-400 shadow-md ring-1 ring-indigo-500/40'
                    : isResolved
                    ? 'bg-slate-900/50 border-slate-800/80 hover:border-slate-700 opacity-75'
                    : 'bg-slate-900/90 border-slate-800 hover:border-slate-700 shadow-xs'
                }`}
              >
                {/* カード上部: 番号 ＆ ページ ＆ 付箋カラー ＆ ステータス */}
                <div className="flex items-center justify-between mb-1.5">
                  <div className="flex items-center gap-1.5">
                    <span
                      className="w-5 h-5 rounded-full flex items-center justify-center font-bold text-[10px] text-white shadow-xs"
                      style={{ backgroundColor: styleDef.hexDot }}
                    >
                      {comment.number}
                    </span>
                    <span className="font-mono font-bold text-slate-300 text-[11px]">
                      p.{comment.pageIndex + 1}
                    </span>
                    <span
                      className="text-[9px] px-1.5 py-0.2 rounded font-medium border"
                      style={{
                        backgroundColor: `${styleDef.hexBg}20`,
                        color: styleDef.hexDot,
                        borderColor: `${styleDef.hexBorder}40`,
                      }}
                    >
                      {styleDef.name.split(' ')[0]}
                    </span>
                    {comment.pageIndex === currentPage && (
                      <span className="text-[9px] px-1.5 py-0.2 rounded bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 font-medium">
                        表示中
                      </span>
                    )}
                  </div>

                  {/* 未解決 / 解決済 切替スイッチ */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      onToggleCommentStatus(comment.id)
                    }}
                    className={`px-2 py-0.5 rounded text-[10px] font-bold flex items-center gap-1 transition cursor-pointer ${
                      isResolved
                        ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 hover:bg-emerald-500/30'
                        : 'bg-rose-500/20 text-rose-300 border border-rose-500/30 hover:bg-rose-500/30'
                    }`}
                    title={isResolved ? '未解決に戻す' : '解決済みにする'}
                  >
                    {isResolved ? (
                      <>
                        <Check className="w-3 h-3 text-emerald-400" />
                        <span>解決済 (OK)</span>
                      </>
                    ) : (
                      <>
                        <AlertCircle className="w-3 h-3 text-rose-400" />
                        <span>要対応</span>
                      </>
                    )}
                  </button>
                </div>

                {/* 指摘本文 */}
                {isEditing ? (
                  <div className="mt-2 space-y-1.5" onClick={(e) => e.stopPropagation()}>
                    <textarea
                      value={editingText}
                      onChange={(e) => setEditingText(e.target.value)}
                      className="w-full p-2 bg-slate-950 border border-slate-700 rounded-lg text-white text-xs focus:border-indigo-500 focus:outline-hidden resize-none"
                      rows={3}
                      autoFocus
                    />
                    <div className="flex justify-end gap-1.5">
                      <button
                        onClick={() => setEditingId(null)}
                        className="px-2 py-1 rounded text-[10px] text-slate-400 hover:text-white"
                      >
                        キャンセル
                      </button>
                      <button
                        onClick={() => handleSaveEdit(comment.id)}
                        className="px-2.5 py-1 rounded bg-indigo-600 hover:bg-indigo-500 text-white text-[10px] font-bold"
                      >
                        保存
                      </button>
                    </div>
                  </div>
                ) : (
                  <p
                    className={`text-xs leading-relaxed whitespace-pre-wrap break-words ${
                      isResolved ? 'text-slate-400 line-through' : 'text-slate-200'
                    }`}
                  >
                    {comment.text}
                  </p>
                )}

                {/* カードフッター */}
                <div className="mt-2 pt-2 border-t border-slate-800/80 flex items-center justify-between text-[10px] text-slate-500">
                  <span className="flex items-center gap-1 font-mono">
                    <Clock className="w-3 h-3" />
                    {new Date(comment.createdAt).toLocaleTimeString('ja-JP', {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </span>

                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition">
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        handleStartEdit(comment)
                      }}
                      className="p-1 rounded hover:bg-slate-800 text-slate-400 hover:text-slate-200"
                      title="指摘内容を編集"
                    >
                      <Edit2 className="w-3 h-3" />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        if (window.confirm(`指摘 ①「${comment.text.slice(0, 15)}...」を削除しますか？`)) {
                          onDeleteComment(comment.id)
                        }
                      }}
                      className="p-1 rounded hover:bg-rose-950/50 text-slate-400 hover:text-rose-400"
                      title="指摘を削除"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}

