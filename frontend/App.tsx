import React from 'react';
import { StatusBar } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { EventProvider } from './src/context/EventContext';
import { AuthProvider } from './src/context/AuthContext';
import { RootNavigator } from './src/navigation/RootNavigator';
import { COLORS } from './src/constants/design';

/**
 * SPAJAM 2026 メインアプリケーション
 */
export default function App() {
  return (
    <SafeAreaProvider>
      <StatusBar
        barStyle="dark-content"
        backgroundColor={COLORS.canvas}
        translucent={true}
      />
      <AuthProvider>
        <EventProvider>
          <RootNavigator />
        </EventProvider>
      </AuthProvider>
    </SafeAreaProvider>
  );
}
