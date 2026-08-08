import React from 'react';
import { View, ViewStyle, StyleSheet } from 'react-native';
import { BlurView } from 'expo-blur';
import { COLORS, BORDER_RADIUS, SHADOWS, SPACING } from '../constants/design';

interface CardComponentProps {
  children: React.ReactNode;
  blurred?: boolean;
  intensity?: number;
  style?: ViewStyle;
  padding?: number;
}

/**
 * カードコンポーネント
 * test_modelのぼかし背景 + rounded cornerカード用
 */
const CardComponent: React.FC<CardComponentProps> = ({
  children,
  blurred = true,
  intensity = 95,
  style,
  padding = SPACING.md,
}) => {
  if (blurred) {
    return (
      <BlurView intensity={intensity} style={[styles.container, style]}>
        <View style={[styles.content, { padding }]}>
          {children}
        </View>
      </BlurView>
    );
  }

  return (
    <View style={[styles.containerSolid, { padding }, style]}>
      {children}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    borderRadius: BORDER_RADIUS.lg,
    overflow: 'hidden',
    backgroundColor: COLORS.card.background,
    borderWidth: 1,
    borderColor: COLORS.card.border,
    ...SHADOWS.card,
  },
  containerSolid: {
    borderRadius: BORDER_RADIUS.lg,
    backgroundColor: COLORS.card.background,
    borderWidth: 1,
    borderColor: COLORS.card.border,
    ...SHADOWS.card,
  },
  content: {
    flex: 1,
  },
});

export default CardComponent;
