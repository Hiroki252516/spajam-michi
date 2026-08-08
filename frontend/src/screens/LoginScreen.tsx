import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  StatusBar,
  Pressable,
  Alert,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import ScreenContainer from '../components/ScreenContainer';
import TextInputField from '../components/TextInputField';
import GradientButton from '../components/GradientButton';
import { COLORS, TYPOGRAPHY, SPACING, BORDER_RADIUS, SHADOWS } from '../constants/design';
import { useAuth } from '../context/AuthContext';

interface LoginScreenProps {
  onLoginSuccess: () => void;
  onNavigateToRegister?: () => void;
  onGoBack?: () => void;
}

/**
 * LoginScreen - ログイン画面
 * screen-login.svg および DESIGN.md (Warm Marketplace) に準拠
 */
const LoginScreen: React.FC<LoginScreenProps> = ({
  onLoginSuccess,
  onNavigateToRegister,
  onGoBack,
}) => {
  const { login, isLoading } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);

  const handleLogin = async () => {
    setError(null);
    if (!email.trim()) {
      setError('メールアドレスを入力してください');
      return;
    }
    if (!password) {
      setError('パスワードを入力してください');
      return;
    }

    try {
      await login(email, password);
      onLoginSuccess();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'ログインに失敗しました';
      setError(message);
    }
  };

  // デモログイン（ワンタップ）
  const handleDemoLogin = async () => {
    setEmail('dev@spajam.jp');
    setPassword('demo1234');
    try {
      await login('dev@spajam.jp', 'demo1234');
      onLoginSuccess();
    } catch {
      Alert.alert('エラー', 'デモログインに失敗しました');
    }
  };

  return (
    <>
      <StatusBar barStyle="dark-content" backgroundColor={COLORS.canvas} />
      <ScreenContainer scrollable={true} keyboardAvoid={true} horizontalPadding={SPACING.lg}>
        {/* ナビゲーションヘッダー */}
        <View style={styles.topHeader}>
          {onGoBack && (
            <Pressable onPress={onGoBack} style={styles.backButton}>
              <MaterialCommunityIcons name="arrow-left" size={22} color={COLORS.ink} />
            </Pressable>
          )}
          <Text style={styles.headerTitle}>ログイン</Text>
        </View>

        {/* Branding Hero */}
        <View style={styles.brandHero}>
          <View style={styles.logoCircle}>
            <MaterialCommunityIcons name="lightning-bolt" size={36} color={COLORS.onPrimary} />
          </View>
          <Text style={styles.brandTitle}>Welcome to SPAJAM</Text>
          <Text style={styles.brandSubtitle}>
            アカウントにログインしてイベントの閲覧・探索を始めましょう
          </Text>
        </View>

        {/* ログインフォーム */}
        <View style={styles.formContainer}>
          <TextInputField
            label="メールアドレス"
            placeholder="example@spajam.jp"
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
            icon={<MaterialCommunityIcons name="email-outline" size={20} color={COLORS.muted} />}
          />

          <TextInputField
            label="パスワード"
            placeholder="••••••••"
            value={password}
            onChangeText={setPassword}
            secureTextEntry={true}
            containerStyle={{ marginTop: SPACING.md }}
            icon={<MaterialCommunityIcons name="lock-outline" size={20} color={COLORS.muted} />}
          />

          {error && <Text style={styles.errorText}>{error}</Text>}

          <Pressable style={styles.forgotPasswordButton} onPress={() => Alert.alert('パスワード再設定', '再設定リンクを送信します')}>
            <Text style={styles.forgotPasswordText}>パスワードをお忘れですか？</Text>
          </Pressable>

          <GradientButton
            title={isLoading ? 'ログイン中...' : 'ログイン'}
            onPress={handleLogin}
            disabled={isLoading}
            size="lg"
            style={{ marginTop: SPACING.lg }}
          />

          {/* デモログインボタン */}
          <Pressable
            onPress={handleDemoLogin}
            disabled={isLoading}
            style={styles.demoLoginButton}
          >
            <MaterialCommunityIcons name="account-key-outline" size={18} color={COLORS.primary} />
            <Text style={styles.demoLoginText}>ワンタップでデモログイン</Text>
          </Pressable>
        </View>

        {/* フッターリンク */}
        <View style={styles.footerLinkContainer}>
          <Text style={styles.footerLinkSub}>アカウントをお持ちでないですか？</Text>
          <Pressable onPress={onNavigateToRegister || (() => Alert.alert('新規登録', 'アカウント新規作成フォームへ導線します'))}>
            <Text style={styles.signupText}>新規登録</Text>
          </Pressable>
        </View>
      </ScreenContainer>
    </>
  );
};

const styles = StyleSheet.create({
  topHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: SPACING.sm,
    marginBottom: SPACING.md,
  },
  backButton: {
    width: 36,
    height: 36,
    borderRadius: BORDER_RADIUS.full,
    backgroundColor: COLORS.surfaceSoft,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: SPACING.sm,
  },
  headerTitle: {
    fontSize: TYPOGRAPHY.titleMd.fontSize,
    fontWeight: TYPOGRAPHY.titleMd.fontWeight,
    color: COLORS.ink,
  },
  brandHero: {
    alignItems: 'center',
    marginVertical: SPACING.lg,
  },
  logoCircle: {
    width: 64,
    height: 64,
    borderRadius: 20,
    backgroundColor: COLORS.primary,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: SPACING.md,
    ...SHADOWS.md,
  },
  brandTitle: {
    fontSize: TYPOGRAPHY.displayLg.fontSize,
    fontWeight: TYPOGRAPHY.displayLg.fontWeight,
    color: COLORS.ink,
    letterSpacing: -0.4,
    marginBottom: SPACING.xs,
  },
  brandSubtitle: {
    fontSize: TYPOGRAPHY.bodySm.fontSize,
    color: COLORS.muted,
    textAlign: 'center',
    paddingHorizontal: SPACING.md,
  },
  formContainer: {
    marginVertical: SPACING.md,
  },
  errorText: {
    fontSize: TYPOGRAPHY.captionSm.fontSize,
    color: COLORS.primaryErrorText,
    marginTop: SPACING.xs,
  },
  forgotPasswordButton: {
    alignSelf: 'flex-end',
    marginTop: SPACING.xs,
  },
  forgotPasswordText: {
    fontSize: TYPOGRAPHY.caption.fontSize,
    color: COLORS.muted,
    fontWeight: '500',
  },
  demoLoginButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.xs,
    paddingVertical: SPACING.md,
    marginTop: SPACING.md,
    borderRadius: BORDER_RADIUS.sm,
    backgroundColor: COLORS.surfaceSoft,
  },
  demoLoginText: {
    fontSize: TYPOGRAPHY.bodySm.fontSize,
    fontWeight: '600',
    color: COLORS.primary,
  },
  footerLinkContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: SPACING.xs,
    marginTop: SPACING.xl,
    paddingBottom: SPACING.xl,
  },
  footerLinkSub: {
    fontSize: TYPOGRAPHY.bodySm.fontSize,
    color: COLORS.muted,
  },
  signupText: {
    fontSize: TYPOGRAPHY.bodySm.fontSize,
    fontWeight: '700',
    color: COLORS.primary,
  },
});

export default LoginScreen;
