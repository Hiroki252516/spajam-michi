import React from 'react';
import { View, ScrollView, StyleSheet, ViewStyle, KeyboardAvoidingView, Platform } from 'react-native';
import SafeAreaContainer from './SafeAreaContainer';
import { COLORS, SPACING } from '../constants/design';

interface ScreenContainerProps {
  children: React.ReactNode;
  scrollable?: boolean;
  horizontalPadding?: number;
  verticalPadding?: number;
  backgroundColor?: string;
  style?: ViewStyle;
  keyboardAvoid?: boolean;
}

/**
 * 画面コンテナコンポーネント
 * 各画面の共通レイアウト（SafeArea + padding + scroll対応）
 */
const ScreenContainer: React.FC<ScreenContainerProps> = ({
  children,
  scrollable = true,
  horizontalPadding = SPACING.md,
  verticalPadding = SPACING.md,
  backgroundColor = COLORS.background.primary,
  style,
  keyboardAvoid = true,
}) => {
  const paddingStyle = {
    paddingHorizontal: horizontalPadding,
    paddingVertical: verticalPadding,
  };

  const content = (
    <SafeAreaContainer backgroundColor={backgroundColor}>
      {scrollable ? (
        <ScrollView
          style={[styles.scrollView, paddingStyle, style]}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {children}
        </ScrollView>
      ) : (
        <View style={[styles.container, paddingStyle, style]}>
          {children}
        </View>
      )}
    </SafeAreaContainer>
  );

  if (keyboardAvoid) {
    return (
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1 }}
      >
        {content}
      </KeyboardAvoidingView>
    );
  }

  return content;
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
  },
});

export default ScreenContainer;
