import React, { useState, useEffect } from 'react';
import {
  FlatList,
  ScrollView,
  View,
  Text,
  StyleSheet,
  StatusBar,
  Pressable,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import ScreenContainer from '../components/ScreenContainer';
import EventCard, { EventCardData } from '../components/EventCard';
import CardComponent from '../components/CardComponent';
import { COLORS, TYPOGRAPHY, SPACING, BORDER_RADIUS, SHADOWS } from '../constants/design';
import { DUMMY_EVENTS } from '../constants/dummyData';
import { fetchEvents } from '../services/api';
import { useAuth } from '../context/AuthContext';

interface SearchScreenProps {
  onEventSelect: (eventId: string, eventName: string) => void;
  onOpenLogin: () => void;
  onOpenMyPage: () => void;
}

/**
 * SearchScreen - イベント一覧 & ガイド（チュートリアル）表示画面
 */
const SearchScreen: React.FC<SearchScreenProps> = ({
  onEventSelect,
  onOpenLogin,
  onOpenMyPage,
}) => {
  const { isLoggedIn, user, completeTutorial } = useAuth();
  const [activeTab, setActiveTab] = useState<'events' | 'guide'>(
    user?.isFirstLogin ? 'guide' : 'events'
  );
  const [events, setEvents] = useState<EventCardData[]>(DUMMY_EVENTS);
  const [isLoading, setIsLoading] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  useEffect(() => {
    if (user?.isFirstLogin) {
      setActiveTab('guide');
    }
  }, [user?.isFirstLogin]);

  const handleFinishTutorial = () => {
    completeTutorial();
    setActiveTab('events');
  };

  const loadEvents = async () => {
    try {
      const data = await fetchEvents();
      if (data && data.length > 0) {
        setEvents(data as EventCardData[]);
      }
    } catch (error) {
      console.warn('Failed to load events from backend:', error);
    }
  };

  useEffect(() => {
    let isMounted = true;
    const initialLoad = async () => {
      setIsLoading(true);
      await loadEvents();
      if (isMounted) {
        setIsLoading(false);
      }
    };

    initialLoad();
    return () => {
      isMounted = false;
    };
  }, []);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await loadEvents();
    setIsRefreshing(false);
  };

  const handleEventPress = (eventId: string, eventName: string) => {
    onEventSelect(eventId, eventName);
  };

  return (
    <>
      <StatusBar barStyle="dark-content" backgroundColor={COLORS.canvas} />
      <ScreenContainer scrollable={false} keyboardAvoid={true} horizontalPadding={SPACING.base}>
        {/* トッププロダクトナビゲーション + アカウントボタン (DESIGN.md top-nav) */}
        <View style={styles.headerRow}>
          <View style={styles.navBar}>
            {/* イベントタブ */}
            <Pressable
              onPress={() => setActiveTab('events')}
              style={[styles.tabItem, activeTab === 'events' && styles.tabItemActive]}
            >
              <MaterialCommunityIcons
                name="calendar-multiselect"
                size={22}
                color={activeTab === 'events' ? COLORS.ink : COLORS.muted}
              />
              <Text style={[styles.tabLabel, activeTab === 'events' && styles.tabLabelActive]}>
                イベント
              </Text>
            </Pressable>

            {/* ガイド（チュートリアル）タブ */}
            <Pressable
              onPress={() => setActiveTab('guide')}
              style={[styles.tabItem, activeTab === 'guide' && styles.tabItemActive]}
            >
              <View style={styles.tabIconWrapper}>
                <MaterialCommunityIcons
                  name="compass-outline"
                  size={22}
                  color={activeTab === 'guide' ? COLORS.ink : COLORS.muted}
                />
                <View style={styles.guideBadge}>
                  <Text style={styles.guideBadgeText}>使い方</Text>
                </View>
              </View>
              <Text style={[styles.tabLabel, activeTab === 'guide' && styles.tabLabelActive]}>
                ガイド
              </Text>
            </Pressable>
          </View>

          {/* アカウント・マイページボタン (DESIGN.md icon-button-outline) */}
          <Pressable
            onPress={isLoggedIn ? onOpenMyPage : onOpenLogin}
            style={styles.accountButton}
          >
            <MaterialCommunityIcons
              name={isLoggedIn ? 'account-circle' : 'account-circle-outline'}
              size={24}
              color={isLoggedIn ? COLORS.primary : COLORS.ink}
            />
            {isLoggedIn && (
              <Text style={styles.accountButtonText} numberOfLines={1}>
                {user?.name?.split(' ')[0] || 'マイページ'}
              </Text>
            )}
          </Pressable>
        </View>

        {/* タブに応じたメインコンテンツ切り替え */}
        {activeTab === 'events' ? (
          <>
            {/* 見出し */}
            <View style={styles.sectionHeader}>
              <Text style={styles.headline}>Where to go next?</Text>
              <Text style={styles.subheadline}>
                条件に合う場所へ出発しよう！何が待っているかは到着後のお楽しみ ✨
              </Text>
            </View>

            {/* イベント一覧 (DESIGN.md property-card) */}
            {isLoading ? (
              <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color={COLORS.primary} />
              </View>
            ) : events.length > 0 ? (
              <FlatList
                data={events}
                renderItem={({ item }) => (
                  <EventCard
                    event={item}
                    onPress={() => handleEventPress(item.id, item.name)}
                  />
                )}
                keyExtractor={(item) => item.id}
                scrollEnabled={true}
                contentContainerStyle={styles.listContent}
                showsVerticalScrollIndicator={false}
                refreshControl={
                  <RefreshControl
                    refreshing={isRefreshing}
                    onRefresh={handleRefresh}
                    colors={[COLORS.primary]}
                    tintColor={COLORS.primary}
                  />
                }
              />
            ) : (
              <View style={styles.emptyState}>
                <MaterialCommunityIcons
                  name="magnify-remove-outline"
                  size={48}
                  color={COLORS.mutedSoft}
                />
                <Text style={styles.emptyStateTitle}>イベントが見つかりませんでした</Text>
              </View>
            )}
          </>
        ) : (
          /* ガイド（チュートリアル）表示画面 */
          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.guideContainer}
          >
            <View style={styles.sectionHeader}>
              <Text style={styles.headline}>App Guide & Tutorial 🗺️</Text>
              <Text style={styles.subheadline}>
                アプリの楽しみ方と基本の使い方ガイド
              </Text>
            </View>

            {/* チュートリアルステップ 1 */}
            <CardComponent blurred={true} padding={SPACING.md} style={styles.tutorialCard}>
              <View style={styles.stepHeader}>
                <View style={styles.stepBadge}>
                  <Text style={styles.stepBadgeText}>STEP 1</Text>
                </View>
                <Text style={styles.stepTitle}>条件から行き先を選ぶ</Text>
              </View>
              <View style={styles.stepContent}>
                <MaterialCommunityIcons name="map-search-outline" size={32} color={COLORS.primary} />
                <Text style={styles.stepDescription}>
                  開催時間・所要時間・必要な金額・開催場所周辺の地図を確認して、気になる目的地のスポットを選択しましょう。
                </Text>
              </View>
            </CardComponent>

            {/* チュートリアルステップ 2 */}
            <CardComponent blurred={true} padding={SPACING.md} style={styles.tutorialCard}>
              <View style={styles.stepHeader}>
                <View style={styles.stepBadge}>
                  <Text style={styles.stepBadgeText}>STEP 2</Text>
                </View>
                <Text style={styles.stepTitle}>マップを見ながら出発</Text>
              </View>
              <View style={styles.stepContent}>
                <MaterialCommunityIcons name="navigation-variant-outline" size={32} color={COLORS.primary} />
                <Text style={styles.stepDescription}>
                  目的地を決めたらナビ画面へ。リアルタイムGPSで目的地までの距離と方角を確認しながら移動します。
                </Text>
              </View>
            </CardComponent>

            {/* チュートリアルステップ 3 */}
            <CardComponent blurred={true} padding={SPACING.md} style={styles.tutorialCard}>
              <View style={styles.stepHeader}>
                <View style={styles.stepBadge}>
                  <Text style={styles.stepBadgeText}>STEP 3</Text>
                </View>
                <Text style={styles.stepTitle}>現地到着でイベント判明！</Text>
              </View>
              <View style={styles.stepContent}>
                <MaterialCommunityIcons name="party-popper" size={32} color={COLORS.primary} />
                <Text style={styles.stepDescription}>
                  目的地まで100m以内に近づくとイベント情報がアンロック！現地で待っている最高の体験を楽しみましょう 🎉
                </Text>
              </View>
            </CardComponent>

            {/* チュートリアルステップ 4 */}
            <CardComponent blurred={true} padding={SPACING.md} style={styles.tutorialCard}>
              <View style={styles.stepHeader}>
                <View style={styles.stepBadge}>
                  <Text style={styles.stepBadgeText}>STEP 4</Text>
                </View>
                <Text style={styles.stepTitle}>参加＆満足度の記録</Text>
              </View>
              <View style={styles.stepContent}>
                <MaterialCommunityIcons name="star-outline" size={32} color={COLORS.primary} />
                <Text style={styles.stepDescription}>
                  イベント参加後は星評価で満足度を記録。記録された参加履歴はマイページに思い出として保存されます。
                </Text>
              </View>
            </CardComponent>

            {/* アクションボタン */}
            <Pressable
              style={styles.startEventButton}
              onPress={handleFinishTutorial}
            >
              <MaterialCommunityIcons name="rocket-launch-outline" size={20} color={COLORS.onPrimary} />
              <Text style={styles.startEventText}>さっそくイベントを探してみる</Text>
            </Pressable>
          </ScrollView>
        )}
      </ScreenContainer>
    </>
  );
};

