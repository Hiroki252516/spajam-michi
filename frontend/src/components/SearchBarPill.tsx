import React from 'react';
import { View, Text, Pressable, StyleSheet, TextInput } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { COLORS, TYPOGRAPHY, BORDER_RADIUS, SHADOWS, SPACING } from '../constants/design';

interface SearchBarPillProps {
  query: string;
  onChangeQuery: (text: string) => void;
  onSearch: () => void;
  isSearching?: boolean;
}

/**
 * ピル型グローバル検索バーコンポーネント
 * DESIGN.md: search-bar-pill & search-orb (完全丸型, Where/When/Whoセグメント, コーラルレッドの検索オーブ)
 */
const SearchBarPill: React.FC<SearchBarPillProps> = ({
  query,
  onChangeQuery,
  onSearch,
}) => {
  return (
    <View style={styles.container}>
      <View style={styles.segmentsContainer}>
        <View style={styles.segment}>
          <Text style={styles.segmentLabel}>どこへ？</Text>
          <TextInput
            value={query}
            onChangeText={onChangeQuery}
            placeholder="行き先やイベント名を検索"
            placeholderTextColor={COLORS.muted}
            style={styles.searchInput}
            returnKeyType="search"
            onSubmitEditing={onSearch}
          />
        </View>
      </View>

      {/* 検索オーブ (search-orb) */}
      <Pressable
        onPress={onSearch}
        style={({ pressed }) => [
          styles.searchOrb,
          pressed && styles.searchOrbPressed,
        ]}
      >
        <MaterialCommunityIcons name="magnify" size={22} color={COLORS.onPrimary} />
      </Pressable>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 60,
    backgroundColor: COLORS.canvas,
    borderRadius: BORDER_RADIUS.full,
    borderWidth: 1,
    borderColor: COLORS.hairline,
    paddingLeft: SPACING.base,
    paddingRight: 6,
    ...SHADOWS.pill,
  },
  segmentsContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  segment: {
    flex: 1,
    justifyContent: 'center',
  },
  segmentLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: COLORS.ink,
    letterSpacing: 0.3,
    marginBottom: 1,
  },
  searchInput: {
    fontSize: TYPOGRAPHY.bodySm.fontSize,
    color: COLORS.ink,
    padding: 0,
  },
  searchOrb: {
    width: 46,
    height: 46,
    borderRadius: BORDER_RADIUS.full,
    backgroundColor: COLORS.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  searchOrbPressed: {
    backgroundColor: COLORS.primaryActive,
    transform: [{ scale: 0.96 }],
  },
});

export default SearchBarPill;
