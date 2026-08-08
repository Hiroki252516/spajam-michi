import React, { useState } from 'react';
import {
  FlatList,
  View,
  Text,
  StyleSheet,
  StatusBar,
  Pressable,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import ScreenContainer from '../components/ScreenContainer';
import SearchBarPill from '../components/SearchBarPill';
import EventCard, { EventCardData } from '../components/EventCard';
import { COLORS, TYPOGRAPHY, SPACING, BORDER_RADIUS, SHADOWS } from '../constants/design';
import { searchEvents } from '../constants/dummyData';
import { useAuth } from '../context/AuthContext';

interface SearchScreenProps {
  onEventSelect: (eventId: string, eventName: string) => void;
  onOpenLogin: () => void;
  onOpenMyPage: () => void;
}

/**
 * SearchScreen - イベント検索・一覧表示画面
 * DESIGN.md: Warm Marketplace (Stays/Experiences/Services タブ, ピル型検索バー, Photo-first カード, アカウント導線)
 */
const SearchScreen: React.FC<SearchScreenProps> = ({
  onEventSelect,
  onOpenLogin,
  onOpenMyPage,
}) => {
  const { isLoggedIn, user } = useAuth();
  const [activeTab, setActiveTab] = useState<'events' | 'experiences' | 'services'>('events');
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);

  const handleSearch = () => {
    setIsSearching(true);
    setTimeout(() => setIsSearching(false), 200);
  };

  const filteredEvents = searchEvents(searchQuery);

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

            <Pressable
              onPress={() => setActiveTab('experiences')}
              style={[styles.tabItem, activeTab === 'experiences' && styles.tabItemActive]}
            >
              <View style={styles.tabIconWrapper}>
                <MaterialCommunityIcons
                  name="ticket-confirmation-outline"
                  size={22}
                  color={activeTab === 'experiences' ? COLORS.ink : COLORS.muted}
                />
                <View style={styles.newBadge}>
                  <Text style={styles.newBadgeText}>NEW</Text>
                </View>
              </View>
              <Text style={[styles.tabLabel, activeTab === 'experiences' && styles.tabLabelActive]}>
                体験
              </Text>
            </Pressable>

            <Pressable
              onPress={() => setActiveTab('services')}
              style={[styles.tabItem, activeTab === 'services' && styles.tabItemActive]}
            >
              <View style={styles.tabIconWrapper}>
                <MaterialCommunityIcons
                  name="compass-outline"
                  size={22}
                  color={activeTab === 'services' ? COLORS.ink : COLORS.muted}
                />
                <View style={styles.newBadge}>
                  <Text style={styles.newBadgeText}>NEW</Text>
                </View>
              </View>
              <Text style={[styles.tabLabel, activeTab === 'services' && styles.tabLabelActive]}>
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

        {/* ピル型グローバル検索バー (DESIGN.md search-bar-pill) */}
        <View style={styles.searchSection}>
          <SearchBarPill
            query={searchQuery}
            onChangeQuery={setSearchQuery}
            onSearch={handleSearch}
            isSearching={isSearching}
          />
        </View>

        {/* 見出し */}
        <View style={styles.sectionHeader}>
          <Text style={styles.headline}>Find your next getaway</Text>
          <Text style={styles.subheadline}>近くで開催される注目のイベント</Text>
        </View>

        {/* イベント一覧 (DESIGN.md property-card) */}
        {filteredEvents.length > 0 ? (
          <FlatList
            data={filteredEvents}
            renderItem={({ item }) => (
              <EventCard
                event={item as EventCardData}
                onPress={() => handleEventPress(item.id, item.name)}
              />
            )}
            keyExtractor={(item) => item.id}
            scrollEnabled={true}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
          />
        ) : (
          <View style={styles.emptyState}>
            <MaterialCommunityIcons
              name="magnify-remove-outline"
              size={48}
              color={COLORS.mutedSoft}
            />
            <Text style={styles.emptyStateTitle}>イベントが見つかりませんでした</Text>
            <Text style={styles.emptyStateSub}>キーワードを変えて検索してみてください</Text>
          </View>
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
  newBadge: {
    position: 'absolute',
    top: -4,
    right: -14,
    backgroundColor: COLORS.canvas,
    borderWidth: 1,
    borderColor: COLORS.ink,
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: BORDER_RADIUS.full,
  },
  newBadgeText: {
    fontSize: TYPOGRAPHY.uppercaseTag.fontSize,
    fontWeight: TYPOGRAPHY.uppercaseTag.fontWeight,
    color: COLORS.ink,
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
  searchSection: {
    marginVertical: SPACING.sm,
  },
  sectionHeader: {
    marginTop: SPACING.xs,
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
  emptyStateSub: {
    fontSize: TYPOGRAPHY.bodySm.fontSize,
    color: COLORS.muted,
  },
});

export default SearchScreen;
