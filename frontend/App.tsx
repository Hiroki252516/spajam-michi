import React from 'react';
import { StatusBar } from 'react-native';
import { EventProvider } from './src/context/EventContext';
import { RootNavigator } from './src/navigation/RootNavigator';
import { COLORS } from './src/constants/design';

/**
 * メインアプリケーション
 * イベント検索・ナビゲーション・評価機能を統合
 */
export default function App() {
  return (
    <>
      <StatusBar
        barStyle="dark-content"
        backgroundColor={COLORS.background.primary}
        translucent={false}
      />
      <EventProvider>
        <RootNavigator />
      </EventProvider>
    </>
  );
}
