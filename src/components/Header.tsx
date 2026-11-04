import React, { useState } from 'react'
import { Eraser, Download, FileUp, ShieldCheck, Layers, Scale, X, Printer, CheckCircle2, Save, Minimize2, Sparkles, PenTool, FolderKanban, Home, ClipboardCheck } from 'lucide-react'
import { HubSignatureInfo, CompactLevel } from '../utils/mupdfService'
import { WorkspaceMode } from '../types/drawing'

function formatBytes(bytes?: number | null): string {
  if (!bytes || bytes <= 0) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
}

interface HeaderProps {
  isHomeScreen?: boolean;
  fileName: string | null;
  fileSize?: number | null;
  workspaceMode: WorkspaceMode;
  onWorkspaceModeChange: (mode: WorkspaceMode) => void;
  totalRedactions: number;
  totalDrawings?: number;
  totalReviews?: number;
  unresolvedReviews?: number;
  verifiedPageCount?: number;
  numPages?: number;
  hasOtherEdits?: boolean;
  isProcessing: boolean;
  isDeskOpen?: boolean;
  deskItemCount?: number;
  hubSignature?: HubSignatureInfo | null;
  onUploadClick: () => void;
  onSaveClick: () => void;
  onSaveDraftClick?: () => void;
  onCompactClick?: (
    level: CompactLevel,
    action: 'apply' | 'download'
  ) => Promise<{ originalSize: number; compactedSize: number; optimizedImagesCount: number } | null>;
  onPrintClick?: () => void;
  onResetClick: () => void;
  onToggleDesk?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  isHomeScreen = false,
  fileName,
  fileSize,
  workspaceMode,
  onWorkspaceModeChange,
  totalRedactions,
  totalDrawings = 0,
  totalReviews = 0,
  unresolvedReviews = 0,
  verifiedPageCount = 0,
  numPages = 0,
  hasOtherEdits = false,
  isProcessing,
  isDeskOpen = false,
  deskItemCount = 0,
  hubSignature,
  onUploadClick,
  onSaveClick,
  onSaveDraftClick,
  onCompactClick,
  onPrintClick,
  onResetClick,
  onToggleDesk,
}) => {
  const [isLicenseOpen, setIsLicenseOpen] = useState(false)
  const [isCompactOpen, setIsCompactOpen] = useState(false)
  const [compactLevel, setCompactLevel] = useState<CompactLevel>('standard')
  const [lastCompactResult, setLastCompactResult] = useState<{
    originalSize: number;
    compactedSize: number;
    optimizedImagesCount: number;
  } | null>(null)
  const totalCount = totalRedactions + totalDrawings + totalReviews
  const hasAnyEdits = totalCount > 0 || hasOtherEdits || verifiedPageCount > 0
  const saveBtnLabel = isProcessing
    ? '処理中...'
    : workspaceMode === 'review'
    ? '確定保存 (審査済)'
    : totalRedactions > 0 && totalDrawings > 0
    ? '確定保存 (墨消し・校正)'
    : totalDrawings > 0
    ? '確定保存 (校正済)'
    : totalRedactions > 0
    ? '確定保存 (完全墨消し)'
    : hasOtherEdits
    ? '確定保存 (回転・編集済)'
    : '確定保存'
  return (
    <header className="border-b border-slate-800 bg-slate-900/95 backdrop-blur-md px-4 lg:px-6 py-2.5 flex flex-wrap items-center justify-between gap-3 sticky top-0 z-30 shadow-md">
      {/* 左側: ロゴ・アプリ名・ファイル情報 */}
      <div className="flex items-center gap-3 min-w-0">
        <div
          onClick={!isHomeScreen ? onResetClick : undefined}
          title={!isHomeScreen ? '入り口（モード選択画面）へ戻る' : undefined}
          className={`p-2 bg-gradient-to-br from-blue-600 via-indigo-600 to-rose-500 rounded-xl text-white shadow-lg shadow-blue-500/25 ring-1 ring-white/20 shrink-0 ${
            !isHomeScreen ? 'cursor-pointer hover:scale-105 transition' : ''
          }`}
        >
          <Layers className="w-5 h-5" />
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h1 className="text-base lg:text-lg font-bold tracking-tight text-white truncate">
              GioV PDF Hub
            </h1>
            {!fileName && (
              <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 hidden sm:inline-flex items-center gap-1">
                <ShieldCheck className="w-3 h-3" />
                完全ローカル完結
              </span>
            )}
          </div>
          <div className="text-xs text-slate-400 flex items-center gap-1.5 truncate">
            {fileName ? (
              <>
                <span className="text-blue-300 font-medium truncate max-w-[180px] xl:max-w-[260px]" title={fileName}>
                  {fileName}
                </span>
                {fileSize && fileSize > 0 && (
                  <span className="px-1.5 py-0.2 rounded bg-slate-800 border border-slate-700 text-[10px] text-slate-300 font-mono shrink-0">
                    {formatBytes(fileSize)}
                  </span>
                )}
                {hubSignature && (
                  <span
                    onClick={() => setIsLicenseOpen(true)}
                    className="inline-flex items-center gap-1 px-1.5 py-0.2 rounded bg-emerald-950/80 border border-emerald-500/40 text-[10px] text-emerald-300 font-mono cursor-pointer hover:bg-emerald-900/80 transition shrink-0"
                    title={`GioV PDF Hub 出力検証済 (${new Date(hubSignature.timestamp).toLocaleString('ja-JP')} / ${hubSignature.operation})`}
                  >
                    <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                    <span className="hidden md:inline">Verified</span>
                  </span>
                )}
              </>
            ) : (
              <span className="truncate">目的別の4つの入り口から、迷わずシンプルにPDFを処理</span>
            )}
          </div>
        </div>
      </div>

      {/* 中央: 審査・確認モード時は専用ステータス、他モード時は4モード切替スイッチャー */}
      {!isHomeScreen && (
        workspaceMode === 'review' ? (
          <div className="flex items-center gap-2.5 px-3.5 py-1.5 rounded-xl bg-slate-950/90 border border-indigo-500/30 shadow-inner">
            <span className="flex items-center gap-1.5 text-xs font-bold text-white">
              <ClipboardCheck className="w-4 h-4 text-indigo-400" />
              <span>書類審査・校正専用ワークスペース</span>
            </span>
            {totalReviews > 0 && (
              <span
                className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                  unresolvedReviews > 0
                    ? 'bg-rose-500 text-white animate-pulse'
                    : 'bg-emerald-600 text-white'
                }`}
                title={unresolvedReviews > 0 ? `未解決指摘 ${unresolvedReviews}件` : 'すべての指摘が解決済'}
              >
                {unresolvedReviews > 0 ? `未解決 ${unresolvedReviews}件` : '全件解決済 ✓'}
              </span>
            )}
            {numPages > 0 && (
              <span className="text-[11px] font-mono text-slate-400 border-l border-slate-800 pl-2">
                確認進捗: <strong className="text-emerald-400">{verifiedPageCount}</strong>/{numPages} 頁
              </span>
            )}
          </div>
        ) : (
          <div className="flex items-center bg-slate-950 p-1 rounded-xl border border-slate-800 shadow-inner gap-1">
            <button
              onClick={() => onWorkspaceModeChange('redact')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
                workspaceMode === 'redact'
                  ? 'bg-gradient-to-r from-rose-600 to-pink-600 text-white shadow-md shadow-rose-600/30'
                  : 'text-slate-400 hover:text-white hover:bg-slate-900'
              }`}
              title="機密抹消・黒塗り/白塗りモード"
            >
              <Eraser className="w-3.5 h-3.5" />
              <span>墨消し</span>
              {totalRedactions > 0 && (
                <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-bold ${
                  workspaceMode === 'redact' ? 'bg-white text-rose-600' : 'bg-rose-500/20 text-rose-300'
                }`}>
                  {totalRedactions}
                </span>
              )}
            </button>

            <button
              onClick={() => onWorkspaceModeChange('draw')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
                workspaceMode === 'draw'
                  ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-md shadow-blue-600/30'
                  : 'text-slate-400 hover:text-white hover:bg-slate-900'
              }`}
              title="文字入力・図形・スタンプ・透明物差しによる描画・計測モード"
            >
              <PenTool className="w-3.5 h-3.5" />
              <span>描画・計測</span>
              {totalDrawings > 0 && (
                <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-bold ${
                  workspaceMode === 'draw' ? 'bg-white text-blue-600' : 'bg-blue-500/20 text-blue-300'
                }`}>
                  {totalDrawings}
                </span>
              )}
            </button>

            <button
              onClick={() => onWorkspaceModeChange('organize')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
                workspaceMode === 'organize'
                  ? 'bg-gradient-to-r from-emerald-600 to-teal-600 text-white shadow-md shadow-emerald-600/30'
                  : 'text-slate-400 hover:text-white hover:bg-slate-900'
              }`}
              title="複数PDFの結合・ページ抽出・回転・作業机によるページ整理モード"
            >
              <FolderKanban className="w-3.5 h-3.5" />
              <span>作業机・整理</span>
              {deskItemCount > 0 && (
                <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-bold ${
                  workspaceMode === 'organize' ? 'bg-white text-emerald-700' : 'bg-emerald-600 text-white'
                }`}>
                  {deskItemCount}
                </span>
              )}
            </button>

            <button
              onClick={() => onWorkspaceModeChange('optimize')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
                workspaceMode === 'optimize'
                  ? 'bg-gradient-to-r from-amber-500 to-orange-500 text-slate-950 shadow-md shadow-amber-500/30'
                  : 'text-slate-400 hover:text-amber-300 hover:bg-slate-900'
              }`}
              title="テキスト選択を維持したままファイルサイズを軽量化するモード"
            >
              <Minimize2 className="w-3.5 h-3.5" />
              <span>軽量化</span>
            </button>
          </div>
        )
      )}

      {/* 右側アクションボタン */}
      <div className="flex items-center gap-2">
        {!isHomeScreen && (
          <button
            onClick={onResetClick}
            disabled={isProcessing}
            className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium transition flex items-center gap-1.5 border border-slate-700 active:scale-95 disabled:opacity-50 cursor-pointer"
            title="現在の画面を閉じて、最初の入り口（4モード選択画面）へ戻る"
          >
            <Home className="w-3.5 h-3.5 text-slate-400" />
            <span>入り口へ</span>
          </button>
        )}

        {!isHomeScreen && (
          <button
            onClick={onUploadClick}
            disabled={isProcessing}
            className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium transition flex items-center gap-1.5 border border-slate-700 active:scale-95 shadow-sm cursor-pointer"
            title={workspaceMode === 'organize' ? 'PDFファイルを選択して作業机に追加' : 'PDFファイルを選択して開く'}
          >
            <FileUp className="w-3.5 h-3.5 text-slate-300" />
            <span>{workspaceMode === 'organize' ? 'PDFを机に追加' : fileName ? '別のPDF' : 'PDFを開く'}</span>
          </button>
        )}

        {!isHomeScreen && (workspaceMode === 'redact' || workspaceMode === 'draw') && onToggleDesk && (
          <button
            onClick={onToggleDesk}
            className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold transition flex items-center gap-1.5 border active:scale-95 cursor-pointer shadow-sm ${
              isDeskOpen
                ? 'bg-emerald-600 hover:bg-emerald-500 text-white border-emerald-400 ring-2 ring-emerald-400/30'
                : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border-slate-700'
            }`}
            title="作業机（複数PDFの束ね・編纂ドロワー）を右側からいつでも開閉できます"
          >
            <Layers className={`w-3.5 h-3.5 ${isDeskOpen ? 'text-white' : 'text-emerald-400'}`} />
            <span>作業机</span>
            {deskItemCount > 0 && (
              <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-bold ${
                isDeskOpen ? 'bg-white text-emerald-700' : 'bg-emerald-600 text-white'
              }`}>
                {deskItemCount}
              </span>
            )}
          </button>
        )}

        {fileName && workspaceMode !== 'optimize' && workspaceMode !== 'organize' && onPrintClick && (
          <button
            onClick={onPrintClick}
            disabled={isProcessing}
            className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold transition flex items-center gap-1.5 border border-slate-700 active:scale-95 shadow-sm cursor-pointer disabled:opacity-50"
            title="現在の編集内容（墨消し・校正・回転）を反映して直接プリンターで印刷します"
          >
            <Printer className="w-3.5 h-3.5 text-blue-400" />
            <span className="hidden lg:inline">印刷</span>
          </button>
        )}

        {fileName && workspaceMode !== 'optimize' && workspaceMode !== 'organize' && onSaveDraftClick && (
          <button
            onClick={onSaveDraftClick}
            disabled={isProcessing}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition flex items-center gap-1.5 border active:scale-95 shadow-sm cursor-pointer disabled:opacity-50 ${
              hasAnyEdits
                ? 'bg-indigo-950/90 hover:bg-indigo-900 text-indigo-200 border-indigo-500/60 ring-1 ring-indigo-400/30'
                : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border-slate-700'
            }`}
            title="物理切除を行わずに一時保存します。後からこのアプリで開くとすべての墨消し枠・注記・図形を再編集できます"
          >
            <Save className="w-3.5 h-3.5 text-indigo-400" />
            <span>一時保存</span>
          </button>
        )}

        {fileName && workspaceMode !== 'optimize' && workspaceMode !== 'organize' && (
          <button
            onClick={onSaveClick}
            disabled={isProcessing}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 shadow-lg active:scale-95 ${
              hasAnyEdits
                ? 'bg-gradient-to-r from-rose-600 to-pink-600 hover:from-rose-500 hover:to-pink-500 text-white shadow-rose-600/30 ring-1 ring-rose-400/50 cursor-pointer'
                : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 cursor-pointer'
            }`}
            title={!hasAnyEdits ? '現在のPDFを保存します' : '指定箇所のテキスト・画像を物理切除し、編集内容を確定保存します（不可逆）'}
          >
            <Download className={`w-3.5 h-3.5 ${isProcessing ? 'animate-bounce' : ''}`} />
            <span>{saveBtnLabel}</span>
          </button>
        )}

        <button
          onClick={() => setIsLicenseOpen(true)}
          className="p-1.5 rounded-lg bg-slate-800/80 hover:bg-slate-700 text-slate-400 hover:text-slate-200 border border-slate-700/80 transition cursor-pointer"
          title="オープンソースライセンス・著作権情報 (AGPL-3.0)"
        >
          <Scale className="w-4 h-4" />
        </button>
      </div>

      {/* PDF軽量化（コンパクト保存）モーダル */}
      {isCompactOpen && onCompactClick && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4"
          onClick={() => !isProcessing && setIsCompactOpen(false)}
        >
          <div
            className="bg-slate-900 border border-slate-700 rounded-2xl max-w-lg w-full p-6 shadow-2xl text-slate-200 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <Minimize2 className="w-5 h-5 text-amber-400" />
                <h2 className="text-base font-bold text-white">
                  PDF軽量化・コンパクト保存（テキスト選択100%維持）
                </h2>
              </div>
              <button
                onClick={() => setIsCompactOpen(false)}
                disabled={isProcessing}
                className="p-1 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="text-xs text-slate-300 space-y-3">
              <div className="p-3 rounded-xl bg-blue-950/50 border border-blue-500/30 flex items-start gap-2.5">
                <Sparkles className="w-4 h-4 text-blue-400 shrink-0 mt-0.5" />
                <div className="leading-relaxed">
                  <span className="font-bold text-blue-200">テキスト・ベクター図面は無劣化で保持：</span>
                  ページ全体を画像化するのではなく、PDF内の<strong>埋め込み画像（XObject）と不要な構造ゴミだけをピンポイント圧縮</strong>するため、軽量化後も<strong>文字の選択・コピー・検索は100%そのまま可能</strong>です。
                </div>
              </div>

              {fileSize && (
                <div className="flex items-center justify-between px-3 py-2 rounded-lg bg-slate-950 border border-slate-800">
                  <span className="text-slate-400">現在のファイルサイズ:</span>
                  <span className="font-mono font-bold text-sm text-white">
                    {formatBytes(fileSize)}
                  </span>
                </div>
              )}

              <div className="space-y-2">
                <div className="font-semibold text-slate-200">圧縮レベルの選択:</div>

                <label
                  onClick={() => setCompactLevel('standard')}
                  className={`block p-3 rounded-xl border cursor-pointer transition ${
                    compactLevel === 'standard'
                      ? 'bg-amber-500/10 border-amber-500/60 ring-1 ring-amber-400/30'
                      : 'bg-slate-800/40 border-slate-700/70 hover:bg-slate-800/70'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-white flex items-center gap-1.5">
                      <input
                        type="radio"
                        checked={compactLevel === 'standard'}
                        onChange={() => setCompactLevel('standard')}
                        className="accent-amber-400"
                      />
                      標準（推奨：画質とサイズの最適バランス）
                    </span>
                    <span className="text-[10px] px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 font-semibold">
                      おすすめ
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-400 mt-1 pl-5">
                    テキスト・線画は100%無劣化。埋め込み写真・画像のみ長辺最大 1600px / JPEG品質 75% に最適化し、未参照ゴミデータを完全除去します。
                  </p>
                </label>

                <label
                  onClick={() => setCompactLevel('high')}
                  className={`block p-3 rounded-xl border cursor-pointer transition ${
                    compactLevel === 'high'
                      ? 'bg-amber-500/10 border-amber-500/60 ring-1 ring-amber-400/30'
                      : 'bg-slate-800/40 border-slate-700/70 hover:bg-slate-800/70'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-white flex items-center gap-1.5">
                      <input
                        type="radio"
                        checked={compactLevel === 'high'}
                        onChange={() => setCompactLevel('high')}
                        className="accent-amber-400"
                      />
                      高圧縮（メール添付・容量制限対策）
                    </span>
                    <span className="text-[10px] px-2 py-0.5 rounded bg-rose-500/20 text-rose-300 font-semibold">
                      最小サイズ
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-400 mt-1 pl-5">
                    テキスト・線画は100%無劣化。埋め込み写真・画像を長辺最大 1200px / JPEG品質 55% に高圧縮し、ファイルサイズを劇的に削減します。
                  </p>
                </label>

                <label
                  onClick={() => setCompactLevel('lossless')}
                  className={`block p-3 rounded-xl border cursor-pointer transition ${
                    compactLevel === 'lossless'
                      ? 'bg-amber-500/10 border-amber-500/60 ring-1 ring-amber-400/30'
                      : 'bg-slate-800/40 border-slate-700/70 hover:bg-slate-800/70'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-white flex items-center gap-1.5">
                      <input
                        type="radio"
                        checked={compactLevel === 'lossless'}
                        onChange={() => setCompactLevel('lossless')}
                        className="accent-amber-400"
                      />
                      ロスレス（画像も無劣化・構造クリーンアップのみ）
                    </span>
                    <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 font-semibold">
                      完全無劣化
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-400 mt-1 pl-5">
                    画像の画質も一切変更せず、PDF内部に残った不要データ・重複オブジェクトの掃除とストリーム圧縮のみを行います。
                  </p>
                </label>
              </div>

              {lastCompactResult && (
                <div className="p-3 rounded-xl bg-emerald-950/70 border border-emerald-500/50 text-emerald-200 space-y-1">
                  <div className="font-bold text-emerald-300 flex items-center justify-between">
                    <span>
                      ✨ 軽量化結果:{' '}
                      {formatBytes(lastCompactResult.originalSize)} →{' '}
                      {formatBytes(lastCompactResult.compactedSize)}
                    </span>
                    <span className="px-2 py-0.5 rounded bg-emerald-500/30 text-emerald-200 font-mono text-xs">
                      {lastCompactResult.compactedSize < lastCompactResult.originalSize
                        ? `▲ ${Math.round(
                            ((lastCompactResult.originalSize - lastCompactResult.compactedSize) /
                              lastCompactResult.originalSize) *
                              100
                          )}% 削減`
                        : '最適化済'}
                    </span>
                  </div>
                  <div className="text-[11px] text-emerald-300/80">
                    ・最適化された埋め込み画像: {lastCompactResult.optimizedImagesCount} 件 ／ テキスト選択100%維持
                  </div>
                </div>
              )}
            </div>

            <div className="flex flex-wrap items-center justify-end gap-2.5 pt-3 border-t border-slate-800">
              <button
                onClick={async () => {
                  const res = await onCompactClick(compactLevel, 'apply')
                  if (res) setLastCompactResult(res)
                }}
                disabled={isProcessing}
                className="px-3.5 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-amber-300 border border-amber-500/40 text-xs font-bold transition cursor-pointer disabled:opacity-50"
                title="現在開いている作業用PDFデータを軽量化し、編集をそのまま続けます"
              >
                ✨ 作業画面のデータに反映
              </button>
              <button
                onClick={async () => {
                  const res = await onCompactClick(compactLevel, 'download')
                  if (res) setLastCompactResult(res)
                }}
                disabled={isProcessing}
                className="px-4 py-2 rounded-lg bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-slate-950 text-xs font-bold transition shadow-lg shadow-amber-500/20 cursor-pointer flex items-center gap-1.5 disabled:opacity-50"
              >
                <Download className="w-4 h-4" />
                <span>軽量化PDFをファイル保存</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ライセンス＆著作権情報モーダル (AGPL-3.0 / OSS 準拠表記) */}
      {isLicenseOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4"
          onClick={() => setIsLicenseOpen(false)}
        >
          <div
            className="bg-slate-900 border border-slate-700 rounded-2xl max-w-lg w-full p-6 shadow-2xl text-slate-200 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <Scale className="w-5 h-5 text-blue-400" />
                <h2 className="text-base font-bold text-white">
                  ライセンス・著作権情報 (Open Source Notices)
                </h2>
              </div>
              <button
                onClick={() => setIsLicenseOpen(false)}
                className="p-1 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="text-xs leading-relaxed text-slate-300 space-y-3 max-h-[65vh] overflow-y-auto pr-1">
              {hubSignature && (
                <div className="p-3 rounded-xl bg-emerald-950/60 border border-emerald-500/40 text-emerald-200 space-y-1">
                  <div className="font-bold text-emerald-300 flex items-center gap-1.5">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                    <span>出力証明（ステルス刻印）検証結果：本アプリ出力ファイル</span>
                  </div>
                  <div className="text-[11px] text-emerald-300/90 font-mono pl-5 space-y-0.5">
                    <div>・出力日時: {new Date(hubSignature.timestamp).toLocaleString('ja-JP')}</div>
                    <div>・処理種別: {hubSignature.operation}</div>
                    <div>・エンジン: GioV PDF Hub v{hubSignature.version}</div>
                  </div>
                </div>
              )}

              <div className="p-3 rounded-xl bg-slate-950/80 border border-slate-800">
                <div className="font-bold text-white mb-1">
                  GioV PDF Hub — Open Source Edition
                </div>
                <p className="text-slate-400">
                  本アプリケーションは、端末内（ブラウザ内のWebAssembly）のみで完全ローカル動作するオープンソースソフトウェアであり、<strong>GNU Affero General Public License v3.0 or later (AGPL-3.0-or-later)</strong> の下で提供されています。入力されたPDFデータが外部サーバーへ送信されることは一切ありません。
                </p>
              </div>

              <div className="space-y-2">
                <div className="font-semibold text-slate-200">
                  同梱・使用しているオープンソースライブラリ:
                </div>

                <div className="p-2.5 rounded-lg bg-slate-800/50 border border-slate-700/60">
                  <div className="flex items-center justify-between font-semibold text-white">
                    <span>MuPDF (mupdf.js)</span>
                    <span className="text-[10px] px-2 py-0.5 rounded bg-blue-500/20 text-blue-300 border border-blue-500/30 font-mono">
                      AGPL-3.0-or-later
                    </span>
                  </div>
                  <div className="text-[11px] text-slate-400 mt-1">
                    Copyright (C) 2006-2026 Artifex Software, Inc.<br />
                    This program is free software: you can redistribute it and/or modify it under the terms of the GNU Affero General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.
                  </div>
                </div>

                <div className="p-2.5 rounded-lg bg-slate-800/50 border border-slate-700/60">
                  <div className="flex items-center justify-between font-semibold text-white">
                    <span>React / React DOM</span>
                    <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 font-mono">
                      MIT License
                    </span>
                  </div>
                  <div className="text-[11px] text-slate-400 mt-1">
                    Copyright (c) Meta Platforms, Inc. and affiliates.
                  </div>
                </div>

                <div className="p-2.5 rounded-lg bg-slate-800/50 border border-slate-700/60">
                  <div className="flex items-center justify-between font-semibold text-white">
                    <span>Lucide Icons (lucide-react)</span>
                    <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 font-mono">
                      ISC License
                    </span>
                  </div>
                  <div className="text-[11px] text-slate-400 mt-1">
                    Copyright (c) Cole Bemis and Lucide Contributors.
                  </div>
                </div>

                <div className="p-2.5 rounded-lg bg-slate-800/50 border border-slate-700/60">
                  <div className="flex items-center justify-between font-semibold text-white">
                    <span>Tailwind CSS</span>
                    <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 font-mono">
                      MIT License
                    </span>
                  </div>
                  <div className="text-[11px] text-slate-400 mt-1">
                    Copyright (c) Tailwind Labs, Inc.
                  </div>
                </div>
              </div>
            </div>

            <div className="flex justify-end pt-2 border-t border-slate-800">
              <button
                onClick={() => setIsLicenseOpen(false)}
                className="px-4 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold transition cursor-pointer"
              >
                閉じる
              </button>
            </div>
          </div>
        </div>
      )}
    </header>
  )
}
