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

interface RegisterScreenProps {
  onRegisterSuccess: () => void;
  onNavigateToLogin: () => void;
  onGoBack?: () => void;
}

/**
 * RegisterScreen - アカウント新規登録画面
 * DESIGN.md (Warm Marketplace) に準拠
 */
const RegisterScreen: React.FC<RegisterScreenProps> = ({
  onRegisterSuccess,
  onNavigateToLogin,
  onGoBack,
}) => {
  const { register, isLoading } = useAuth();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);

  const handleRegister = async () => {
    setError(null);
    if (!name.trim()) {
      setError('お名前を入力してください');
      return;
    }
    if (!email.trim() || !email.includes('@')) {
      setError('有効なメールアドレスを入力してください');
      return;
    }
    if (!password || password.length < 4) {
      setError('パスワードは4文字以上で入力してください');
      return;
    }
    if (password !== confirmPassword) {
      setError('パスワードが一致しません');
      return;
    }

    try {
      await register(name, email, password);
      onRegisterSuccess();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : '登録に失敗しました';
      setError(message);
    }
  };

  // デモ新規登録（ワンタップ）
  const handleDemoRegister = async () => {
    setName('デモユーザー');
    setEmail('demo_new@spajam.jp');
    setPassword('demo1234');
    setConfirmPassword('demo1234');
    try {
      await register('デモユーザー', 'demo_new@spajam.jp', 'demo1234');
      onRegisterSuccess();
    } catch {
      Alert.alert('エラー', 'デモアカウント作成に失敗しました');
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
          <Text style={styles.headerTitle}>新規アカウント作成</Text>
        </View>

        {/* Brand Hero */}
        <View style={styles.brandHero}>
          <View style={styles.logoCircle}>
            <MaterialCommunityIcons name="account-plus-outline" size={36} color={COLORS.onPrimary} />
          </View>
          <Text style={styles.brandTitle}>Join SPAJAM 2026</Text>
          <Text style={styles.brandSubtitle}>
            新しいアカウントを作成して、注目のイベントや体験に参加しましょう
          </Text>
        </View>

        {/* 新規登録フォーム */}
        <View style={styles.formContainer}>
          <TextInputField
            label="お名前"
            placeholder="山田 太郎"
            value={name}
            onChangeText={setName}
            autoCapitalize="words"
            icon={<MaterialCommunityIcons name="account-outline" size={20} color={COLORS.muted} />}
          />

          <TextInputField
            label="メールアドレス"
            placeholder="example@spajam.jp"
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
            containerStyle={{ marginTop: SPACING.sm }}
            icon={<MaterialCommunityIcons name="email-outline" size={20} color={COLORS.muted} />}
          />

          <TextInputField
            label="パスワード"
            placeholder="•••••••• (4文字以上)"
            value={password}
            onChangeText={setPassword}
            secureTextEntry={true}
            containerStyle={{ marginTop: SPACING.sm }}
            icon={<MaterialCommunityIcons name="lock-outline" size={20} color={COLORS.muted} />}
          />

          <TextInputField
            label="パスワード（確認）"
            placeholder="••••••••"
            value={confirmPassword}
            onChangeText={setConfirmPassword}
            secureTextEntry={true}
            containerStyle={{ marginTop: SPACING.sm }}
            icon={<MaterialCommunityIcons name="lock-check-outline" size={20} color={COLORS.muted} />}
          />

          {error && <Text style={styles.errorText}>{error}</Text>}

          <GradientButton
            title={isLoading ? 'アカウント作成中...' : 'アカウントを作成'}
            onPress={handleRegister}
            disabled={isLoading}
            size="lg"
            style={{ marginTop: SPACING.lg }}
          />

          {/* デモアカウント新規登録ボタン */}
          <Pressable
            onPress={handleDemoRegister}
            disabled={isLoading}
            style={styles.demoRegisterButton}
          >
            <MaterialCommunityIcons name="account-key-outline" size={18} color={COLORS.primary} />
            <Text style={styles.demoRegisterText}>ワンタップでデモ新規登録</Text>
          </Pressable>
        </View>

        {/* ログイン画面への案内リンク */}
        <View style={styles.footerLinkContainer}>
          <Text style={styles.footerLinkSub}>すでにアカウントをお持ちですか？</Text>
          <Pressable onPress={onNavigateToLogin}>
            <Text style={styles.loginText}>ログイン</Text>
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
    marginBottom: SPACING.xs,
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
    marginVertical: SPACING.md,
  },
  logoCircle: {
    width: 64,
    height: 64,
    borderRadius: 20,
    backgroundColor: COLORS.primary,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: SPACING.sm,
    ...SHADOWS.md,
  },
  brandTitle: {
    fontSize: TYPOGRAPHY.displayLg.fontSize,
    fontWeight: TYPOGRAPHY.displayLg.fontWeight,
    color: COLORS.ink,
    letterSpacing: -0.4,
    marginBottom: 2,
  },
  brandSubtitle: {
    fontSize: TYPOGRAPHY.bodySm.fontSize,
    color: COLORS.muted,
    textAlign: 'center',
    paddingHorizontal: SPACING.md,
  },
  formContainer: {
    marginVertical: SPACING.xs,
  },
  errorText: {
    fontSize: TYPOGRAPHY.captionSm.fontSize,
    color: COLORS.primaryErrorText,
    marginTop: SPACING.xs,
  },
  demoRegisterButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.xs,
    paddingVertical: SPACING.md,
    marginTop: SPACING.md,
    borderRadius: BORDER_RADIUS.sm,
    backgroundColor: COLORS.surfaceSoft,
  },
  demoRegisterText: {
    fontSize: TYPOGRAPHY.bodySm.fontSize,
    fontWeight: '600',
    color: COLORS.primary,
  },
  footerLinkContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: SPACING.xs,
    marginTop: SPACING.lg,
    paddingBottom: SPACING.xl,
  },
  footerLinkSub: {
    fontSize: TYPOGRAPHY.bodySm.fontSize,
    color: COLORS.muted,
  },
  loginText: {
    fontSize: TYPOGRAPHY.bodySm.fontSize,
    fontWeight: '700',
    color: COLORS.primary,
  },
});

export default RegisterScreen;
