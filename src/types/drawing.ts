export type AppMode = 'eraser' | 'draw'

export type WorkspaceMode = 'redact' | 'draw' | 'organize' | 'optimize' | 'review'

export type RulerMeasureMode = 'distance' | 'area'

// 審査・校正（Review / Audit）用型定義
export type ReviewMarkType =
  | 'highlight' // 🖍️ マーカー (半透明蛍光ペン)
  | 'strike' // ̶S̶ 取り消し線 (ストライクスルー)
  | 'underline' // <u>U</u> 下線 (アンダーライン)
  | 'box' // ▢ 囲み枠 (四角・注目エリア囲み)

export type ReviewTool =
  | 'pin' // 📑 指摘付箋
  | ReviewMarkType
  | 'select' // ↖ 選択
  | 'pan' // ✋ 手のひら

// 後方互換エイリアス
export type ProofreadingMarkType = ReviewMarkType;
export type ProofreadingMark = ReviewMark;

// 付箋（Sticky Note）の淡いパステルカラー定義
export type ReviewCommentColor = 'yellow' | 'pink' | 'blue' | 'green' | 'purple' | 'orange'

export interface StickyNoteStyleDef {
  name: string
  label: string
  bgClass: string
  borderClass: string
  headerBgClass: string
  textClass: string
  badgeBgClass: string
  dotBgClass: string
  hexBg: string
  hexBorder: string
  hexText: string
  hexDot: string
}

export const STICKY_NOTE_COLORS: Record<ReviewCommentColor, StickyNoteStyleDef> = {
  yellow: {
    name: 'イエロー (確認)',
    label: '通常・確認メモ',
    bgClass: 'bg-amber-50',
    borderClass: 'border-amber-300',
    headerBgClass: 'bg-amber-100/90',
    textClass: 'text-amber-950',
    badgeBgClass: 'bg-amber-500',
    dotBgClass: 'bg-amber-300',
    hexBg: '#fefce8',
    hexBorder: '#fde047',
    hexText: '#713f12',
    hexDot: '#eab308',
  },
  pink: {
    name: 'ピンク (要修正)',
    label: '重要指摘・不整合',
    bgClass: 'bg-rose-50',
    borderClass: 'border-rose-300',
    headerBgClass: 'bg-rose-100/90',
    textClass: 'text-rose-950',
    badgeBgClass: 'bg-rose-500',
    dotBgClass: 'bg-rose-300',
    hexBg: '#fff1f2',
    hexBorder: '#fda4af',
    hexText: '#881337',
    hexDot: '#f43f5e',
  },
  blue: {
    name: 'ブルー (照合/質問)',
    label: '仕様照合・質疑',
    bgClass: 'bg-sky-50',
    borderClass: 'border-sky-300',
    headerBgClass: 'bg-sky-100/90',
    textClass: 'text-sky-950',
    badgeBgClass: 'bg-sky-500',
    dotBgClass: 'bg-sky-300',
    hexBg: '#f0f9ff',
    hexBorder: '#7dd3fc',
    hexText: '#0c4a6e',
    hexDot: '#0ea5e9',
  },
  green: {
    name: 'グリーン (承認/適合)',
    label: '適合確認・承認',
    bgClass: 'bg-emerald-50',
    borderClass: 'border-emerald-300',
    headerBgClass: 'bg-emerald-100/90',
    textClass: 'text-emerald-950',
    badgeBgClass: 'bg-emerald-500',
    dotBgClass: 'bg-emerald-300',
    hexBg: '#f0fdf4',
    hexBorder: '#86efac',
    hexText: '#064e3b',
    hexDot: '#10b981',
  },
  purple: {
    name: 'パープル (特記/変更)',
    label: '特記事項・変更点',
    bgClass: 'bg-purple-50',
    borderClass: 'border-purple-300',
    headerBgClass: 'bg-purple-100/90',
    textClass: 'text-purple-950',
    badgeBgClass: 'bg-purple-500',
    dotBgClass: 'bg-purple-300',
    hexBg: '#faf5ff',
    hexBorder: '#d8b4fe',
    hexText: '#581c87',
    hexDot: '#a855f7',
  },
  orange: {
    name: 'オレンジ (保留/協議)',
    label: '協議事項・保留',
    bgClass: 'bg-orange-50',
    borderClass: 'border-orange-300',
    headerBgClass: 'bg-orange-100/90',
    textClass: 'text-orange-950',
    badgeBgClass: 'bg-orange-500',
    dotBgClass: 'bg-orange-300',
    hexBg: '#fff7ed',
    hexBorder: '#fdba74',
    hexText: '#7c2d12',
    hexDot: '#f97316',
  },
}

