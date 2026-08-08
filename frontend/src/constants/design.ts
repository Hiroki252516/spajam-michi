import { ViewStyle } from 'react-native';

/**
 * SPAJAM 2026 - Warm Marketplace Design Tokens
 * DESIGN.md に厳密に則ったデザインシステム定数
 */

// ==================== COLORS ====================

export const COLORS = {
  // ブランドカラー（Warm Coral-Red）
  primary: '#ff385c',
  primaryActive: '#e00b41',
  primaryDisabled: '#ffd1da',
  primaryErrorText: '#c13515',

  // グラデーション（メインCTA/ブランド用）
  gradient: {
    start: '#ff385c',
    end: '#e00b41',
  },

  // テキストカラー
  ink: '#222222',         // メインテキスト（純黒ではない）
  body: '#3f3f3f',        // 本文テキスト
  muted: '#6a6a6a',       // 補助・サブテキスト
  mutedSoft: '#929292',   // 薄い補助テキスト
  onPrimary: '#ffffff',   // CTA用白テキスト
  starRating: '#222222',  // 星評価用

  text: {
    primary: '#222222',
    secondary: '#6a6a6a',
    tertiary: '#929292',
    white: '#ffffff',
    light: '#f7f7f7',
  },

  // 背景色
  canvas: '#ffffff',      // メインキャンバス
  surfaceSoft: '#f7f7f7',  // 薄いサブ背景
  surfaceCard: '#ffffff',  // カード背景
  surfaceStrong: '#f2f2f2',// ボタン背景など

  background: {
    primary: '#ffffff',
    secondary: '#f7f7f7',
    tertiary: '#f2f2f2',
  },

  // 枠線・区切り線
  hairline: '#dddddd',
  hairlineSoft: '#ebebeb',
  borderStrong: '#c1c1c1',

  card: {
    background: '#ffffff',
    border: '#ebebeb',
  },

  // ステータス
  status: {
    success: '#10b981',
    error: '#c13515',
    warning: '#f59e0b',
    info: '#3b82f6',
  },

  // 星評価
  star: {
    filled: '#ff385c',
    empty: '#dddddd',
  },
};

// ==================== TYPOGRAPHY ====================

