import React from 'react';
import { SafeAreaView, StyleSheet, ViewStyle } from 'react-native';
import { COLORS } from '../constants/design';

interface SafeAreaContainerProps {
  children: React.ReactNode;
  style?: ViewStyle;
  backgroundColor?: string;
}

/**
 * SafeAreaコンテナコンポーネント
 * ステータスバー・ノッチ対応
 */
const SafeAreaContainer: React.FC<SafeAreaContainerProps> = ({
  children,
  style,
  backgroundColor = COLORS.background.primary,
}) => {
  return (
    <SafeAreaView
      style={[
        styles.container,
        { backgroundColor },
        style,
      ]}
    >
      {children}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});

export default SafeAreaContainer;