export interface ReviewComment {
  id: string
  pageIndex: number
  number: number // 通し番号 ①, ②, ③
  x: number // PDF座標系 (pt)
  y: number // PDF座標系 (pt)
  text: string // 指摘・確認事項のテキスト
  status: 'unresolved' | 'resolved' // 未解決 / 解決済
  color?: ReviewCommentColor // 付箋カラー（デフォルト: 'yellow'）
  markType?: ReviewMarkType // 関連するマークアップの種類
  markId?: string // 関連するマークアップID
  createdAt: number
  author?: string
}

// 審査マークアップ（マーカー・取り消し線・下線・囲み枠）アイテム
export interface ReviewMark {
  id: string
  pageIndex: number
  type: ReviewMarkType
  color?: string // 色 (蛍光黄、朱赤、青など)
  strokeWidth?: number // 線の太さ
  x: number // 始点または左上 (pt)
  y: number // 始点または左上 (pt)
  w?: number // 幅 (マーカー・囲み枠用)
  h?: number // 高さ (マーカー・囲み枠用)
  points?: Point[] // 始点・終点 (取り消し線・下線用)
  opacity?: number // 透明度 (マーカー用)
  commentId?: string // 紐付く付箋コメントID
  createdAt: number
}

// 旧スタンプの後方互換型エイリアス
export type ReviewStampType = 'checked' | 'match' | 'need_check' | 'reject' | 'check_mark'
export interface ReviewStamp {
  id: string
  pageIndex: number
  type: ReviewStampType
  x: number
  y: number
  w: number
  h: number
  createdAt: number
}

export type DrawingTool =
  | 'pan'
  | 'select'
  | 'text'
  | 'image'
  | 'line'
  | 'polyline'
  | 'rect'
  | 'polygon'
  | 'circle'
  | 'check'
  | 'ruler'
  | 'draw_eraser'
  | 'arrow'

export type FillMode = 'none' | 'semi' | 'solid'

export type ArrowHead = 'end' | 'start' | 'both' | 'none'

export interface Point {
  x: number
  y: number
}

export interface DrawingItem {
  id: string
  pageIndex: number
  tool: DrawingTool
  color: string
  fillColor?: string
  fillMode: FillMode
  lineWidth: number
  fontSize: number
  // 矢印用
  arrowHead?: ArrowHead
  // テキスト用
  text?: string
  bgWhite?: boolean
  rotation?: number // 回転角度 (0〜360度)
  // 画像用
  imageUrl?: string
  imageBytes?: Uint8Array
  imageMime?: string
  aspectRatio?: number
  // 矩形・丸・テキスト・チェック・画像のバウンディングボックス (PDF座標系: 左上原点)
  x?: number
  y?: number
  w?: number
  h?: number
  // 直線・矢印・多角形用の頂点群 (PDF座標系: 左上原点)
  points?: Point[]
}

// しおり（目次 / ブックマーク）アイテム
export interface BookmarkItem {
  id: string
  title: string
  page: number // 0-based page index
  children?: BookmarkItem[]
  isOpen?: boolean
}

// 元に戻す (Undo) 用の履歴アクション
export type HistoryAction =
  | { type: 'add_redaction'; redactionId: string }
  | { type: 'add_redactions'; redactionIds: string[] }
  | { type: 'remove_redaction'; redaction: any }
  | { type: 'add_drawing'; drawingId: string }
  | { type: 'remove_drawing'; drawing: DrawingItem }
  | { type: 'move_drawing'; id: string; prev: Partial<DrawingItem> }
  | { type: 'clear_page'; redactions: any[]; drawings: DrawingItem[] }
  | { type: 'clear_all'; redactions: any[]; drawings: DrawingItem[] }

