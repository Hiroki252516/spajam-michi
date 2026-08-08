import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  StatusBar,
  Pressable,
  Image,
  FlatList,
  Alert,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import ScreenContainer from '../components/ScreenContainer';
import GradientButton from '../components/GradientButton';
import StarRating from '../components/StarRating';
import { COLORS, TYPOGRAPHY, SPACING, BORDER_RADIUS, SHADOWS } from '../constants/design';
import { useAuth } from '../context/AuthContext';
import { VisitedEventItem } from '../services/authApi';

interface MyPageScreenProps {
  onGoBack: () => void;
  onLogoutSuccess: () => void;
}

/**
 * MyPageScreen - マイページ画面
 * 要求仕様: プロフィール（画像・名前）と「参加イベント一覧（参加日・イベント名・満足度）」のみ
 */
const MyPageScreen: React.FC<MyPageScreenProps> = ({ onGoBack, onLogoutSuccess }) => {
  const { user, logout } = useAuth();

  const handleLogout = () => {
    Alert.alert('ログアウト確認', '本当にログアウトしますか？', [
      { text: 'キャンセル', style: 'cancel' },
      {
        text: 'ログアウト',
        style: 'destructive',
        onPress: async () => {
          await logout();
          onLogoutSuccess();
        },
      },
    ]);
  };

  const visitedEvents: VisitedEventItem[] = user?.visitedEvents || [
    {
      id: 'visited_1',
      eventName: 'SPAJAM 2026 予選ハッカソン',
      visitedDate: '2026年8月2日',
      rating: 5,
    },
    {
      id: 'visited_2',
      eventName: 'ナイトマーケット＆フードフェス 2026',
      visitedDate: '2026年7月20日',
      rating: 4,
    },
    {
      id: 'visited_3',
      eventName: 'デジタルアート＆ライティング展',
      visitedDate: '2026年6月14日',
      rating: 5,
    },
  ];

  return (
    <>
      <StatusBar barStyle="dark-content" backgroundColor={COLORS.canvas} />
      <ScreenContainer scrollable={false} keyboardAvoid={false} horizontalPadding={SPACING.base}>
        {/* ナビゲーションヘッダー */}
        <View style={styles.topHeader}>
          <Pressable onPress={onGoBack} style={styles.backButton}>
            <MaterialCommunityIcons name="arrow-left" size={22} color={COLORS.ink} />
          </Pressable>
          <Text style={styles.headerTitle}>マイページ</Text>
        </View>

        {/* 1. プロフィール（画像、名前） */}
        <View style={styles.profileSection}>
          <View style={styles.avatarContainer}>
            {user?.avatarUrl ? (
              <Image source={{ uri: user.avatarUrl }} style={styles.avatarImage} />
            ) : (
              <View style={styles.avatarPlaceholder}>
                <MaterialCommunityIcons name="account" size={44} color={COLORS.canvas} />
              </View>
            )}
          </View>
          <Text style={styles.userName}>{user?.name || '山田 太郎'}</Text>
        </View>

        {/* 2. 参加イベント一覧（参加日・イベント名・満足度） */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>参加・満足度記録一覧</Text>
          <Text style={styles.sectionCount}>{visitedEvents.length}件</Text>
        </View>

        <FlatList
          data={visitedEvents}
          keyExtractor={(item) => item.id}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.listContent}
          renderItem={({ item }) => (
            <View style={styles.eventCard}>
              <View style={styles.cardHeader}>
                <View style={styles.dateBadge}>
                  <MaterialCommunityIcons name="calendar-clock" size={14} color={COLORS.muted} />
                  <Text style={styles.visitedDate}>{item.visitedDate}</Text>
                </View>
                {/* 満足度（星5段階評価） */}
                <View style={styles.ratingRow}>
                  <StarRating
                    rating={item.rating}
                    onRatingChange={() => {}}
                    readonly={true}
                    size="sm"
                    showLabel={false}
                  />
                  <Text style={styles.ratingText}>{item.rating}.0</Text>
                </View>
              </View>

              <Text style={styles.eventName}>{item.eventName}</Text>
            </View>
          )}
        />

        {/* ログアウトボタン */}
        <View style={styles.footerSection}>
          <GradientButton
            title="ログアウト"
            onPress={handleLogout}
            variant="secondary"
            size="md"
          />
        </View>
      </ScreenContainer>
    </>
  );
};

const styles = StyleSheet.create({
  topHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: SPACING.xs,
    marginBottom: SPACING.sm,
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
  profileSection: {
    alignItems: 'center',
    paddingVertical: SPACING.md,
    marginBottom: SPACING.md,
    backgroundColor: COLORS.surfaceSoft,
    borderRadius: BORDER_RADIUS.md,
  },
  avatarContainer: {
    marginBottom: SPACING.xs,
  },
  avatarImage: {
    width: 72,
    height: 72,
    borderRadius: 36,
  },
  avatarPlaceholder: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: COLORS.muted,
    justifyContent: 'center',
    alignItems: 'center',
  },
  userName: {
    fontSize: TYPOGRAPHY.displaySm.fontSize,
    fontWeight: TYPOGRAPHY.displaySm.fontWeight,
    color: COLORS.ink,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SPACING.sm,
  },
  sectionTitle: {
    fontSize: TYPOGRAPHY.titleSm.fontSize,
    fontWeight: TYPOGRAPHY.titleSm.fontWeight,
    color: COLORS.ink,
  },
  sectionCount: {
    fontSize: TYPOGRAPHY.bodySm.fontSize,
    color: COLORS.muted,
  },
  listContent: {
    paddingBottom: SPACING.md,
  },
  eventCard: {
    backgroundColor: COLORS.canvas,
    borderRadius: BORDER_RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.hairlineSoft,
    padding: SPACING.md,
    marginBottom: SPACING.sm,
    ...SHADOWS.sm,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SPACING.xs,
  },
  dateBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  visitedDate: {
    fontSize: TYPOGRAPHY.captionSm.fontSize,
    color: COLORS.muted,
  },
  ratingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  ratingText: {
    fontSize: TYPOGRAPHY.captionSm.fontSize,
    fontWeight: '700',
    color: COLORS.ink,
    marginLeft: 2,
  },
  eventName: {
    fontSize: TYPOGRAPHY.titleSm.fontSize,
    fontWeight: '600',
    color: COLORS.ink,
    marginTop: 2,
  },
  footerSection: {
    paddingVertical: SPACING.md,
  },
});

export default MyPageScreen;
