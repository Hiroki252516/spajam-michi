import React from 'react';
import { View, StyleSheet, ViewStyle, Platform, StatusBar } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { COLORS } from '../constants/design';

interface SafeAreaContainerProps {
  children: React.ReactNode;
  style?: ViewStyle;
  backgroundColor?: string;
}

/**
 * SafeAreaContainer - iPhone & Android 完全対応
 * Android の StatusBar.currentHeight および iPhone 16 の Dynamic Island インセットを確実に確保
 */
const SafeAreaContainer: React.FC<SafeAreaContainerProps> = ({
  children,
  style,
  backgroundColor = COLORS.canvas,
}) => {
  const insets = useSafeAreaInsets();

  // Android 特有のステータスバー高さ (StatusBar.currentHeight) を考慮
  const androidStatusBarHeight = Platform.OS === 'android' ? (StatusBar.currentHeight || 24) : 0;
  
  // iOS (Dynamic Island等) と Android の両方で安全なトップインセットを算出
  const safeTopPadding = Math.max(insets.top, androidStatusBarHeight, 12);
  const safeBottomPadding = Math.max(insets.bottom, 12);

  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor,
          paddingTop: safeTopPadding,
          paddingBottom: safeBottomPadding,
        },
        style,
      ]}
    >
      {children}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});

export default SafeAreaContainer;
