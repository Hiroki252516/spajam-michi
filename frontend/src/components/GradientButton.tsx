import React from 'react';
import { Pressable, PressableProps, Text, StyleSheet, ViewStyle, TextStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { COLORS, TYPOGRAPHY, BORDER_RADIUS, SIZES, SHADOWS } from '../constants/design';

interface GradientButtonProps extends PressableProps {
  title: string;
  onPress: () => void;
  disabled?: boolean;
  size?: 'sm' | 'md' | 'lg';
  style?: ViewStyle;
  textStyle?: TextStyle;
}

/**
 * グラデーションボタンコンポーネント
 * test_modelの紫グラデーション検索・投稿ボタン用
 */
const GradientButton: React.FC<GradientButtonProps> = ({
  title,
  onPress,
  disabled = false,
  size = 'md',
  style,
  textStyle,
  ...props
}) => {
  const buttonHeight = size === 'sm' ? 40 : size === 'lg' ? 56 : SIZES.button.height;

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.container,
        { height: buttonHeight },
        pressed && !disabled && styles.pressed,
        disabled && styles.disabled,
        style,
      ]}
      {...props}
    >
      <LinearGradient
        colors={[COLORS.gradient.start, COLORS.gradient.end]}
        start={GRADIENTS.primary.start}
        end={GRADIENTS.primary.end}
        style={[
          styles.gradient,
          { height: buttonHeight },
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

// Re-export for use in other components
export { COLORS };
const GRADIENTS = {
  primary: {
    colors: [COLORS.gradient.start, COLORS.gradient.end],
    start: { x: 0, y: 0 },
    end: { x: 1, y: 0 },
  },
};

const styles = StyleSheet.create({
  container: {
    borderRadius: BORDER_RADIUS.xl,
    overflow: 'hidden',
    ...SHADOWS.md,
  },
  gradient: {
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: SIZES.button.minWidth / 2,
  },
  text: {
    color: COLORS.text.white,
    fontSize: TYPOGRAPHY.body.medium.size,
    fontWeight: '600',
  },
  pressed: {
    opacity: 0.8,
  },
  disabled: {
    opacity: 0.5,
  },
});

export default GradientButton;
