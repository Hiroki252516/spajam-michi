import React, { useState, useEffect, useCallback } from 'react';
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
import * as Location from 'expo-location';
import ScreenContainer from '../components/ScreenContainer';
import EventCard, { type EventCardData } from '../components/EventCard';
import CardComponent from '../components/CardComponent';
import { COLORS, TYPOGRAPHY, SPACING, BORDER_RADIUS, SHADOWS } from '../constants/design';
import { searchEvents } from '../services/api';
import type { EventData, EventSearchResponse } from '../services/api';
import { useAuth } from '../context/AuthContext';

interface SearchScreenProps {
  onEventSelect: (event: EventData) => void;
  onOpenLogin: () => void;
  onOpenMyPage: () => void;
}

function emptySearchMessage(result: EventSearchResponse) {
  if (result.events.length > 0) return null;
  if (result.meta.degradedReasons.includes('current_location_resolution_unavailable')) {
    return '現在地の地域名を特定できず、近くのイベントを検索できませんでした。時間をおいて再検索してください。';
  }
  return null;
}

/**
 * SearchScreen - イベント一覧 & ガイド（チュートリアル）表示画面
 */
const SearchScreen: React.FC<SearchScreenProps> = ({
  onEventSelect,
  onOpenLogin,
  onOpenMyPage,
}) => {
  const { isLoggedIn, user, token, completeTutorial } = useAuth();
  const [activeTab, setActiveTab] = useState<'events' | 'guide'>(
    user?.isFirstLogin ? 'guide' : 'events'
  );
  const [events, setEvents] = useState<EventCardData[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    if (user?.isFirstLogin) {
      setActiveTab('guide');
    }
  }, [user?.isFirstLogin]);

  const handleFinishTutorial = () => {
    completeTutorial();
    setActiveTab('events');
  };

  const fetchCurrentEvents = useCallback(async () => {
    if (!token) throw new Error('ログインしてからイベントを検索してください。');

    let permission = await Location.getForegroundPermissionsAsync();
    if (!permission.granted) {
      permission = await Location.requestForegroundPermissionsAsync();
    }
    if (!permission.granted) {
      throw new Error('イベント検索には位置情報の許可が必要です。iPhoneの設定からExpo Goの位置情報を許可してください。');
    }
    if (!(await Location.hasServicesEnabledAsync())) {
      throw new Error('iPhoneの位置情報サービスを有効にしてください。');
    }

    const position = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Balanced,
    });
    return searchEvents({
      token,
      latitude: position.coords.latitude,
      longitude: position.coords.longitude,
    });
  }, [token]);

  useEffect(() => {
    let isMounted = true;
    const initialLoad = async () => {
      setIsLoading(true);
      setLoadError(null);
      try {
        const result = await fetchCurrentEvents();
        if (isMounted) {
          setEvents(result.events);
          setLoadError(emptySearchMessage(result));
        }
      } catch (error) {
        if (isMounted) {
          setEvents([]);
          setLoadError(error instanceof Error ? error.message : 'イベントを検索できませんでした。');
        }
      } finally {
        if (isMounted) setIsLoading(false);
      }
    };

    void initialLoad();
    return () => {
      isMounted = false;
    };
  }, [fetchCurrentEvents]);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    setLoadError(null);
    try {
      const result = await fetchCurrentEvents();
      setEvents(result.events);
      setLoadError(emptySearchMessage(result));
    } catch (error) {
      setEvents([]);
      setLoadError(error instanceof Error ? error.message : 'イベントを検索できませんでした。');
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleEventPress = (event: EventData) => {
    onEventSelect(event);
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
                    onPress={() => handleEventPress(item)}
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
                <Text style={styles.emptyStateTitle}>
                  {loadError ? 'イベントを検索できませんでした' : '現在地周辺でイベントが見つかりませんでした'}
                </Text>
                {loadError && <Text style={styles.subheadline}>{loadError}</Text>}
                <Pressable onPress={handleRefresh} style={styles.retryButton}>
                  <Text style={styles.retryButtonText}>現在地から再検索</Text>
                </Pressable>
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
  retryButton: {
    marginTop: SPACING.md,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.sm,
    borderRadius: BORDER_RADIUS.full,
    backgroundColor: COLORS.primary,
  },
  retryButtonText: {
    color: COLORS.onPrimary,
    fontWeight: '700',
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