export const TYPOGRAPHY = {
  displayXl: {
    fontSize: 28,
    size: 28,
    fontWeight: '700' as const,
    weight: '700' as const,
    lineHeight: 34,
  },
  displayLg: {
    fontSize: 22,
    size: 22,
    fontWeight: '500' as const,
    weight: '500' as const,
    lineHeight: 26,
  },
  displayMd: {
    fontSize: 21,
    size: 21,
    fontWeight: '700' as const,
    weight: '700' as const,
    lineHeight: 30,
  },
  displaySm: {
    fontSize: 20,
    size: 20,
    fontWeight: '600' as const,
    weight: '600' as const,
    lineHeight: 24,
  },
  titleMd: {
    fontSize: 16,
    size: 16,
    fontWeight: '600' as const,
    weight: '600' as const,
    lineHeight: 20,
  },
  titleSm: {
    fontSize: 16,
    size: 16,
    fontWeight: '500' as const,
    weight: '500' as const,
    lineHeight: 20,
  },
  ratingDisplay: {
    fontSize: 64,
    size: 64,
    fontWeight: '700' as const,
    weight: '700' as const,
    lineHeight: 70,
  },
  bodyMd: {
    fontSize: 16,
    size: 16,
    fontWeight: '400' as const,
    weight: '400' as const,
    lineHeight: 24,
  },
  bodySm: {
    fontSize: 14,
    size: 14,
    fontWeight: '400' as const,
    weight: '400' as const,
    lineHeight: 20,
  },
  caption: {
    fontSize: 14,
    size: 14,
    fontWeight: '500' as const,
    weight: '500' as const,
    lineHeight: 18,
  },
  captionSm: {
    fontSize: 13,
    size: 13,
    fontWeight: '400' as const,
    weight: '400' as const,
    lineHeight: 16,
  },
  badge: {
    fontSize: 11,
    size: 11,
    fontWeight: '600' as const,
    weight: '600' as const,
    lineHeight: 13,
  },
  microLabel: {
    fontSize: 12,
    size: 12,
    fontWeight: '700' as const,
    weight: '700' as const,
    lineHeight: 16,
  },
  uppercaseTag: {
    fontSize: 8,
    size: 8,
    fontWeight: '700' as const,
    weight: '700' as const,
    lineHeight: 10,
    letterSpacing: 0.32,
  },
  buttonMd: {
    fontSize: 16,
    size: 16,
    fontWeight: '500' as const,
    weight: '500' as const,
    lineHeight: 20,
  },
  buttonSm: {
    fontSize: 14,
    size: 14,
    fontWeight: '500' as const,
    weight: '500' as const,
    lineHeight: 18,
  },
  navLink: {
    fontSize: 16,
    size: 16,
    fontWeight: '600' as const,
    weight: '600' as const,
    lineHeight: 20,
  },

  // 互換性のための既存エイリアス
  heading: {
    size: 28,
    fontSize: 28,
    weight: '700' as const,
    fontWeight: '700' as const,
    lineHeight: 34,
  },
  subheading: {
    size: 22,
    fontSize: 22,
    weight: '600' as const,
    fontWeight: '600' as const,
    lineHeight: 26,
  },
  body: {
    large: {
      size: 18,
      fontSize: 18,
      weight: '500' as const,
      fontWeight: '500' as const,
      lineHeight: 24,
    },
    medium: {
      size: 16,
      fontSize: 16,
      weight: '400' as const,
      fontWeight: '400' as const,
      lineHeight: 22,
    },
    small: {
      size: 14,
      fontSize: 14,
      weight: '400' as const,
      fontWeight: '400' as const,
      lineHeight: 20,
    },
  },
  label: {
    size: 12,
    fontSize: 12,
    weight: '600' as const,
    fontWeight: '600' as const,
    lineHeight: 16,
  },
};

// ==================== BORDER RADIUS ====================

export const BORDER_RADIUS = {
  none: 0,
  xs: 4,
  sm: 8,
  md: 14,   // DESIGN.md 規定: 14px
  lg: 20,   // DESIGN.md 規定: 20px
  xl: 32,   // DESIGN.md 規定: 32px
  full: 9999,
};

// ==================== SPACING ====================

export const SPACING = {
  xxs: 2,
  xs: 4,
  sm: 8,
  md: 12,
  base: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
  section: 64,
};

// ==================== SHADOWS ====================

/**
 * DESIGN.md に定義された Elevation Tier (単一のシャドウ階層)
 * box-shadow: rgba(0,0,0,0.02) 0 0 0 1px, rgba(0,0,0,0.04) 0 2px 6px, rgba(0,0,0,0.1) 0 4px 8px
 */
export const SHADOWS = {
  sm: {
    elevation: 2,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
  } as ViewStyle,

  md: {
    elevation: 3,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
  } as ViewStyle,

  lg: {
    elevation: 6,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 10,
  } as ViewStyle,

  card: {
    elevation: 3,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
  } as ViewStyle,

  pill: {
    elevation: 2,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
  } as ViewStyle,
};

// ==================== GRADIENTS ====================

export const GRADIENTS = {
  primary: {
    colors: [COLORS.primary, COLORS.primaryActive],
    start: { x: 0, y: 0 },
    end: { x: 1, y: 0 },
  },
  background: {
    colors: ['#ffffff', '#f7f7f7'],
    start: { x: 0, y: 0 },
    end: { x: 0, y: 1 },
  },
};

// ==================== SIZE CONSTANTS ====================

export const SIZES = {
  icon: {
    xs: 16,
    sm: 20,
    md: 24,
    lg: 32,
    xl: 48,
  },
  button: {
    height: 48,
    minWidth: 100,
  },
  input: {
    height: 56,
    borderRadius: BORDER_RADIUS.sm,
  },
  card: {
    minHeight: 120,
    borderRadius: BORDER_RADIUS.md,
  },
};
