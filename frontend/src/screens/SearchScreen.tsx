import React, { useState } from 'react';
import {
  FlatList,
  View,
  Text,
  StyleSheet,
  StatusBar,
} from 'react-native';
import { MaterialCommunityIcons } from 'expo-vector-icons';
import ScreenContainer from '../components/ScreenContainer';
import TextInputField from '../components/TextInputField';
import EventCard, { EventCardData } from '../components/EventCard';
import GradientButton from '../components/GradientButton';
import { COLORS, TYPOGRAPHY, SPACING } from '../constants/design';
import { searchEvents } from '../constants/dummyData';

interface SearchScreenProps {
  onEventSelect: (eventId: string, eventName: string) => void;
}

/**
 * SearchScreen - イベント検索・一覧表示画面
 * test_modelの検索画面を再現
 */
const SearchScreen: React.FC<SearchScreenProps> = ({ onEventSelect }) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);

  const handleSearch = () => {
    setIsSearching(true);
    // ダミー遅延（本物のAPI呼び出しをシミュレート）
    setTimeout(() => setIsSearching(false), 300);
  };

  const filteredEvents = searchEvents(searchQuery);

  const handleEventPress = (eventId: string, eventName: string) => {
    onEventSelect(eventId, eventName);
  };

  return (
    <>
      <StatusBar barStyle="dark-content" backgroundColor={COLORS.background.primary} />
      <ScreenContainer scrollable={false} keyboardAvoid={true}>
        {/* ヘッダー */}
        <View style={styles.header}>
          <Text style={styles.title}>イベント検索</Text>
          <Text style={styles.subtitle}>周辺のイベントを探索</Text>
        </View>

        {/* 検索フォーム */}
        <View style={styles.searchSection}>
          <TextInputField
            placeholder="イベント名・場所で検索..."
            value={searchQuery}
            onChangeText={setSearchQuery}
            icon={
              <MaterialCommunityIcons
                name="magnify"
                size={20}
                color={COLORS.text.secondary}
              />
            }
          />

          <GradientButton
            title="検索"
            onPress={handleSearch}
            disabled={isSearching || !searchQuery.trim()}
            size="md"
            style={styles.searchButton}
          />
        </View>

        {/* イベント一覧 */}
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
              name="magnify"
              size={48}
              color={COLORS.text.tertiary}
            />
            <Text style={styles.emptyStateText}>
              {searchQuery.trim()
                ? 'イベントが見つかりませんでした'
                : 'イベントを検索してください'}
            </Text>
          </View>
        )}
      </ScreenContainer>
    </>
  );
};

const styles = StyleSheet.create({
  header: {
    paddingBottom: SPACING.lg,
  },
  title: {
    fontSize: TYPOGRAPHY.heading.size,
    fontWeight: TYPOGRAPHY.heading.weight,
    color: COLORS.text.primary,
    marginBottom: SPACING.sm,
  },
  subtitle: {
    fontSize: TYPOGRAPHY.body.small.size,
    color: COLORS.text.secondary,
  },
  searchSection: {
    marginBottom: SPACING.lg,
    gap: SPACING.md,
  },
  searchButton: {
    width: '100%',
  },
  listContent: {
    paddingBottom: SPACING.xl,
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: SPACING.md,
  },
  emptyStateText: {
    fontSize: TYPOGRAPHY.body.medium.size,
    color: COLORS.text.secondary,
  },
});

export default SearchScreen;