const styles = StyleSheet.create({
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: SPACING.xs,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.hairlineSoft,
  },
  navBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.lg,
  },
  tabItem: {
    alignItems: 'center',
    paddingBottom: SPACING.xs,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabItemActive: {
    borderBottomColor: COLORS.ink,
  },
  tabIconWrapper: {
    position: 'relative',
  },
  tabLabel: {
    fontSize: TYPOGRAPHY.navLink.fontSize,
    fontWeight: '500',
    color: COLORS.muted,
    marginTop: 2,
  },
  tabLabelActive: {
    fontWeight: '600',
    color: COLORS.ink,
  },
  guideBadge: {
    position: 'absolute',
    top: -4,
    right: -20,
    backgroundColor: COLORS.canvas,
    borderWidth: 1,
    borderColor: COLORS.primary,
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: BORDER_RADIUS.full,
  },
  guideBadgeText: {
    fontSize: 9,
    fontWeight: '700',
    color: COLORS.primary,
  },
  accountButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: BORDER_RADIUS.full,
    borderWidth: 1,
    borderColor: COLORS.hairline,
    backgroundColor: COLORS.canvas,
    ...SHADOWS.pill,
  },
  accountButtonText: {
    fontSize: TYPOGRAPHY.captionSm.fontSize,
    fontWeight: '600',
    color: COLORS.ink,
    maxWidth: 70,
  },
  sectionHeader: {
    marginTop: SPACING.md,
    marginBottom: SPACING.md,
  },
  headline: {
    fontSize: TYPOGRAPHY.displayLg.fontSize,
    fontWeight: TYPOGRAPHY.displayLg.fontWeight,
    color: COLORS.ink,
    letterSpacing: -0.4,
  },
  subheadline: {
    fontSize: TYPOGRAPHY.bodySm.fontSize,
    color: COLORS.muted,
    marginTop: 2,
  },
  listContent: {
    paddingBottom: SPACING.xxl,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: SPACING.xxl,
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: SPACING.xs,
    paddingVertical: SPACING.xxl,
  },
  emptyStateTitle: {
    fontSize: TYPOGRAPHY.titleMd.fontSize,
    fontWeight: TYPOGRAPHY.titleMd.fontWeight,
    color: COLORS.ink,
    marginTop: SPACING.sm,
  },
  /* チュートリアルガイド表示用スタイル */
  guideContainer: {
    paddingBottom: SPACING.xxl,
  },
  tutorialCard: {
    marginBottom: SPACING.md,
  },
  stepHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    marginBottom: SPACING.sm,
  },
  stepBadge: {
    backgroundColor: COLORS.primary,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: BORDER_RADIUS.full,
  },
  stepBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: COLORS.onPrimary,
  },
  stepTitle: {
    fontSize: TYPOGRAPHY.titleSm.fontSize,
    fontWeight: '700',
    color: COLORS.ink,
  },
  stepContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
  },
  stepDescription: {
    flex: 1,
    fontSize: TYPOGRAPHY.bodySm.fontSize,
    color: COLORS.body,
    lineHeight: 20,
  },
  startEventButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.xs,
    backgroundColor: COLORS.primary,
    paddingVertical: SPACING.md,
    borderRadius: BORDER_RADIUS.md,
    marginTop: SPACING.md,
    marginBottom: SPACING.xl,
    ...SHADOWS.md,
  },
  startEventText: {
    fontSize: TYPOGRAPHY.titleSm.fontSize,
    fontWeight: '700',
    color: COLORS.onPrimary,
  },
});

export default SearchScreen;
