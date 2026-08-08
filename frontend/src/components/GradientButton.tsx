import React from 'react';
import { Pressable, PressableProps, Text, StyleSheet, ViewStyle, TextStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { COLORS, TYPOGRAPHY, BORDER_RADIUS, SIZES, SHADOWS } from '../constants/design';

export interface GradientButtonProps extends PressableProps {
  title: string;
  onPress: () => void;
  disabled?: boolean;
  size?: 'sm' | 'md' | 'lg';
  variant?: 'primary' | 'secondary' | 'pill';
  style?: ViewStyle;
  textStyle?: TextStyle;
}

/**
 * Primary / Gradient CTA ボタンコンポーネント
 * DESIGN.md: Warm Coral-Red (#ff385c) ブランドカラーを使用したプライマリボタン
 */
const GradientButton: React.FC<GradientButtonProps> = ({
  title,
  onPress,
  disabled = false,
  size = 'md',
  variant = 'primary',
  style,
  textStyle,
  ...props
}) => {
  const buttonHeight = size === 'sm' ? 40 : size === 'lg' ? 56 : SIZES.button.height;
  const radius = variant === 'pill' ? BORDER_RADIUS.full : BORDER_RADIUS.sm;

  if (variant === 'secondary') {
    return (
      <Pressable
        onPress={onPress}
        disabled={disabled}
        style={({ pressed }) => [
          styles.secondaryContainer,
          { height: buttonHeight, borderRadius: radius },
          pressed && !disabled && styles.pressed,
          disabled && styles.disabled,
          style,
        ]}
        {...props}
      >
        <Text
          style={[
            styles.secondaryText,
            size === 'sm' && { fontSize: 14 },
            size === 'lg' && { fontSize: 18 },
            textStyle,
          ]}
        >
          {title}
        </Text>
      </Pressable>
    );
  }

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.container,
        { height: buttonHeight, borderRadius: radius },
        pressed && !disabled && styles.pressed,
        disabled && styles.disabled,
        style,
      ]}
      {...props}
    >
      <LinearGradient
        colors={disabled ? [COLORS.primaryDisabled, COLORS.primaryDisabled] : [COLORS.primary, COLORS.primaryActive]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={[
          styles.gradient,
          { height: buttonHeight, borderRadius: radius },
        ]}
      >
        <Text
          style={[
            styles.text,
            size === 'sm' && { fontSize: 14 },
            size === 'lg' && { fontSize: 18 },
            textStyle,
          ]}
        >
          {title}
        </Text>
      </LinearGradient>
    </Pressable>
  );
};

const styles = StyleSheet.create({
  container: {
    borderRadius: BORDER_RADIUS.sm,
    overflow: 'hidden',
    ...SHADOWS.sm,
  },
  secondaryContainer: {
    backgroundColor: COLORS.canvas,
    borderWidth: 1,
    borderColor: COLORS.ink,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  secondaryText: {
    color: COLORS.ink,
    fontSize: TYPOGRAPHY.buttonMd.fontSize,
    fontWeight: TYPOGRAPHY.buttonMd.fontWeight,
  },
  gradient: {
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  text: {
    color: COLORS.onPrimary,
    fontSize: TYPOGRAPHY.buttonMd.fontSize,
    fontWeight: TYPOGRAPHY.buttonMd.fontWeight,
  },
  pressed: {
    opacity: 0.88,
    transform: [{ scale: 0.98 }],
  },
  disabled: {
    opacity: 0.6,
  },
});

export default GradientButton;
