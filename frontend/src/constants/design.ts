import { ViewStyle } from 'react-native';

/**
 * デザインシステム定数
 * test_modelのFigmaデザインを忠実に再現するための色、Typography、spacing定義
 */

// ==================== COLORS ====================

export const COLORS = {
  // プライマリグラデーション（紫）
  gradient: {
    start: '#4F46E5',    // インディゴ
    end: '#7C3AED',      // パープル
  },

  // テキストカラー
  text: {
    primary: '#1F2937',    // 濃い灰色（本文）
    secondary: '#6B7280',  // 中灰色（補助テキスト）
    tertiary: '#9CA3AF',   // 薄灰色（サブラベル）
    white: '#FFFFFF',
    light: '#F3F4F6',      // 薄灰色背景用
  },

  // 背景色
  background: {
    primary: '#FFFFFF',
    secondary: '#F9FAFB',  // 薄灰色背景
    tertiary: '#F3F4F6',   // もっと薄い背景
  },

  // カード・コンポーネント背景
  card: {
    background: 'rgba(255, 255, 255, 0.95)',  // セミトランスペアレント白
    border: '#E5E7EB',
  },

  // ステータス色
  status: {
    success: '#10B981',   // 緑
    error: '#EF4444',     // 赤
    warning: '#F59E0B',   // 黄
    info: '#3B82F6',      // 青
  },

  // 星評価色
  star: {
    filled: '#FCD34D',    // 金色
    empty: '#E5E7EB',     // グレー
  },
};

// ==================== TYPOGRAPHY ====================

export const TYPOGRAPHY = {
  // 見出し
  heading: {
    size: 28,
    weight: '700' as const,
    lineHeight: 34,
  },

  // サブ見出し
  subheading: {
    size: 24,
    weight: '600' as const,
    lineHeight: 30,
  },

  // 本体テキスト（大）
  body: {
    large: {
      size: 18,
      weight: '500' as const,
      lineHeight: 24,
    },
    // 本体テキスト（中）
    medium: {
      size: 16,
      weight: '400' as const,
      lineHeight: 22,
    },
    // 本体テキスト（小）
    small: {
      size: 14,
      weight: '400' as const,
      lineHeight: 20,
    },
  },

  // ラベル
  label: {
    size: 12,
    weight: '600' as const,
    lineHeight: 16,
  },

  // キャプション
  caption: {
    size: 11,
    weight: '400' as const,
    lineHeight: 14,
  },
};

// ==================== SPACING ====================

export const SPACING = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
};

// ==================== BORDER RADIUS ====================

export const BORDER_RADIUS = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  full: 9999,
};

// ==================== SHADOWS ====================

/**
 * iOS/Android統一のドロップシャドウ定義
 */
export const SHADOWS = {
  // 微小シャドウ（subtle）
  sm: {
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
  } as ViewStyle,

  // 通常シャドウ（medium）
  md: {
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 4,
  } as ViewStyle,

  // 大きいシャドウ（large）
  lg: {
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
  } as ViewStyle,

  // グラデーション用（テストモデルのカード用）
  card: {
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
  } as ViewStyle,
};

// ==================== GRADIENTS ====================

export const GRADIENTS = {
  // プライマリ（検索・投稿ボタン等）
  primary: {
    colors: [COLORS.gradient.start, COLORS.gradient.end],
    start: { x: 0, y: 0 },
    end: { x: 1, y: 0 },
  },

  // 背景グラデーション（オプション）
  background: {
    colors: ['#F9FAFB', '#FFFFFF'],
    start: { x: 0, y: 0 },
    end: { x: 0, y: 1 },
  },
};

// ==================== COMMON STYLES ====================

export const COMMON_STYLES = {
  // フレックスコンテナ（中央揃え）
  flexCenter: {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
  } as ViewStyle,

  // フレックスコンテナ（スペースビトウィーン）
  flexSpaceBetween: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  } as ViewStyle,

  // フレックスコンテナ（スペースアラウンド）
  flexSpaceAround: {
    display: 'flex',
    justifyContent: 'space-around',
    alignItems: 'center',
  } as ViewStyle,

  // 絶対配置フル
  absolute: {
    position: 'absolute' as const,
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  } as ViewStyle,
};

// ==================== SIZE CONSTANTS ====================

export const SIZES = {
  // アイコンサイズ
  icon: {
    xs: 16,
    sm: 20,
    md: 24,
    lg: 32,
    xl: 48,
  },

  // ボタンサイズ
  button: {
    height: 48,
    minWidth: 100,
  },

  // 入力フィールドサイズ
  input: {
    height: 48,
    borderRadius: BORDER_RADIUS.md,
  },

  // カードサイズ
  card: {
    minHeight: 120,
    borderRadius: BORDER_RADIUS.lg,
  },
};
